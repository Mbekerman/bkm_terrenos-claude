// Serviço das pastas do Drive do BKM Terrenos (Cloud Run, serviço terrenos-drive).
//
// Para cada terreno, uma pasta dentro de cada pasta da pasta-mãe (DRIVE_PASTA_RAIZ, hoje
// "DI › 01) Novos Negócios"), com o nome de src/nome.js. O front chama por /drive no mesmo
// endereço do sistema (o Caddy repassa para cá) com o login do Supabase de quem edita; o
// serviço lê o terreno e grava o id das pastas com esse mesmo login (app.drive_terreno,
// app.registrar_pasta_drive: só quem edita). O Drive é usado com a conta de serviço do
// próprio Cloud Run. Nunca apaga nem move pasta; só cria e renomeia.
//
//   GET  /drive/saude
//   POST /drive/sincronizar { terreno_id }  → cria as que faltam e renomeia as desatualizadas
//
// Depois de cada sincronização, de 10 em 10 minutos no máximo, confere se algum terreno que
// a pessoa edita está sem pasta em alguma pasta-modelo (terreno antigo, pasta-modelo nova) e
// cria em segundo plano.

import http from 'node:http';
import { nomePasta } from './nome.js';
import { pastasModelo, ler, acharPorTerreno, criar, renomear, ErroDrive } from './drive.js';

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? '';
const RAIZ = process.env.DRIVE_PASTA_RAIZ ?? '';

class ErroPedido extends Error { constructor(status, code, msg) { super(msg); this.status = status; this.code = code; } }

async function rest(token, caminho, init = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Accept-Profile': 'app', 'Content-Profile': 'app', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => { throw new ErroPedido(503, 'BANCO_FORA', 'O serviço do Drive não conseguiu falar com o banco.'); });
  const txt = await r.text();
  const corpo = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new ErroPedido(r.status === 401 ? 401 : r.status === 403 ? 403 : 400, 'BANCO', corpo?.message ?? `Banco respondeu ${r.status}`);
  return corpo;
}

const ehId = (x) => /^[0-9a-f-]{36}$/i.test(String(x ?? ''));

// pastas-modelo guardadas por 1 minuto (uma listagem a cada sincronização seria à toa)
let modelo = null;
async function modelos() {
  if (modelo && Date.now() - modelo.em < 60_000) return modelo.l;
  modelo = { l: await pastasModelo(RAIZ), em: Date.now() };
  return modelo.l;
}

// um terreno por vez (dois pedidos juntos do mesmo terreno não criam pasta dobrada)
const travas = new Map();
function travado(id, f) {
  const antes = travas.get(id) ?? Promise.resolve();
  const p = antes.catch(() => {}).then(f);
  travas.set(id, p);
  p.finally(() => { if (travas.get(id) === p) travas.delete(id); }).catch(() => {});
  return p;
}

async function sincronizar(token, terrenoId) {
  return travado(terrenoId, async () => {
    const t = await rest(token, 'rpc/drive_terreno', { method: 'POST', body: JSON.stringify({ p_terreno: terrenoId }) });
    if (t.excluido) return { nome: null, criadas: 0, renomeadas: 0 };
    const nome = nomePasta(t);
    let criadas = 0, renomeadas = 0;
    for (const m of await modelos()) {
      const salva = t.pastas.find((p) => p.pasta_mae_id === m.id);
      let pasta = null;
      if (salva) {
        const f = await ler(salva.pasta_id);
        if (f && !f.trashed && (f.parents ?? []).includes(m.id)) pasta = f;
      }
      if (!pasta) pasta = await acharPorTerreno(m.id, t.id);
      if (!pasta) { pasta = await criar(m.id, nome, t.id, t.codigo); criadas++; }
      else if (pasta.name !== nome) { pasta = await renomear(pasta.id, nome); renomeadas++; }
      if (!salva || salva.pasta_id !== pasta.id || salva.nome !== pasta.name) {
        await rest(token, 'rpc/registrar_pasta_drive', { method: 'POST', body: JSON.stringify({ p_terreno: t.id, p_pasta_mae: m.id, p_pasta_mae_nome: m.name, p_pasta: pasta.id, p_nome: pasta.name }) });
      }
    }
    return { nome, criadas, renomeadas };
  });
}

// terrenos sem pasta em alguma pasta-modelo (antigos, ou pasta-modelo nova no Drive)
let ultimaVarredura = 0, varrendo = false;
async function varrer(token) {
  if (varrendo || Date.now() - ultimaVarredura < 600_000) return;
  varrendo = true; ultimaVarredura = Date.now();
  try {
    const ms = (await modelos()).map((m) => m.id);
    const ts = await rest(token, 'terrenos?select=id&excluido_em=is.null&limit=5000');
    const ps = await rest(token, 'terreno_pastas_drive?select=terreno_id,pasta_mae_id&limit=50000');
    const tem = new Set(ps.map((p) => p.terreno_id + '|' + p.pasta_mae_id));
    const faltam = ts.filter((t) => ms.some((m) => !tem.has(t.id + '|' + m))).slice(0, 300);
    for (const t of faltam) {
      try { await sincronizar(token, t.id); }
      catch (e) { console.warn(`drive varredura erro ${e?.code ?? e?.name ?? 'Erro'}`); if (e?.status === 401) break; }
    }
  } catch (e) { console.warn(`drive varredura erro ${e?.code ?? e?.name ?? 'Erro'}`); }
  finally { varrendo = false; }
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 4096) { falha(new ErroPedido(413, 'GRANDE', 'Pedido grande demais.')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { falha(new ErroPedido(400, 'PEDIDO', 'JSON inválido.')); } });
    req.on('error', falha);
  });
}

const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

const servidor = http.createServer(async (req, res) => {
  const caminho = new URL(req.url ?? '/', 'http://x').pathname.replace(/^\/drive/, '');
  try {
    if (req.method === 'GET' && caminho === '/saude') return json(res, 200, { ok: true, raiz: !!RAIZ, banco: !!(SUPABASE_URL && SUPABASE_KEY) });
    if (req.method !== 'POST' || caminho !== '/sincronizar') return json(res, 404, { code: 'ROTA', error: 'Não encontrado.' });
    if (!SUPABASE_URL || !SUPABASE_KEY || !RAIZ) throw new ErroPedido(503, 'CONFIG', 'Serviço sem SUPABASE_URL, SUPABASE_KEY ou DRIVE_PASTA_RAIZ.');
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new ErroPedido(401, 'SEM_LOGIN', 'Entre no sistema.');
    const corpo = await lerCorpo(req);
    if (!ehId(corpo?.terreno_id)) throw new ErroPedido(400, 'PEDIDO', 'Terreno inválido.');
    const r = await sincronizar(token, corpo.terreno_id);
    void varrer(token);
    return json(res, 200, r);
  } catch (e) {
    const conhecido = e instanceof ErroPedido || e instanceof ErroDrive;
    // nunca registra corpo do pedido nem token
    console.warn(`drive erro ${conhecido ? e.code : e?.name ?? 'Erro'}`);
    return json(res, conhecido ? (e.status ?? 422) : 500, { code: conhecido ? e.code : 'INTERNO', error: conhecido ? e.message : 'Erro interno no serviço do Drive.' });
  }
});

servidor.requestTimeout = 120_000;
servidor.listen(Number(process.env.PORT ?? 8080), () => console.log('serviço do Drive no ar'));
