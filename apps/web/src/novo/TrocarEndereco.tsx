/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase, mensagemErro } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { empilhar } from '../components/Desfazer';
import LotesGeo from './LotesGeo';
import { trocarSqls } from './trocarSqls';
import { GEO_BASE, type LoteSql } from './geosampa';
import { atualizarFrentes } from './frentes';
import { frentes, localDoPonto, nomeBase, nomeRef, nomeUnico, normRua, type Frente, type Local, type P } from './geo';

// Endereço só pelo mapa (pedido do Moises, 6/nov/2026): o endereço não se digita nem se busca na ficha; muda quando a
// poligonal (ou o pino) muda de lugar. Depois de salvar a edição da poligonal, se a rua do terreno não encosta mais na
// poligonal, a pergunta "Trocar o endereço?"; trocando, o mesmo passo do cadastro (acesso principal e nome de referência,
// com o que já estava preenchido) e, em São Paulo, o mapa de lotes da prefeitura com os SQLs do terreno marcados, que
// refaz os SQLs, a poligonal e as consultas do GeoSampa (novo/trocarSqls.ts). Tudo entra no Ctrl+Z.

type R = Record<string, any>;
interface Caso { t: R; poly: P[]; fr: Frente[]; local: Local | null; nomes: string[]; passo: 'pergunta' | 'dados' | 'lotes'; sqls?: string[] }
let C: Caso | null = null;
const ouv = new Set<() => void>();
const mudar = (c: Caso | null) => { C = c; ouv.forEach((f) => f()); };
const useCaso = () => useSyncExternalStore((f) => { ouv.add(f); return () => ouv.delete(f); }, () => C);

const anel = (g: any): P[] | null => (g?.coordinates?.[0] ? (g.coordinates[0] as number[][]).slice(0, -1).map(([lo, la]) => [la, lo] as P) : null);
const sp = (l: Local | null, mun?: string | null) => /^s[ãa]o paulo$/i.test((l?.cidade || mun || '').trim());
const CAMPOS = 'id,codigo,nome,versao,empresa_id,logradouro,numero,bairro,cep,municipio_id,latitude,longitude,poligono_geojson';

