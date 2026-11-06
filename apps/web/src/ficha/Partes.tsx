/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { useRascunho } from '../components/Rascunho';
import { empilhar } from '../components/Desfazer';
import { Adorno } from '../lib/mascara';
import { Ic } from '../components/Moldura';
import { data as fd, m2 } from '../lib/format';
import { centroPoly, fixa, geojson, lotesUniao, type P } from '../novo/geo';
import { digitos, GEO_BASE, loteDoSql } from '../novo/geosampa';
import { consultarLote, consultarTerreno, useConsultaGeo } from '../novo/consulta';
import type { Ficha, R } from './dados';
import { lerNum, num, Quadro } from './edicao';
import { useNavigate } from 'react-router-dom';
import LotesGeo from '../novo/LotesGeo';
import type { LoteSql } from '../novo/geosampa';
import { pedirOferta } from './Comercial';

// Aba Terreno, segunda metade (proto_lotes.js): Partes (um cartão por parte, com o contato opcional) e Matrículas e SQLs
// em etiquetas (matrícula amarela, SQL roxa) arrastadas para as partes; a janela da etiqueta com os dados, a consulta da
// prefeitura e o IPTU (só o exercício mais recente). Cada SQL incluído ou excluído refaz a poligonal pela soma dos lotes
// da prefeitura (São Paulo); a desenhada fica guardada e volta quando não sobra SQL com lote.

