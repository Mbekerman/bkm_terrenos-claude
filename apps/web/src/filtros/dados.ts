/* Filtros de terrenos, porte de tools/prototipo/proto_filtros.js (decisões do Moises, 23/out e 4/nov/2026): definição dos
   filtros, quem passa e as contagens. Funções puras sobre TerFx, que carregarFx monta de app.v_terrenos, dos processos e
   do que a completude da ficha pede. Dentro de um filtro as opções somam (ou); entre filtros, todos valem (e). Faixa com
   mínimo ou máximo deixa de fora quem não tem o dado, salvo "Incluir sem informação". */
import { supabase } from '../lib/supabase';
import { FORMA, ORIGEM, data as fd, milhoes } from '../lib/format';
import { completude, proprietariosCompletos, TEMP, type Ficha } from '../ficha/dados';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ProcFx { fase: string; etapa: string; sub: string | null; status: string }
export interface SubFx { k: string; nome: string }
export interface EtapaFx { k: string; nome: string; subs: SubFx[] }
export interface FaseFx { k: string; nome: string; ativo: boolean; etapas: EtapaFx[] }
export interface TerFx {
  id: string; nome: string; codigo: string | null; uf: string | null; cidade: string | null; zona: string | null; bairro: string | null; temp: number | null;
  pedido: number | null; area: number | null; proposta: number | null; vgv: number | null; corretores: string[]; forma: string | null;
  origem: string | null; zonas: string[]; resp: string | null; ident: string | null; pct: number; procs: ProcFx[];
}
export interface DadosFx { fases: FaseFx[]; ters: TerFx[]; corretores: [string, string][]; pessoas: [string, string][] }

