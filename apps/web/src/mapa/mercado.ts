/* eslint-disable @typescript-eslint/no-explicit-any */
// Concorrência no mapa: os empreendimentos do monitor de mercado (Órulo), portado de tools/prototipo/proto_mercado.js
// (mkCarregar, mkUn, mfPassa, mfAtivos, mkGrupos e os formatos). O retrato vem de docs/dados/mercado.json, servido
// junto do protótipo em /prototipo/dados.

export const MK_SIT: Record<string, [string, string, string]> = {
  breve_lancamento: ['Breve lançamento', '#ffdf99', '#7a5900'], lancamento: ['Lançamento', '#c4eed0', '#0f5223'], em_obras: ['Em obras', '#ffdcc1', '#8a4a00'],
  pronto: ['Pronto', '#f0dbff', '#6b2c91'], usado: ['Usado', '#ffd8e8', '#8f1d52'], nao_informado: ['Sem situação', '#e3e3e3', '#444746'],
};
/* faixas do R$/m² médio das unidades à venda (soma dos preços ÷ soma das áreas), cada uma com a sua cor; a situação vai no
   desenho dentro do quadrado (pedido do Moisés, 5/nov/2026; proto_mercado.js › MK_FX, MK_GLIFO). O limite de baixo entra na faixa. */
export const MK_FX: [number, string, string][] = [[7000, 'Abaixo de 7 mil', '#5e4fa2'], [8000, '7 a 8 mil', '#3288bd'], [9000, '8 a 9 mil', '#66c2a5'], [10000, '9 a 10 mil', '#abdda4'],
  [11000, '10 a 11 mil', '#e6f598'], [13000, '11 a 13 mil', '#fee08b'], [15000, '13 a 15 mil', '#fdae61'], [18000, '15 a 18 mil', '#f46d43'], [25000, '18 a 25 mil', '#d53e4f'], [Infinity, 'Acima de 25 mil', '#9e0142']];
