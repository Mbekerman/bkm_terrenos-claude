// Serviço do IPTU do BKM Terrenos (Cloud Run, serviço terrenos-iptu).
//
// O front chama por /iptu no mesmo endereço do sistema (o Caddy repassa para cá). Cada
// pedido traz o login do Supabase de quem clicou; o serviço confere, com esse mesmo
// login, que a pessoa edita a empresa e que o SQL é de um terreno dela (a RLS do banco
// decide), emite a notificação no portal da Prefeitura e grava o venal e o IPTU em
// app.inscricao_valores também com o login da pessoa. Assim a Senha Web só serve para
// SQLs já cadastrados no sistema, por quem pode editar.
//
//   GET  /saude
//   POST /consultar    { inscricao_id, exercicio? }  → grava e devolve o valor
//   POST /notificacao  { inscricao_id, exercicio }   → devolve o PDF (não grava)

import http from 'node:http';
import { emitir, ErroPortal } from './portal.js';
import { lerPdf, paraBanco, ErroLeitura } from './notificacao.js';

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? '';
const SAO_PAULO = '3550308';
const LIMITE_HORA = 40; // consultas por pessoa por hora

class ErroPedido extends Error { constructor(status, code, msg) { super(msg); this.status = status; this.code = code; } }

async function rest(token, caminho, init = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Accept-Profile': 'app', 'Content-Profile': 'app', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => { throw new ErroPedido(503, 'BANCO_FORA', 'O serviço do IPTU não conseguiu falar com o banco.'); });
  const txt = await r.text();
  const corpo = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new ErroPedido(r.status === 401 ? 401 : 400, 'BANCO', corpo?.message ?? `Banco respondeu ${r.status}`);
  return corpo;
}

async function usuario(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
    .catch(() => { throw new ErroPedido(503, 'BANCO_FORA', 'O serviço do IPTU não conseguiu falar com o banco.'); });
  if (!r.ok) throw new ErroPedido(401, 'SEM_LOGIN', 'Entre no sistema para consultar o IPTU.');
  return r.json();
}

const usos = new Map();
function contar(uid) {
  const agora = Date.now(), l = (usos.get(uid) ?? []).filter((t) => agora - t < 3600_000);
  if (l.length >= LIMITE_HORA) throw new ErroPedido(429, 'LIMITE', 'Limite de consultas de IPTU por hora atingido. Tente mais tarde.');
  l.push(agora); usos.set(uid, l);
}

/** Login, permissão de edição e a inscrição (SQL de São Paulo de um terreno da empresa). */
async function preparar(req, corpo) {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) throw new ErroPedido(401, 'SEM_LOGIN', 'Entre no sistema para consultar o IPTU.');
  const u = await usuario(token);
  const id = String(corpo?.inscricao_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroPedido(400, 'PEDIDO', 'Inscrição inválida.');
  const [ins] = await rest(token, `inscricoes_municipais?id=eq.${id}&select=id,empresa_id,inscricao_norm,municipios(codigo_ibge)`);
  if (!ins) throw new ErroPedido(404, 'SEM_INSCRICAO', 'SQL não encontrado nos seus terrenos.');
  if (ins.municipios?.codigo_ibge !== SAO_PAULO || !/^\d{11}$/.test(ins.inscricao_norm)) throw new ErroPedido(400, 'FORA_DE_SP', 'A consulta do IPTU pela Prefeitura só existe para SQL de São Paulo.');
  const edicao = await rest(token, 'rpc/empresas_edicao', { method: 'POST', body: '{}' });
  const ids = (edicao ?? []).map((x) => (typeof x === 'string' ? x : x?.empresas_edicao ?? Object.values(x ?? {})[0]));
  if (!ids.includes(ins.empresa_id)) throw new ErroPedido(403, 'SEM_PERMISSAO', 'Só quem edita a ficha consulta o IPTU na Prefeitura.');
  contar(u.id);
  return { token, ins };
}

const anoSP = () => Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date()));