export async function carregarFx(emp: string): Promise<DadosFx> {
  const [v, t, p, f, e, s, mat, ins, pes, inf, itI, cor, pts] = await Promise.all([
    supabase.from('v_terrenos').select('id,nome,codigo,uf,municipio,zona,bairro,logradouro,numero,temperatura,valor_pedido,area_adotada_m2,proposta_ativa_valor,vgv,corretor_ids,forma_pagamento_pedida,origem_cadastro,zonas_siglas,responsavel_id,data_identificacao').eq('empresa_id', emp),
    supabase.from('terrenos').select('id,latitude,testada_principal_m,situacao_ocupacao').eq('empresa_id', emp),
    supabase.from('processos').select('terreno_id,fase,etapa_atual,subetapa_atual,status,data_inicio').eq('empresa_id', emp).is('parte_id', null).order('data_inicio'),
    supabase.from('fases_modelo').select('codigo,nome,ordem,ativo').eq('empresa_id', emp).order('ordem'),
    supabase.from('etapas_modelo').select('fase,codigo,nome,ordem').eq('empresa_id', emp).order('ordem'),
    supabase.from('subetapas_modelo').select('fase,etapa,codigo,nome,ordem,ativo').eq('empresa_id', emp).order('ordem'),
    supabase.from('matriculas').select('terreno_id').eq('empresa_id', emp),
    supabase.from('inscricoes_municipais').select('terreno_id').eq('empresa_id', emp),
    supabase.from('terreno_pessoas').select('terreno_id,parte_id,percentual_participacao').eq('empresa_id', emp).eq('papel', 'proprietario'),
    supabase.from('v_terreno_infraestrutura').select('terreno_id,item,disponibilidade'),
    supabase.from('itens_infraestrutura').select('codigo,viabilidade_tecnica'),
    supabase.from('corretores').select('id,pessoas(nome_razao_social)').eq('empresa_id', emp),
    supabase.from('terreno_partes').select('id,terreno_id').eq('empresa_id', emp).eq('ativa', true),
  ]);
  for (const r of [v, t, p, f, e, s, mat, ins, pes, inf, itI, cor, pts]) if (r.error) throw r.error;
  const fases: FaseFx[] = (f.data as R[]).map((x) => ({
    k: x.codigo, nome: x.nome, ativo: x.ativo !== false,
    etapas: (e.data as R[]).filter((y) => y.fase === x.codigo).map((y) => ({
      k: y.codigo, nome: y.nome,
      subs: (s.data as R[]).filter((z) => z.fase === x.codigo && z.etapa === y.codigo && z.ativo !== false).map((z) => ({ k: z.codigo, nome: z.nome })),
    })),
  }));
  const quantos = (rs: R[]) => { const m: Record<string, number> = {}; for (const r of rs) m[r.terreno_id] = (m[r.terreno_id] ?? 0) + 1; return m; };
  const qM = quantos(mat.data as R[]), qI = quantos(ins.data as R[]);
  const grupo = (rs: R[]) => { const m: Record<string, R[]> = {}; for (const r of rs) (m[r.terreno_id] ??= []).push(r); return m; };
  const donosT = grupo(pes.data as R[]), partesT = grupo(pts.data as R[]);
  const visita = new Set((itI.data as R[]).filter((i) => !i.viabilidade_tecnica).map((i) => i.codigo));
  const qNV = quantos((inf.data as R[]).filter((i) => visita.has(i.item) && i.disponibilidade === 'nao_verificado'));
  const tr = Object.fromEntries((t.data as R[]).map((x) => [x.id, x]));
  const procs: Record<string, ProcFx[]> = {};
  for (const x of p.data as R[]) (procs[x.terreno_id] ??= []).push({ fase: x.fase, etapa: x.etapa_atual, sub: x.subetapa_atual, status: x.status });
  const vs = v.data as R[];
  const ids = [...new Set(vs.map((x) => x.responsavel_id).filter(Boolean))];
  const us = ids.length ? await supabase.from('usuarios').select('user_id,nome,email').in('user_id', ids) : { data: [], error: null };
  if (us.error) throw us.error;
  const zs = (z: unknown) => (Array.isArray(z) ? z : z ? String(z).split(/\s*\/\s*/) : []).filter(Boolean) as string[];
  const ters: TerFx[] = vs.map((x) => {
    const r = tr[x.id] ?? {};
    const fic = { logradouro: x.logradouro, numero: x.numero, bairro: x.bairro, municipio: x.municipio, uf: x.uf, zona: x.zona, lat: r.latitude, area: x.area_adotada_m2, testada: r.testada_principal_m,
      ocupacao: r.situacao_ocupacao, qMat: qM[x.id] ?? 0, qInsc: qI[x.id] ?? 0, temProprietario: proprietariosCompletos((partesT[x.id] ?? []).map((y) => y.id), donosT[x.id] ?? []), zonas: zs(x.zonas_siglas).join(' / ') || null,
      infraNV: qNV[x.id] ?? 0, valorPedido: x.valor_pedido, temp: x.temperatura } as unknown as Ficha;
    return {
      id: x.id, nome: x.nome ?? '', codigo: x.codigo ?? null, uf: x.uf, cidade: x.municipio, zona: x.zona, bairro: x.bairro, temp: x.temperatura, pedido: x.valor_pedido == null ? null : +x.valor_pedido,
      area: x.area_adotada_m2 == null ? null : +x.area_adotada_m2, proposta: x.proposta_ativa_valor == null ? null : +x.proposta_ativa_valor,
      vgv: x.vgv == null ? null : +x.vgv, corretores: x.corretor_ids ?? [], forma: x.forma_pagamento_pedida, origem: x.origem_cadastro,
      zonas: zs(x.zonas_siglas), resp: x.responsavel_id, ident: x.data_identificacao, pct: completude(fic).pct, procs: procs[x.id] ?? [],
    };
  });
  const corretores = (cor.data as R[]).map((c) => [c.id, (c.pessoas as R | null)?.nome_razao_social ?? 'Corretor'] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], 'pt'));
  const pessoas = (us.data as R[]).map((u) => [u.user_id, u.nome || u.email] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], 'pt'));
  return { fases, ters, corretores, pessoas };
}

