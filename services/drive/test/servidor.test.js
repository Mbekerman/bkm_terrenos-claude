// O caminho todo com o Drive e o banco simulados: cria as 7 pastas, não cria de novo,
// renomeia quando o nome muda e acha pela marca a pasta que o banco não guardou.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

const PORTA = 18000 + Math.floor(Math.random() * 1000);
Object.assign(process.env, { PORT: String(PORTA), SUPABASE_URL: 'https://banco.teste', SUPABASE_KEY: 'k', DRIVE_PASTA_RAIZ: 'RAIZ00000000', DRIVE_TOKEN_TESTE: 't' });

const TID = '11111111-1111-1111-1111-111111111111';
const terreno = { id: TID, empresa_id: 'e', codigo: 'A001', criado_em: '2026-11-12T15:00:00Z', excluido: false, municipio: 'São Paulo', sigla: 'SP', zona: null, bairro: 'Vila Jacuí', logradouro: 'Avenida São Miguel' };
const banco = new Map(); // pasta_mae_id → { pasta_id, nome }
const drive = new Map(); // id → { id, name, parents, appProperties }
const modelos = Array.from({ length: 7 }, (_, i) => ({ id: `MODELO000000${i}`, name: `0${i + 1}) Pasta ${i + 1}` }));
let n = 0, criadas = 0;

const real = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const resp = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (u.hostname === 'banco.teste') {
    if (u.pathname === '/auth/v1/user') return init.headers?.Authorization === 'Bearer x' ? resp({ id: 'u1' }) : resp({ msg: 'invalid' }, 401);
    if (u.pathname.endsWith('/rpc/drive_terreno')) return resp({ ...terreno, pastas: [...banco].map(([m, p]) => ({ pasta_mae_id: m, ...p })) });
    if (u.pathname.endsWith('/rpc/registrar_pasta_drive')) { const b = JSON.parse(init.body); banco.set(b.p_pasta_mae, { pasta_id: b.p_pasta, nome: b.p_nome }); return new Response(null, { status: 204 }); }
    if (u.pathname.endsWith('/terrenos')) return resp([{ id: TID }]);
    if (u.pathname.endsWith('/terreno_pastas_drive')) return resp([...banco.keys()].map((m) => ({ terreno_id: TID, pasta_mae_id: m })));
    return resp({ message: 'rota' }, 404);
  }
  if (u.hostname === 'www.googleapis.com') {
    const qq = u.searchParams.get('q') ?? '';
    const id = decodeURIComponent(u.pathname.split('/files')[1]?.slice(1) ?? '');
    if (init.method === 'POST') { const b = JSON.parse(init.body); const f = { id: `PASTA${String(++n).padStart(8, '0')}`, name: b.name, parents: b.parents, appProperties: b.appProperties }; drive.set(f.id, f); criadas++; return resp(f); }
    if (init.method === 'PATCH') { const f = drive.get(id); f.name = JSON.parse(init.body).name; return resp(f); }
    if (id) { const f = drive.get(id); return f ? resp({ ...f, trashed: false }) : resp({}, 404); }
    if (qq.startsWith("'RAIZ00000000'")) return resp({ files: modelos });
    const mae = /^'([^']+)' in parents/.exec(qq)[1];
    return resp({ files: [...drive.values()].filter((f) => f.parents.includes(mae) && f.appProperties?.bkm_terreno === TID) });
  }
  return real(url, init);
};

await import('../src/servidor.js');
after(() => process.exit(0));
const pedir = () => real(`http://127.0.0.1:${PORTA}/drive/sincronizar`, { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ terreno_id: TID }) }).then((r) => r.json());

test('cria uma pasta em cada pasta-modelo e guarda no banco', async () => {
  const r = await pedir();
  assert.equal(r.criadas, 7);
  assert.equal(r.nome, 'SP_NA_VILA JACUÍ_26 11_A001_Av. São Miguel');
  assert.equal(banco.size, 7);
});

test('pedir de novo não cria nada', async () => {
  const r = await pedir();
  assert.deepEqual([r.criadas, r.renomeadas], [0, 0]);
  assert.equal(criadas, 7);
});

test('a zona chegou: renomeia as 7, sem criar', async () => {
  terreno.zona = 'leste';
  await new Promise((ok) => setTimeout(ok, 10));
  const r = await pedir();
  assert.deepEqual([r.criadas, r.renomeadas], [0, 7]);
  assert.ok([...drive.values()].every((f) => f.name === 'SP_ZL_VILA JACUÍ_26 11_A001_Av. São Miguel'));
});

test('o banco perdeu o id: acha pela marca, não cria outra', async () => {
  banco.clear();
  const r = await pedir();
  assert.equal(r.criadas, 0);
  assert.equal(banco.size, 7);
  assert.equal(criadas, 7);
});

test('sem login válido, recusa antes de tocar no Drive', async () => {
  const antes = criadas;
  const r = await real(`http://127.0.0.1:${PORTA}/drive/sincronizar`, { method: 'POST', headers: { Authorization: 'Bearer falso', 'Content-Type': 'application/json' }, body: JSON.stringify({ terreno_id: TID }) });
  assert.equal(r.status, 401);
  const r2 = await real(`http://127.0.0.1:${PORTA}/drive/sincronizar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ terreno_id: TID }) });
  assert.equal(r2.status, 401);
  assert.equal(criadas, antes);
});