async function consultar(req, corpo) {
  const { token, ins } = await preparar(req, corpo);
  const pedido = Number(corpo.exercicio) || null;
  // sem exercício: o do ano; sem notificação dele ainda (começo do ano), o anterior
  let pdf, exercicio = pedido ?? anoSP();
  try { pdf = await emitir(ins.inscricao_norm, exercicio); }
  catch (e) {
    if (pedido || !(e instanceof ErroPortal) || !/^SEM_NOTIFICACAO/.test(e.code)) throw e;
    exercicio -= 1;
    pdf = await emitir(ins.inscricao_norm, exercicio);
  }
  const n = await lerPdf(pdf);
  if (n.sql?.replace(/\D/g, '') !== ins.inscricao_norm || n.exercicio !== exercicio) throw new ErroPedido(502, 'PDF_DIVERGENTE', 'O PDF do portal não é do SQL ou do exercício pedido.');
  const v = paraBanco(n);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  // Mesmo exercício com os mesmos valores já vindos da Prefeitura: não cria revisão nova.
  const [atual] = await rest(token, `inscricao_valores?inscricao_id=eq.${ins.id}&vigente=is.true&select=*`);
  const igual = atual && atual.exercicio === v.exercicio && Number(atual.iptu_valor_anual ?? -1) === Number(v.iptu_valor_anual ?? -1)
    && Number(atual.valor_venal_imovel ?? -1) === Number(v.valor_venal_imovel ?? -1) && atual.notificacao != null;
  if (igual) return { valor: atual, novo: false };
  const [linha] = await rest(token, 'inscricao_valores', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      empresa_id: ins.empresa_id, inscricao_id: ins.id, exercicio: v.exercicio, valor_venal_terreno: v.valor_venal_terreno,
      valor_venal_construcao: v.valor_venal_construcao, valor_venal_imovel: v.valor_venal_imovel, situacao_iptu: v.situacao_iptu,
      iptu_valor_anual: v.iptu_valor_anual, data_verificacao: hoje, fonte: v.fonte, notificacao: v.notificacao,
    }),
  });
  return { valor: linha, novo: true };
}

async function notificacao(req, corpo) {
  const { ins } = await preparar(req, corpo);
  const ex = Number(corpo.exercicio);
  if (!Number.isInteger(ex) || ex < 2000 || ex > 2100) throw new ErroPedido(400, 'PEDIDO', 'Exercício inválido.');
  return { pdf: await emitir(ins.inscricao_norm, ex), nome: `IPTU-${ins.inscricao_norm}-${ex}.pdf` };
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
  const caminho = new URL(req.url ?? '/', 'http://x').pathname.replace(/^\/iptu/, '');
  try {
    if (req.method === 'GET' && caminho === '/saude') return json(res, 200, { ok: true, credencial: !!(process.env.IPTU_CPF && process.env.IPTU_SENHA) });
    if (req.method !== 'POST') return json(res, 404, { code: 'ROTA', error: 'Não encontrado.' });
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new ErroPedido(503, 'CONFIG', 'Serviço sem SUPABASE_URL ou SUPABASE_KEY.');
    const corpo = await lerCorpo(req);
    if (caminho === '/consultar') return json(res, 200, await consultar(req, corpo));
    if (caminho === '/notificacao') {
      const { pdf, nome } = await notificacao(req, corpo);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
      return res.end(pdf);
    }
    return json(res, 404, { code: 'ROTA', error: 'Não encontrado.' });
  } catch (e) {
    const conhecido = e instanceof ErroPedido || e instanceof ErroPortal || e instanceof ErroLeitura;
    // nunca registra corpo do pedido, token nem a credencial
    console.warn(`iptu erro ${conhecido ? e.code : e?.name ?? 'Erro'}`);
    return json(res, conhecido ? (e.status ?? 422) : 500, { code: conhecido ? e.code : 'INTERNO', error: conhecido ? e.message : 'Erro interno no serviço do IPTU.' });
  }
});

servidor.requestTimeout = 300_000;
servidor.listen(Number(process.env.PORT ?? 8080), () => console.log('serviço do IPTU no ar'));