const SIT_IPTU: Record<string, string> = { nao_informada: 'Não informada', tributado: 'Tributado', isento: 'Isento' };
const brl = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d }));
const CRIS = Array.from({ length: 18 }, (_, i) => `${i + 1}º CRI`);
const soma = (v: number[]) => v.reduce((s, x) => s + x, 0);
/** máscara da inscrição da cidade (0 = dígito) */
const mascarar = (s: string, m: string) => { const d = digitos(s); let o = '', i = 0; for (const c of m) { if (i >= d.length) break; o += c === '0' ? d[i++] : c; } return o; };
const fmtTel = (v: string | null) => { const d = digitos(v ?? ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : v ?? ''; };
const fmtDoc = (v: string | null) => { const d = digitos(v ?? ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : v ?? ''; };

/* cm e ci: as etiquetas nas partes (matricula_partes, inscricao_partes); o mesmo lote pode estar em mais de uma parte,
   com o percentual dela no lote opcional (pedido do Moisés, 6/nov/2026); lote sem etiqueta está sem parte */
export interface Lotes { partes: R[]; mats: R[]; insc: R[]; cm: R[]; ci: R[]; base: R | null; consultas: Record<string, R> }
export function useLotes(f: Ficha) {
  return useQuery({
    queryKey: ['ficha-lotes', f.id],
    queryFn: async (): Promise<Lotes> => {
      const [pt, m, i, c, b, cm, ci] = await Promise.all([
        supabase.from('terreno_partes').select('id,nome,pessoa_nome,telefone,email,documento,observacoes,ativa,criado_em').eq('terreno_id', f.id).eq('ativa', true).order('criado_em'),
        supabase.from('matriculas').select('id,numero,numero_norm,cartorio,area_registrada_m2,data_certidao').eq('terreno_id', f.id).order('numero_norm'),
        supabase.from('inscricoes_municipais').select('id,inscricao,inscricao_norm,municipio_id,area_cadastral_m2,cib,zona_fiscal,origem,endereco_prefeitura,inscricao_valores(id,exercicio,revisao,vigente,valor_venal_terreno,valor_venal_construcao,valor_venal_imovel,situacao_iptu,iptu_valor_anual,iptu_parcelas,iptu_mensal_informado,fonte)').eq('terreno_id', f.id).order('inscricao_norm'),
        supabase.from('consultas_lote').select('inscricao_id,consultado_em,base,lote,zonas,poligono_geojson,area_poligono_m2,camadas_com_erro').eq('terreno_id', f.id).order('consultado_em', { ascending: false }),
        f.t.municipio_id ? supabase.from('bases_cadastrais').select('codigo,municipio_id,nome,rotulo,mascara').eq('municipio_id', f.t.municipio_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        supabase.from('matricula_partes').select('id,matricula_id,parte_id,percentual').eq('terreno_id', f.id),
        supabase.from('inscricao_partes').select('id,inscricao_id,parte_id,percentual').eq('terreno_id', f.id),
      ]);
      for (const r of [pt, m, i, c, b, cm, ci]) if (r.error) throw r.error;
      const consultas: Record<string, R> = {};
      for (const x of (c.data ?? []) as R[]) if (x.inscricao_id && !consultas[x.inscricao_id]) consultas[x.inscricao_id] = x;
      return { partes: (pt.data ?? []) as R[], mats: (m.data ?? []) as R[], insc: (i.data ?? []) as R[], cm: (cm.data ?? []) as R[], ci: (ci.data ?? []) as R[], base: (b.data as R) ?? null, consultas };
    },
  });
}

type Tp = 'm' | 's';
const FK = { m: 'matricula_id', s: 'inscricao_id' } as const;
const TAB_C = { m: 'matricula_partes', s: 'inscricao_partes' } as const;
const lotesDe = (L: Lotes, tipo: Tp) => (tipo === 'm' ? L.mats : L.insc);
const copiasDe = (L: Lotes, tipo: Tp) => (tipo === 'm' ? L.cm : L.ci);
/** etiquetas do lote nas partes */
export const copias = (L: Lotes, tipo: Tp, lote: string) => copiasDe(L, tipo).filter((c) => c[FK[tipo]] === lote);
/** fração da etiqueta no lote: o percentual informado; sem ele, o que sobra dos informados dividido igual entre as sem
   percentual (estimada); uma etiqueta só é o lote inteiro (como app.v_etiquetas) */
export function fracao(L: Lotes, tipo: Tp, c: R): { f: number; est: boolean } {
  if (c.percentual != null) return { f: +c.percentual / 100, est: false };
  const cs = copias(L, tipo, c[FK[tipo]]), inf = soma(cs.filter((x) => x.percentual != null).map((x) => +x.percentual)), sem = cs.filter((x) => x.percentual == null).length;
  return { f: Math.max(0, 1 - inf / 100) / (sem || 1), est: cs.length > 1 };
}
/** lotes de um tipo na parte, cada um com a etiqueta dela */
export function daParte(L: Lotes, tipo: Tp, pid: string): { x: R; c: R }[] {
  const ls = lotesDe(L, tipo);
  return copiasDe(L, tipo).filter((c) => c.parte_id === pid).map((c) => ({ x: ls.find((l) => l.id === c[FK[tipo]])!, c })).filter((e) => e.x)
    .sort((a, b) => String(a.x.numero_norm ?? a.x.inscricao_norm).localeCompare(String(b.x.numero_norm ?? b.x.inscricao_norm)));
}
const areaDe = (L: Lotes, tipo: Tp, es: { x: R; c: R }[]) => {
  const k = tipo === 'm' ? 'area_registrada_m2' : 'area_cadastral_m2';
  return es.every((e) => e.x[k] != null) ? Math.round(soma(es.map((e) => +e.x[k] * fracao(L, tipo, e.c).f)) * 100) / 100 : null;
};
/** área da parte: a soma das matrículas (todas com área); sem matrícula, a dos SQLs (todos com área cadastral); o lote de
   mais de uma parte entra pela fração da parte nele */
export function ptArea(L: Lotes, pid: string): { area: number | null; fonte: string | null } {
  const ms = daParte(L, 'm', pid), is = daParte(L, 's', pid);
  if (ms.length) { const a = areaDe(L, 'm', ms); return a != null ? { area: a, fonte: 'matrículas' } : { area: null, fonte: null }; }
  if (is.length) { const a = areaDe(L, 's', is); return a != null ? { area: a, fonte: 'SQLs' } : { area: null, fonte: null }; }
  return { area: null, fonte: null };
}
/** Matrícula × Prefeitura da parte: área cadastral dos SQLs contra a das matrículas, em % da matrícula */
function ptDiv(L: Lotes, pid: string) {
  const ms = daParte(L, 'm', pid), is = daParte(L, 's', pid);
  if (!ms.length || !is.length) return null;
  const a = areaDe(L, 'm', ms), b = areaDe(L, 's', is);
  return a && b != null ? Math.round(((b - a) / a) * 1000) / 10 : null;
}

function useRecarregar(f: Ficha) {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ['ficha-lotes', f.id] }); qc.invalidateQueries({ queryKey: ['ficha-pessoas', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); qc.invalidateQueries({ queryKey: ['mapa'] }); };
}

/** refaz a poligonal pela soma dos lotes dos SQLs (São Paulo); sem SQL com lote, volta a desenhada */
let refazendo = false;
export async function refazerPoligonal(f: Ficha, como: string, aviso: (m: string, erro?: boolean) => void) {
  if (refazendo || !GEO_BASE) return;
  refazendo = true;
  try {
    const [{ data: ins }, { data: cs }, { data: t, error }] = await Promise.all([
      supabase.from('inscricoes_municipais').select('id,inscricao,inscricao_norm').eq('terreno_id', f.id),
      supabase.from('consultas_lote').select('inscricao_id,poligono_geojson,consultado_em').eq('terreno_id', f.id).order('consultado_em', { ascending: false }),
      supabase.from('terrenos').select('versao,poligono_geojson,poligono_desenhado_geojson').eq('id', f.id).single(),
    ]);
    if (error || !t) throw error ?? new Error('Terreno não encontrado');
    const polys: P[][] = [], fora: string[] = [];
    for (const i of (ins ?? []) as R[]) {
      const c = ((cs ?? []) as R[]).find((x) => x.inscricao_id === i.id && x.poligono_geojson);
      let p: P[] | null = c ? (c.poligono_geojson.coordinates[0] as number[][]).slice(0, -1).map(([ln, la]) => [la, ln] as P) : null;
      if (!p) try { p = (await loteDoSql(i.inscricao_norm)).poly; } catch { p = null; }
      if (p) polys.push(p); else fora.push(i.inscricao);
    }
    const salvar = async (d: R) => {
      const r = await supabase.rpc('salvar_terreno', { p_terreno: f.id, p_versao: t.versao, p_dados: d });
      if (r.error) throw r.error;
    };
    if (!polys.length) {
      if (t.poligono_desenhado_geojson) {
        const p = (t.poligono_desenhado_geojson.coordinates[0] as number[][]).slice(0, -1).map(([ln, la]) => [la, ln] as P), c = centroPoly(p);
        await salvar({ poligono_geojson: t.poligono_desenhado_geojson, poligono_desenhado_geojson: null, latitude: +c[0].toFixed(7), longitude: +c[1].toFixed(7) });
        aviso('Sem SQL com lote: a poligonal voltou a ser a desenhada.');
      }
      return;
    }
    const u = lotesUniao(polys);
    if (!u) { aviso('Os lotes dos SQLs não se encostam: a poligonal continua a de antes.', true); return; }
    const g = geojson(fixa(u));
    if (JSON.stringify(g) === JSON.stringify(t.poligono_geojson)) return;
    const c = centroPoly(u);
    await salvar({ poligono_geojson: g, poligono_desenhado_geojson: t.poligono_desenhado_geojson ?? t.poligono_geojson ?? null,
      latitude: +c[0].toFixed(7), longitude: +c[1].toFixed(7), precisao_localizacao: 'aproximada' });
    aviso(`Poligonal refeita pelos lotes (${como}).` + (fora.length ? ` Sem lote na prefeitura: ${fora.join(', ')}.` : ''), !!fora.length);
  } catch (e: any) { aviso(e?.message ?? String(e), true); } finally { refazendo = false; }
}

/* ---------- Partes ---------- */
const CAMPOS_PT: [string, string, string, Record<string, string>][] = [
  ['pessoa_nome', 'Nome completo da pessoa principal', '', {}], ['telefone', 'Telefone', '(11) 98765-4321', { inputMode: 'tel', 'data-fmt': 'tel' }],
  ['email', 'E-mail', 'nome@email.com', { type: 'email' }], ['documento', 'CPF ou CNPJ', '000.000.000-00', { inputMode: 'numeric', 'data-fmt': 'doc' }],
];
function CartaoParte({ f, L, pa, n }: { f: Ficha; L: Lotes; pa: R; n: number }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar(f);
  const fmt = (k: string) => (k === 'telefone' ? fmtTel(pa[k]) : k === 'documento' ? fmtDoc(pa[k]) : pa[k] ?? '');
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => setV({ nome: pa.nome, observacoes: pa.observacoes ?? '', ...Object.fromEntries(CAMPOS_PT.map(([k]) => [k, fmt(k)])) }), [pa]); // eslint-disable-line react-hooks/exhaustive-deps
  async function gravar(k: string) {
    const novo = (v[k] ?? '').trim(), ant = k === 'nome' || k === 'observacoes' ? pa[k] ?? '' : fmt(k);
    if (novo === ant) return;
    if (k === 'nome') {
      if (!novo) { toast('A parte precisa de um título.', true); setV({ ...v, nome: pa.nome }); return; }
      if (L.partes.some((x) => x.id !== pa.id && x.nome.trim().toLowerCase() === novo.toLowerCase())) { toast('Já existe uma parte com este título.', true); setV({ ...v, nome: pa.nome }); return; }
    }
    const { error } = await supabase.rpc('salvar_parte', { p_terreno: f.id, p_parte: pa.id, p_dados: { [k]: novo || null } });
    if (error) { toast(error.message, true); setV({ ...v, [k]: ant }); return; }
    recarregar();
  }
  async function excluir() {
    const { error } = await supabase.rpc('excluir_parte', { p_parte: pa.id });
    if (error) { toast(error.message, true); return; }
    const k = daParte(L, 'm', pa.id).length + daParte(L, 's', pa.id).length;
    toast(`${pa.nome} excluída.${k ? ` ${k} etiqueta${k > 1 ? 's saíram' : ' saiu'} dela.` : ''}`);
    recarregar();
  }
  const nm = daParte(L, 'm', pa.id).length, ni = daParte(L, 's', pa.id).length;
  const inp = (k: string, l: string, ph: string, x: Record<string, string>) => (
    <label className="field" key={k}><span className="lbl-f">{l}</span>
      {edita ? <input value={v[k] ?? ''} placeholder={ph} {...x} onChange={(e) => setV({ ...v, [k]: e.target.value })} onBlur={() => gravar(k)} />
        : <span className="v">{fmt(k) || <span className="ni">Não informado</span>}</span>}</label>
  );
  return (
    <article className="pt2" id={`pt2-${pa.id}`}>
      <div className="pt2-h">
        {edita ? <input className="pt2-tit" value={v.nome ?? ''} aria-label="Título da parte" onChange={(e) => setV({ ...v, nome: e.target.value })} onBlur={() => gravar('nome')} /> : <b>{pa.nome}</b>}
        <span className={`chip ${nm || ni ? 'good' : ''}`}>{nm || ni ? [nm && nm + (nm > 1 ? ' matrículas' : ' matrícula'), ni && ni + (ni > 1 ? ' SQLs' : ' SQL')].filter(Boolean).join(' · ') : 'sem matrícula nem SQL'}</span>
        {edita && n > 1 && <button className="btn text sm pt2-x" onClick={excluir}><Ic n="lixo" s={16} />Excluir parte</button>}
      </div>
      <div className="pt2-g">
        {CAMPOS_PT.map(([k, l, ph, x]) => inp(k, l, ph, x))}
        <label className="field pt2-obs"><span className="lbl-f">Observação</span>
          {edita ? <textarea rows={1} value={v.observacoes ?? ''} onChange={(e) => setV({ ...v, observacoes: e.target.value })} onBlur={() => gravar('observacoes')} />
            : <span className="v">{pa.observacoes || <span className="ni">Não informada</span>}</span>}</label>
      </div>
    </article>
  );
}

function SecPartes({ f, L }: { f: Ficha; L: Lotes }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar(f);
  const P = L.partes;
  const [qtd, setQtd] = useState(String(P.length));
  useEffect(() => setQtd(String(P.length)), [P.length]);
  async function nova() {
    let n = P.length + 1;
    while (P.some((p) => p.nome.trim().toLowerCase() === 'vendedor ' + n)) n++;
    const { error } = await supabase.rpc('salvar_parte', { p_terreno: f.id, p_parte: null, p_dados: { nome: 'Vendedor ' + n } });
    if (error) { toast(error.message, true); return false; }
    return true;
  }
  async function ajustar(n: number) {
    n = Math.max(1, Math.min(30, n || 1));
    for (let i = P.length; i < n; i++) if (!(await nova())) break;
    if (n < P.length) {
      for (const pa of P.slice(n).reverse()) {
        const tem = L.cm.some((c) => c.parte_id === pa.id) || L.ci.some((c) => c.parte_id === pa.id) || ['pessoa_nome', 'telefone', 'email', 'documento', 'observacoes'].some((k) => pa[k]);
        if (tem) { toast(`${pa.nome} já tem dados, matrículas ou SQLs: use Excluir parte.`, true); break; }
        const { error } = await supabase.rpc('excluir_parte', { p_parte: pa.id });
        if (error) { toast(error.message, true); break; }
      }
    }
    recarregar();
  }
  return (
    <Quadro aba="terreno" id="partes-cad" titulo={<>Partes <span className="h-n">{P.length}</span></>}>
      <div className="sec-b">
        {edita && (
          <div className="pt2-qtd"><label htmlFor="pt2-n">Quantas partes vendem?</label>
            <span className="pt2-passo">
              <button type="button" className="iconbtn sm" aria-label="Uma parte a menos" disabled={P.length < 2} onClick={() => ajustar(P.length - 1)}>−</button>
              <input id="pt2-n" inputMode="numeric" value={qtd} aria-label="Quantidade de partes" onChange={(e) => setQtd(e.target.value)} onBlur={() => +qtd !== P.length && ajustar(parseInt(qtd, 10))}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              <button type="button" className="iconbtn sm" aria-label="Uma parte a mais" onClick={() => ajustar(P.length + 1)}>+</button>
            </span>
            <span className="faint">Todo terreno nasce com uma parte. Os dados da parte são opcionais.</span>
          </div>
        )}
        <div className="pt2-lista">{P.map((pa) => <CartaoParte key={pa.id} f={f} L={L} pa={pa} n={P.length} />)}</div>
        {edita && <button className="btn text sm qd-add" onClick={async () => { await nova(); recarregar(); }}><Ic n="add" s={16} />Adicionar parte</button>}
      </div>
    </Quadro>
  );
}

/* ---------- Matrículas e SQLs ---------- */
const FECHADAS = new Set<string>();
const RECOLHIDOS = new Set<Tp>();   // quadros de Matrículas e de SQLs recolhidos (só quando um fica sobre o outro), na sessão   // partes com o quadro recolhido (a seta recolhe a linha inteira)
/* a etiqueta: o lote (x) e, dentro de uma parte, a cópia dela (c); o mesmo lote pode ter cópia em mais de uma parte */
type Etq = { tipo: Tp; x: R; c?: R };
const chave = (e: Etq) => `${e.tipo}:${e.x.id}${e.c ? ':' + e.c.id : ''}`;
/** a etiqueta do lote sem nenhuma cópia, como se fosse uma cópia solta inteira (id vazio): a pizza, a barra e a janela
    valem igual, numa parte ou não (pedido do Moises, 6/nov/2026); gravar o percentual dela cria a cópia solta */
const virtual = (tipo: Tp, x: R): R => ({ id: '', [FK[tipo]]: x.id, parte_id: null, percentual: null });
const comC = (e: Etq): Etq & { c: R } => ({ ...e, c: e.c ?? virtual(e.tipo, e.x) });

function Etiqueta({ e, L, rot, edita, ver, tirar, menu, pct }: { e: Etq; L: Lotes; rot: string; edita: boolean; ver: (k: string) => void; tirar: (k: string) => void; menu: (k: string, x: number, y: number) => void; pct: (k: string, r: DOMRect) => void }) {
  const n = e.tipo === 'm' ? e.x.numero : e.x.inscricao, k = chave(e), c = e.c ?? virtual(e.tipo, e.x);
  /* mini pizza com a fração da parte no lote, sempre que a etiqueta está numa parte (cheia em 100%; com 0%, o alerta);
     o clique abre a barra do percentual (pedido do Moises, 6/nov/2026) */
  const cs = copias(L, e.tipo, e.x.id), fr = fracao(L, e.tipo, c);
  const pz: number | null = Math.round(fr.f * 1000) / 10;
  const dica = `${L.partes.find((pa) => pa.id === c.parte_id)?.nome ?? 'Solta'}: ${num(pz, pz % 1 ? 1 : 0)}% deste lote${fr.est ? ' (estimado: sem percentual informado)' : ''}${cs.length > 1 ? ` · em ${cs.length} cópias` : ''}`;
  const shared = cs.length > 1;
  return (
    <span className={`etq ${e.tipo}`} data-etq={k} tabIndex={edita ? 0 : undefined} aria-label={`${e.tipo === 'm' ? 'Matrícula' : rot} ${n}${pz != null ? ', ' + dica : ''}`}
      onContextMenu={(ev) => { if (!edita) return; ev.preventDefault(); menu(k, ev.clientX, ev.clientY); }}
      onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) { ev.preventDefault(); ver(k); } if (edita && (ev.key === 'ContextMenu' || (ev.shiftKey && ev.key === 'F10'))) { ev.preventDefault(); const r = ev.currentTarget.getBoundingClientRect(); menu(k, r.left, r.bottom); } }}>
      {pz != null && (edita
        ? <button type="button" className={`etq-pzb${pz === 0 ? ' zero' : ''}`} data-dica={`${num(pz, pz % 1 ? 1 : 0)}%${fr!.est ? ' estimado' : ''} · Clique para editar`}
            aria-label={`${num(pz, pz % 1 ? 1 : 0)}% deste lote${c.parte_id ? ' na parte' : ''}. Clique para editar`} onClick={(ev) => pct(k, ev.currentTarget.getBoundingClientRect())}>
            <span className={`etq-pz${fr!.est ? ' est' : ''}`} style={{ '--p': pz } as any} aria-hidden="true" /></button>
        : <span className={`etq-pz${fr!.est ? ' est' : ''}`} style={{ '--p': pz, marginLeft: 8 } as any} title={dica} aria-hidden="true" />)}
      <button type="button" className="etq-n num" title={pz === 0 ? 'Esta parte está com 0% deste lote: clique na pizza para dar o percentual' : dica} onClick={() => ver(k)}>
        {pz === 0 && <span className="etq-alerta" aria-hidden="true">!</span>}{n}</button>
      {edita && <button type="button" className="etq-ed" aria-label={`Editar ${e.tipo === 'm' ? 'a matrícula' : 'o ' + rot} ${n}`} title="Editar" onClick={() => ver(k)}><Ic n="edit" s={14} /></button>}
      {edita && <button type="button" className="etq-x" aria-label={`${shared ? 'Tirar desta parte' : 'Excluir'} ${e.tipo === 'm' ? 'a matrícula' : 'o ' + rot} ${n}`} title={shared ? 'Tirar desta parte' : 'Excluir'} onClick={() => tirar(k)}><Ic n="close" s={14} /></button>}
    </span>
  );
}