/* ---------- definição dos filtros ---------- */
export type Filtro = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** onde o filtro vale: no quadro do Funil a descida fase › etapa já é o filtro do funil */
export type Ctx = 'mapa' | 'kanban';
export interface Def {
  k: string; g: string; l: string; tipo: 'lista' | 'faixa' | 'marca' | 'periodo' | 'numero'; funil?: boolean; busca?: boolean; dica?: string; dica2?: string;
  un?: string; op?: (d: DadosFx, f: Filtro) => [string, string, string?][]; v?: (t: TerFx) => unknown; p?: (t: TerFx, eu: string | null) => boolean;
  vis?: (d: DadosFx, f: Filtro) => boolean; suf?: string; ph?: string; chip?: (v: unknown) => string; menor?: boolean;
}
export const GRUPOS: [string, string][] = [['funil', 'Funil'], ['comercial', 'Comercial'], ['local', 'Localização'], ['terreno', 'Terreno'], ['gestao', 'Gestão']];
const ZONA: Record<string, string> = { leste: 'Leste', oeste: 'Oeste', norte: 'Norte', sul: 'Sul', centro: 'Centro', sudeste: 'Sudeste', sudoeste: 'Sudoeste', nordeste: 'Nordeste', noroeste: 'Noroeste' };
const pctVgv = (v: number | null, t: TerFx) => (v != null && t.vgv ? (v / t.vgv) * 100 : null);
const m2De = (v: number | null, t: TerFx) => (v != null && t.area ? v / t.area : null);
const sel = (f: Filtro, k: string): string[] => f[k] || [];
const fasesSel = (d: DadosFx, f: Filtro) => sel(f, 'fase').filter((k) => d.fases.some((x) => x.k === k));
const etapaF = (d: DadosFx, f: string, e: string) => d.fases.find((x) => x.k === f)?.etapas.find((x) => x.k === e);
const etapasSel = (d: DadosFx, f: Filtro) => sel(f, 'etapa').map((x) => x.split(':')).filter(([a, b]) => fasesSel(d, f).includes(a) && etapaF(d, a, b));
function distintos(d: DadosFx, fv: (t: TerFx) => unknown, pre?: (t: TerFx) => boolean): [string, string][] {
  const s = new Set<string>();
  d.ters.filter(pre ?? (() => true)).forEach((t) => ([] as unknown[]).concat(fv(t) ?? []).forEach((v) => v && s.add(String(v))));
  return [...s].sort((a, b) => a.localeCompare(b, 'pt')).map((v) => [v, v]);
}
export const FX: Def[] = [
  { k: 'fase', g: 'funil', l: 'Fase', tipo: 'lista', funil: true, op: (d) => d.fases.filter((x) => x.ativo).map((x) => [x.k, x.nome]) },
  { k: 'etapa', g: 'funil', l: 'Etapa', tipo: 'lista', funil: true, op: (d, f) => fasesSel(d, f).flatMap((fk) => (d.fases.find((x) => x.k === fk)?.etapas ?? []).map((e) => [fk + ':' + e.k, e.nome, fk] as [string, string, string])),
    vis: (d, f) => fasesSel(d, f).length > 0, dica: 'Marque uma fase para escolher as etapas.' },
  { k: 'sub', g: 'funil', l: 'Subetapa', tipo: 'lista', funil: true, op: (d, f) => etapasSel(d, f).flatMap(([fk, ek]) => (etapaF(d, fk, ek)?.subs ?? []).map((s) => [fk + ':' + s.k, s.nome, fk] as [string, string, string])),
    vis: (d, f) => etapasSel(d, f).length > 0, dica: 'Marque uma etapa para escolher as subetapas.' },
  { k: 'temp', g: 'comercial', l: 'Temperatura', tipo: 'lista', op: () => [['5', '5 · ' + TEMP[5]], ['4', '4 · ' + TEMP[4]], ['3', '3'], ['2', '2'], ['1', '1'], ['na', 'Não avaliada']],
    v: (t) => (t.procs.length ? String(t.temp || 'na') : null) },
  { k: 'preco', g: 'comercial', l: 'Preço pedido', dica2: 'da oferta de referência', tipo: 'faixa', un: 'R$', v: (t) => t.pedido },
  { k: 'm2', g: 'comercial', l: 'Preço pedido por m²', tipo: 'faixa', un: 'R$', v: (t) => m2De(t.pedido, t) },
  { k: 'pvgv', g: 'comercial', l: 'Preço pedido em % do VGV', dica2: 'VGV do estudo válido', tipo: 'faixa', un: '%', v: (t) => pctVgv(t.pedido, t) },
  { k: 'temProp', g: 'comercial', l: 'Proposta ativa', dica2: 'apresentada, em análise ou aceita', tipo: 'lista', op: () => [['sim', 'Sim'], ['nao', 'Não']], v: (t) => (t.proposta != null ? 'sim' : 'nao') },
  { k: 'prop', g: 'comercial', l: 'Proposta ativa: valor', tipo: 'faixa', un: 'R$', v: (t) => t.proposta },
  { k: 'propM2', g: 'comercial', l: 'Proposta ativa: valor por m²', tipo: 'faixa', un: 'R$', v: (t) => m2De(t.proposta, t) },
  { k: 'propVgv', g: 'comercial', l: 'Proposta ativa: valor em % do VGV', tipo: 'faixa', un: '%', v: (t) => pctVgv(t.proposta, t) },
  { k: 'vgv', g: 'comercial', l: 'VGV estimado', dica2: 'do estudo válido', tipo: 'faixa', un: 'R$', v: (t) => t.vgv },
  { k: 'corretor', g: 'comercial', l: 'Corretor', dica2: 'do terreno ou de qualquer parte', tipo: 'lista', busca: true, op: (d) => d.corretores, v: (t) => t.corretores },
  { k: 'forma', g: 'comercial', l: 'Forma de pagamento aceita', dica2: 'da oferta de referência', tipo: 'lista', op: () => Object.entries(FORMA), v: (t) => t.forma },
  { k: 'origem', g: 'comercial', l: 'Origem do cadastro', tipo: 'lista', op: () => Object.entries(ORIGEM), v: (t) => t.origem },
  { k: 'uf', g: 'local', l: 'Estado', tipo: 'lista', op: (d) => distintos(d, (t) => t.uf), v: (t) => t.uf },
  { k: 'cidade', g: 'local', l: 'Cidade', tipo: 'lista', op: (d, f) => distintos(d, (t) => t.cidade, (t) => !sel(f, 'uf').length || sel(f, 'uf').includes(t.uf ?? '')), v: (t) => t.cidade },
  { k: 'zona', g: 'local', l: 'Região', tipo: 'lista', op: () => Object.entries(ZONA), v: (t) => t.zona },
  { k: 'bairro', g: 'local', l: 'Bairro', tipo: 'lista', busca: true, op: (d, f) => distintos(d, (t) => t.bairro, (t) => !sel(f, 'cidade').length || sel(f, 'cidade').includes(t.cidade ?? '')), v: (t) => t.bairro },
  { k: 'zon', g: 'terreno', l: 'Zoneamento', dica2: 'análise vigente', tipo: 'lista', busca: true, op: (d) => distintos(d, (t) => t.zonas), v: (t) => t.zonas },
  { k: 'area', g: 'terreno', l: 'Área', dica2: 'área adotada', tipo: 'faixa', un: 'm²', v: (t) => t.area },
  { k: 'meus', g: 'gestao', l: 'Meus terrenos', tipo: 'marca', p: (t, eu) => !!eu && t.resp === eu },
  { k: 'resp', g: 'gestao', l: 'Por analista', dica2: 'responsável pelo terreno', tipo: 'lista', op: (d) => d.pessoas, v: (t) => t.resp },
  { k: 'ident', g: 'gestao', l: 'Cadastrado entre', tipo: 'periodo', v: (t) => t.ident },
  { k: 'incomp', g: 'gestao', l: 'Ficha incompleta: menos de', tipo: 'numero', un: '%', menor: true, suf: '% preenchida', ph: 'Ex.: 50',
    chip: (v) => `Ficha com menos de ${v}% preenchida`, v: (t) => t.pct },
];
export const FXK: Record<string, Def> = Object.fromEntries(FX.map((d) => [d.k, d]));