export const MK_FX_CHAVES = [...MK_FX.map((_, i) => 'f' + i), 'fx'];
export const mkFxK = (e: { preco?: number | null; area?: number | null }) => { const v = e.preco != null && (e.area || 0) > 0 ? e.preco / e.area! : null; return v == null ? 'fx' : 'f' + MK_FX.findIndex((f) => v < f[0]); };
export const mkFxInfo = (k: string): [string, string] => (k === 'fx' ? ['Sem preço', '#bdc1c6'] : [MK_FX[+k.slice(1)][1], MK_FX[+k.slice(1)][2]]);
/* o desenho de cada situação: lançamento estrela, em obras guindaste, pronto prédio */
const MK_GLIFO: Record<string, string> = {
  lancamento: 'M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z',
  em_obras: 'M7 21V3M4 21h7M7 4h13M7 4l4 4M17 4v5M15 9h4v3h-4zM7 9h3M7 14h3',
  pronto: 'M4 21V5l8-3v19M12 9l8 3v9M2 21h20M7 8h2M7 12h2M7 16h2M15 14h2M15 18h2',
  nao_informado: 'M8 8a4 4 0 1 1 5 3.9c-.6.2-1 .7-1 1.3V15M12 19h.01',
};
MK_GLIFO.breve_lancamento = MK_GLIFO.lancamento; MK_GLIFO.usado = MK_GLIFO.pronto;
/* cor do desenho: escura sobre as cores claras, branca sobre as escuras */
const mkTinta = (c: string) => { const n = parseInt(c.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#1f1f1f' : '#fff'; };
/** some do mapa quando a faixa ou a situação estão desligadas na legenda */
export const mkVisivel = (e: Emp, off: string[]) => !off.includes(mkSitK(e)) && !off.includes(mkFxK(e));

export interface Emp {
  id: string; nome: string; inc: string; bairro: string; mun: string; lat: number; lng: number; sit: string;
  lanc: string | null; ent: string | null; prog: string | null; unidades: number; estoque: number; preco: number | null; area: number | null; vendas: number;
  _u: string | null; u: (number | null)[][] | null; _g: any[] | null; g: any[] | null;
}
export interface Mercado { emps: Emp[]; janela: { de: string; ate: string } | null; cg: string[]; cfg: any; gerado: string; incs: string[] }

export const mkSitK = (e: { sit?: string } | null | undefined) => (e?.sit && MK_SIT[e.sit] ? e.sit : 'nao_informado');
export const mkSitNome = (s: string | null | undefined) => (MK_SIT[s || ''] || MK_SIT.nao_informado)[0];
export const mkTitulo = (e: Emp) => { const k = mkFxK(e); return `${e.nome} · ${mkSitNome(e.sit)} · ${k === 'fx' ? 'sem preço' : 'R$/m² ' + mkFxInfo(k)[0].toLowerCase()}`; };

let MK: Mercado | null = null;
let promessa: Promise<Mercado> | null = null;
export const mercado = () => MK;
export function carregarMercado(): Promise<Mercado> {
  if (MK) return Promise.resolve(MK);
  if (promessa) return promessa;
  promessa = fetch('/prototipo/dados/mercado.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((j) => {
    const c: string[] = j.campos;
    const emps: Emp[] = j.emps.map((a: any[]) => {
      const o: any = {}; c.forEach((k, i) => (o[k] = a[i]));
      return { id: o.id, nome: o.nome, inc: o.incorporadora, bairro: o.bairro, mun: o.municipio, lat: +o.lat, lng: +o.lng, sit: o.situacao,
        lanc: o.lancamento, ent: o.entrega, prog: o.programa_social, unidades: o.unidades, estoque: o.estoque, preco: o.preco == null ? null : +o.preco,
        area: o.area == null ? null : +o.area, vendas: o.vendas, _u: o.estoque_un, u: null, _g: o.grupos || [], g: null };
    });
    return (MK = { emps, janela: j.janela, cg: j.campos_grupo, cfg: j.agrupamento, gerado: j.gerado_em, incs: [...new Set(emps.map((e) => e.inc))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')) });
  }).catch((e) => { promessa = null; throw e; });
  return promessa;
}

/* unidades à venda: [dormitórios, área, preço], nulo onde o Órulo não traz */
export function mkUn(e: Emp) {
  if (!e.u) { const n = (s: string) => (s === '' ? null : +s); e.u = e._u ? e._u.split(';').map((s) => { const [d, a, p] = s.split(','); return [n(d), n(a), n(p)]; }) : []; e._u = null; }
  return e.u;
}
export const mkM2 = (preco: number | null | undefined, area: number | null | undefined) => (preco != null && area != null && area > 0 ? preco / area : null);
export const mkVso = (v: number, est: number) => (v + est > 0 ? v / (v + est) : null);
export const num = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
export const brl = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
export const mkPct = (v: number | null) => (v == null ? '—' : num(v * 100, 1) + '%');
export const mkData = (d: string | null | undefined) => { if (!d) return '—'; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
export const mkPeriodo = () => { const j = MK?.janela; return j && j.de ? `${mkData(j.de)} a ${mkData(j.ate)}` : ''; };
export const mkDias = () => { const j = MK?.janela; return j && j.de ? Math.round((+new Date(j.ate) - +new Date(j.de)) / 864e5) : null; };
/* "270 mil", "1,2 mi", "R$ 350.000" (proto_filtros.js › fxLerNum) */
export function lerNum(s0: string) {
  let s = String(s0 || '').trim().toLowerCase().replace(/r\$\s*/, ''); if (!s) return null;
  let mult = 1;
  if (/\bmi(lh[õo]es|lhão)?\b|\bmi$/.test(s)) { mult = 1e6; s = s.replace(/mi.*$/, ''); } else if (/\bmil\b/.test(s)) { mult = 1e3; s = s.replace(/mil.*$/, ''); }
  s = s.trim().replace(/\./g, '').replace(',', '.');
  const v = Number(s); return isFinite(v) && s !== '' ? v * mult : null;
}

/* ---------- filtro do mapa (na sessão; não mexe no filtro de terrenos) ---------- */
export type Faixa = { min?: any; max?: any; semInfo?: boolean };
export type Filtro = { [k: string]: any } & { inc?: string[]; prog?: string[] };
export const MF_UN: [string, string, string, number][] = [['dorm', 'Dormitórios', '', 0], ['area', 'Área privativa', 'm²', 1], ['preco', 'Preço', 'R$', 2], ['m2', 'Preço por m²', 'R$/m²', 3]];
export const MF_DT: [string, string][] = [['lanc', 'Data de lançamento'], ['ent', 'Data de entrega']];
export function mfAtivos(f: Filtro) {
  const n: string[] = [];
  MF_DT.forEach(([k]) => { if (f[k] && (f[k].min || f[k].max)) n.push(k); });
  MF_UN.forEach(([k]) => { if (f[k] && (f[k].min != null || f[k].max != null)) n.push(k); });
  if (f.inc?.length) n.push('inc'); if (f.prog?.length) n.push('prog');
  return n;
}
const dentro = (v: number | null, w: Faixa) => v != null && (w.min == null || v >= w.min) && (w.max == null || v <= w.max);
export function mfPassa(f: Filtro, e: any, sem?: string) {
  for (const [k] of MF_DT) {
    if (k === sem) continue; const w = f[k]; if (!w || !(w.min || w.max)) continue; const v = e[k];
    if (!v) { if (w.semInfo) continue; return false; }
    if ((w.min && v < w.min) || (w.max && v > w.max)) return false;
  }
  if (sem !== 'inc' && f.inc?.length && !f.inc.includes(e.inc)) return false;
  if (sem !== 'prog' && f.prog?.length && !f.prog.includes(e.prog)) return false;
  const us = MF_UN.filter(([k]) => k !== sem && f[k] && (f[k].min != null || f[k].max != null)); if (!us.length) return true;
  /* basta uma unidade à venda dentro de todos os filtros de unidade, a mesma */
  return mkUn(e).some((u) => us.every(([k, , , i]) => dentro(i === 3 ? mkM2(u[2], u[1]) : u[i], f[k])));
}

/* resumo do empreendimento: os grupos de unidades parecidas */
export function mkGrupos(e: Emp) {
  if (!e.g) {
    const c = MK!.cg;
    e.g = (e._g || []).map((a: any[]) => { const o: any = {}; c.forEach((k, i) => (o[k] = a[i])); o.m2 = mkM2(o.preco_estoque, o.area_estoque); o.m2p1 = mkM2(o.preco_primeiro, o.area_primeiro); o.vso = mkVso(o.vendas, o.estoque); return o; });
    e._g = null;
  }
  return e.g!;
}
export const mkDormN = (d: number | null) => (d == null ? 'Dorms não informados' : d === 0 ? 'Studio' : d + (d > 1 ? ' dorms' : ' dorm'));
export const mkVagaN = (v: number | null) => (v == null ? 'vaga não informada' : v === 0 ? 'sem vaga' : v + (v > 1 ? ' vagas' : ' vaga'));
export const mkAreaN = (g: any) => (g.area_min === g.area_max ? num(g.area_min, 2) : num(g.area_min, 2) + ' a ' + num(g.area_max, 2)) + ' m²';

/* quadrado na cor da faixa do R$/m² com o desenho da situação; só com a situação (legenda), cinza neutro; destacado: fundo
   escuro, desenho branco e anel azul */
export const mkMarcaHtml = (e: { sit?: string; preco?: number | null; area?: number | null }, dest?: boolean) => {
  const f = e.preco === undefined ? '#e8eaed' : mkFxInfo(mkFxK(e))[1], g = mkTinta(f), d = MK_GLIFO[mkSitK(e)];
  return `<span class="mk-b${dest ? ' mk-dest-b' : ''}" style="background:${dest ? '#202124' : f};border-color:${dest ? '#fff' : 'rgba(0,0,0,.45)'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="${dest ? '#fff' : g}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg></span>`;
};
export const mkFxMarcaHtml = (k: string) => `<span class="mk-b" style="background:${mkFxInfo(k)[1]};border-color:rgba(0,0,0,.45)"></span>`;
