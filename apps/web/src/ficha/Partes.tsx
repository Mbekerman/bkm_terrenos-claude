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

export interface Lotes { partes: R[]; mats: R[]; insc: R[]; base: R | null; consultas: Record<string, R> }
export function useLotes(f: Ficha) {
  return useQuery({
    queryKey: ['ficha-lotes', f.id],
    queryFn: async (): Promise<Lotes> => {
      const [pt, m, i, c, b] = await Promise.all([
        supabase.from('terreno_partes').select('id,nome,pessoa_nome,telefone,email,documento,observacoes,ativa,criado_em').eq('terreno_id', f.id).eq('ativa', true).order('criado_em'),
        supabase.from('matriculas').select('id,numero,numero_norm,cartorio,area_registrada_m2,data_certidao,parte_id').eq('terreno_id', f.id).order('numero_norm'),
        supabase.from('inscricoes_municipais').select('id,inscricao,inscricao_norm,municipio_id,area_cadastral_m2,cib,zona_fiscal,parte_id,origem,endereco_prefeitura,inscricao_valores(id,exercicio,revisao,vigente,valor_venal_terreno,valor_venal_construcao,valor_venal_imovel,situacao_iptu,iptu_valor_anual,iptu_parcelas,iptu_mensal_informado,fonte)').eq('terreno_id', f.id).order('inscricao_norm'),
        supabase.from('consultas_lote').select('inscricao_id,consultado_em,base,lote,zonas,poligono_geojson,area_poligono_m2,camadas_com_erro').eq('terreno_id', f.id).order('consultado_em', { ascending: false }),
        f.t.municipio_id ? supabase.from('bases_cadastrais').select('codigo,municipio_id,nome,rotulo,mascara').eq('municipio_id', f.t.municipio_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      for (const r of [pt, m, i, c, b]) if (r.error) throw r.error;
      const consultas: Record<string, R> = {};
      for (const x of (c.data ?? []) as R[]) if (x.inscricao_id && !consultas[x.inscricao_id]) consultas[x.inscricao_id] = x;
      return { partes: (pt.data ?? []) as R[], mats: (m.data ?? []) as R[], insc: (i.data ?? []) as R[], base: (b.data as R) ?? null, consultas };
    },
  });
}

/** área da parte: a soma das matrículas (todas com área); sem matrícula, a dos SQLs (todos com área cadastral) */
export function ptArea(L: Lotes, pid: string): { area: number | null; fonte: string | null } {
  const ms = L.mats.filter((m) => m.parte_id === pid), is = L.insc.filter((i) => i.parte_id === pid);
  if (ms.length && ms.every((m) => m.area_registrada_m2 != null)) return { area: soma(ms.map((m) => +m.area_registrada_m2)), fonte: 'matrículas' };
  if (!ms.length && is.length && is.every((i) => i.area_cadastral_m2 != null)) return { area: soma(is.map((i) => +i.area_cadastral_m2)), fonte: 'SQLs' };
  return { area: null, fonte: null };
}
/** Matrícula × Prefeitura da parte: área cadastral dos SQLs contra a das matrículas, em % da matrícula */
function ptDiv(L: Lotes, pid: string) {
  const ms = L.mats.filter((m) => m.parte_id === pid), is = L.insc.filter((i) => i.parte_id === pid);
  if (!ms.length || !is.length || ms.some((m) => m.area_registrada_m2 == null) || is.some((i) => i.area_cadastral_m2 == null)) return null;
  const a = soma(ms.map((m) => +m.area_registrada_m2)), b = soma(is.map((i) => +i.area_cadastral_m2));
  return a ? Math.round(((b - a) / a) * 1000) / 10 : null;
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
    const k = L.mats.filter((m) => m.parte_id === pa.id).length + L.insc.filter((i) => i.parte_id === pa.id).length;
    toast(`${pa.nome} excluída.${k ? ` ${k} etiqueta${k > 1 ? 's voltaram' : ' voltou'} para o quadro de cima.` : ''}`);
    recarregar();
  }
  const nm = L.mats.filter((m) => m.parte_id === pa.id).length, ni = L.insc.filter((i) => i.parte_id === pa.id).length;
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
        const tem = L.mats.some((m) => m.parte_id === pa.id) || L.insc.some((i) => i.parte_id === pa.id) || ['pessoa_nome', 'telefone', 'email', 'documento', 'observacoes'].some((k) => pa[k]);
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
const FECHADAS = new Set<string>();   // partes com o quadro recolhido (a seta recolhe a linha inteira)
type Etq = { tipo: 'm' | 's'; x: R };
const chave = (e: Etq) => `${e.tipo}:${e.x.id}`;

function Etiqueta({ e, rot, edita, ver, tirar }: { e: Etq; rot: string; edita: boolean; ver: (k: string) => void; tirar: (k: string) => void }) {
  const n = e.tipo === 'm' ? e.x.numero : e.x.inscricao, k = chave(e);
  return (
    <span className={`etq ${e.tipo}`} data-etq={k} tabIndex={edita ? 0 : undefined} aria-label={`${e.tipo === 'm' ? 'Matrícula' : rot} ${n}`}
      onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) { ev.preventDefault(); ver(k); } }}>
      <button type="button" className="etq-n num" title="Ver e editar" onClick={() => ver(k)}>{n}</button>
      {edita && <button type="button" className="etq-x" aria-label={`Excluir ${e.tipo === 'm' ? 'a matrícula' : 'o ' + rot} ${n}`} title="Excluir" onClick={() => tirar(k)}><Ic n="close" s={14} /></button>}
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
  const achar = (k: string): Etq | null => {
    const [tipo, id] = k.split(':');
    const x = tipo === 'm' ? L.mats.find((m) => m.id === id) : L.insc.find((i) => i.id === id);
    return x ? { tipo: tipo as 'm' | 's', x } : null;
  };
  const nome = (e: Etq) => (e.tipo === 'm' ? `Matrícula ${e.x.numero}` : `${rot} ${e.x.inscricao}`);
  const ver = (k: string) => { if (Date.now() - soltou.current > 400) abrirEtq(k); };

  async function parte(k: string, pid: string | null) {
    const e = achar(k);
    if (!e || (e.x.parte_id ?? null) === pid) return;
    const tab = e.tipo === 'm' ? 'matriculas' : 'inscricoes_municipais', antes = e.x.parte_id ?? null;
    const { error } = await supabase.from(tab).update({ parte_id: pid }).eq('id', e.x.id);
    if (error) { toast(error.message, true); return; }
    recarregar();
    const por = async (v: string | null) => {
      const r = await supabase.from(tab).update({ parte_id: v }).eq('id', e.x.id);
      if (r.error) { toast(r.error.message, true); return false; }
      recarregar(); return true;
    };
    empilhar({ rotulo: `${nome(e)} de parte`, fazer: () => por(antes), refazer: () => por(pid) });
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
  const tirar = (k: string) => { const e = achar(k); if (e?.tipo === 's' && (e.x.inscricao_valores ?? []).length) setConf(k); else excluir(k); };

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
    const ms = L.mats.filter((m) => !m.parte_id).map((m) => m.id), is = L.insc.filter((i) => !i.parte_id).map((i) => i.id);
    if (!pa || !(ms.length + is.length)) return;
    const r = await Promise.all([ms.length ? supabase.from('matriculas').update({ parte_id: pa.id }).in('id', ms) : null, is.length ? supabase.from('inscricoes_municipais').update({ parte_id: pa.id }).in('id', is) : null]);
    const err = r.find((x) => x?.error)?.error;
    if (err) toast(err.message, true);
    else {
      toast(`Tudo na parte ${pa.nome}.`);
      const por = async (v: string | null) => {
        const r2 = await Promise.all([ms.length ? supabase.from('matriculas').update({ parte_id: v }).in('id', ms) : null, is.length ? supabase.from('inscricoes_municipais').update({ parte_id: v }).in('id', is) : null]);
        const e2 = r2.find((x) => x?.error)?.error;
        if (e2) { toast(e2.message, true); return false; }
        recarregar(); return true;
      };
      empilhar({ rotulo: `etiquetas na parte ${pa.nome}`, fazer: () => por(null), refazer: () => por(pa.id) });
    }
    recarregar();
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
      const tipo = a.k[0], orig = a.el.closest('[data-drop]');
      raiz()?.querySelectorAll<HTMLElement>('[data-drop]').forEach((d) => { if (d !== orig && (d.dataset.drop === 'parte' || d.dataset.tipo === tipo)) d.classList.add('etq-aceita'); });
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
      if (!el || !raiz()?.contains(el) || e.button > 0 || (e.target as HTMLElement).closest('.etq-x')) return;
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
    const lista = tipo === 'm' ? L.mats : L.insc, soltas = lista.filter((x) => !x.parte_id);
    return (
      <div className="etq-pool" data-drop="pool" data-tipo={tipo}>
        {soltas.length ? soltas.map((x) => <Etiqueta key={x.id} e={{ tipo, x }} rot={rot} edita={edita} ver={ver} tirar={tirar} />)
          : <span className="etq-vazio">{lista.length ? 'Todas já estão numa parte.' : tipo === 'm' ? 'Nenhuma matrícula ainda.' : `Nenhum ${rot} ainda.`}</span>}
      </div>
    );
  };
  const soltos = L.mats.filter((m) => !m.parte_id).length + L.insc.filter((i) => !i.parte_id).length;
  const toque = matchMedia('(pointer: coarse)').matches;
  const andamento = cons && cons.terreno === f.id ? <span className="chip blue lg-cons">Consultando o GeoSampa: {cons.feitos} de {cons.total}</span> : null;
  const confE = conf ? achar(conf) : null;
  return (
    <div ref={sec} style={{ display: 'contents' }}>
      <Quadro aba="terreno" id="lotes" titulo={`Matrículas e ${rot}s`} acoes={andamento ?? undefined}>
        <div className="sec-b">
          <div className="etq-top">
            <div className="etq-col">
              <div className="etq-ct"><span className="etq-sw m" /><b>Matrículas</b> <span className="h-n">{L.mats.length}</span></div>
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
            <div className="etq-col">
              <div className="etq-ct"><span className="etq-sw s" /><b>{rot}s</b> <span className="h-n">{L.insc.length}</span></div>
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
            const ms = L.mats.filter((m) => m.parte_id === pa.id), is = L.insc.filter((i) => i.parte_id === pa.id), fe = FECHADAS.has(pa.id), ai = ptArea(L, pa.id), dv = ptDiv(L, pa.id);
            return (
              <article key={pa.id} className={`etq-pt${fe ? ' fechado' : ''}`} data-drop="parte" data-p={pa.id}>
                <button type="button" className="etq-pt-h" aria-expanded={!fe} title={`${fe ? 'Abrir' : 'Recolher'} a linha`} onClick={() => linha(pa.id)}>
                  <Ic n="chev" s={18} /><b>{pa.nome}</b><span className="faint">{ms.length} mat. · {is.length} {rot}</span></button>
                <div className="etq-pt-b">
                  <div className="etq-pt-l">
                    {ms.length > 0 && <div className="etq-pt-g m">{ms.map((x) => <Etiqueta key={x.id} e={{ tipo: 'm', x }} rot={rot} edita={edita} ver={ver} tirar={tirar} />)}</div>}
                    {is.length > 0 ? <div className="etq-pt-g s">{is.map((x) => <Etiqueta key={x.id} e={{ tipo: 's', x }} rot={rot} edita={edita} ver={ver} tirar={tirar} />)}</div>
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
      {etq && <JanelaEtq f={f} L={L} k={etq} fechar={() => abrirEtq(null)} tirar={(k) => { abrirEtq(null); tirar(k); }} />}
    </div>
  );
}

/* ---------- janela da etiqueta ---------- */
function JanelaEtq({ f, L, k, fechar, tirar }: { f: Ficha; L: Lotes; k: string; fechar: () => void; tirar: (k: string) => void }) {
  const { edita, empresa } = useSessao();
  const toast = useToast(), recarregar = useRecarregar(f);
  const [tipo, id] = k.split(':');
  const x = tipo === 'm' ? L.mats.find((m) => m.id === id) : L.insc.find((i) => i.id === id);
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
  const parte = lin('Parte', edita
    ? <select value={x.parte_id ?? ''} onChange={(e) => gravar('parte_id', e.target.value || null)}><option value="">Sem parte</option>{L.partes.map((pa) => <option key={pa.id} value={pa.id}>{pa.nome}</option>)}</select>
    : val(L.partes.find((pa) => pa.id === x.parte_id)?.nome ?? 'Sem parte'));
  const rodape = <><button className="btn text" onClick={() => pedir(fechar)}>Fechar</button>
    {edita && <button className="btn" onClick={() => tirar(k)}><Ic n="lixo" s={16} />Excluir</button>}</>;
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
      </Dialogo>
    );
  }
  const c = L.consultas[x.id], sp = L.base?.codigo === 'geosampa';
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
      {sp && (
        <div className="etq-geo">
          {c ? (
            <div className="geo-h"><span><b>GeoSampa</b> <span className="muted">consultado em {fd(c.consultado_em)}{(c.zonas ?? []).length ? ` · ${(c.zonas as R[]).map((z) => z.sigla).join(' / ')}` : ''}{x.cib ? ` · CIB ${x.cib}` : ''}{x.zona_fiscal ? ` · ${x.zona_fiscal}` : ''}</span></span>
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