/** filtros que saíram (guardados na sessão, no endereço ou numa visão) não valem mais */
export const soValidos = (f: Filtro): Filtro => Object.fromEntries(Object.entries(f || {}).filter(([k]) => FXK[k]));
export function tem(d: Def, f: Filtro): boolean {
  const v = f[d.k];
  if (d.tipo === 'lista') return Array.isArray(v) && v.length > 0;
  if (d.tipo === 'marca') return !!v;
  if (d.tipo === 'faixa' || d.tipo === 'periodo') return !!v && (v.min != null || v.max != null);
  return v != null && v !== '';
}
export const valeEm = (d: Def, ctx: Ctx, D: DadosFx, f: Filtro) => !(ctx === 'kanban' && d.funil) && (!d.vis || d.vis(D, f));
export const ativos = (ctx: Ctx, D: DadosFx, f: Filtro) => FX.filter((d) => tem(d, f) && valeEm(d, ctx, D, f));

/* funil: fase, etapa e subetapa juntos sobre o mesmo processo aberto (ativo ou Stand By) */
function passaFunil(t: TerFx, f: Filtro, ctx: Ctx, D: DadosFx): boolean {
  if (ctx === 'kanban') return true;
  const fs = sel(f, 'fase'), es = sel(f, 'etapa').filter((x) => fs.includes(x.split(':')[0])), ss = sel(f, 'sub').filter((x) => es.some((e) => x.startsWith(e.split(':')[0] + ':')));
  if (!fs.length) return true;
  const etOk = (p: ProcFx) => {
    const daFase = es.filter((x) => x.startsWith(p.fase + ':'));
    if (!daFase.length) return true;
    if (!daFase.includes(p.fase + ':' + p.etapa)) return false;
    const subs = ss.filter((x) => { const [ff, sk] = x.split(':'); return ff === p.fase && (etapaF(D, ff, p.etapa)?.subs ?? []).some((s) => s.k === sk); });
    return !subs.length || subs.includes(p.fase + ':' + p.sub);
  };
  return t.procs.some((p) => fs.includes(p.fase) && (p.status === 'ativo' || p.status === 'stand_by') && etOk(p));
}
function passaUm(t: TerFx, d: Def, f: Filtro, eu: string | null): boolean {
  const v = f[d.k];
  if (d.tipo === 'marca') return !!d.p?.(t, eu);
  const x = d.v!(t) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (d.tipo === 'lista') return ([] as unknown[]).concat(x ?? []).some((y) => v.includes(String(y)));
  if (d.tipo === 'faixa') { if (x == null) return !!v.semInfo; return (v.min == null || x >= v.min) && (v.max == null || x <= v.max); }
  if (d.tipo === 'periodo') { if (!x) return false; return (!v.min || x >= v.min) && (!v.max || x <= v.max); }
  return x != null && (d.menor ? x < Number(v) : x > Number(v));
}
/** passa em tudo, menos (opcional) o filtro `fora`, para as contagens de cada opção */
export function passa(t: TerFx, ctx: Ctx, D: DadosFx, f: Filtro, eu: string | null, fora?: string): boolean {
  let g = f;
  if (fora && FXK[fora]?.funil) { g = { ...f }; delete g[fora]; if (fora === 'fase') { delete g.etapa; delete g.sub; } if (fora === 'etapa') delete g.sub; }
  if (!passaFunil(t, g, ctx, D)) return false;
  return FX.every((d) => d.funil || d.k === fora || !tem(d, f) || !valeEm(d, ctx, D, f) || passaUm(t, d, f, eu));
}
/** quantos ficam marcando a opção, com os outros filtros valendo */
export function conta(d: Def, val: string, ctx: Ctx, D: DadosFx, f: Filtro, eu: string | null): number {
  const base = D.ters.filter((t) => passa(t, ctx, D, f, eu, d.k));
  if (d.funil) { const g: Filtro = { ...f, [d.k]: [val] }; if (d.k === 'fase') { delete g.etapa; delete g.sub; } return base.filter((t) => passa(t, ctx, D, g, eu)).length; }
  return base.filter((t) => ([] as unknown[]).concat(d.v!(t) ?? []).map(String).includes(val)).length;
}
/** tira etapa e subetapa que não valem mais e filtros vazios */
export function limparDependentes(f: Filtro, D: DadosFx): Filtro {
  const g = { ...f }, fs = fasesSel(D, g);
  if (g.etapa) { g.etapa = g.etapa.filter((x: string) => fs.includes(x.split(':')[0])); if (!g.etapa.length) delete g.etapa; }
  const es = etapasSel(D, g);
  if (g.sub) { g.sub = g.sub.filter((x: string) => { const [a, b] = x.split(':'); return es.some(([ff, e]) => ff === a && (etapaF(D, a, e)?.subs ?? []).some((z) => z.k === b)); }); if (!g.sub.length) delete g.sub; }
  for (const k of Object.keys(g)) if (FXK[k] && !tem(FXK[k], g)) delete g[k];
  return g;
}
export function tira(f: Filtro, k: string): Filtro {
  const g = { ...f };
  delete g[k];
  if (k === 'fase') { delete g.etapa; delete g.sub; }
  if (k === 'etapa') delete g.sub;
  return g;
}