function SecLotes({ f, L }: { f: Ficha; L: Lotes }) {
  const [etq, abrirEtq] = useState<string | null>(null);
  const { edita, empresa } = useSessao();
  const toast = useToast(), recarregar = useRecarregar(f);
  const cons = useConsultaGeo();
  const sec = useRef<HTMLDivElement | null>(null);
  const soltou = useRef(0);
  const [, re] = useState(0);
  const [conf, setConf] = useState<string | null>(null);
  const [mat, setMat] = useState({ num: '', cri: f.t.cartorio ?? '', area: '' });
  const [sql, setSql] = useState('');
  const [grav, setGrav] = useState(false);
  const mref = useRef<HTMLFormElement>(null), sref = useRef<HTMLFormElement>(null);
  const { aviso: avisoM } = useRascunho(mref, !!(mat.num.trim() || mat.area.trim()), 'a matrícula', () => setMat({ num: '', cri: f.t.cartorio ?? '', area: '' }));
  const { aviso: avisoS } = useRascunho(sref, !!sql.trim(), `o ${L.base?.rotulo ?? 'SQL'}`, () => setSql(''));
  const [lg, setLg] = useState(false);
  const [dup, setDup] = useState<{ oque: string; codigo: string; nome: string } | null>(null);
  const navegar = useNavigate();
  /* matrícula ou SQL que já está em outro terreno não entra: pergunta se quer registrar uma nova oferta naquele terreno, e o
     analista decide lá se segue ou descarta (decisão do Moisés, 4/nov/2026); cartório em branco conta como o mesmo */
  async function outroTerreno(tipo: 'm' | 's', d: string, cri: string | null): Promise<R | null> {
    const q = tipo === 'm'
      ? supabase.from('matriculas').select('cartorio,terrenos(codigo,nome)').eq('empresa_id', empresa!.id).eq('numero_norm', d).neq('terreno_id', f.id)
      : supabase.from('inscricoes_municipais').select('terrenos(codigo,nome)').eq('empresa_id', empresa!.id).eq('inscricao_norm', d).neq('terreno_id', f.id)
        .eq('municipio_id', base?.municipio_id ?? f.t.municipio_id);
    const { data } = await q;
    const x = ((data ?? []) as R[]).find((r) => tipo === 's' || !r.cartorio || !cri || r.cartorio === cri);
    return x?.terrenos ?? null;
  }
  const P = L.partes, base = L.base, rot = base?.rotulo ?? 'Inscrição', sp = base?.codigo === 'geosampa';
  const crisSel = f.t.cartorio && !CRIS.includes(f.t.cartorio) ? [f.t.cartorio, ...CRIS] : CRIS;
  const LR = useRef(L);
  LR.current = L;
  const achar = (k: string): Etq | null => {
    const L2 = LR.current, [tipo, id, cid] = k.split(':') as [Tp, string, string | undefined];
    const x = lotesDe(L2, tipo).find((l) => l.id === id);
    return x ? { tipo, x, c: cid ? copiasDe(L2, tipo).find((c) => c.id === cid) : undefined } : null;
  };
  const nomeP = (pid: string | null) => (pid ? LR.current.partes.find((pa) => pa.id === pid)?.nome ?? 'a parte' : 'solta');
  const [menu, setMenu] = useState<{ k: string; x: number; y: number } | null>(null);
  const nome = (e: Etq) => (e.tipo === 'm' ? `Matrícula ${e.x.numero}` : `${rot} ${e.x.inscricao}`);
  const ver = (k: string) => { if (Date.now() - soltou.current > 400) abrirEtq(k); };

  /* operações nas etiquetas das partes (matricula_partes, inscricao_partes), todas com Ctrl+Z */
  const okR = (r: { error: any }) => { if (r.error) { toast(r.error.message, true); return false; } recarregar(); return true; };
  /* a tela muda na hora (cache da consulta) e a recarga confirma depois; sem isso a pizza esperava a ficha inteira recarregar */
  const qc = useQueryClient();
  const local = (tipo: Tp, fn: (cs: R[]) => R[]) => qc.setQueryData<Lotes>(['ficha-lotes', f.id], (l) => {
    if (!l) return l;
    const k = tipo === 'm' ? 'cm' : 'ci', n = { ...l, [k]: fn(l[k]) };
    LR.current = n;
    return n;
  });
  const inserir = async (tipo: Tp, rows: R[]) => { local(tipo, (cs) => [...cs, ...rows]); return okR(await supabase.from(TAB_C[tipo]).insert(rows)); };
  const apagarC = async (tipo: Tp, ids: string[]) => { local(tipo, (cs) => cs.filter((c) => !ids.includes(c.id))); return okR(await supabase.from(TAB_C[tipo]).delete().in('id', ids)); };
  const mudarC = async (tipo: Tp, id: string, v: R) => { local(tipo, (cs) => cs.map((c) => (c.id === id ? { ...c, ...v } : c))); return okR(await supabase.from(TAB_C[tipo]).update(v).eq('id', id)); };
  const nova = (e: Etq, pid: string | null): R => ({ id: crypto.randomUUID(), empresa_id: empresa!.id, terreno_id: f.id, [FK[e.tipo]]: e.x.id, parte_id: pid });
  const jaEm = (e: Etq, pid: string) => copias(LR.current, e.tipo, e.x.id).some((c) => c.parte_id === pid);
  /** leva a etiqueta para a parte (null = de volta para sem parte) */
  async function parte(k: string, pid: string | null) {
    const e = achar(k);
    if (!e) return;
    if (!e.c) {   // sem parte → parte
      if (!pid) return;
      const row = nova(e, pid);
      if (!(await inserir(e.tipo, [row]))) return;
      empilhar({ rotulo: `${nome(e)} na parte ${nomeP(pid)}`, fazer: () => apagarC(e.tipo, [row.id]), refazer: () => inserir(e.tipo, [row]) });
      return;
    }
    const c = e.c;
    if (c.parte_id === pid) return;
    /* com o lote em outras partes, sair da parte deixa a cópia solta, com o percentual dela, para distribuir depois */
    if (!pid && copias(LR.current, e.tipo, e.x.id).length < 2) {   // parte → sem parte: o lote volta a ficar solto
      const row = { id: c.id, empresa_id: empresa!.id, terreno_id: f.id, [FK[e.tipo]]: e.x.id, parte_id: c.parte_id, percentual: c.percentual ?? null };
      if (!(await apagarC(e.tipo, [c.id]))) return;
      empilhar({ rotulo: `${nome(e)} fora da parte ${nomeP(c.parte_id)}`, fazer: () => inserir(e.tipo, [row]), refazer: () => apagarC(e.tipo, [c.id]) });
      return;
    }
    if (pid && jaEm(e, pid)) { toast(`${nome(e)} já está na parte ${nomeP(pid)}.`, true); return; }
    const antes = c.parte_id;
    if (!(await mudarC(e.tipo, c.id, { parte_id: pid }))) return;
    empilhar({ rotulo: pid ? `${nome(e)} de parte` : `${nome(e)} solta`, fazer: () => mudarC(e.tipo, c.id, { parte_id: antes }), refazer: () => mudarC(e.tipo, c.id, { parte_id: pid }) });
  }
  /** duplica a etiqueta noutra parte: o lote passa a ser de mais de uma parte (pedido do Moisés, 6/nov/2026). A cópia nasce
      com o que falta para 100%; se o lote já está todo nas outras partes, nasce com 0% e o alerta. As etiquetas sem percentual
      ficam com o que tinham (estimado) por escrito, para a cópia não dividir com elas (pedido do Moises, 6/nov/2026) */
  async function duplicar(k: string) {
    const e = achar(k);
    if (!e) return;
    /* a cópia nasce no mesmo lugar da original: na mesma parte ou solta (pedido do Moises, 6/nov/2026) */
    const pid: string | null = e.c?.parte_id ?? null;
    const L2 = LR.current, cs = copias(L2, e.tipo, e.x.id);
    /* lote solto (sem nenhuma cópia): vira duas cópias soltas, a de agora com 100% e a nova com 0%, para distribuir depois */
    if (!cs.length) {
      const rows: R[] = [{ ...nova(e, null), percentual: 100 }, { ...nova(e, pid), percentual: 0 }];
      if (!(await inserir(e.tipo, rows))) return;
      toast(`${nome(e)} duplicada: a nova cópia nasce com 0%. Clique na pizza para dar o percentual de cada uma.`);
      empilhar({ rotulo: `${nome(e)} duplicada`, fazer: () => apagarC(e.tipo, rows.map((r) => r.id)), refazer: () => inserir(e.tipo, rows) });
      return;
    }
    const ef = cs.map((c) => ({ c, p: Math.round(fracao(L2, e.tipo, c).f * 10000) / 100 }));
    const resto = Math.round((100 - soma(ef.map((y) => y.p))) * 100) / 100;
    const fixar = ef.filter((y) => y.c.percentual == null);
    const row: R = { ...nova(e, pid), percentual: resto >= 0.5 ? resto : 0 };
    const pFix = async (vals: (y: { c: R; p: number }) => number | null) => {
      for (const y of fixar) { local(e.tipo, (cs) => cs.map((c) => (c.id === y.c.id ? { ...c, percentual: vals(y) } : c))); const r = await supabase.from(TAB_C[e.tipo]).update({ percentual: vals(y) }).eq('id', y.c.id); if (r.error) { toast(r.error.message, true); recarregar(); return false; } }
      return true;
    };
    if (!(await pFix((y) => y.p))) return;
    if (!(await inserir(e.tipo, [row]))) { await pFix(() => null); recarregar(); return; }
    const onde = 'duplicada';
    toast(row.percentual ? `${nome(e)} ${onde}, com ${num(row.percentual, row.percentual % 1 ? 2 : 0)}%.`
      : `${nome(e)} ${onde}, com 0%: o lote já está todo nas outras cópias. Clique na pizza para dar o percentual.`);
    empilhar({ rotulo: `${nome(e)} duplicada`,
      fazer: async () => (await apagarC(e.tipo, [row.id])) && (await pFix(() => null)) && (recarregar(), true),
      refazer: async () => (await pFix((y) => y.p)) && inserir(e.tipo, [row]) });
  }
  /** percentual da parte no lote (vazio = não informado) */
  async function percentual(tipo: Tp, c: R, v: number | null) {
    if (!c.id) {   // lote sem cópia: o percentual cria a cópia solta dele
      if (v == null) return true;
      const row = { id: crypto.randomUUID(), empresa_id: empresa!.id, terreno_id: f.id, [FK[tipo]]: c[FK[tipo]], parte_id: null, percentual: v };
      if (!(await inserir(tipo, [row]))) return false;
      empilhar({ rotulo: 'percentual da etiqueta solta', fazer: () => apagarC(tipo, [row.id]), refazer: () => inserir(tipo, [row]) });
      return true;
    }
    const antes = c.percentual ?? null;
    if ((antes == null ? null : +antes) === v) return true;
    if (!(await mudarC(tipo, c.id, { percentual: v }))) return false;
    empilhar({ rotulo: `percentual da parte ${nomeP(c.parte_id)}`, fazer: () => mudarC(tipo, c.id, { percentual: antes }), refazer: () => mudarC(tipo, c.id, { percentual: v }) });
    return true;
  }
  async function excluir(k: string) {
    const e = achar(k);
    if (!e) return;
    const { error } = await supabase.from(e.tipo === 'm' ? 'matriculas' : 'inscricoes_municipais').delete().eq('id', e.x.id);
    setConf(null);
    if (error) { toast(error.message, true); return; }
    toast(`${nome(e)} excluída.`);
    recarregar();
    if (e.tipo === 's' && sp) { await refazerPoligonal(f, `${e.x.inscricao} excluído`, toast); recarregar(); }
  }
  /** o X da etiqueta: se o lote está em mais de uma parte, só sai desta; senão o lote sai do terreno */
  const apagar = (k: string) => { const e = achar(k); if (e?.tipo === 's' && (e.x.inscricao_valores ?? []).length) setConf(k); else excluir(k); };
  /** o X: cópia numa parte, com o lote em outras, fica solta; cópia solta, com outras, sai; a última cópia ou o lote solto saem do terreno */
  async function soltaFora(k: string) {
    const e = achar(k);
    if (!e?.c) return;
    const c = e.c, row = { id: c.id, empresa_id: empresa!.id, terreno_id: f.id, [FK[e.tipo]]: e.x.id, parte_id: null, percentual: c.percentual ?? null };
    if (!(await apagarC(e.tipo, [c.id]))) return;
    empilhar({ rotulo: `cópia solta de ${nome(e)}`, fazer: () => inserir(e.tipo, [row]), refazer: () => apagarC(e.tipo, [c.id]) });
  }
  const tirar = (k: string) => {
    const e = achar(k), n = e?.c ? copias(LR.current, e.tipo, e.x.id).length : 0;
    if (e?.c && n > 1) { if (e.c.parte_id) parte(k, null); else soltaFora(k); } else apagar(k);
  };

  async function incluirMat(ev: FormEvent) {
    ev.preventDefault();
    const n = mat.num.trim(), cri = mat.cri.trim() || null;
    if (!digitos(n)) { toast('Informe o número da matrícula.', true); return; }
    if (L.mats.some((m) => m.numero_norm === digitos(n) && (!m.cartorio || !cri || m.cartorio === cri))) { toast(`A matrícula ${n} já está no terreno.`, true); return; }
    const ou = await outroTerreno('m', digitos(n), cri);
    if (ou) { setDup({ oque: `A matrícula ${n}`, codigo: ou.codigo, nome: ou.nome }); return; }
    const { error } = await supabase.from('matriculas').insert({ empresa_id: empresa!.id, terreno_id: f.id, numero: n, cartorio: cri, area_registrada_m2: lerNum(mat.area) });
    if (error) { toast(error.message, true); return; }
    setMat({ num: '', cri: mat.cri, area: '' });
    recarregar();
    setTimeout(() => document.getElementById('em-n')?.focus(), 30);
  }
  async function incluirSql(ev: FormEvent) {
    ev.preventDefault();
    if (grav) return;
    const d = digitos(sql), ndig = base ? base.mascara.replace(/[^0]/g, '').length : 0;
    if (!d) { toast(`Digite o ${rot}.`, true); return; }
    if (base && d.length !== ndig) { toast(`${rot} incompleto: são ${ndig} dígitos.`, true); return; }
    if (L.insc.some((i) => i.inscricao_norm === d)) { toast(`O ${rot} ${sql} já está no terreno.`, true); return; }
    const ou = await outroTerreno('s', d, null);
    if (ou) { setDup({ oque: `O ${rot} ${sql}`, codigo: ou.codigo, nome: ou.nome }); return; }
    setGrav(true);
    try {
      if (sp && GEO_BASE) await loteDoSql(d);   // confere o dígito no GeoSampa
      const { data, error } = await supabase.from('inscricoes_municipais')
        .insert({ empresa_id: empresa!.id, terreno_id: f.id, municipio_id: base?.municipio_id ?? f.t.municipio_id ?? null, inscricao: base ? mascarar(d, base.mascara) : sql.trim() })
        .select('id,inscricao').single();
      if (error) throw error;
      setSql('');
      recarregar();
      setTimeout(() => document.getElementById('es-sql')?.focus(), 30);
      if (sp && GEO_BASE) {
        await consultarTerreno(f.id, null, [{ id: data.id, sql: data.inscricao }], toast);
        recarregar();
        await refazerPoligonal(f, `${data.inscricao} incluído`, toast);
        recarregar();
      }
    } catch (e: any) { toast(e?.message ?? String(e), true); } finally { setGrav(false); }
  }
  /* "Escolher no mapa": os marcados entram sem parte (origem mapa_prefeitura), os desmarcados das quadras abertas saem,
     menos os que têm IPTU lançado; depois a consulta do GeoSampa nos novos e a poligonal pela soma dos lotes */
  async function incluirMapa(marc: LoteSql[], quadras: string[]) {
    setLg(false);
    const ja = new Set(L.insc.map((i) => i.inscricao_norm)), marcD = new Set(marc.map((x) => digitos(x.sql)));
    const novos = marc.filter((x) => !ja.has(digitos(x.sql)));
    const tirar = L.insc.filter((i) => !marcD.has(i.inscricao_norm) && quadras.includes(i.inscricao_norm.slice(0, 3) + '.' + i.inscricao_norm.slice(3, 6)) && !(i.inscricao_valores ?? []).length);
    try {
      let ins: R[] = [];
      if (novos.length) {
        const r = await supabase.from('inscricoes_municipais').insert(novos.map((q) => ({ empresa_id: empresa!.id, terreno_id: f.id, municipio_id: base?.municipio_id ?? f.t.municipio_id,
          inscricao: q.sql, area_cadastral_m2: q.area, cib: q.cib, origem: 'mapa_prefeitura', endereco_prefeitura: q.end || null }))).select('id,inscricao');
        if (r.error) throw r.error;
        ins = (r.data ?? []) as R[];
      }
      if (tirar.length) { const r = await supabase.from('inscricoes_municipais').delete().in('id', tirar.map((i) => i.id)); if (r.error) throw r.error; }
      if (!novos.length && !tirar.length) { toast('Nada mudou nos SQLs.'); return; }
      toast([novos.length && `${novos.length} SQL${novos.length > 1 ? 's' : ''} incluído${novos.length > 1 ? 's' : ''}`, tirar.length && `${tirar.length} tirado${tirar.length > 1 ? 's' : ''}`].filter(Boolean).join(', ') + '.');
      recarregar();
      if (ins.length) { await consultarTerreno(f.id, null, ins.map((x) => ({ id: x.id, sql: x.inscricao })), toast); recarregar(); }
      await refazerPoligonal(f, 'mapa de lotes da prefeitura', toast);
      recarregar();
    } catch (e: any) { toast(e?.message ?? String(e), true); }
  }
  async function tudo() {
    const pa = P[0];
    if (!pa) return;
    const rm = L.mats.filter((m) => !copias(L, 'm', m.id).length).map((x) => nova({ tipo: 'm', x }, pa.id));
    const rs = L.insc.filter((i) => !copias(L, 's', i.id).length).map((x) => nova({ tipo: 's', x }, pa.id));
    if (!(rm.length + rs.length)) return;
    const por = async (sim: boolean) => {
      const r = await Promise.all([rm.length ? (sim ? inserir('m', rm) : apagarC('m', rm.map((x) => x.id))) : true, rs.length ? (sim ? inserir('s', rs) : apagarC('s', rs.map((x) => x.id))) : true]);
      return r.every(Boolean);
    };
    if (!(await por(true))) return;
    toast(`Tudo na parte ${pa.nome}.`);
    empilhar({ rotulo: `etiquetas na parte ${pa.nome}`, fazer: () => por(false), refazer: () => por(true) });
  }
  function linha(pid: string) {
    const el = sec.current?.querySelector<HTMLElement>(`.etq-pt[data-p="${pid}"]`);
    if (!el) return;
    const fechar = !FECHADAS.has(pid), y = el.offsetTop;
    sec.current!.querySelectorAll<HTMLElement>('.etq-pt').forEach((b) => { if (Math.abs(b.offsetTop - y) < 4) { if (fechar) FECHADAS.add(b.dataset.p!); else FECHADAS.delete(b.dataset.p!); } });
    re((x) => x + 1);
  }

  /* arrastar e soltar (mouse e toque: no toque, segurar a etiqueta antes de arrastar) */
  const parteR = useRef(parte);
  parteR.current = parte;
  useEffect(() => {
    if (!edita) return;
    let A: any = null;
    const raiz = () => sec.current;
    const comecar = () => {
      const a = A; if (!a) return; a.ativo = true;
      const r = a.el.getBoundingClientRect(); a.dx = a.x - r.left; a.dy = a.y - r.top;
      const g = a.el.cloneNode(true); g.classList.add('etq-fantasma'); g.style.width = r.width + 'px'; document.body.appendChild(g); a.g = g;
      a.el.classList.add('etq-origem'); document.body.classList.add('etq-arrastando');
      const [tipo, lote] = a.k.split(':'), orig = a.el.closest('[data-drop]');
      /* a parte que já tem o lote não acende */
      const tem = new Set(copias(LR.current, tipo as Tp, lote).map((c) => c.parte_id));
      raiz()?.querySelectorAll<HTMLElement>('[data-drop]').forEach((d) => { if (d !== orig && ((d.dataset.drop === 'parte' && !tem.has(d.dataset.p!)) || d.dataset.tipo === tipo)) d.classList.add('etq-aceita'); });
      mover(a.x, a.y);
    };
    const mover = (x: number, y: number) => {
      const a = A; if (!a?.g) return;
      a.g.style.left = x - a.dx + 'px'; a.g.style.top = y - a.dy + 'px';
      const d = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.('.etq-aceita');
      document.querySelectorAll('.etq-sobre').forEach((z) => { if (z !== d) z.classList.remove('etq-sobre'); });
      d?.classList.add('etq-sobre');
      if (y < 60) scrollBy(0, -14); else if (y > innerHeight - 60) scrollBy(0, 14);
    };
    const fim = (soltar: boolean, x = 0, y = 0) => {
      const a = A; A = null; if (!a) return; clearTimeout(a.timer); if (!a.ativo) return;
      soltou.current = Date.now();
      a.g?.remove(); a.el.classList.remove('etq-origem'); document.body.classList.remove('etq-arrastando');
      const d = soltar ? (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.<HTMLElement>('.etq-aceita') : null;
      document.querySelectorAll('.etq-aceita,.etq-sobre').forEach((z) => z.classList.remove('etq-aceita', 'etq-sobre'));
      if (d) parteR.current(a.k, d.dataset.drop === 'parte' ? d.dataset.p! : null);
    };
    const down = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest?.<HTMLElement>('.etq[data-etq]');
      if (!el || !raiz()?.contains(el) || e.button > 0 || (e.target as HTMLElement).closest('.etq-x,.etq-ed,.etq-pzb')) return;
      A = { el, k: el.dataset.etq, x: e.clientX, y: e.clientY, pid: e.pointerId, toque: e.pointerType !== 'mouse', ativo: false };
      if (A.toque) { const a = A; a.timer = setTimeout(() => { if (A === a) comecar(); }, 300); }
    };
    const move = (e: PointerEvent) => {
      const a = A; if (!a || e.pointerId !== a.pid) return;
      if (!a.ativo) { const d = Math.hypot(e.clientX - a.x, e.clientY - a.y); if (a.toque) { if (d > 8) { clearTimeout(a.timer); A = null; } return; } if (d < 5) return; comecar(); }
      e.preventDefault(); mover(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => { if (A && e.pointerId === A.pid) fim(true, e.clientX, e.clientY); };
    const cancel = (e: PointerEvent) => { if (A && e.pointerId === A.pid) fim(false); };
    const tm = (e: TouchEvent) => { if (A?.ativo) e.preventDefault(); };
    const ctx = (e: MouseEvent) => { if (A || (e.target as HTMLElement).closest?.('.etq[data-etq]')) e.preventDefault(); };
    document.addEventListener('pointerdown', down); document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel); document.addEventListener('touchmove', tm, { passive: false }); document.addEventListener('contextmenu', ctx);
    return () => {
      document.removeEventListener('pointerdown', down); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel); document.removeEventListener('touchmove', tm); document.removeEventListener('contextmenu', ctx);
    };
  }, [edita]);

  const pool = (tipo: 'm' | 's') => {
    /* sem parte: o lote sem nenhuma cópia e as cópias soltas (duplicadas para distribuir depois) */
    const lista = lotesDe(L, tipo), es: Etq[] = lista.flatMap((x) => { const cs = copias(L, tipo, x.id); return cs.length ? cs.filter((c) => !c.parte_id).map((c) => ({ tipo, x, c })) : [{ tipo, x }]; });
    return (
      <div className="etq-pool" data-drop="pool" data-tipo={tipo}>
        {es.length ? es.map((e) => <Etiqueta key={chave(e)} e={e} L={L} rot={rot} edita={edita} ver={ver} tirar={tirar} menu={abrirMenu} pct={abrirPct} />)
          : <span className="etq-vazio">{lista.length ? 'Todas já estão numa parte.' : tipo === 'm' ? 'Nenhuma matrícula ainda.' : `Nenhum ${rot} ainda.`}</span>}
      </div>
    );
  };
  const soltos = L.mats.filter((m) => !copias(L, 'm', m.id).length).length + L.insc.filter((i) => !copias(L, 's', i.id).length).length;
  const [pop, setPop] = useState<{ k: string; r: DOMRect } | null>(null);
  const abrirPct = (k: string, r: DOMRect) => { setMenu(null); setPop((p) => (p?.k === k ? null : { k, r })); };
  function abrirMenu(k: string, x: number, y: number) { setMenu({ k, x: Math.min(x, innerWidth - 240), y: Math.min(y, innerHeight - 260) }); }
  useEffect(() => {
    if (!menu) return;
    const fora = (ev: PointerEvent) => { if (!(ev.target as HTMLElement).closest?.('.etq-menu')) setMenu(null); };
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); setMenu(null); } };
    const fechar = () => setMenu(null);
    document.addEventListener('pointerdown', fora, true); document.addEventListener('keydown', tecla, true); addEventListener('scroll', fechar, true); addEventListener('resize', fechar);
    return () => { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', tecla, true); removeEventListener('scroll', fechar, true); removeEventListener('resize', fechar); };
  }, [menu]);
  const menuE = menu ? achar(menu.k) : null;
  const faltam = menuE ? P.filter((pa) => !copias(L, menuE.tipo, menuE.x.id).some((c) => c.parte_id === pa.id)) : [];
  const fazM = (fn: () => void) => { setMenu(null); fn(); };
  const toque = matchMedia('(pointer: coarse)').matches;
  /* com Matrículas e SQLs um sobre o outro, cada quadro recolhe pela seta do título, para chegar perto das partes
     (pedido do Moises, 6/nov/2026); lado a lado, ficam sempre abertos */
  const topo = useRef<HTMLDivElement>(null);
  const [empilhado, setEmpilhado] = useState(false);
  const [, setRec] = useState(0);
  useEffect(() => {
    const el = topo.current; if (!el) return;
    const medir = () => { const cs = el.querySelectorAll<HTMLElement>(':scope > .etq-col'); setEmpilhado(cs.length > 1 && cs[1].offsetTop > cs[0].offsetTop + 4); };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const recolhido = (t: Tp) => empilhado && RECOLHIDOS.has(t);
  const cab = (t: Tp, titulo: ReactNode, n: number) => {
    const fe = recolhido(t);
    const conteudo = <><span className={`etq-sw ${t}`} /><b>{titulo}</b> <span className="h-n">{n}</span></>;
    return empilhado
      ? <button type="button" className="etq-ct etq-ct-b" aria-expanded={!fe} title={fe ? 'Abrir' : 'Recolher'}
          onClick={() => { if (fe) RECOLHIDOS.delete(t); else RECOLHIDOS.add(t); setRec((x) => x + 1); }}><Ic n="chev" s={18} />{conteudo}</button>
      : <div className="etq-ct">{conteudo}</div>;
  };
  const andamento = cons && cons.terreno === f.id ? <span className="chip blue lg-cons">Consultando o GeoSampa: {cons.feitos} de {cons.total}</span> : null;
  const confE = conf ? achar(conf) : null;
  return (
    <div ref={sec} style={{ display: 'contents' }}>
      <Quadro aba="terreno" id="lotes" titulo={`Matrículas e ${rot}s`} acoes={andamento ?? undefined}>
        <div className="sec-b">
          <div className="etq-top" ref={topo}>
            <div className={`etq-col${recolhido('m') ? ' fechado' : ''}`}>
              {cab('m', 'Matrículas', L.mats.length)}
              {edita && (
                <form className="etq-form" ref={mref} onSubmit={incluirMat}>
                  <div className="field"><label htmlFor="em-n">Nº da matrícula</label><input id="em-n" inputMode="numeric" required autoComplete="off" value={mat.num} onChange={(e) => setMat({ ...mat, num: e.target.value })} /></div>
                  <div className="field"><label htmlFor="em-c">Cartório</label>{sp
                    ? <select id="em-c" value={mat.cri} onChange={(e) => setMat({ ...mat, cri: e.target.value })}><option value="">Não informado</option>{crisSel.map((x) => <option key={x}>{x}</option>)}</select>
                    : <input id="em-c" value={mat.cri} onChange={(e) => setMat({ ...mat, cri: e.target.value })} />}</div>
                  <div className="field"><label htmlFor="em-a">Área registrada</label><Adorno t="m2"><input id="em-a" inputMode="decimal" value={mat.area} onChange={(e) => setMat({ ...mat, area: e.target.value })} /></Adorno></div>
                  <button className="btn sm"><Ic n="add" s={16} />Incluir</button>
                  {avisoM}
                </form>
              )}
              {pool('m')}
            </div>
            <div className={`etq-col${recolhido('s') ? ' fechado' : ''}`}>
              {cab('s', `${rot}s`, L.insc.length)}
              {edita && (
                <form className="etq-form" ref={sref} onSubmit={incluirSql}>
                  <div className="field grow"><label htmlFor="es-sql">{rot}</label>
                    <input id="es-sql" required autoComplete="off" inputMode={base ? 'numeric' : 'text'} placeholder={base?.mascara ?? 'Como está no carnê do IPTU'} value={sql}
                      onChange={(e) => setSql(base ? mascarar(e.target.value, base.mascara) : e.target.value)} /></div>
                  <button className="btn sm" disabled={grav}><Ic n="add" s={16} />{grav ? 'Incluindo…' : 'Incluir'}</button>
                  {sp && GEO_BASE && f.poly && <button type="button" className="btn sm text" onClick={() => setLg(true)}><Ic n="layers" s={16} />Escolher no mapa</button>}
                  {avisoS}
                </form>
              )}
              {pool('s')}
            </div>
          </div>
          <div className="etq-ph"><b>Partes</b>
            {edita && P.length === 1 && soltos > 0 && <button className="btn sm" onClick={tudo}><Ic n="fwd" s={16} />Enviar tudo para {P[0].nome}</button>}
            {edita && <span className="faint">{toque ? 'Toque e segure a etiqueta para arrastá-la até a parte.' : 'Arraste as etiquetas para a parte certa, ou de uma parte para outra.'}</span>}
          </div>
          <div className="etq-partes">{P.map((pa) => {
            const ms = daParte(L, 'm', pa.id), is = daParte(L, 's', pa.id), fe = FECHADAS.has(pa.id), ai = ptArea(L, pa.id), dv = ptDiv(L, pa.id);
            return (
              <article key={pa.id} className={`etq-pt${fe ? ' fechado' : ''}`} data-drop="parte" data-p={pa.id}>
                <button type="button" className="etq-pt-h" aria-expanded={!fe} title={`${fe ? 'Abrir' : 'Recolher'} a linha`} onClick={() => linha(pa.id)}>
                  <Ic n="chev" s={18} /><b>{pa.nome}</b><span className="faint">{ms.length} mat. · {is.length} {rot}</span></button>
                <div className="etq-pt-b">
                  <div className="etq-pt-l">
                    {ms.length > 0 && <div className="etq-pt-g m">{ms.map(({ x, c }) => <Etiqueta key={c.id} e={{ tipo: 'm', x, c }} L={L} rot={rot} edita={edita} ver={ver} tirar={tirar} menu={abrirMenu} pct={abrirPct} />)}</div>}
                    {is.length > 0 ? <div className="etq-pt-g s">{is.map(({ x, c }) => <Etiqueta key={c.id} e={{ tipo: 's', x, c }} L={L} rot={rot} edita={edita} ver={ver} tirar={tirar} menu={abrirMenu} pct={abrirPct} />)}</div>
                      : !ms.length && <span className="etq-vazio">{edita ? 'Arraste para cá as matrículas e os SQLs desta parte.' : 'Sem matrícula nem SQL.'}</span>}
                  </div>
                  {(ai.area != null || dv != null) && (
                    <div className="etq-pt-r">
                      {ai.area != null && <span>{m2(ai.area)} <span className="faint">pelas {ai.fonte}</span></span>}
                      {dv != null && Math.abs(dv) >= 1 && <span className={`chip ${Math.abs(dv) > 5 ? 'crit' : 'warn'}`} title="Área cadastral dos SQLs da parte comparada com a das matrículas dela">Matrícula × Prefeitura {dv > 0 ? '+' : ''}{num(dv, 1)}%</span>}
                    </div>
                  )}
                </div>
              </article>
            );
          })}</div>
        </div>
      </Quadro>
      {confE && (
        <Dialogo titulo={`Excluir ${nome(confE)}?`} onFechar={() => setConf(null)}
          rodape={<><button className="btn text" onClick={() => setConf(null)}>Cancelar</button><button className="btn primary" onClick={() => excluir(conf!)}>Excluir</button></>}>
          <p style={{ margin: 0 }}>Ele tem IPTU lançado, que sai junto. A poligonal é refeita sem o lote dele.</p>
        </Dialogo>
      )}
      {lg && f.poly && (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setLg(false)}>
          <div className="dialog" role="dialog" aria-modal="true">
            <LotesGeo empresa={empresa!.id} L={{ modo: 'ficha', ficha: { codigo: f.codigo, nome: f.nome, poly: f.poly, sqls: L.insc.map((i) => i.inscricao_norm), fechar: () => setLg(false), incluir: incluirMapa } }} />
          </div>
        </div>
      )}
      {dup && (
        <Dialogo titulo={`${dup.oque} já está em outro terreno`} onFechar={() => setDup(null)}
          rodape={<><button className="btn text" onClick={() => setDup(null)}>Cancelar</button>
            <button className="btn" onClick={() => { setDup(null); navegar(`/terrenos/${dup.codigo}`); }}>Abrir {dup.codigo}</button>
            <button className="btn primary" onClick={() => { const d = dup; setDup(null); pedirOferta(d.codigo, `Registre a nova oferta no ${d.codigo}.`); navegar(`/terrenos/${d.codigo}/comercial`); }}>Registrar nova oferta no {dup.codigo}</button></>}>
          <div className="banner blue"><Ic n="layers" /><div style={{ flex: 1 }}><div className="bt">{dup.codigo} · {dup.nome}</div>
            <div>O lote não é cadastrado de novo. Se chegou uma oferta, registre-a nesse terreno: o analista decide lá se segue a tratativa ou descarta.</div></div></div>
        </Dialogo>
      )}
      {menu && menuE && (
        <div className="etq-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
          <div className="etq-menu-t">{nome(menuE)}</div>
          <button type="button" role="menuitem" onClick={() => fazM(() => duplicar(menu.k))}><Ic n="add" s={16} />Duplicar</button>
          {faltam.length > 0 && <>
            <div className="etq-menu-h">{menuE.c?.parte_id ? 'Mover para' : 'Pôr em'}</div>
            {faltam.map((pa) => <button key={'m' + pa.id} type="button" role="menuitem" onClick={() => fazM(() => parte(menu.k, pa.id))}><Ic n="fwd" s={16} />{pa.nome}</button>)}
          </>}
          <hr />
          <button type="button" role="menuitem" onClick={() => fazM(() => ver(menu.k))}><Ic n="edit" s={16} />Editar</button>
          {menuE.c?.parte_id && <button type="button" role="menuitem" onClick={() => fazM(() => parte(menu.k, null))}><Ic n="close" s={16} />Tirar da parte {nomeP(menuE.c.parte_id)}</button>}
        </div>
      )}
      {pop && (() => { const e0 = achar(pop.k); if (!e0) return null; const e = comC(e0); return <PctPop key={pop.k} e={e} L={L} r={pop.r} nomeP={nomeP} fechar={() => setPop(null)} salvar={(v) => percentual(e.tipo, e.c, v)} />; })()}
      {etq && <JanelaEtq f={f} L={L} k={etq} fechar={() => abrirEtq(null)} ops={{ parte, duplicar, percentual, tirar: (k) => { abrirEtq(null); parte(k, null); }, apagar: (k) => { abrirEtq(null); apagar(k); } }} />}
    </div>
  );
}