/** depois de salvar a poligonal ou o pino: a rua do terreno ainda encosta na poligonal? Se não, abre a pergunta */
export async function verificarEndereco(id: string) {
  /* frentes, esquina e testada acompanham a poligonal (São Paulo) */
  atualizarFrentes(id).catch((e) => console.warn('frentes', e));
  try {
    const { data: t } = await supabase.from('terrenos').select(CAMPOS).eq('id', id).single();
    const poly = anel(t?.poligono_geojson);
    if (!t || !poly || t.latitude == null) return;
    let fr: Frente[] = [], l: Local | null = null;
    try { fr = await frentes(poly); } catch (e) { console.warn('frentes', e); }
    try { l = await localDoPonto(t.latitude, t.longitude); } catch (e) { console.warn('local', e); }
    if (!fr.length && l?.logradouro) fr = [{ logradouro: l.logradouro, numero: l.numero, m: null, lados: [] }];
    if (!fr.length) return;
    /* a mesma rua com ou sem o tipo abreviado (Av. Cupecê = Avenida Cupecê) e com ou sem os títulos (Dr., Prof.) */
    const chave = (r: string) => normRua(nomeRef(r)).replace(/\b(dr|doutor|prof|professor|eng|engenheiro|gen|general|cel|coronel|des|desembargador|pres|presidente|sen|senador|dep|deputado|cap|capitao|sto|santo|sta|santa|n\.? ?sra|nossa senhora)\b\.?\s*/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const atual = chave(t.logradouro || '');
    if (atual && fr.some((x) => chave(x.logradouro) === atual)) return;
    mudar({ t, poly, fr, local: l, nomes: [], passo: 'pergunta' });
    /* nomes já usados, para o nome sugerido ganhar 2, 3... como no cadastro */
    const bases = [...new Set(fr.map((x) => nomeBase(l?.bairro, x.logradouro)).filter(Boolean))];
    const rs = await Promise.all(bases.map((b) => supabase.from('terrenos').select('nome').eq('empresa_id', t.empresa_id).neq('id', id).ilike('nome', b.replace(/[\\%_]/g, (c) => '\\' + c) + '%')));
    if (C?.t.id === id) mudar({ ...C, nomes: rs.flatMap((r) => (r.data || []).map((x: R) => x.nome as string)) });
  } catch (e) { console.warn('verificar endereço', e); }
}

async function salvarT(id: string, d: R) {
  const { data: t, error: e1 } = await supabase.from('terrenos').select('versao').eq('id', id).single();
  if (e1 || !t) throw e1 ?? new Error('Terreno não encontrado');
  const { error } = await supabase.rpc('salvar_terreno', { p_terreno: id, p_versao: t.versao, p_dados: d });
  if (error) throw error;
}

export default function TrocarEndereco() {
  const c = useCaso();
  const { empresa, edita } = useSessao();
  const toast = useToast();
  const qc = useQueryClient();
  const [pri, setPri] = useState(0);
  const [nome, setNome] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  if (!c || !empresa || !edita) return null;
  const { t, fr, local: l } = c;
  const fechar = () => { mudar(null); setPri(0); setNome(null); };
  const att = () => { qc.invalidateQueries({ queryKey: ['mapa'] }); qc.invalidateQueries({ queryKey: ['ficha'] }); qc.invalidateQueries({ queryKey: ['ficha-lotes'] }); };
  const x = <button className="iconbtn" aria-label="Fechar" onClick={fechar}><Ic n="close" /></button>;
  const ruaVelha = [t.logradouro, t.numero].filter(Boolean).join(', ');
  const p0 = Math.min(pri, fr.length - 1), f0 = fr[p0];
  const sugerido = (f?: Frente) => (f ? nomeUnico(nomeBase(l?.bairro, f.logradouro), c.nomes) : '');
  const nomeV = nome ?? t.nome;

  async function gravar(ev: React.FormEvent) {
    ev.preventDefault();
    if (gravando || !c) return;
    const n = nomeV.trim();
    if (!n) { toast('Informe o nome de referência.', true); return; }
    setGravando(true);
    try {
      const d: R = { logradouro: f0?.logradouro || null, numero: f0?.numero || null, bairro: l?.bairro || t.bairro || null, cep: l?.cep || t.cep || null, nome: n };
      if (l?.cidade) {
        const { data: m } = await supabase.rpc('municipio_por_nome', { p_nome: l.cidade, p_uf: l.uf || '' });
        if (m) d.municipio_id = m;
      }
      const antes: R = Object.fromEntries(Object.keys(d).map((k) => [k, t[k] ?? null]));
      await salvarT(t.id, d);
      att();
      empilhar({ rotulo: 'endereço do terreno',
        fazer: async () => { try { await salvarT(t.id, antes); att(); return true; } catch (e) { toast(mensagemErro(e), true); return false; } },
        refazer: async () => { try { await salvarT(t.id, d); att(); return true; } catch (e) { toast(mensagemErro(e), true); return false; } } });
      toast(`Endereço trocado: ${[d.logradouro, d.numero].filter(Boolean).join(', ')}.`);
      /* em São Paulo, segue para os lotes da prefeitura, com os SQLs do terreno marcados */
      if (sp(l) && GEO_BASE) {
        const { data } = await supabase.from('inscricoes_municipais').select('inscricao_norm').eq('terreno_id', t.id);
        mudar({ ...c, passo: 'lotes', sqls: ((data ?? []) as R[]).map((x) => x.inscricao_norm) });
      } else fechar();
    } catch (e) { toast(mensagemErro(e), true); } finally { setGravando(false); }
  }
  async function lotes(marc: LoteSql[]) {
    if (!c) return;
    fechar();
    if (!marc.length) { toast('Nenhum lote marcado: os SQLs do terreno continuam como estavam.'); return; }
    const r = await trocarSqls(t.id, empresa!.id, marc, toast, { pos: t.latitude != null ? [t.latitude, t.longitude] : null, movido: false });
    att();
    if (r) empilhar({ rotulo: 'lotes do terreno', fazer: async () => { const ok = await r.desfazer(); att(); return ok; }, refazer: async () => { const ok = await r.refazer(); att(); return ok; } });
  }

  let corpo: React.ReactNode;
  if (c.passo === 'lotes') {
    return <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && fechar()}><div className="dialog" role="dialog" aria-modal="true">
      <LotesGeo empresa={empresa.id} L={{ modo: 'ficha', ficha: { codigo: t.codigo, nome: nomeV, poly: c.poly, sqls: c.sqls || [], fechar, incluir: lotes } }} />
    </div></div>;
  } else if (c.passo === 'pergunta') {
    corpo = <>
      <div className="dh"><div><h2>Trocar o endereço?</h2>
        <div className="muted" style={{ marginTop: 4 }}>{t.codigo} · {t.nome}</div></div>{x}</div>
      <p>{ruaVelha ? <>A poligonal não encosta mais em <b>{ruaVelha}</b>. </> : null}Agora ela fica {fr.length > 1 ? 'em' : 'na'} <b>{fr.map((q) => q.logradouro).join(', ')}</b>.</p>
      <p className="muted">Trocando, o endereço e o nome de referência são refeitos como no cadastro{sp(l) && GEO_BASE ? ' e o mapa de lotes da prefeitura abre para conferir os SQLs' : ''}. O que já está preenchido na ficha continua.</p>
      <div className="df"><button className="btn text" onClick={fechar}>Manter o endereço</button><button className="btn primary" onClick={() => mudar({ ...c, passo: 'dados' })}>Trocar o endereço</button></div>
    </>;
  } else {
    const onde = [f0 && [f0.logradouro, f0.numero].filter(Boolean).join(', '), l?.bairro, l?.cidade && l.cidade + (l.uf ? ' · ' + l.uf : '')].filter(Boolean).join(' · ');
    const sug = sugerido(f0);
    corpo = <>
      <div className="dh"><div><h2>Novo endereço</h2><div className="muted" style={{ marginTop: 4 }}>{t.codigo} · o resto da ficha fica como está.</div></div>{x}</div>
      <form id="f-troca-end" onSubmit={gravar}><div className="fields">
        <div className="field full"><div className="banner blue"><Ic n="check" /><div style={{ flex: 1 }}><div className="bt">{onde || 'Endereço não encontrado pela localização.'}</div>
          {ruaVelha && <div>Antes: {ruaVelha}{t.bairro ? ' · ' + t.bairro : ''}</div>}</div></div></div>
        {fr.length > 1 && <div className="field full nv-frentes"><span className="lbl-f" id="te-fr-l">A poligonal tem {fr.length} frentes. Qual é o acesso principal?</span>
          <span className="nv-fr" role="radiogroup" aria-labelledby="te-fr-l">{fr.map((q, i) => <label key={i} className="opt-radio"><input type="radio" name="te-pri" value={i} checked={i === p0} onChange={() => setPri(i)} />
            {q.logradouro}{q.numero ? ', ' + q.numero : ''}{q.m ? <span className="faint">&nbsp;· {Math.round(q.m).toLocaleString('pt-BR')} m</span> : null}</label>)}</span></div>}
        <div className="field full"><label htmlFor="te-nome">Nome de referência *</label>
          <input id="te-nome" required value={nomeV} onChange={(e) => setNome(e.target.value)} />
          {sug && sug !== nomeV.trim() && <span className="hint">Pelo endereço novo: <button type="button" className="linkbtn" onClick={() => setNome(sug)}>{sug}</button></span>}</div>
      </div></form>
      <div className="df"><button className="btn text" onClick={fechar}>Cancelar</button>
        <button className="btn primary" type="submit" form="f-troca-end" disabled={gravando}>{gravando ? 'Gravando...' : sp(l) && GEO_BASE ? 'Gravar e conferir os lotes' : 'Gravar endereço'}</button></div>
    </>;
  }
  return <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && fechar()}><div className="dialog" role="dialog" aria-modal="true">{corpo}</div></div>;
}

/** lápis do endereço na ficha: abre a página Mapa com a poligonal do terreno em edição (o pino também se arrasta) */
export function useEditarNoMapa() {
  const navegar = useNavigate();
  return (codigo: string) => navegar(`/mapa/${codigo}`, { state: { editar: true } });
}
export function LapisMapa({ codigo, className = 'kv-ed', id, rotulo }: { codigo: string; className?: string; id?: string; rotulo?: string }) {
  const ir = useEditarNoMapa();
  return <button type="button" id={id} className={className} title="Editar no mapa: poligonal e pino" aria-label="Editar o endereço no mapa (poligonal e pino)" onClick={() => ir(codigo)}><Ic n="edit" s={16} />{rotulo}</button>;
}