/* ---------- textos dos chips ---------- */
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fxNum = (v: number, un?: string) => (un === 'R$' ? milhoes(v) : un === 'm²' ? num(v) + ' m²' : num(v) + (un ? ' ' + un : ''));
export function chipTxt(d: Def, f: Filtro, D: DadosFx): string {
  const v = f[d.k];
  if (d.tipo === 'marca') return d.l;
  if (d.tipo === 'lista') {
    const ops = new Map((d.op?.(D, f) ?? []).map((o) => [o[0], o[1]]));
    const ls = (v as string[]).map((x) => ops.get(x) || x);
    if (d.k === 'etapa' || d.k === 'sub') return `${d.l}: ${ls.join(', ')}`;
    return `${d.k === 'temp' ? '' : d.l + ': '}${ls.length > 2 ? ls.slice(0, 2).join(', ') + ' +' + (ls.length - 2) : ls.join(', ')}`;
  }
  if (d.tipo === 'faixa') {
    const a = v.min != null ? fxNum(v.min, d.un) : null, b = v.max != null ? fxNum(v.max, d.un) : null;
    return `${d.l} ${a && b ? a + ' a ' + b : a ? '≥ ' + a : 'até ' + b}${v.semInfo ? ' (com sem informação)' : ''}`;
  }
  if (d.tipo === 'periodo') return `Cadastrado ${v.min && v.max ? fd(v.min) + ' a ' + fd(v.max) : v.min ? 'desde ' + fd(v.min) : 'até ' + fd(v.max)}`;
  return d.chip ? d.chip(v) : `${d.l} ${v}`;
}

/** valores digitados: "12 mi", "800 mil", "1.500.000" */
export function lerNum(s: string): number | null {
  s = String(s || '').trim().toLowerCase().replace(/r\$\s*/, '');
  if (!s) return null;
  let mult = 1;
  if (/\bmi(lh[õo]es|lhão)?\b|\bmi$/.test(s)) { mult = 1e6; s = s.replace(/mi.*$/, ''); }
  else if (/\bmil\b/.test(s)) { mult = 1e3; s = s.replace(/mil.*$/, ''); }
  s = s.trim().replace(/\./g, '').replace(',', '.');
  const v = Number(s);
  return isFinite(v) && s !== '' ? v * mult : null;
}
