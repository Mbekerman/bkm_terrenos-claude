/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { comRasc, useGuardarRasc, apagarRasc, LimparRasc } from '../components/Rascunho';
import { empilhar, type Desfeito } from '../components/Desfazer';
import { Adorno } from '../lib/mascara';
import { Ic } from '../components/Moldura';
import { data as fd, m2 } from '../lib/format';
import { centroPoly, fixa, geojson, lotesUniao, type P } from '../novo/geo';
import { digitos, GEO_BASE, loteDoSql } from '../novo/geosampa';
import { consultarLote, consultarTerreno, useConsultaGeo } from '../novo/consulta';
import { GSJ_BASE, consultarLoteSjc, gsjPoligono } from '../novo/geosanja';
import type { Ficha, R } from './dados';
import { lerNum, num, Quadro } from './edicao';
import { buscando } from '../lib/buscando';
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
const NO_EXCLUIDO = 'O administrador pode restaurar ou deletar esse terreno em Configurações › Terrenos excluídos.';
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
        supabase.from('inscricoes_municipais').select('id,inscricao,inscricao_norm,municipio_id,area_cadastral_m2,cib,zona_fiscal,origem,endereco_prefeitura,inscricao_valores(id,exercicio,revisao,vigente,valor_venal_terreno,valor_venal_construcao,valor_venal_imovel,situacao_iptu,iptu_valor_anual,iptu_parcelas,iptu_mensal_informado,fonte,data_verificacao)').eq('terreno_id', f.id).order('inscricao_norm'),
        supabase.from('consultas_lote').select('inscricao_id,consultado_em,base,lote,zonas,poligono_geojson,area_poligono_m2,camadas_com_erro').eq('terreno_id', f.id).order('consultado_em', { ascending: false }),
        f.t.municipio_id ? supabase.from('bases_cadastrais').select('codigo,municipio_id,nome,rotulo,mascara').eq('municipio_id', f.t.municipio_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        supabase.from('matricula_partes').select('id,matricula_id,parte_id,percentual').eq('terreno_id', f.id),
        supabase.from('inscricao_partes').select('id,inscricao_id,parte_id,percentual,matricula_parte_id').eq('terreno_id', f.id),
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
/** área dos SQLs da parte (pedido do Moises, 6/nov/2026): área cadastral do SQL × fração da parte no SQL × fração da parte
    na matrícula em que ele está (como app.v_partes); null se algum SQL não tem área */
function areaSqls(L: Lotes, es: { x: R; c: R }[]) {
  if (!es.every((e) => e.x.area_cadastral_m2 != null)) return null;
  return Math.round(soma(es.map((e) => {
    const cm = e.c.matricula_parte_id ? L.cm.find((y) => y.id === e.c.matricula_parte_id) : null;
    return +e.x.area_cadastral_m2 * fracao(L, 's', e.c).f * (cm ? fracao(L, 'm', cm).f : 1);
  })) * 100) / 100;
}
/** área da parte: a dos SQLs dela (com as frações); sem SQL, a das matrículas (todas com área) */
export function ptArea(L: Lotes, pid: string): { area: number | null; fonte: string | null } {
  const ms = daParte(L, 'm', pid), is = daParte(L, 's', pid);
  if (is.length) { const a = areaSqls(L, is); return a != null ? { area: a, fonte: 'SQLs' } : { area: null, fonte: null }; }
  if (ms.length) { const a = areaDe(L, 'm', ms); return a != null ? { area: a, fonte: 'matrículas' } : { area: null, fonte: null }; }
  return { area: null, fonte: null };
}
/** Matrícula × Prefeitura da parte: área dos SQLs contra a das matrículas, em % da matrícula */
function ptDiv(L: Lotes, pid: string) {
  const ms = daParte(L, 'm', pid), is = daParte(L, 's', pid);
  if (!ms.length || !is.length) return null;
  const a = areaDe(L, 'm', ms), b = areaSqls(L, is);
  return a && b != null ? Math.round(((b - a) / a) * 1000) / 10 : null;
}

/* recarga depois de cada ação, só do que a ação muda, e juntando as ações seguidas numa recarga só (6/nov/2026: cada
   etiqueta mexida recarregava a ficha, as partes, os lotes e o mapa inteiro, umas 16 consultas por clique):
   'lotes' = etiquetas e percentuais; 'ficha' = + ficha e proprietários (SQL, matrícula, parte); 'tudo' = + mapa (poligonal) */
type Esc = 'lotes' | 'ficha' | 'tudo';
const NIVEL: Record<Esc, number> = { lotes: 0, ficha: 1, tudo: 2 };
const PEND = new Map<string, { n: number; t: ReturnType<typeof setTimeout> }>();
function useRecarregar(f: Ficha) {
  const qc = useQueryClient();
  return (esc: Esc = 'ficha') => {
    const p = PEND.get(f.id), n = Math.max(NIVEL[esc], p?.n ?? 0);
    if (p) clearTimeout(p.t);
    PEND.set(f.id, { n, t: setTimeout(() => {
      PEND.delete(f.id);
      qc.invalidateQueries({ queryKey: ['ficha-lotes', f.id] });
      if (n >= 1) { qc.invalidateQueries({ queryKey: ['ficha-pessoas', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); }
      if (n >= 2) qc.invalidateQueries({ queryKey: ['mapa'] });
    }, 150) });
  };
}

/** refaz a poligonal pela soma dos lotes dos SQLs (São Paulo); sem SQL com lote, volta a desenhada */
let refazendo = false;
export async function refazerPoligonal(f: Ficha, como: string, aviso: (m: string, erro?: boolean) => void) {
  if (refazendo || (!GEO_BASE && !GSJ_BASE)) return;
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
      /* sem consulta guardada: o lote direto na prefeitura (SQL de São Paulo com 11 dígitos; inscrição de SJC com 14) */
      if (!p) try { p = i.inscricao_norm.length === 14 ? (GSJ_BASE ? await gsjPoligono(i.inscricao) : null) : GEO_BASE ? (await loteDoSql(i.inscricao_norm)).poly : null; } catch { p = null; }
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
/* relação da pessoa com a parte (pedido do Moises, 6/nov/2026) */
export const RELACAO: Record<string, string> = { proprietario: 'Proprietário', conjuge: 'Cônjuge', representante: 'Representante', procurador: 'Procurador', parente: 'Parente', contato: 'Contato', outro: 'Outros' };
/** as pessoas das partes do terreno (terreno_pessoas com a pessoa) */
export function usePessoasPartes(f: Ficha) {
  return useQuery({
    queryKey: ['ficha-pessoas', f.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('terreno_pessoas').select('id,papel,percentual_participacao,parte_id,pessoa_id,pessoas(id,nome_razao_social,tipo_pessoa,telefone,email,cpf_cnpj)').eq('terreno_id', f.id);
      if (error) throw error;
      return ((data ?? []) as R[]).sort((a, b) => (a.papel === 'proprietario' ? 0 : 1) - (b.papel === 'proprietario' ? 0 : 1)
        || String(a.pessoas?.nome_razao_social ?? '').localeCompare(b.pessoas?.nome_razao_social ?? '', 'pt-BR'));
    },
  });
}
const pctTxt = (v: unknown) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%');

/** janela das pessoas da parte: formulário de inclusão (e edição) e a tabela de todas embaixo */
function JanelaPessoas({ f, pa, ps, fechar }: { f: Ficha; pa: R; ps: R[]; fechar: () => void }) {
  const { edita, empresa } = useSessao();
  const toast = useToast(), qc = useQueryClient();
  const NV0 = { id: '', nome: '', tel: '', email: '', doc: '', pct: '', papel: 'proprietario' };
  const kP = `${f.id}:pessoa:${pa.id}`;
  const [nv, setNv] = useState(() => comRasc(kP, NV0));
  const [grav, setGrav] = useState(false);
  const fref = useRef<HTMLFormElement>(null);
  const temP = !!(nv.nome.trim() || nv.tel.trim() || nv.email.trim() || nv.doc.trim() || nv.pct.trim());
  useGuardarRasc(kP, nv, temP);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ['ficha-pessoas', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); };
  const editar = (p: R) => setNv({ id: p.id, nome: p.pessoas?.nome_razao_social ?? '', tel: p.pessoas?.telefone ? fmtTel(p.pessoas.telefone) : '', email: p.pessoas?.email ?? '',
    doc: p.pessoas?.cpf_cnpj ? fmtDoc(p.pessoas.cpf_cnpj) : '', pct: p.percentual_participacao != null ? num(+p.percentual_participacao, 2) : '', papel: p.papel });
  async function gravar(ev: FormEvent) {
    ev.preventDefault();
    if (grav) return;
    const nome = nv.nome.trim(), doc = digitos(nv.doc), tel = digitos(nv.tel), email = nv.email.trim().toLowerCase();
    if (!nome) { toast('Informe o nome.', true); return; }
    if (doc && doc.length !== 11 && doc.length !== 14) { toast('O CPF tem 11 dígitos (o CNPJ, 14).', true); return; }
    if (tel && (tel.length < 10 || tel.length > 11)) { toast('Telefone com DDD: 10 ou 11 dígitos.', true); return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('E-mail inválido.', true); return; }
    /* do proprietário só o nome e a participação são obrigatórios; telefone, e-mail e CPF não (pedido do Moises, 9/nov/2026) */
    const pct = nv.papel === 'proprietario' && nv.pct.trim() ? lerNum(nv.pct) : null;
    if (nv.papel === 'proprietario' && pct == null) { toast('Informe a participação do proprietário.', true); document.getElementById('pp-p')?.focus(); return; }
    if (pct != null && !(pct > 0 && pct <= 100)) { toast('A participação vai de 0 a 100%.', true); return; }
    const dp = { nome_razao_social: nome, tipo_pessoa: doc.length === 14 ? 'PJ' : 'PF', telefone: tel || null, email: email || null, cpf_cnpj: doc || null };
    setGrav(true);
    try {
      const ant = nv.id ? ps.find((x) => x.id === nv.id) : null;
      if (ant) {
        const r1 = await supabase.from('pessoas').update(dp).eq('id', ant.pessoa_id);
        if (r1.error) throw r1.error;
        const r2 = await supabase.from('terreno_pessoas').update({ papel: nv.papel, percentual_participacao: pct }).eq('id', ant.id);
        if (r2.error) throw r2.error;
        toast(`${nome} alterado.`);
      } else {
        /* com o CPF já cadastrado na empresa, a pessoa é a mesma */
        let pid: string | null = null;
        if (doc) { const r = await supabase.from('pessoas').select('id').eq('empresa_id', empresa!.id).eq('cpf_cnpj', doc).maybeSingle(); if (r.error) throw r.error; pid = r.data?.id ?? null; }
        if (!pid) { const r = await supabase.from('pessoas').insert({ empresa_id: empresa!.id, ...dp }).select('id').single(); if (r.error) throw r.error; pid = r.data.id; }
        const r2 = await supabase.from('terreno_pessoas').insert({ empresa_id: empresa!.id, terreno_id: f.id, pessoa_id: pid, papel: nv.papel, percentual_participacao: pct, parte_id: pa.id });
        if (r2.error) throw r2.error.code === '23505' ? new Error(`${nome} já está no terreno com essa relação.`) : r2.error;
      }
      apagarRasc(kP);
      setNv(NV0);
      recarregar();
      setTimeout(() => document.getElementById('pp-n')?.focus(), 30);
    } catch (e: any) { toast(e?.message ?? String(e), true); } finally { setGrav(false); }
  }
  async function tirar(p: R) {
    const { error } = await supabase.from('terreno_pessoas').delete().eq('id', p.id);
    if (error) { toast(error.message, true); return; }
    if (nv.id === p.id) setNv(NV0);
    toast(`${p.pessoas?.nome_razao_social ?? 'Pessoa'} tirado da parte.`);
    recarregar();
  }
  const prop = nv.papel === 'proprietario';
  const somaPct = soma(ps.filter((p) => p.papel === 'proprietario' && p.percentual_participacao != null).map((p) => +p.percentual_participacao));
  return (
    <Dialogo titulo={`Pessoas · ${pa.nome}`} onFechar={fechar} acao={edita && !nv.id ? <LimparRasc chave={kP} mostrar={temP} limpar={() => setNv(NV0)} /> : null} rodape={<button className="btn" onClick={fechar}>Concluir</button>}>
      <div className="pp-dlg">
        {edita && (
          <form className="pp-form" ref={fref} onSubmit={gravar}>
            <div className="field pp-nome"><label htmlFor="pp-n">Nome</label><input id="pp-n" required autoComplete="off" value={nv.nome} onChange={(e) => setNv({ ...nv, nome: e.target.value })} /></div>
            <div className="field"><label htmlFor="pp-r">Relação</label><select id="pp-r" value={nv.papel} onChange={(e) => setNv({ ...nv, papel: e.target.value, pct: e.target.value === 'proprietario' ? nv.pct : '' })}>
              {Object.entries(RELACAO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="pp-p">% de participação</label><Adorno t="pct"><input id="pp-p" inputMode="decimal" data-fmt="pct" disabled={!prop} required={prop} value={nv.pct} onChange={(e) => setNv({ ...nv, pct: e.target.value })} /></Adorno></div>
            <div className="field"><label htmlFor="pp-t">Telefone</label><input id="pp-t" inputMode="tel" data-fmt="tel" placeholder="(11) 98765-4321" value={nv.tel} onChange={(e) => setNv({ ...nv, tel: e.target.value })} /></div>
            <div className="field"><label htmlFor="pp-e">E-mail</label><input id="pp-e" type="email" placeholder="nome@email.com" value={nv.email} onChange={(e) => setNv({ ...nv, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="pp-c">CPF</label><input id="pp-c" inputMode="numeric" data-fmt="doc" placeholder="000.000.000-00" value={nv.doc} onChange={(e) => setNv({ ...nv, doc: e.target.value })} /></div>
            <div className="pp-bt">
              {nv.id && <button type="button" className="btn text sm" onClick={() => { apagarRasc(kP); setNv(NV0); }}>Cancelar</button>}
              <button className="btn primary sm" disabled={grav}><Ic n={nv.id ? 'check' : 'add'} s={16} />{nv.id ? 'Salvar' : 'Incluir'}</button>
            </div>
          </form>
        )}
        {ps.length ? (
          <div className="tblwrap"><table className="mini-tbl lst2 pp-tbl"><thead><tr><th>Nome</th><th>Relação</th><th className="r">%</th><th>Telefone</th><th>E-mail</th><th>CPF</th>{edita && <th />}</tr></thead><tbody>
            {ps.map((p) => (
              <tr key={p.id} className={nv.id === p.id ? 'sel' : ''}>
                <td className="l1">{p.pessoas?.nome_razao_social}</td>
                <td>{RELACAO[p.papel] ?? p.papel}</td>
                <td className={`r${p.percentual_participacao != null ? '' : ' l0'}`}>{pctTxt(p.percentual_participacao) || '—'}</td>
                <td className={p.pessoas?.telefone ? '' : 'l0'}>{p.pessoas?.telefone ? fmtTel(p.pessoas.telefone) : '—'}</td>
                <td className={p.pessoas?.email ? '' : 'l0'}>{p.pessoas?.email || '—'}</td>
                <td className={p.pessoas?.cpf_cnpj ? '' : 'l0'}>{p.pessoas?.cpf_cnpj ? fmtDoc(p.pessoas.cpf_cnpj) : '—'}</td>
                {edita && <td className="r"><span className="pp-acoes">
                  <button type="button" className="iconbtn sm" aria-label="Editar" title="Editar" onClick={() => editar(p)}><Ic n="edit" s={18} /></button>
                  <button type="button" className="iconbtn sm lixo" aria-label="Tirar da parte" title="Tirar da parte" onClick={() => tirar(p)}><Ic n="lixo" s={18} /></button></span></td>}
              </tr>
            ))}
          </tbody></table></div>
        ) : <div className="muted">Ninguém cadastrado nesta parte.</div>}
        {somaPct > 0 && <div className="hint">Participações informadas: {pctTxt(somaPct)}{somaPct < 100 ? `, faltam ${pctTxt(100 - somaPct)}` : ''}.</div>}
      </div>
    </Dialogo>
  );
}

function CartaoParte({ f, L, pa, n, ps }: { f: Ficha; L: Lotes; pa: R; n: number; ps: R[] }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar(f);
  const [nome, setNome] = useState(pa.nome);
  const [jan, setJan] = useState(false);
  useEffect(() => setNome(pa.nome), [pa.nome]);
  async function gravarNome() {
    const novo = nome.trim();
    if (novo === pa.nome) return;
    if (!novo) { toast('A parte precisa de um título.', true); setNome(pa.nome); return; }
    if (L.partes.some((x) => x.id !== pa.id && x.nome.trim().toLowerCase() === novo.toLowerCase())) { toast('Já existe uma parte com este título.', true); setNome(pa.nome); return; }
    const { error } = await supabase.rpc('salvar_parte', { p_terreno: f.id, p_parte: pa.id, p_dados: { nome: novo } });
    if (error) { toast(error.message, true); setNome(pa.nome); return; }
    recarregar();
  }
  async function excluir() {
    const { error } = await supabase.rpc('excluir_parte', { p_parte: pa.id });
    if (error) { toast(error.message, true); return; }
    const k = daParte(L, 'm', pa.id).length + daParte(L, 's', pa.id).length;
    toast(`${pa.nome} excluída.${k ? ` ${k} etiqueta${k > 1 ? 's saíram' : ' saiu'} dela.` : ''}`);
    recarregar('ficha');
  }
  const nm = daParte(L, 'm', pa.id).length, ni = daParte(L, 's', pa.id).length;
  /* só os proprietários, com o nome e o percentual; o resto (contatos, telefone, e-mail, CPF) fica na janela (pedido do Moises, 6/nov/2026) */
  const donos = ps.filter((p) => p.papel === 'proprietario'), outros = ps.length - donos.length;
  return (
    <article className="pt2" id={`pt2-${pa.id}`}>
      <div className="pt2-h">
        {edita ? <input className="pt2-tit" value={nome} aria-label="Título da parte" onChange={(e) => setNome(e.target.value)} onBlur={gravarNome} /> : <b>{pa.nome}</b>}
        <span className={`chip ${nm || ni ? 'good' : ''}`}>{nm || ni ? [nm && nm + (nm > 1 ? ' matrículas' : ' matrícula'), ni && ni + (ni > 1 ? ' SQLs' : ' SQL')].filter(Boolean).join(' · ') : 'sem matrícula'}</span>
        {/* só os ícones, sempre na linha do título (pedido do Moises, 6/nov/2026) */}
        <span className="pt2-acoes">
          <button type="button" className="iconbtn" id={`pp-ed-${pa.id}`} title={edita ? 'Editar pessoas da parte' : 'Ver pessoas da parte'} aria-label={edita ? 'Editar pessoas da parte' : 'Ver pessoas da parte'} onClick={() => setJan(true)}><Ic n={edita ? 'edit' : 'olho'} s={18} /></button>
          {edita && n > 1 && <button type="button" className="iconbtn" title="Excluir parte" aria-label="Excluir parte" onClick={excluir}><Ic n="lixo" s={18} /></button>}
        </span>
      </div>
      <div className="pt2-pp">
        <div className="pt2-pp-h"><span className="lbl-f">Proprietários</span></div>
        {donos.length ? <ul className="pt2-donos">{donos.map((p) => <li key={p.id}><span>{p.pessoas?.nome_razao_social}</span><span className="faint">{pctTxt(p.percentual_participacao) || '% não informado'}</span></li>)}</ul>
          : <span className="ni">Nenhum proprietário informado</span>}
        {outros > 0 && <span className="faint pt2-outros">+ {outros} {outros > 1 ? 'outras pessoas' : 'outra pessoa'} (cônjuge, contato…)</span>}
      </div>
      {jan && <JanelaPessoas f={f} pa={pa} ps={ps} fechar={() => setJan(false)} />}
    </article>
  );
}

function SecPartes({ f, L }: { f: Ficha; L: Lotes }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar(f);
  const P = L.partes;
  const ps = usePessoasPartes(f).data ?? [];
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
        const tem = L.cm.some((c) => c.parte_id === pa.id) || L.ci.some((c) => c.parte_id === pa.id) || ps.some((p) => p.parte_id === pa.id);
        if (tem) { toast(`${pa.nome} já tem pessoas, matrículas ou SQLs: use Excluir parte.`, true); break; }
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
            <span className="faint">Todo terreno nasce com uma parte.</span>
          </div>
        )}
        <div className="pt2-lista">{P.map((pa) => <CartaoParte key={pa.id} f={f} L={L} pa={pa} n={P.length} ps={ps.filter((p) => p.parte_id === pa.id || (P.length === 1 && !p.parte_id))} />)}</div>
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
/** contexto de uma mudança em grupo: os avisos e os desfazer de cada etiqueta, juntados no fim */
type Grupo = { avisos: string[]; pilha: Desfeito[] };
const chave = (e: Etq) => `${e.tipo}:${e.x.id}${e.c ? ':' + e.c.id : ''}`;
/** a etiqueta do lote sem nenhuma cópia, como se fosse uma cópia solta inteira (id vazio): a pizza, a barra e a janela
    valem igual, numa parte ou não (pedido do Moises, 6/nov/2026); gravar o percentual dela cria a cópia solta */
const virtual = (tipo: Tp, x: R): R => ({ id: '', [FK[tipo]]: x.id, parte_id: null, percentual: null });
const comC = (e: Etq): Etq & { c: R } => ({ ...e, c: e.c ?? virtual(e.tipo, e.x) });

function Etiqueta({ e, L, rot, edita, ver, tirar, menu, pct, sel }: { e: Etq; L: Lotes; rot: string; edita: boolean; ver: (k: string) => void; tirar: (k: string) => void; menu: (k: string, x: number, y: number) => void; pct: (k: string, r: DOMRect) => void; sel?: Set<string> }) {
  const n = e.tipo === 'm' ? e.x.numero : e.x.inscricao, k = chave(e), c = e.c ?? virtual(e.tipo, e.x);
  /* mini pizza com a fração da parte no lote, sempre que a etiqueta está numa parte (cheia em 100%; com 0%, o alerta);
     o clique abre a barra do percentual (pedido do Moises, 6/nov/2026) */
  const cs = copias(L, e.tipo, e.x.id), fr = fracao(L, e.tipo, c);
  const pz: number | null = Math.round(fr.f * 1000) / 10;
  const dica = `${L.partes.find((pa) => pa.id === c.parte_id)?.nome ?? 'Solta'}: ${num(pz, pz % 1 ? 1 : 0)}% deste lote${fr.est ? ' (estimado: sem percentual informado)' : ''}${cs.length > 1 ? ` · em ${cs.length} cópias` : ''}`;
  const shared = cs.length > 1;
  return (
    <span className={`etq ${e.tipo}${sel?.has(k) ? ' etq-sel' : ''}`} data-etq={k} aria-selected={sel?.has(k) || undefined} tabIndex={edita ? 0 : undefined} aria-label={`${e.tipo === 'm' ? 'Matrícula' : rot} ${n}${pz != null ? ', ' + dica : ''}`}
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
  const kM = `${f.id}:matricula`, kS = `${f.id}:sql`;
  const [mat, setMat] = useState(() => comRasc(kM, { num: '', cri: f.t.cartorio ?? '', area: '' }));
  const [sql, setSql] = useState(() => comRasc(kS, ''));
  useGuardarRasc(kM, mat, !!(mat.num.trim() || mat.area.trim()));
  useGuardarRasc(kS, sql, !!sql.trim());
  const [grav, setGrav] = useState(false);
  const mref = useRef<HTMLFormElement>(null), sref = useRef<HTMLFormElement>(null);
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
    /* sem o terreno na resposta: está num terreno excluído (a leitura esconde), que ainda segura o número */
    return x ? x.terrenos ?? { excluido: true } : null;
  }
  const P = L.partes, base = L.base, rot = base?.rotulo ?? 'Inscrição', sp = base?.codigo === 'geosampa', sjc = base?.codigo === 'geosanja';
  /* a cidade tem prefeitura para consultar nesta versão (São Paulo pelo GeoSampa, São José dos Campos pelo GeoSanja) */
  const pref = (sp && !!GEO_BASE) || (sjc && !!GSJ_BASE);
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
  const okR = (r: { error: any }) => { if (r.error) { toast(r.error.message, true); return false; } recarregar('lotes'); return true; };
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
  /* o SQL entra na parte sempre dentro de uma matrícula dela (pedido do Moises, 6/nov/2026): com uma matrícula só, vai para ela;
     com mais de uma, precisa ser solto sobre a matrícula; sem matrícula, não entra */
  function matDaParte(pid: string, av: (m: string, erro?: boolean) => void = toast): string | null {
    const ms = LR.current.cm.filter((c) => c.parte_id === pid);
    if (!ms.length) { av(`É necessário atribuir uma matrícula à parte ${nomeP(pid)} antes de lançar lotes nela.`, true); return null; }
    if (ms.length > 1) { av(`A parte ${nomeP(pid)} tem mais de uma matrícula: solte o ${rot} sobre a matrícula dele.`, true); return null; }
    return ms[0].id;
  }
  const nomeM = (mp: string | null | undefined) => { const c = mp ? LR.current.cm.find((y) => y.id === mp) : null; const m = c && LR.current.mats.find((x) => x.id === c.matricula_id); return m ? `matrícula ${m.numero}` : 'matrícula'; };
  /** a matrícula leva os SQLs dela (o banco faz o mesmo; aqui a tela muda na hora) */
  const levarSqls = (cid: string, pid: string | null) => local('s', (cs) => cs.map((y) => (y.matricula_parte_id === cid ? { ...y, parte_id: pid } : y)));
  const mudarM = async (id: string, v: R) => { if ('parte_id' in v) levarSqls(id, v.parte_id); return mudarC('m', id, v); };
  /** leva a etiqueta para a parte (null = de volta para sem parte); o SQL, para dentro da matrícula mp (sem mp, a única da parte) */
  async function parte(k: string, pid: string | null, mp?: string | null, ctx?: Grupo) {
    /* em grupo (seleção por retângulo), os avisos e o Ctrl+Z se juntam num só */
    const av = (m: string, erro = false) => (ctx ? ctx.avisos.push(m) : toast(m, erro));
    const emp = (d: Desfeito) => (ctx ? ctx.pilha.push(d) : empilhar(d));
    const e = achar(k);
    if (!e) return;
    if (e.tipo === 's') {
      if (pid && !mp) { mp = matDaParte(pid, av); if (!mp) return; }
      if (!pid) mp = null;
    }
    const dest: R = e.tipo === 's' ? { parte_id: pid, matricula_parte_id: mp ?? null } : { parte_id: pid };
    const onde = e.tipo === 's' && mp ? `${nomeM(mp)} da parte ${nomeP(pid)}` : `parte ${nomeP(pid)}`;
    if (!e.c) {   // sem parte → parte
      if (!pid) return;
      if (e.tipo === 's' && copias(LR.current, 's', e.x.id).some((y) => y.matricula_parte_id === mp)) { av(`${nome(e)} já está na ${onde}.`, true); return; }
      const row = { ...nova(e, pid), ...dest };
      if (!(await inserir(e.tipo, [row]))) return;
      emp({ rotulo: `${nome(e)} na ${onde}`, fazer: () => apagarC(e.tipo, [row.id]), refazer: () => inserir(e.tipo, [row]) });
      return;
    }
    const c = e.c;
    if (c.parte_id === pid && (e.tipo === 'm' || (c.matricula_parte_id ?? null) === (mp ?? null))) return;
    /* com o lote em outras partes, sair da parte deixa a cópia solta, com o percentual dela, para distribuir depois */
    if (!pid && copias(LR.current, e.tipo, e.x.id).length < 2) {   // parte → sem parte: o lote volta a ficar solto
      const row: R = { id: c.id, empresa_id: empresa!.id, terreno_id: f.id, [FK[e.tipo]]: e.x.id, parte_id: c.parte_id, percentual: c.percentual ?? null };
      if (e.tipo === 's') row.matricula_parte_id = c.matricula_parte_id ?? null;
      /* a matrícula que sai deixa os SQLs dela soltos; o Ctrl+Z os põe de volta nela */
      const dentro = e.tipo === 'm' ? LR.current.ci.filter((y) => y.matricula_parte_id === c.id).map((y) => y.id as string) : [];
      if (dentro.length) local('s', (cs) => cs.map((y) => (dentro.includes(y.id) ? { ...y, parte_id: null, matricula_parte_id: null } : y)));
      if (!(await apagarC(e.tipo, [c.id]))) return;
      const repor = async () => {
        if (!(await inserir(e.tipo, [row]))) return false;
        for (const id of dentro) if (!(await mudarC('s', id, { matricula_parte_id: c.id, parte_id: c.parte_id }))) return false;
        return true;
      };
      emp({ rotulo: `${nome(e)} fora da parte ${nomeP(c.parte_id)}`, fazer: repor, refazer: () => apagarC(e.tipo, [c.id]) });
      if (dentro.length) av(`${nome(e)} saiu da parte; ${dentro.length > 1 ? `os ${dentro.length} ${rot}s dela ficaram soltos` : `o ${rot} dela ficou solto`}.`);
      return;
    }
    if (pid && e.tipo === 'm' && jaEm(e, pid)) { av(`${nome(e)} já está na parte ${nomeP(pid)}.`, true); return; }
    if (pid && e.tipo === 's' && copias(LR.current, 's', e.x.id).some((y) => y.id !== c.id && y.matricula_parte_id === mp)) { av(`${nome(e)} já está na ${onde}.`, true); return; }
    const antes: R = e.tipo === 's' ? { parte_id: c.parte_id, matricula_parte_id: c.matricula_parte_id ?? null } : { parte_id: c.parte_id };
    const mv = (v: R) => (e.tipo === 'm' ? mudarM(c.id, v) : mudarC('s', c.id, v));
    if (!(await mv(dest))) return;
    emp({ rotulo: pid ? `${nome(e)} na ${onde}` : `${nome(e)} solta`, fazer: () => mv(antes), refazer: () => mv(dest) });
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
    if (e.tipo === 's') row.matricula_parte_id = e.c?.matricula_parte_id ?? null;   // o SQL duplicado fica na mesma matrícula
    const pFix = async (vals: (y: { c: R; p: number }) => number | null) => {
      for (const y of fixar) { local(e.tipo, (cs) => cs.map((c) => (c.id === y.c.id ? { ...c, percentual: vals(y) } : c))); const r = await supabase.from(TAB_C[e.tipo]).update({ percentual: vals(y) }).eq('id', y.c.id); if (r.error) { toast(r.error.message, true); recarregar('lotes'); return false; } }
      return true;
    };
    if (!(await pFix((y) => y.p))) return;
    if (!(await inserir(e.tipo, [row]))) { await pFix(() => null); recarregar('lotes'); return; }
    const onde = 'duplicada';
    toast(row.percentual ? `${nome(e)} ${onde}, com ${num(row.percentual, row.percentual % 1 ? 2 : 0)}%.`
      : `${nome(e)} ${onde}, com 0%: o lote já está todo nas outras cópias. Clique na pizza para dar o percentual.`);
    empilhar({ rotulo: `${nome(e)} duplicada`,
      fazer: async () => (await apagarC(e.tipo, [row.id])) && (await pFix(() => null)) && (recarregar('lotes'), true),
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
    if (e.tipo === 's' && (sp || sjc)) { await refazerPoligonal(f, `${e.x.inscricao} excluído`, toast); recarregar('tudo'); }
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
    if (ou?.excluido) { toast(`A matrícula ${n} está num terreno excluído. ${NO_EXCLUIDO}`, true); return; }
    if (ou) { setDup({ oque: `A matrícula ${n}`, codigo: ou.codigo, nome: ou.nome }); return; }
    const { error } = await supabase.from('matriculas').insert({ empresa_id: empresa!.id, terreno_id: f.id, numero: n, cartorio: cri, area_registrada_m2: lerNum(mat.area) });
    if (error) { toast(error.message, true); return; }
    apagarRasc(kM);
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
    if (ou?.excluido) { toast(`O ${rot} ${sql} está num terreno excluído. ${NO_EXCLUIDO}`, true); return; }
    if (ou) { setDup({ oque: `O ${rot} ${sql}`, codigo: ou.codigo, nome: ou.nome }); return; }
    setGrav(true);
    try {
      if (sp && GEO_BASE) await loteDoSql(d);   // confere o dígito no GeoSampa
      const { data, error } = await supabase.from('inscricoes_municipais')
        .insert({ empresa_id: empresa!.id, terreno_id: f.id, municipio_id: base?.municipio_id ?? f.t.municipio_id ?? null, inscricao: base ? mascarar(d, base.mascara) : sql.trim() })
        .select('id,inscricao').single();
      if (error) throw error;
      apagarRasc(kS);
      setSql('');
      recarregar();
      setTimeout(() => document.getElementById('es-sql')?.focus(), 30);
      if (pref) {
        await consultarTerreno(f.id, null, [{ id: data.id, sql: data.inscricao }], toast, base!.codigo);
        recarregar();
        await refazerPoligonal(f, `${data.inscricao} incluído`, toast);
        recarregar('tudo');
      }
    } catch (e: any) { toast(e?.message ?? String(e), true); } finally { setGrav(false); }
  }
  /* "Escolher no mapa": os marcados entram sem parte (origem mapa_prefeitura), os desmarcados das quadras abertas saem,
     menos os que têm IPTU lançado; depois a consulta do GeoSampa (ou do GeoSanja, em São José) nos novos e a poligonal pela soma dos lotes */
  async function incluirMapa(marc: LoteSql[], quadras: string[]) {
    setLg(false);
    const ja = new Set(L.insc.map((i) => i.inscricao_norm)), marcD = new Set(marc.map((x) => digitos(x.sql)));
    const novos = marc.filter((x) => !ja.has(digitos(x.sql)));
    const tirar = L.insc.filter((i) => !marcD.has(i.inscricao_norm) && quadras.includes(sjc ? i.inscricao_norm.slice(0, 2) + '.' + i.inscricao_norm.slice(2, 6) : i.inscricao_norm.slice(0, 3) + '.' + i.inscricao_norm.slice(3, 6)) && !(i.inscricao_valores ?? []).length);
    try {
      let ins: R[] = [];
      if (novos.length) {
        const r = await supabase.from('inscricoes_municipais').insert(novos.map((q) => ({ empresa_id: empresa!.id, terreno_id: f.id, municipio_id: base?.municipio_id ?? f.t.municipio_id,
          inscricao: q.sql, area_cadastral_m2: q.area, cib: q.cib, origem: 'mapa_prefeitura', endereco_prefeitura: q.end || null }))).select('id,inscricao');
        if (r.error) throw r.error;
        ins = (r.data ?? []) as R[];
      }
      if (tirar.length) { const r = await supabase.from('inscricoes_municipais').delete().in('id', tirar.map((i) => i.id)); if (r.error) throw r.error; }
      if (!novos.length && !tirar.length) { toast(sjc ? 'Nada mudou nas inscrições.' : 'Nada mudou nos SQLs.'); return; }
      const nn = novos.length > 1, nt = tirar.length > 1;
      toast([novos.length && (sjc ? `${novos.length} inscriç${nn ? 'ões incluídas' : 'ão incluída'}` : `${novos.length} SQL${nn ? 's' : ''} incluído${nn ? 's' : ''}`), tirar.length && `${tirar.length} tirad${sjc ? 'a' : 'o'}${nt ? 's' : ''}`].filter(Boolean).join(', ') + '.');
      recarregar();
      if (ins.length) { await consultarTerreno(f.id, null, ins.map((x) => ({ id: x.id, sql: x.inscricao })), toast, sjc ? 'geosanja' : 'geosampa'); recarregar(); }
      await refazerPoligonal(f, 'mapa de lotes da prefeitura', toast);
      recarregar('tudo');
    } catch (e: any) { toast(e?.message ?? String(e), true); }
  }
  async function tudo() {
    const pa = P[0];
    if (!pa) return;
    const rm = L.mats.filter((m) => !copias(L, 'm', m.id).length).map((x) => nova({ tipo: 'm', x }, pa.id));
    /* os SQLs entram dentro da matrícula: só vão juntos se a parte ficar com uma matrícula só */
    const mats = [...L.cm.filter((c) => c.parte_id === pa.id).map((c) => c.id as string), ...rm.map((r) => r.id as string)];
    const soltosS = L.insc.filter((i) => !copias(L, 's', i.id).length);
    const rs: R[] = mats.length === 1 ? soltosS.map((x) => ({ ...nova({ tipo: 's', x }, pa.id), matricula_parte_id: mats[0] })) : [];
    if (!(rm.length + rs.length)) {
      if (soltosS.length) toast(mats.length ? `A parte ${pa.nome} tem mais de uma matrícula: arraste cada ${rot} para a matrícula dele.` : `É necessário atribuir uma matrícula à parte ${pa.nome} antes de lançar lotes nela.`, true);
      return;
    }
    const por = async (sim: boolean) => {
      if (sim) return (!rm.length || (await inserir('m', rm))) && (!rs.length || (await inserir('s', rs)));
      return (!rs.length || (await apagarC('s', rs.map((x) => x.id)))) && (!rm.length || (await apagarC('m', rm.map((x) => x.id))));
    };
    if (!(await por(true))) return;
    toast(soltosS.length && !rs.length ? `Matrículas na parte ${pa.nome}. A parte ficou com mais de uma matrícula: arraste cada ${rot} para a matrícula dele.` : `Tudo na parte ${pa.nome}.`);
    empilhar({ rotulo: `etiquetas na parte ${pa.nome}`, fazer: () => por(false), refazer: () => por(true) });
  }
  function linha(pid: string) {
    const el = sec.current?.querySelector<HTMLElement>(`.etq-pt[data-p="${pid}"]`);
    if (!el) return;
    const fechar = !FECHADAS.has(pid), y = el.offsetTop;
    sec.current!.querySelectorAll<HTMLElement>('.etq-pt').forEach((b) => { if (Math.abs(b.offsetTop - y) < 4) { if (fechar) FECHADAS.add(b.dataset.p!); else FECHADAS.delete(b.dataset.p!); } });
    re((x) => x + 1);
  }

  /* seleção de várias etiquetas (pedido do Moises, 10/nov/2026): com o mouse, clicar no vazio da seção e arrastar desenha um
     retângulo, e as etiquetas que ele toca ficam selecionadas; Ctrl (⌘ no Mac) ou Shift com o clique na etiqueta ou no começo
     do retângulo soma à seleção; clique no vazio ou Esc limpa. Arrastar uma etiqueta selecionada leva todas juntas */
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const selR = useRef(sel);
  selR.current = sel;
  useEffect(() => {
    if (!sel.size) return;
    /* na captura, para o Esc só limpar a seleção (e não fechar a gaveta da ficha junto) */
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.scrim')) { e.stopPropagation(); setSel(new Set()); } };
    document.addEventListener('keydown', esc, true);
    return () => document.removeEventListener('keydown', esc, true);
  }, [sel.size]);
  /* etiqueta que sumiu (excluída, movida por outra pessoa) sai da seleção */
  useEffect(() => {
    if (!sel.size) return;
    const vivas = new Set<string>(); sec.current?.querySelectorAll<HTMLElement>('.etq[data-etq]').forEach((el) => vivas.add(el.dataset.etq!));
    if ([...sel].some((k) => !vivas.has(k))) setSel(new Set([...sel].filter((k) => vivas.has(k))));
  });
  /** leva o grupo para o destino solto: as matrículas antes (os SQLs podem entrar nelas), um aviso e um Ctrl+Z só */
  async function grupo(ks: string[], drop: 'pool' | 'parte' | 'mat', pid: string | null, mp?: string) {
    const ctx: Grupo = { avisos: [], pilha: [] };
    const es = ks.map((k) => ({ k, e: achar(k) })).filter((y) => y.e) as { k: string; e: Etq }[];
    const ms = es.filter((y) => y.e.tipo === 'm'), ss = es.filter((y) => y.e.tipo === 's');
    const alvo = drop === 'pool' ? null : pid;
    for (const { k } of ms) await parte(k, alvo, undefined, ctx);
    for (const { k, e } of ss) {
      /* o SQL que já foi junto com a matrícula dele não anda de novo */
      const c = e.c && copiasDe(LR.current, 's').find((y) => y.id === e.c!.id);
      if (alvo && drop === 'parte' && c?.parte_id === alvo) continue;
      await parte(k, alvo, drop === 'mat' ? mp : undefined, ctx);
    }
    const n = ctx.pilha.length;
    if (n) {
      const pilha = [...ctx.pilha];
      empilhar({ rotulo: `${n} etiquetas ${alvo ? `na parte ${nomeP(alvo)}` : 'soltas'}`,
        fazer: async () => { for (const d of [...pilha].reverse()) if (!(await d.fazer())) return false; return true; },
        refazer: async () => { for (const d of pilha) if (!(await d.refazer())) return false; return true; } });
    }
    const avisos = [...new Set(ctx.avisos)];
    if (avisos.length) toast((n ? `${n} de ${es.length} etiquetas foram. ` : '') + avisos.join(' '), !n);
    else if (n) toast(`${n} etiqueta${n > 1 ? 's' : ''} ${alvo ? `na parte ${nomeP(alvo)}` : `solta${n > 1 ? 's' : ''}`}.`);
    setSel(new Set());
  }
  const grupoR = useRef(grupo);
  grupoR.current = grupo;

  /* arrastar e soltar (mouse e toque: no toque, segurar a etiqueta antes de arrastar) */
  const parteR = useRef<(k: string, pid: string | null, mp?: string | null) => Promise<void>>(parte);
  parteR.current = parte;
  useEffect(() => {
    if (!edita) return;
    let A: any = null, Q: any = null;   // A: etiqueta (ou grupo) sendo arrastada; Q: o retângulo de seleção
    const raiz = () => sec.current;
    const comecar = () => {
      const a = A; if (!a) return; a.ativo = true;
      const r = a.el.getBoundingClientRect(); a.dx = a.x - r.left; a.dy = a.y - r.top;
      const g = a.el.cloneNode(true) as HTMLElement; g.classList.add('etq-fantasma'); g.classList.remove('etq-sel'); g.style.width = r.width + 'px';
      if (a.ks.length > 1) { const b = document.createElement('span'); b.className = 'etq-conta'; b.textContent = String(a.ks.length); g.appendChild(b); g.classList.add('grupo'); }
      document.body.appendChild(g); a.g = g;
      a.els = a.ks.map((k: string) => raiz()?.querySelector<HTMLElement>(`.etq[data-etq="${k}"]`)).filter(Boolean);
      a.els.forEach((el: HTMLElement) => el.classList.add('etq-origem')); document.body.classList.add('etq-arrastando');
      /* destino aceita se aceita alguma das etiquetas do grupo (a parte que já tem o lote não acende para ele) */
      const regras = a.ks.map((k: string) => {
        const [tipo, lote] = k.split(':'), orig = raiz()?.querySelector<HTMLElement>(`.etq[data-etq="${k}"]`)?.closest('[data-drop]');
        const cs = copias(LR.current, tipo as Tp, lote), tem = new Set(cs.map((c) => c.parte_id)), temM = new Set(cs.map((c) => c.matricula_parte_id));
        /* o SQL vai para dentro de uma matrícula (a parte inteira também aceita: com uma matrícula só, ele entra nela); a matrícula, para a parte */
        return (d: HTMLElement) => d !== orig && (d.dataset.tipo === tipo || (tipo === 's'
          ? (d.dataset.drop === 'mat' && !temM.has(d.dataset.mp!)) || d.dataset.drop === 'parte'
          : d.dataset.drop === 'parte' && !tem.has(d.dataset.p!)));
      });
      raiz()?.querySelectorAll<HTMLElement>('[data-drop]').forEach((d) => { if (regras.some((f: (d: HTMLElement) => boolean) => f(d))) d.classList.add('etq-aceita'); });
      mover(a.x, a.y);
    };
    const mover = (x: number, y: number) => {
      const a = A; if (!a?.g) return;
      a.g.style.left = x - a.dx + 'px'; a.g.style.top = y - a.dy + 'px';
      const d = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.('.etq-aceita');
      document.querySelectorAll('.etq-sobre').forEach((z) => { if (z !== d) z.classList.remove('etq-sobre'); });
      d?.classList.add('etq-sobre');
      if (y < 60) rolar(-14); else if (y > innerHeight - 60) rolar(14);
    };
    /* rola quem de fato rola a seção (a página ou a gaveta da ficha) */
    const rolar = (dy: number) => {
      for (let p = raiz()?.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) { p.scrollBy(0, dy); return; }
      }
      scrollBy(0, dy);
    };
    const rolou = () => { const q = Q; if (q?.ativo) laco(q.lx, q.ly); };
    const fim = (soltar: boolean, x = 0, y = 0) => {
      const a = A; A = null; if (!a) return; clearTimeout(a.timer); if (!a.ativo) return;
      soltou.current = Date.now();
      a.g?.remove(); a.els?.forEach((el: HTMLElement) => el.classList.remove('etq-origem')); document.body.classList.remove('etq-arrastando');
      const d = soltar ? (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.<HTMLElement>('.etq-aceita') : null;
      document.querySelectorAll('.etq-aceita,.etq-sobre').forEach((z) => z.classList.remove('etq-aceita', 'etq-sobre'));
      if (!d) return;
      const drop = d.dataset.drop as 'pool' | 'parte' | 'mat';
      if (a.ks.length > 1) grupoR.current(a.ks, drop, drop === 'pool' ? null : d.dataset.p!, drop === 'mat' ? d.dataset.mp! : undefined);
      else parteR.current(a.k, drop === 'pool' ? null : d.dataset.p!, drop === 'mat' ? d.dataset.mp! : undefined);
    };
    /* o retângulo: só com o mouse e a partir do vazio (fora de etiqueta, campo, botão e título de parte) */
    const VAZIO_NAO = '.etq, input, select, textarea, button, a, label, [contenteditable], .etq-menu, .scrim';
    const laco = (x: number, y: number) => {
      const q = Q; if (!q) return;
      q.lx = x; q.ly = y;
      /* o ponto de partida fica preso ao conteúdo: rolando (roda ou borda), ele anda junto e o retângulo cresce */
      const rr = q.ancora.getBoundingClientRect(), ax = rr.left + q.ox, ay = rr.top + q.oy;
      const l = Math.min(ax, x), t = Math.min(ay, y), w = Math.abs(x - ax), h = Math.abs(y - ay);
      Object.assign(q.div.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px' });
      const dentro = new Set<string>(q.base);
      raiz()?.querySelectorAll<HTMLElement>('.etq[data-etq]').forEach((el) => {
        if (el.closest('.fechado')) return;
        const r = el.getBoundingClientRect();
        if (r.right >= l && r.left <= l + w && r.bottom >= t && r.top <= t + h) dentro.add(el.dataset.etq!);
      });
      const atual = selR.current;
      if (dentro.size !== atual.size || [...dentro].some((k) => !atual.has(k))) setSel(dentro);
      if (y < 60) rolar(-14); else if (y > innerHeight - 60) rolar(14);
    };
    const down = (e: PointerEvent) => {
      const alvo = e.target as HTMLElement;
      const el = alvo.closest?.<HTMLElement>('.etq[data-etq]');
      const somar = e.ctrlKey || e.metaKey || e.shiftKey;
      if (!el) {
        if (e.pointerType !== 'mouse' || e.button !== 0 || !raiz()?.contains(alvo) || alvo.closest(VAZIO_NAO)) return;
        /* âncora: o elemento clicado (a seção é display: contents e não tem caixa) */
        const rr = alvo.getBoundingClientRect();
        Q = { x: e.clientX, y: e.clientY, ancora: alvo, ox: e.clientX - rr.left, oy: e.clientY - rr.top, pid: e.pointerId, ativo: false, base: somar ? [...selR.current] : [] };
        return;
      }
      if (!raiz()?.contains(el) || e.button > 0 || alvo.closest('.etq-x,.etq-ed,.etq-pzb')) return;
      const k = el.dataset.etq!;
      if (somar && e.pointerType === 'mouse') {   // Ctrl/Shift + clique: põe ou tira da seleção, sem abrir a janela
        e.preventDefault(); soltou.current = Date.now();
        setSel((s0) => { const n = new Set(s0); if (n.has(k)) n.delete(k); else n.add(k); return n; });
        return;
      }
      const ks = selR.current.has(k) && selR.current.size > 1 ? [...selR.current] : [k];
      A = { el, k, ks, x: e.clientX, y: e.clientY, pid: e.pointerId, toque: e.pointerType !== 'mouse', ativo: false };
      if (A.toque) { const a = A; a.timer = setTimeout(() => { if (A === a) comecar(); }, 300); }
    };
    const move = (e: PointerEvent) => {
      const q = Q;
      if (q && e.pointerId === q.pid) {
        if (!q.ativo) {
          if (Math.hypot(e.clientX - q.x, e.clientY - q.y) < 5) return;
          q.ativo = true; q.div = document.createElement('div'); q.div.className = 'etq-laco'; document.body.appendChild(q.div);
          document.body.classList.add('etq-lacando'); getSelection()?.removeAllRanges();
        }
        e.preventDefault(); laco(e.clientX, e.clientY); return;
      }
      const a = A; if (!a || e.pointerId !== a.pid) return;
      if (!a.ativo) { const d = Math.hypot(e.clientX - a.x, e.clientY - a.y); if (a.toque) { if (d > 8) { clearTimeout(a.timer); A = null; } return; } if (d < 5) return; comecar(); }
      e.preventDefault(); mover(e.clientX, e.clientY);
    };
    const fimQ = (e: PointerEvent) => {
      const q = Q; if (!q || e.pointerId !== q.pid) return false;
      Q = null;
      if (q.ativo) { q.div.remove(); document.body.classList.remove('etq-lacando'); soltou.current = Date.now(); }
      else if (!q.base.length && selR.current.size) setSel(new Set());   // clique no vazio limpa
      return true;
    };
    const up = (e: PointerEvent) => { if (fimQ(e)) return; if (A && e.pointerId === A.pid) fim(true, e.clientX, e.clientY); };
    const cancel = (e: PointerEvent) => { if (fimQ(e)) return; if (A && e.pointerId === A.pid) fim(false); };
    const tm = (e: TouchEvent) => { if (A?.ativo) e.preventDefault(); };
    const ctx = (e: MouseEvent) => { if (A || (e.target as HTMLElement).closest?.('.etq[data-etq]')) e.preventDefault(); };
    document.addEventListener('pointerdown', down); document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel); document.addEventListener('touchmove', tm, { passive: false }); document.addEventListener('contextmenu', ctx);
    document.addEventListener('scroll', rolou, true);
    return () => {
      document.removeEventListener('scroll', rolou, true);
      document.removeEventListener('pointerdown', down); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel); document.removeEventListener('touchmove', tm); document.removeEventListener('contextmenu', ctx);
      Q?.div?.remove(); document.body.classList.remove('etq-lacando');
    };
  }, [edita]);

  const pool = (tipo: 'm' | 's') => {
    /* sem parte: o lote sem nenhuma cópia e as cópias soltas (duplicadas para distribuir depois) */
    const lista = lotesDe(L, tipo), es: Etq[] = lista.flatMap((x) => { const cs = copias(L, tipo, x.id); return cs.length ? cs.filter((c) => !c.parte_id).map((c) => ({ tipo, x, c })) : [{ tipo, x }]; });
    return (
      <div className="etq-pool" data-drop="pool" data-tipo={tipo}>
        {es.length ? es.map((e) => <Etiqueta key={chave(e)} e={e} L={L} rot={rot} edita={edita} ver={ver} tirar={tirar} menu={abrirMenu} pct={abrirPct} sel={sel} />)
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
  /* destinos do menu: a matrícula vai para a parte; o SQL, para cada matrícula de cada parte */
  const destinos: { pid: string; mp?: string; nome: string }[] = !menuE ? []
    : menuE.tipo === 'm' ? P.filter((pa) => !copias(L, 'm', menuE.x.id).some((c) => c.parte_id === pa.id)).map((pa) => ({ pid: pa.id, nome: pa.nome }))
    : P.flatMap((pa) => L.cm.filter((c) => c.parte_id === pa.id && !copias(L, 's', menuE.x.id).some((y) => y.matricula_parte_id === c.id))
      .map((c) => ({ pid: pa.id, mp: c.id as string, nome: `${pa.nome} › Matrícula ${L.mats.find((m) => m.id === c.matricula_id)?.numero ?? ''}` })));
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
  const andamento = cons && cons.terreno === f.id ? <span className="chip blue lg-cons">Consultando o {cons.nome ?? 'GeoSampa'}: {cons.feitos} de {cons.total}</span> : null;
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
                  <LimparRasc chave={kM} mostrar={!!(mat.num.trim() || mat.area.trim())} limpar={() => setMat({ num: '', cri: f.t.cartorio ?? '', area: '' })} />
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
                  {((sp && GEO_BASE) || (sjc && GSJ_BASE)) && f.poly && <button type="button" className="btn sm text" onClick={() => setLg(true)}><Ic n="layers" s={16} />Escolher no mapa</button>}
                  <LimparRasc chave={kS} mostrar={!!sql.trim()} limpar={() => setSql('')} />
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
                    {/* cada matrícula da parte é um subquadro, e os SQLs dela entram dentro (pedido do Moises, 6/nov/2026) */}
                    {ms.map(({ x, c }) => {
                      const dentro = is.filter((y) => y.c.matricula_parte_id === c.id);
                      return (
                        <div key={c.id} className="etq-mq" data-drop="mat" data-p={pa.id} data-mp={c.id}>
                          <div className="etq-mq-h"><Etiqueta e={{ tipo: 'm', x, c }} L={L} rot={rot} edita={edita} ver={ver} tirar={tirar} menu={abrirMenu} pct={abrirPct} sel={sel} /></div>
                          <div className="etq-mq-b">{dentro.length ? dentro.map(({ x: y, c: cy }) => <Etiqueta key={cy.id} e={{ tipo: 's', x: y, c: cy }} L={L} rot={rot} edita={edita} ver={ver} tirar={tirar} menu={abrirMenu} pct={abrirPct} sel={sel} />)
                            : <span className="etq-vazio">{edita ? `Solte aqui os ${rot}s desta matrícula.` : `Sem ${rot}.`}</span>}</div>
                        </div>
                      );
                    })}
                    {(() => {   // SQL de antes da regra, sem matrícula: fica à parte até ser levado para uma
                      const sem = is.filter((y) => !y.c.matricula_parte_id || !ms.some((m) => m.c.id === y.c.matricula_parte_id));
                      return sem.length > 0 && (
                        <div className="etq-mq sem">
                          <div className="etq-mq-h"><span className="faint">{rot}s sem matrícula: arraste cada um para a matrícula dele</span></div>
                          <div className="etq-mq-b">{sem.map(({ x: y, c: cy }) => <Etiqueta key={cy.id} e={{ tipo: 's', x: y, c: cy }} L={L} rot={rot} edita={edita} ver={ver} tirar={tirar} menu={abrirMenu} pct={abrirPct} sel={sel} />)}</div>
                        </div>
                      );
                    })()}
                    {!ms.length && !is.length && <span className="etq-vazio">{edita ? `Arraste para cá as matrículas desta parte; os ${rot}s entram dentro de cada matrícula.` : 'Sem matrícula.'}</span>}
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
            <LotesGeo empresa={empresa!.id} L={{ modo: 'ficha', sjc, ficha: { codigo: f.codigo, nome: f.nome, poly: f.poly, sqls: L.insc.map((i) => i.inscricao_norm), fechar: () => setLg(false), incluir: incluirMapa } }} />
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
          {destinos.length > 0 && <>
            <div className="etq-menu-h">{menuE.c?.parte_id ? 'Mover para' : 'Pôr em'}</div>
            {destinos.map((d) => <button key={'m' + d.pid + (d.mp ?? '')} type="button" role="menuitem" onClick={() => fazM(() => parte(menu.k, d.pid, d.mp))}><Ic n="fwd" s={16} />{d.nome}</button>)}
          </>}
          {menuE.tipo === 's' && !destinos.length && !L.cm.some((c) => c.parte_id) && <div className="etq-menu-v">Leve uma matrícula para a parte antes de lançar {rot}s nela.</div>}
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
type OpsEtq = { parte: (k: string, pid: string | null, mp?: string | null) => Promise<void>; duplicar: (k: string) => Promise<void>; percentual: (tipo: Tp, c: R, v: number | null) => Promise<boolean>; tirar: (k: string) => void; apagar: (k: string) => void };
/** Lançar ou atualizar o IPTU de um SQL à mão: só fora de São Paulo (pedido do Moises, 9/nov/2026), onde não há a busca na
 * Prefeitura. Cada lançamento é uma revisão nova em app.inscricao_valores; só vale o exercício mais recente. */
export function FormIptu({ f, x, vv, onFeito }: { f: Ficha; x: R; vv: R | undefined; onFeito?: () => void }) {
  const { empresa } = useSessao();
  const toast = useToast(), recarregar = useRecarregar(f);
  const IPTU0 = { ex: String(vv?.exercicio ?? new Date().getFullYear()), sit: 'tributado', parc: '10' };
  const kI = `${f.id}:iptu:${x.id}`;
  const [iptu, setIptu] = useState<Record<string, string>>(() => comRasc(kI, IPTU0));
  const iref = useRef<HTMLFormElement>(null);
  const temI = ['vt', 'vc', 'iptu', 'mensal', 'fonte'].some((c) => (iptu[c] ?? '').trim() !== '');
  useGuardarRasc(kI, iptu, temI);
  async function lancar(ev: FormEvent) {
    ev.preventDefault();
    const ex = parseInt(iptu.ex, 10);
    if (vv && ex < vv.exercicio) { toast(`Já há IPTU de ${vv.exercicio}: só vale o exercício mais recente.`, true); return; }
    const { error } = await supabase.from('inscricao_valores').insert({
      empresa_id: empresa!.id, inscricao_id: x.id, exercicio: ex, valor_venal_terreno: lerNum(iptu.vt), valor_venal_construcao: lerNum(iptu.vc),
      situacao_iptu: iptu.sit, iptu_valor_anual: iptu.sit === 'isento' ? null : lerNum(iptu.iptu), iptu_parcelas: iptu.parc ? parseInt(iptu.parc, 10) : null,
      iptu_mensal_informado: iptu.sit === 'isento' ? null : lerNum(iptu.mensal), fonte: iptu.fonte?.trim() || null,
    });
    if (error) { toast(error.message, true); return; }
    apagarRasc(kI);
    setIptu({ ex: String(ex), sit: 'tributado', parc: '10' });
    recarregar();
    onFeito?.();
  }
  const ip = (k2: string, l: string, extra: Record<string, unknown> = {}) => (
    <div className="field" key={k2} style={extra.style as any}><label htmlFor={`v-${x.id}-${k2}`}>{l.replace(' (R$)', '')}</label>{(() => {
      const r = / \(R\$\)/.test(l), i = <input id={`v-${x.id}-${k2}`} inputMode="decimal" data-fmt={r ? 'moeda' : (extra.attrs as any)?.inputMode === 'numeric' ? 'none' : undefined} value={iptu[k2] ?? ''} onChange={(e) => setIptu({ ...iptu, [k2]: e.target.value })} {...(extra.attrs as any)} />;
      return r ? <Adorno t="moeda">{i}</Adorno> : i; })()}</div>
  );
  return (
    <>
          <form className="inline-form" ref={iref} style={{ border: 0, paddingTop: 4 }} onSubmit={lancar}>
            {ip('ex', 'Exercício', { style: { flex: '0 1 96px' }, attrs: { inputMode: 'numeric', required: true } })}
            {ip('vt', 'Venal terreno (R$)')}{ip('vc', 'Venal construção (R$)')}
            <div className="field"><label htmlFor={`v-${x.id}-sit`}>Situação do IPTU</label><select id={`v-${x.id}-sit`} value={iptu.sit} onChange={(e) => setIptu({ ...iptu, sit: e.target.value })}>{Object.entries(SIT_IPTU).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
            {ip('iptu', 'IPTU anual (R$)')}{ip('parc', 'Parcelas', { style: { flex: '0 1 86px' }, attrs: { inputMode: 'numeric' } })}
            {ip('mensal', 'IPTU mensal informado (R$)', { attrs: { placeholder: 'se a fonte trouxer' } })}
            <div className="field grow"><label htmlFor={`v-${x.id}-fonte`}>Fonte</label><input id={`v-${x.id}-fonte`} required placeholder="Carnê, certidão de dados cadastrais..." value={iptu.fonte ?? ''} onChange={(e) => setIptu({ ...iptu, fonte: e.target.value })} /></div>
            <button className="btn sm"><Ic n="add" s={16} />{vv ? 'Atualizar IPTU' : 'Lançar IPTU'}</button>
            <LimparRasc chave={kI} mostrar={temI} limpar={() => setIptu(IPTU0)} />
          </form>
          <div className="hint">Só vale o exercício mais recente: lançar o ano novo substitui o anterior.</div>
    </>
  );
}

function JanelaEtq({ f, L, k, fechar, ops }: { f: Ficha; L: Lotes; k: string; fechar: () => void; ops: OpsEtq }) {
  const { edita } = useSessao();
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
  /* o SQL escolhe a matrícula da parte (entra sempre dentro de uma); a matrícula escolhe a parte */
  const temM = new Set(cs.map((y) => y.matricula_parte_id));
  const nMat = (mc: R) => `${nomeP(mc.parte_id)} › Matrícula ${L.mats.find((m) => m.id === mc.matricula_id)?.numero ?? ''}`;
  const matsP = L.cm.filter((mc) => mc.parte_id);
  const parte = lin(cs.length > 1 ? 'Esta etiqueta está na parte' : 'Parte', edita
    ? tipo === 's'
      ? <select value={c?.matricula_parte_id ?? ''} onChange={(e) => { const mc = matsP.find((y) => y.id === e.target.value); ops.parte(kc, mc?.parte_id ?? null, mc?.id ?? null); }}>
          <option value="">{c && cs.length > 1 ? 'Tirar desta parte' : 'Sem parte'}</option>
          {c?.parte_id && !c.matricula_parte_id && <option value="" disabled>{nomeP(c.parte_id)} (sem matrícula)</option>}
          {matsP.map((mc) => <option key={mc.id} value={mc.id} disabled={temM.has(mc.id) && mc.id !== c?.matricula_parte_id}>{nMat(mc)}</option>)}</select>
      : <select value={c?.parte_id ?? ''} onChange={(e) => ops.parte(kc, e.target.value || null)}>
          <option value="">{c && cs.length > 1 ? 'Tirar desta parte' : 'Sem parte'}</option>
          {L.partes.map((pa) => <option key={pa.id} value={pa.id} disabled={temP.has(pa.id) && pa.id !== c?.parte_id}>{pa.nome}</option>)}</select>
    : val(c ? (tipo === 's' && c.matricula_parte_id ? nMat(L.cm.find((y) => y.id === c.matricula_parte_id) ?? { parte_id: c.parte_id }) : nomeP(c.parte_id)) : 'Sem parte'));
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
  const rodape = <><button className="btn text" onClick={fechar}>Concluir</button>
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
  const cg = L.consultas[x.id], sp = L.base?.codigo === 'geosampa', sjc = L.base?.codigo === 'geosanja', pref = sp || sjc;
  const nomeBase = sjc ? 'GeoSanja' : 'GeoSampa', urlBase = sjc ? GSJ_BASE : GEO_BASE;
  const vs = ((x.inscricao_valores ?? []) as R[]).filter((y) => y.vigente).sort((a, b) => b.exercicio - a.exercicio), vv = vs[0];
  const venal = vv ? (vv.valor_venal_imovel ?? (vv.valor_venal_terreno != null && vv.valor_venal_construcao != null ? +vv.valor_venal_terreno + +vv.valor_venal_construcao : vv.valor_venal_terreno)) : null;
  async function buscar() {
    setBusc(true);
    try {
      const ok = await buscando(f.id, sjc ? 'geosanja' : 'geosampa', sjc ? consultarLoteSjc(x!.id, x!.inscricao) : consultarLote(x!.id, x!.inscricao));
      toast(ok ? `${nomeBase} consultado.` : `O ${nomeBase} não achou o lote ${sjc ? 'desta inscrição' : 'deste SQL'}.`, !ok); recarregar();
      /* em SJC a poligonal do lote só chega pela consulta: refaz a do terreno pela soma dos lotes */
      if (ok && sjc) { await refazerPoligonal(f, `${x!.inscricao} consultada`, toast); recarregar('tudo'); }
    }
    catch (e: any) { toast(e?.message ?? String(e), true); } finally { setBusc(false); }
  }
  return (
    <Dialogo titulo={`${rot} ${x.inscricao}`} sub={x.endereco_prefeitura ?? undefined} onFechar={fechar} rodape={rodape}>
      <div className="pt2-g">
        {lin('Área cadastral', edita ? <Adorno t="m2">{txt('area_cadastral_m2', { inputMode: 'decimal' }, lerNum)}</Adorno> : val(x.area_cadastral_m2 != null ? m2(x.area_cadastral_m2) : '—'))}
        {parte}
      </div>
      {partesLote}
      {pref && (
        <div className="etq-geo">
          {cg ? (
            <div className="geo-h"><span><b>{nomeBase}</b> <span className="muted">consultado em {fd(cg.consultado_em)}{(cg.zonas ?? []).length ? ` · ${(cg.zonas as R[]).map((z) => z.sigla).join(' / ')}` : ''}{x.cib ? ` · CIB ${x.cib}` : ''}{x.zona_fiscal ? ` · ${x.zona_fiscal}` : ''}</span></span>
              {edita && urlBase && <button className="btn sm text" disabled={busc} onClick={buscar}><Ic n="search" s={16} />{busc ? 'Consultando...' : 'Buscar de novo'}</button>}</div>
          ) : (
            <div className="geo-vazio">{edita && urlBase && <button className="btn sm" disabled={busc} onClick={buscar}><Ic n="search" s={16} />{busc ? 'Consultando...' : `Buscar no ${nomeBase}`}</button>}
              <span className="hint">{urlBase ? 'Ainda não consultado.' : `A busca no ${nomeBase} funciona na versão publicada.`}</span></div>
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
      {edita && !sp && <details className="details" open={!vv}><summary>{vv ? 'Atualizar IPTU' : 'Lançar IPTU'}</summary><FormIptu f={f} x={x} vv={vv} /></details>}
      {sjc && <div className="hint">O GeoSanja traz só a poligonal do lote, a zona e as restrições. A área cadastral, o endereço, a testada, o valor venal e o IPTU não vêm de lá: digite-os aqui e na aba Terreno.</div>}
      {sp && <div className="hint">Em São Paulo, o valor venal e o IPTU vêm sozinhos da Prefeitura e não se digitam (seção IPTU da aba Terreno).</div>}
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