/* ---------- janela da etiqueta ---------- */
type OpsEtq = { parte: (k: string, pid: string | null) => Promise<void>; duplicar: (k: string) => Promise<void>; percentual: (tipo: Tp, c: R, v: number | null) => Promise<boolean>; tirar: (k: string) => void; apagar: (k: string) => void };
function JanelaEtq({ f, L, k, fechar, ops }: { f: Ficha; L: Lotes; k: string; fechar: () => void; ops: OpsEtq }) {
  const { edita, empresa } = useSessao();
  const toast = useToast(), recarregar = useRecarregar(f);
  const [tipo, id, cid] = k.split(':') as [Tp, string, string | undefined];
  const x = lotesDe(L, tipo).find((l) => l.id === id);
  const cs = x ? copias(L, tipo, x.id) : [];
  /* a etiqueta aberta: a da parte clicada; aberta de fora de uma parte, a única que houver */
  const c = (cid && cs.find((y) => y.id === cid)) || (cs.length === 1 ? cs[0] : undefined);
  const kc = x ? `${tipo}:${x.id}${c ? ':' + c.id : ''}` : k;
  const [pct, setPct] = useState<Record<string, string>>({});
  const pctSig = cs.map((y) => `${y.id}=${y.percentual ?? ''}`).join(',');
  useEffect(() => { setPct(Object.fromEntries(cs.map((y) => [y.id, y.percentual != null ? num(+y.percentual, +y.percentual % 1 ? 2 : 0) : '']))); }, [pctSig]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState<Record<string, string>>({});
  const [busc, setBusc] = useState(false);
  const IPTU0 = { ex: String(new Date().getFullYear()), sit: 'tributado', parc: '10' };
  const [iptu, setIptu] = useState<Record<string, string>>(IPTU0);
  const iref = useRef<HTMLFormElement>(null);
  const { aviso, pedir } = useRascunho(iref, ['vt', 'vc', 'iptu', 'mensal', 'fonte'].some((c) => (iptu[c] ?? '').trim() !== ''), 'o IPTU', () => setIptu(IPTU0));
  useEffect(() => {
    if (!x) return;
    setV(tipo === 'm' ? { numero: x.numero, cartorio: x.cartorio ?? '', area_registrada_m2: x.area_registrada_m2 != null ? num(x.area_registrada_m2, 2) : '', data_certidao: x.data_certidao ?? '' }
      : { area_cadastral_m2: x.area_cadastral_m2 != null ? num(x.area_cadastral_m2, 2) : '' });
  }, [x, tipo]);
  if (!x) return null;
  const rot = L.base?.rotulo ?? 'Inscrição', tabela = tipo === 'm' ? 'matriculas' : 'inscricoes_municipais';
  async function gravar(c: string, valor: unknown) {
    if ((x![c] ?? null) === valor) return;
    const id = x!.id, antes = x![c] ?? null;
    const { error } = await supabase.from(tabela).update({ [c]: valor }).eq('id', id);
    if (error) { toast(error.message, true); return; }
    recarregar();
    const por = async (v: unknown) => {
      const r = await supabase.from(tabela).update({ [c]: v }).eq('id', id);
      if (r.error) { toast(r.error.message, true); return false; }
      recarregar(); return true;
    };
    empilhar({ rotulo: tipo === 'm' ? `matrícula ${x!.numero}` : `${rot} ${x!.inscricao}`, fazer: () => por(antes), refazer: () => por(valor) });
  }
  const lin = (lab: ReactNode, campo: ReactNode) => <label className="field"><span className="lbl-f">{lab}</span>{campo}</label>;
  const val = (s: ReactNode) => <span className="v">{s}</span>;
  const txt = (c: string, extra: Record<string, string> = {}, conv: (s: string) => unknown = (s) => s.trim() || null) =>
    <input value={v[c] ?? ''} {...extra} onChange={(e) => setV({ ...v, [c]: e.target.value })} onBlur={() => {
      if (c === 'numero' && !digitos(v[c] ?? '')) { toast('Informe o número da matrícula.', true); setV({ ...v, numero: x.numero }); return; }
      gravar(c, conv(v[c] ?? ''));
    }} />;
  const nomeP = (pid: string | null) => (pid ? L.partes.find((pa) => pa.id === pid)?.nome ?? 'Parte' : 'Solta');
  const temP = new Set(cs.map((y) => y.parte_id));
  const parte = lin(cs.length > 1 ? 'Esta etiqueta está na parte' : 'Parte', edita
    ? <select value={c?.parte_id ?? ''} onChange={(e) => ops.parte(kc, e.target.value || null)}>
        <option value="">{c && cs.length > 1 ? 'Tirar desta parte' : 'Sem parte'}</option>
        {L.partes.map((pa) => <option key={pa.id} value={pa.id} disabled={temP.has(pa.id) && pa.id !== c?.parte_id}>{pa.nome}</option>)}</select>
    : val(c ? nomeP(c.parte_id) : 'Sem parte'));
  async function salvarPct(y: R) {
    const t = (pct[y.id] ?? '').trim(), v = t ? lerNum(t) : null;
    if (t && (v == null || v < 0 || v > 100)) { toast('O percentual vai de 0 a 100%.', true); setPct({ ...pct, [y.id]: y.percentual != null ? num(+y.percentual, 2) : '' }); return; }
    if (!(await ops.percentual(tipo, y, v))) setPct({ ...pct, [y.id]: y.percentual != null ? num(+y.percentual, 2) : '' });
  }
  /* o percentual de cada parte no lote, opcional: sem ele, o que sobra divide igual entre as partes sem percentual */
  const csV = cs.length ? cs : [virtual(tipo, x)];
  const partesLote = (
    <div className="etq-pcts">
      <h3 className="etq-h3">Partes deste lote</h3>
      {csV.map((y) => {
        const fr = fracao(L, tipo, y), p = Math.round(fr.f * 1000) / 10;
        return (
          <div key={y.id || 'v'} className={`etq-pct${y.id === (c?.id ?? '') ? ' atual' : ''}`}>
            <span className={`etq-pz lg${y.percentual == null && cs.length > 1 ? ' est' : ''}`} style={{ '--p': p } as any} aria-hidden="true" />
            <span className="etq-pct-n">{nomeP(y.parte_id)}</span>
            {edita
              ? <Adorno t="pct"><input aria-label={`Percentual da parte ${nomeP(y.parte_id)} no lote`} inputMode="decimal" placeholder={`${num(p, p % 1 ? 1 : 0)}${cs.length > 1 ? ' estimado' : ''}`}
                  value={pct[y.id] ?? ''} onChange={(e) => setPct({ ...pct, [y.id]: e.target.value })} onBlur={() => salvarPct(y)} /></Adorno>
              : <span className="v">{num(p, p % 1 ? 1 : 0)}%{y.percentual == null && cs.length > 1 ? ' (estimado)' : ''}</span>}
          </div>
        );
      })}
      {edita && <button type="button" className="btn sm text etq-dup" onClick={() => ops.duplicar(kc)}><Ic n="add" s={16} />Duplicar</button>}
      <div className="hint">O percentual é opcional. Sem ele, o que falta para 100% se divide igual entre as partes sem percentual.</div>
    </div>
  );
  const rodape = <><button className="btn text" onClick={() => pedir(fechar)}>Concluir</button>
    {edita && c && cs.length > 1 && <button className="btn" onClick={() => ops.tirar(kc)}><Ic n="close" s={16} />Tirar da parte {nomeP(c.parte_id)}</button>}
    {edita && <button className="btn" onClick={() => ops.apagar(kc)}><Ic n="lixo" s={16} />{cs.length > 1 ? 'Excluir do terreno' : 'Excluir'}</button>}</>;
  if (tipo === 'm') {
    const cris = x.cartorio && !CRIS.includes(x.cartorio) ? [x.cartorio, ...CRIS] : CRIS;
    const origem = x.cartorio && x.cartorio === f.t.cartorio ? (f.t.cartorio_origem === 'prefeitura' ? 'pela poligonal, GeoSampa' : 'do terreno') : x.cartorio ? 'digitado' : '';
    return (
      <Dialogo titulo={`Matrícula ${x.numero}`} onFechar={fechar} rodape={rodape}>
        <div className="pt2-g">
          {lin('Nº da matrícula', edita ? txt('numero', { inputMode: 'numeric' }) : val(x.numero))}
          {lin(<>Cartório {origem && <span className="faint">({origem})</span>}</>, !edita ? val(x.cartorio || '—') : L.base?.codigo === 'geosampa'
            ? <select value={x.cartorio ?? ''} onChange={(e) => gravar('cartorio', e.target.value || null)}><option value="">Não informado</option>{cris.map((c) => <option key={c}>{c}</option>)}</select>
            : txt('cartorio'))}
          {lin('Área registrada', edita ? <Adorno t="m2">{txt('area_registrada_m2', { inputMode: 'decimal' }, lerNum)}</Adorno> : val(x.area_registrada_m2 != null ? m2(x.area_registrada_m2) : '—'))}
          {lin('Certidão de', edita ? <input type="date" value={v.data_certidao ?? ''} onChange={(e) => { setV({ ...v, data_certidao: e.target.value }); gravar('data_certidao', e.target.value || null); }} /> : val(x.data_certidao ? fd(x.data_certidao) : '—'))}
          {parte}
        </div>
        {partesLote}
      </Dialogo>
    );
  }
  const cg = L.consultas[x.id], sp = L.base?.codigo === 'geosampa';
  const vs = ((x.inscricao_valores ?? []) as R[]).filter((y) => y.vigente).sort((a, b) => b.exercicio - a.exercicio), vv = vs[0];
  const venal = vv ? (vv.valor_venal_imovel ?? (vv.valor_venal_terreno != null && vv.valor_venal_construcao != null ? +vv.valor_venal_terreno + +vv.valor_venal_construcao : vv.valor_venal_terreno)) : null;
  async function buscar() {
    setBusc(true);
    try { const ok = await consultarLote(x!.id, x!.inscricao); toast(ok ? 'GeoSampa consultado.' : 'O GeoSampa não achou o lote deste SQL.', !ok); recarregar(); }
    catch (e: any) { toast(e?.message ?? String(e), true); } finally { setBusc(false); }
  }
  async function lancar(ev: FormEvent) {
    ev.preventDefault();
    const ex = parseInt(iptu.ex, 10);
    if (vv && ex < vv.exercicio) { toast(`Já há IPTU de ${vv.exercicio}: só vale o exercício mais recente.`, true); return; }
    const { error } = await supabase.from('inscricao_valores').insert({
      empresa_id: empresa!.id, inscricao_id: x!.id, exercicio: ex, valor_venal_terreno: lerNum(iptu.vt), valor_venal_construcao: lerNum(iptu.vc),
      situacao_iptu: iptu.sit, iptu_valor_anual: iptu.sit === 'isento' ? null : lerNum(iptu.iptu), iptu_parcelas: iptu.parc ? parseInt(iptu.parc, 10) : null,
      iptu_mensal_informado: iptu.sit === 'isento' ? null : lerNum(iptu.mensal), fonte: iptu.fonte?.trim() || null,
    });
    if (error) { toast(error.message, true); return; }
    setIptu({ ex: String(ex), sit: 'tributado', parc: '10' });
    recarregar();
  }
  const ip = (k2: string, l: string, extra: Record<string, unknown> = {}) => (
    <div className="field" key={k2} style={extra.style as any}><label htmlFor={`v-${k2}`}>{l.replace(' (R$)', '')}</label>{(() => {
      const r = / \(R\$\)/.test(l), i = <input id={`v-${k2}`} inputMode="decimal" data-fmt={r ? 'moeda' : (extra.attrs as any)?.inputMode === 'numeric' ? 'none' : undefined} value={iptu[k2] ?? ''} onChange={(e) => setIptu({ ...iptu, [k2]: e.target.value })} {...(extra.attrs as any)} />;
      return r ? <Adorno t="moeda">{i}</Adorno> : i; })()}</div>
  );
  return (
    <Dialogo titulo={`${rot} ${x.inscricao}`} sub={x.endereco_prefeitura ?? undefined} onFechar={() => pedir(fechar)} rodape={rodape}>
      <div className="pt2-g">
        {lin('Área cadastral', edita ? <Adorno t="m2">{txt('area_cadastral_m2', { inputMode: 'decimal' }, lerNum)}</Adorno> : val(x.area_cadastral_m2 != null ? m2(x.area_cadastral_m2) : '—'))}
        {parte}
      </div>
      {partesLote}
      {sp && (
        <div className="etq-geo">
          {cg ? (
            <div className="geo-h"><span><b>GeoSampa</b> <span className="muted">consultado em {fd(cg.consultado_em)}{(cg.zonas ?? []).length ? ` · ${(cg.zonas as R[]).map((z) => z.sigla).join(' / ')}` : ''}{x.cib ? ` · CIB ${x.cib}` : ''}{x.zona_fiscal ? ` · ${x.zona_fiscal}` : ''}</span></span>
              {edita && GEO_BASE && <button className="btn sm text" disabled={busc} onClick={buscar}><Ic n="search" s={16} />{busc ? 'Consultando...' : 'Buscar de novo'}</button>}</div>
          ) : (
            <div className="geo-vazio">{edita && GEO_BASE && <button className="btn sm" disabled={busc} onClick={buscar}><Ic n="search" s={16} />{busc ? 'Consultando...' : 'Buscar no GeoSampa'}</button>}
              <span className="hint">{GEO_BASE ? 'Ainda não consultado.' : 'A busca no GeoSampa funciona na versão publicada.'}</span></div>
          )}
        </div>
      )}
      <h3 className="etq-h3">Valor venal e IPTU</h3>
      {vv ? (
        <div className="tblwrap"><table className="mini-tbl vv"><thead><tr><th>Exercício</th><th className="r">Venal terreno</th><th className="r">Venal construção</th><th className="r">Venal do imóvel</th><th>IPTU</th><th className="r">Anual</th><th className="r">Parcela</th><th>Fonte</th></tr></thead><tbody>
          <tr><td><b>{vv.exercicio}</b>{vv.revisao > 1 && <span className="faint"> · rev. {vv.revisao}</span>}</td><td className="r">{brl(vv.valor_venal_terreno)}</td><td className="r">{brl(vv.valor_venal_construcao)}</td><td className="r"><b>{brl(venal)}</b></td>
            <td>{vv.situacao_iptu === 'isento' ? <span className="chip good">Isento</span> : SIT_IPTU[vv.situacao_iptu]}</td>
            <td className="r">{vv.situacao_iptu === 'isento' ? '—' : brl(vv.iptu_valor_anual, 2)}</td>
            <td className="r">{vv.iptu_valor_anual != null && vv.iptu_parcelas && vv.situacao_iptu !== 'isento' ? <>{brl(vv.iptu_valor_anual / vv.iptu_parcelas, 2)} <span className="faint">× {vv.iptu_parcelas}</span></> : '—'}</td>
            <td className="muted vv-f">{vv.fonte || '—'}</td></tr>
        </tbody></table></div>
      ) : <div className="muted">Sem IPTU lançado.</div>}
      {edita && (
        <details className="details"><summary>{vv ? 'Atualizar IPTU' : 'Lançar IPTU'}</summary>
          <form className="inline-form" ref={iref} style={{ border: 0, paddingTop: 4 }} onSubmit={lancar}>
            {ip('ex', 'Exercício', { style: { flex: '0 1 96px' }, attrs: { inputMode: 'numeric', required: true } })}
            {ip('vt', 'Venal terreno (R$)')}{ip('vc', 'Venal construção (R$)')}
            <div className="field"><label htmlFor="v-sit">Situação do IPTU</label><select id="v-sit" value={iptu.sit} onChange={(e) => setIptu({ ...iptu, sit: e.target.value })}>{Object.entries(SIT_IPTU).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
            {ip('iptu', 'IPTU anual (R$)')}{ip('parc', 'Parcelas', { style: { flex: '0 1 86px' }, attrs: { inputMode: 'numeric' } })}
            {ip('mensal', 'IPTU mensal informado (R$)', { attrs: { placeholder: 'se a fonte trouxer' } })}
            <div className="field grow"><label htmlFor="v-fonte">Fonte</label><input id="v-fonte" required placeholder="Carnê, certidão de dados cadastrais..." value={iptu.fonte ?? ''} onChange={(e) => setIptu({ ...iptu, fonte: e.target.value })} /></div>
            <button className="btn sm"><Ic n="add" s={16} />{vv ? 'Atualizar IPTU' : 'Lançar IPTU'}</button>
          </form>
          <div className="hint">Só vale o exercício mais recente: lançar o ano novo substitui o anterior.</div>
        </details>
      )}
      {aviso}
    </Dialogo>
  );
}

/** Partes e Matrículas e SQLs, entre Endereço e Áreas na aba Terreno */
export default function PartesLotes({ f }: { f: Ficha }) {
  const q = useLotes(f);
  if (!q.data) return q.error ? <section className="sec"><div className="empty">Não foi possível carregar as partes e as matrículas.</div></section> : null;
  return (
    <>
      <SecPartes f={f} L={q.data} />
      <SecLotes f={f} L={q.data} />
    </>
  );
}

/* ---------- barra do percentual da etiqueta (pedido do Moises, 6/nov/2026) ----------
   o clique na pizza abre uma barra vertical que se arrasta (0 a 100%, até o que as outras partes deixam) e um campo pequeno;
   grava ao soltar a barra, no Enter ou ao sair do campo; vazio = não informado (estimado); Esc ou o clique fora fecham */
function PctPop({ e, L, r, nomeP, fechar, salvar }: { e: Etq & { c: R }; L: Lotes; r: DOMRect; nomeP: (pid: string) => string; fechar: () => void; salvar: (v: number | null) => Promise<boolean> }) {
  const outras = soma(copias(L, e.tipo, e.x.id).filter((y) => y.id !== e.c.id && y.percentual != null).map((y) => +y.percentual));
  const max = Math.max(0, Math.round((100 - outras) * 100) / 100);
  const atual = Math.round(fracao(L, e.tipo, e.c).f * 1000) / 10;
  const [v, setV] = useState(atual);
  const [txt, setTxt] = useState(e.c.percentual != null ? num(+e.c.percentual, +e.c.percentual % 1 ? 2 : 0) : '');
  const raiz = useRef<HTMLDivElement>(null);
  const gravado = useRef<number | null>(e.c.percentual != null ? +e.c.percentual : null);
  /* o último valor escolhido (barra ou campo): fechar a barra grava o que ficou, mesmo se a barra foi solta fora dela */
  const pend = useRef<number | null | undefined>(undefined);
  const sair = () => { if (pend.current !== undefined) gravar(pend.current); fechar(); };
  const sairR = useRef(sair); sairR.current = sair;
  useEffect(() => {
    const fora = (ev: PointerEvent) => { if (!raiz.current?.contains(ev.target as Node) && !(ev.target as HTMLElement).closest?.('.etq-pzb')) sairR.current(); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); sairR.current(); } };
    document.addEventListener('pointerdown', fora, true); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', esc, true); };
  }, [fechar]);
  useEffect(() => { raiz.current?.querySelector<HTMLInputElement>('input[type=range]')?.focus(); }, []);
  async function gravar(n: number | null) {
    if (n != null) n = Math.min(Math.max(0, Math.round(n * 100) / 100), max);
    pend.current = undefined;
    if (n === gravado.current) return;
    const antes = gravado.current;
    gravado.current = n;
    if (!(await salvar(n))) gravado.current = antes;
  }
  const lerTxt = () => { const t = txt.trim(); if (!t) return null; const n = lerNum(t); return n == null ? gravado.current : n; };
  const top = Math.min(Math.max(8, r.top - 90), innerHeight - 250), left = Math.min(r.left - 8, innerWidth - 120);
  return (
    <div ref={raiz} className="pct-pop" role="dialog" aria-label={`Percentual da parte ${nomeP(e.c.parte_id)} no lote`} style={{ top, left }}>
      <div className="pct-pop-t">{e.c.parte_id ? nomeP(e.c.parte_id) : 'Solta'}</div>
      <div className="pct-pop-b">
        <input type="range" min={0} max={100} step={1} value={v} aria-label="Percentual" aria-valuetext={`${v}%`}
          style={{ '--p': v, '--max': max } as any}
          onChange={(ev) => { const n = Math.min(+ev.target.value, max); setV(n); setTxt(num(n, 0)); pend.current = n; }}
          onPointerDown={(ev) => { try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* sem captura */ } }} onPointerUp={() => { if (pend.current !== undefined) gravar(pend.current); }} onKeyUp={(ev) => { if (ev.key.startsWith('Arrow') || ev.key === 'PageUp' || ev.key === 'PageDown' || ev.key === 'Home' || ev.key === 'End') gravar(v); }} />
      </div>
      <Adorno t="pct"><input className="pct-pop-i" inputMode="decimal" value={txt} placeholder={num(atual, atual % 1 ? 1 : 0)} aria-label="Percentual digitado"
        onChange={(ev) => { setTxt(ev.target.value); const n = lerNum(ev.target.value); if (n != null) setV(Math.min(Math.max(0, n), max)); pend.current = ev.target.value.trim() ? n ?? undefined : null; }}
        onBlur={() => gravar(lerTxt())} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); gravar(lerTxt()).then(fechar); } }} /></Adorno>
      {max < 100 && <div className="pct-pop-h">até {num(max, max % 1 ? 2 : 0)}%</div>}
    </div>
  );
}
