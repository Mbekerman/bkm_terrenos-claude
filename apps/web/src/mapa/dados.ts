import { supabase } from '../lib/supabase';

// Porte das regras do mapa do protótipo (tools/prototipo/proto_mod.js: SIT, COR_FASE, RAMPA, mpItens, mpClasse,
// mpInfo, mpApagado, mpCorSub, mpSubNome, mpNivelItens; proto_fases.js: faseAtual, procDaFase). Funções puras:
// o nível aberto na legenda (f = fase, e = etapa) e os itens apagados vão por parâmetro.

/** rótulo, cor, glifo e cor do glifo das situações fora das etapas */
export const SIT = {
  sem_negociacao: ['Backlog', '#8a8d91', '·', '#fff'],
  stand_by: ['Stand By', '#c98a2e', '‖', '#fff'],
  comprado: ['Comprado', '#6f9a3a', '✓', '#fff'],
  perdido: ['Perdido', '#9a3b30', '×', '#fff'],
  descartado: ['Descartado', '#6b6560', '–', '#fff'],
} as const;
type Sit = keyof typeof SIT;
const COR_FASE = ['#0b74d6', '#863d8f', '#c67355', '#00838f', '#c2477a', '#7d8a3e', '#1d2e5c', '#5f6368'];
const RAMPA = ['#8fc8f7', '#4aa3f0', '#0b74d6', '#0a4fa0', '#1d2e5c'];
const rampa = (i: number, n: number): [string, string] => {
  const j = n <= 1 ? 2 : Math.round((i * (RAMPA.length - 1)) / (n - 1));
  return [RAMPA[j], j === 0 ? '#1d2e5c' : '#fff'];
};

export interface Sub { k: string; nome: string }
export interface Etapa { k: string; nome: string; subs: Sub[] }
export interface Fase { k: string; nome: string; entrada: boolean; ativo: boolean; etapas: Etapa[] }
export interface Proc { fase: string; etapa: string; sub: string | null; status: string }
export interface TerrenoMapa {
  id: string; codigo: string; nome: string; bairro: string | null; zona: string | null; municipio: string | null;
  corretor: string | null; lat: number | null; lng: number | null; poly: [number, number][] | null; area: number | null;
  procs: Proc[];
}
export interface Item { k: string; nome: string; cor: string; g: string; fg: string; desce: boolean }
export type Apag = Record<string, string[]>;

const sit = (k: Sit): Item => ({ k, nome: SIT[k][0], cor: SIT[k][1], g: SIT[k][2], fg: SIT[k][3], desce: false });
const aberto = (p?: Proc | null) => !!p && (p.status === 'ativo' || p.status === 'stand_by');
const etapaF = (fs: Fase[], f: string, e: string) => fs.find((x) => x.k === f)?.etapas.find((x) => x.k === e);

/** itens da legenda no nível (f, e) */
export function itens(fs: Fase[], f: string, e: string): Item[] {
  if (!f) return [
    ...fs.filter((x) => x.ativo).map((x, i) => ({ k: x.k, nome: x.nome, cor: COR_FASE[i % COR_FASE.length], g: String(i + 1), fg: '#fff', desce: x.etapas.length > 0 })),
    sit('sem_negociacao'), sit('perdido'), sit('descartado'),
  ];
  const L: (Etapa | Sub)[] = e ? etapaF(fs, f, e)?.subs ?? [] : fs.find((x) => x.k === f)?.etapas ?? [];
  return [
    ...L.map((x, i) => { const [cor, fg] = rampa(i, L.length); return { k: x.k, nome: x.nome, cor, g: String(i + 1), fg, desce: !e && ((x as Etapa).subs?.length ?? 0) > 0 }; }),
    sit('stand_by'),
  ];
}

/** fase atual: a aberta mais adiante; sem nenhuma aberta, a última que o terreno teve */
export function faseAtual(fs: Fase[], t: TerrenoMapa): { k: string; p: Proc | null; aberta: boolean } | null {
  const ab = fs.filter((f) => t.procs.some((p) => p.fase === f.k && aberto(p)));
  if (ab.length) { const f = ab[ab.length - 1]; return { k: f.k, p: t.procs.find((p) => p.fase === f.k && aberto(p))!, aberta: true }; }
  const teve = fs.filter((f) => t.procs.some((p) => p.fase === f.k));
  if (!teve.length) return null;
  const f = teve[teve.length - 1];
  return { k: f.k, p: t.procs.filter((p) => p.fase === f.k).slice(-1)[0] ?? null, aberta: false };
}

/** em que item da legenda o terreno cai no nível (f, e); null = fora do nível */
export function classe(fs: Fase[], t: TerrenoMapa, f: string, e: string): string | null {
  if (!f) {
    const a = faseAtual(fs, t);
    if (!a) return 'sem_negociacao';
    if (!a.aberta && (a.p?.status === 'perdido' || a.p?.status === 'descartado')) return a.p.status;
    return a.k;
  }
  const p = t.procs.find((x) => x.fase === f && aberto(x));
  if (!p || (e && p.etapa !== e)) return null;
  return p.status === 'stand_by' ? 'stand_by' : e ? p.sub : p.etapa;
}

export function info(fs: Fase[], k: string | null, f: string, e: string): [string, string, string, string] {
  const x = itens(fs, f, e).find((i) => i.k === k);
  return x ? [x.nome, x.cor, x.g, x.fg] : ['Sem subetapa', '#8a8d91', '·', '#fff'];
}

/** itens apagados na legenda, por nível ('fase|etapa'), valem em qualquer nível aberto */
export function apagado(fs: Fase[], t: TerrenoMapa, apag: Apag): boolean {
  return Object.entries(apag).some(([lv, l]) => {
    if (!l.length) return false;
    const [f, e] = lv.split('|');
    const c = classe(fs, t, f, e);
    return c != null && l.includes(c);
  });
}

/** cor da bolinha da lista: sempre a da subetapa (a que a legenda dá a ela ao descer até a etapa) */
export function corSub(fs: Fase[], t: TerrenoMapa): [string, string] {
  const s = (k: Sit): [string, string] => [SIT[k][1], SIT[k][3]];
  const a = faseAtual(fs, t), p = a?.p;
  if (!a || !p) return s('sem_negociacao');
  if (p.status === 'perdido' || p.status === 'descartado' || p.status === 'stand_by') return s(p.status);
  const e = etapaF(fs, a.k, p.etapa);
  if (!e) { const i = info(fs, classe(fs, t, '', ''), '', ''); return [i[1], i[3]]; }
  const sub = e.subs.length > 0 && p.sub;
  const x = itens(fs, a.k, sub ? p.etapa : '').find((i) => i.k === (sub ? p.sub : p.etapa));
  return x ? [x.cor, x.fg] : ['#8a8d91', '#fff'];
}

export function subNome(fs: Fase[], t: TerrenoMapa): string {
  const a = faseAtual(fs, t), p = a?.p;
  if (!a || !p) return 'Sem negociação';
  if (p.status !== 'ativo') return ({ stand_by: 'Stand By', perdido: 'Perdido', descartado: 'Descartado', concluido: 'Concluído' } as Record<string, string>)[p.status] ?? p.status;
  const e = etapaF(fs, a.k, p.etapa);
  return [e?.nome, p.sub && e?.subs.find((x) => x.k === p.sub)?.nome].filter(Boolean).join(' › ');
}

/** área em m² de uma poligonal [lat, lng] (projeção local, como o protótipo) */
export function areaPoly(pts: [number, number][] | null): number | null {
  if (!pts || pts.length < 3) return null;
  const lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * Math.PI / 180, R = 6371008;
  const xy = pts.map(([la, lo]) => [R * lo * Math.PI / 180 * Math.cos(lat0), R * la * Math.PI / 180]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
export const areaDe = (t: TerrenoMapa) => t.area ?? areaPoly(t.poly);

/** busca da barra superior: todas as palavras em código, nome, bairro, zona, município ou corretor */
export function bate(t: TerrenoMapa, q: string): boolean {
  q = q.trim().toLowerCase();
  if (!q) return true;
  const hay = [t.codigo, t.nome, t.bairro, t.zona, t.municipio, t.corretor].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function anel(g: unknown): [number, number][] | null {
  const o = g as { type?: string; coordinates?: unknown } | null;
  if (!o?.coordinates) return null;
  const r = (o.type === 'MultiPolygon' ? (o.coordinates as number[][][][])[0]?.[0] : (o.coordinates as number[][][])[0]) ?? [];
  const pts = r.map(([lng, lat]) => [lat, lng] as [number, number]);
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  return pts.length >= 3 ? pts : null;
}

/** terrenos do mapa e a configuração do funil da empresa */
export async function carregar(empresa: string): Promise<{ fases: Fase[]; terrenos: TerrenoMapa[] }> {
  const [m, f, e, s, p] = await Promise.all([
    supabase.from('v_mapa').select('id,codigo,nome,bairro,zona,municipio,corretor_principal,latitude,longitude,poligono_geojson,area_adotada_m2').eq('empresa_id', empresa),
    supabase.from('fases_modelo').select('codigo,nome,ordem,entrada,ativo').eq('empresa_id', empresa).order('ordem'),
    supabase.from('etapas_modelo').select('fase,codigo,nome,ordem').eq('empresa_id', empresa).order('ordem'),
    supabase.from('subetapas_modelo').select('fase,etapa,codigo,nome,ordem,ativo').eq('empresa_id', empresa).order('ordem'),
    supabase.from('processos').select('terreno_id,fase,etapa_atual,subetapa_atual,status,data_inicio').eq('empresa_id', empresa).is('parte_id', null).order('data_inicio'),
  ]);
  for (const r of [m, f, e, s, p]) if (r.error) throw r.error;
  type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const fases: Fase[] = (f.data as R[]).map((x) => ({
    k: x.codigo, nome: x.nome, entrada: !!x.entrada, ativo: x.ativo !== false,
    etapas: (e.data as R[]).filter((y) => y.fase === x.codigo).map((y) => ({
      k: y.codigo, nome: y.nome,
      subs: (s.data as R[]).filter((z) => z.fase === x.codigo && z.etapa === y.codigo && z.ativo !== false).map((z) => ({ k: z.codigo, nome: z.nome })),
    })),
  }));
  const procs = (p.data as R[]).map((x) => ({ t: x.terreno_id as string, fase: x.fase, etapa: x.etapa_atual, sub: x.subetapa_atual, status: x.status }));
  const terrenos: TerrenoMapa[] = (m.data as R[]).map((x) => ({
    id: x.id, codigo: x.codigo, nome: x.nome ?? x.codigo, bairro: x.bairro, zona: x.zona, municipio: x.municipio, corretor: x.corretor_principal,
    lat: x.latitude, lng: x.longitude, poly: anel(x.poligono_geojson), area: x.area_adotada_m2,
    procs: procs.filter((q) => q.t === x.id).map(({ fase, etapa, sub, status }) => ({ fase, etapa, sub, status })),
  }));
  return { fases, terrenos };
}
