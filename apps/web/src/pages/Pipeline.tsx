import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { escondidos } from '../lib/escondidos';
import { Carregando, Erro } from '../components/ui';
import { Ic, type ContextoMoldura } from '../components/Moldura';
import { abrirNovo } from '../novo/estado';
import { TEMP, TP_N, ZONA } from '../ficha/dados';
import { usePreCarregarFicha, useFicha } from '../ficha/Ficha';
import { abrirEstudo, PopEstudo, useAberto } from '../viab/Viabilidade';
import GavetaFicha from '../ficha/Gaveta';
import { bate } from '../mapa/dados';
import type { TerrenoMapa } from '../mapa/dados';
import { BarraFx, GavetaFx, useFiltros } from '../filtros/Filtros';
import { alternar } from '../filtros/ordem';

// Pipeline, a tabela de Terrenos (porte de tools/prototipo/proto_tabela.js › COLS_TER, terTabela, pgTerrenos, tgavAbrir;
// pedidos do Moisés de 4/nov/2026). Colunas Terreno (nome, código e endereço), Cidade, Região, Imóvel (área, zoneamento e
// perfil topográfico), Projeto (VGV e unidades do estudo válido), Negociação (pedida e proposta ativa), Corretor,
// Temperatura e Responsável. O clique no título passa por crescente, decrescente e sem ordem; várias colunas valem juntas na
// ordem em que foram clicadas (a ordenação é a mesma da aba Ordenação dos filtros, guardada no navegador e no endereço);
// sem nenhuma, temperatura e código. Tela cheia (Esc sai). O olhinho abre a ficha completa na gaveta da direita, que cobre a
// tabela a partir da coluna 1 (/terrenos/A123/gaveta); com ela aberta, clicar noutra linha troca o terreno.

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Linha {
  id: string; codigo: string; nome: string; endereco: string; cidade: string | null; zona: string | null; area: number | null;
  zonas: string | null; topo: string | null; vgv: number | null; un: number | null; temEstudo: boolean; vid: string | null; ll: number | null; pedido: number | null; proposta: number | null;
  corretores: { nome: string; imob: string | null }[]; temp: number | null; resp: { nome: string; foto: string | null } | null;
  /* só para a busca da barra superior */
  busca: TerrenoMapa;
}

async function carregar(emp: string): Promise<Linha[]> {
  const [v, t, pr, cor, mat, ins] = await Promise.all([
    supabase.from('v_terrenos').select('id,codigo,nome,logradouro,numero,bairro,zona,municipio,area_adotada_m2,zonas_siglas,vgv,margem_pct,valor_pedido,proposta_ativa_valor,corretor_ids,temperatura,responsavel_id,negociacao_id').eq('empresa_id', emp),
    supabase.from('terrenos').select('id,topo_perfil,topo_declividade_pct').eq('empresa_id', emp),
    supabase.from('processos').select('id,viabilidade_id').eq('empresa_id', emp).not('viabilidade_id', 'is', null),
    supabase.from('corretores').select('id,imobiliaria,pessoas(nome_razao_social)').eq('empresa_id', emp),
    supabase.from('matriculas').select('terreno_id,numero').eq('empresa_id', emp),
    supabase.from('inscricoes_municipais').select('terreno_id,inscricao').eq('empresa_id', emp),
  ]);
  for (const r of [v, t, pr, cor, mat, ins]) if (r.error) throw r.error;
  const esc = await escondidos(emp);
  const vs = (v.data as R[]).filter((x) => !esc.has(x.id));
  /* estudo válido: a viabilidade presa à negociação (VGV vem da view; as unidades, da viabilidade) */
  const viabDe = Object.fromEntries((pr.data as R[]).map((x) => [x.id, x.viabilidade_id as string]));
  const vids = [...new Set(vs.map((x) => viabDe[x.negociacao_id]).filter(Boolean))];
  const ids = [...new Set(vs.map((x) => x.responsavel_id).filter(Boolean))];
  const [vb, us] = await Promise.all([
    vids.length ? supabase.from('viabilidades').select('id,unidades').in('id', vids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from('usuarios').select('user_id,nome,email,foto_url').in('user_id', ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (vb.error) throw vb.error;
  if (us.error) throw us.error;
  const unDe = Object.fromEntries((vb.data as R[]).map((x) => [x.id, x.unidades as number | null]));
  const uN = Object.fromEntries((us.data as R[]).map((u) => [u.user_id, { nome: u.nome || u.email, foto: u.foto_url }]));
  const tr = Object.fromEntries((t.data as R[]).map((x) => [x.id, x]));
  const cN = Object.fromEntries((cor.data as R[]).map((c) => [c.id, { nome: (c.pessoas as R | null)?.nome_razao_social ?? 'Corretor', imob: c.imobiliaria ?? null }]));
  const grupo = (rs: R[], k: string) => { const m: Record<string, string[]> = {}; for (const r of rs) if (r[k]) (m[r.terreno_id] ??= []).push(String(r[k])); return m; };
  const mats = grupo(mat.data as R[], 'numero'), sqls = grupo(ins.data as R[], 'inscricao');
  const zs = (z: unknown) => (Array.isArray(z) ? z : z ? String(z).split(/\s*\/\s*/) : []).filter(Boolean).join(' / ') || null;
  return vs.map((x) => {
    const tp = tr[x.id] ?? {}, vid = viabDe[x.negociacao_id];
    const endereco = [[x.logradouro, x.numero].filter(Boolean).join(', '), x.bairro].filter(Boolean).join(' · ');
    const corretores = ((x.corretor_ids ?? []) as string[]).map((id) => cN[id]).filter(Boolean);
    const topo = tp.topo_perfil
      ? tp.topo_perfil === 'inclinado' && tp.topo_declividade_pct != null ? `Inclinado · ${Number(tp.topo_declividade_pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : TP_N[tp.topo_perfil] ?? tp.topo_perfil
      : null;
    return {
      id: x.id, codigo: x.codigo ?? '', nome: x.nome ?? x.codigo ?? '', endereco, cidade: x.municipio ?? null, zona: x.zona ?? null,
      area: x.area_adotada_m2 == null ? null : +x.area_adotada_m2, zonas: zs(x.zonas_siglas), topo,
      vgv: x.vgv == null ? null : +x.vgv, un: vid ? unDe[vid] ?? null : null, temEstudo: !!vid, vid: vid ?? null, ll: x.margem_pct == null ? null : +x.margem_pct,
      pedido: x.valor_pedido == null ? null : +x.valor_pedido, proposta: x.proposta_ativa_valor == null ? null : +x.proposta_ativa_valor,
      corretores, temp: x.temperatura ?? null, resp: uN[x.responsavel_id] ?? null,
      busca: { codigo: x.codigo, nome: x.nome, bairro: x.bairro, zona: x.zona, municipio: x.municipio, corretor: corretores.map((c) => c.nome).join(' '),
        endereco, matriculas: mats[x.id], sqls: sqls[x.id] } as unknown as TerrenoMapa,
    };
  });
}

const mi = (v: number | null) => (v == null ? '—' : 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi');
const num = (v: number) => v.toLocaleString('pt-BR');
const m2 = (v: number) => num(v) + ' m²';
const regiao = (z: string | null) => (z ? (z === 'centro' ? 'Centro' : 'Zona ' + (ZONA[z] ?? z)) : null);
const Nada = ({ s }: { s: string }) => <span className="faint">{s}</span>;

function TempMini({ v }: { v: number | null }) {
  if (!v) return <span className="faint" style={{ fontSize: 12 }}>—</span>;
  return <span className={`temp-mini t${v}`} title={`Temperatura ${v} · ${TEMP[v]}`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= v ? 'on' : ''} />)}<b className="temp-n">{v}</b></span>;
}
function Av({ r }: { r: NonNullable<Linha['resp']> }) {
  let h = 0;
  for (const c of r.nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ini = r.nome.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="avatar sm" style={{ background: `var(--av${(h % 4) + 1})`, overflow: 'hidden', padding: r.foto ? 0 : undefined }}>
    {r.foto ? <img src={r.foto} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : ini}</span>;
}

interface Col { k: string; l: string; cls?: string; v: (t: Linha, verViab: (t: Linha) => void) => React.ReactNode }
/* títulos do Moisés (4/nov/2026, segunda versão); as chaves são as da ordenação (filtros/ordem.ts) */
const COLS: Col[] = [
  { k: 'ter', l: 'Terreno', cls: 'esq', v: (t) => (
    <div className="tb-c1">
      <div className="tb-c1t"><div className="t1">{t.nome}</div><div className="t2 num">{t.codigo}</div>{t.endereco && <div className="t2">{t.endereco}</div>}</div>
    </div>) },
  { k: 'cid', l: 'Cidade', v: (t) => t.cidade ?? <Nada s="—" /> },
  { k: 'zona', l: 'Região', v: (t) => regiao(t.zona) ?? <Nada s="—" /> },
  { k: 'area', l: 'Imóvel', v: (t) => <>
    <div>{t.area != null ? m2(t.area) : <Nada s="Sem área" />}</div>
    <div className="t2">{t.zonas ?? 'Zoneamento não consultado'}</div>
    <div className="t2">{t.topo ?? 'Topografia não medida'}</div></> },
  { k: 'estudo', l: 'Projeto', cls: 'num', v: (t, ver) => (t.temEstudo ? <>
    <div className="tb-vgv"><button type="button" className="iconbtn tb-viab" aria-label={`Ver a viabilidade válida de ${t.nome}`} title="Ver a viabilidade válida"
      onClick={(e) => { e.stopPropagation(); ver(t); }}><Ic n="olho" s={18} /></button>{t.vgv != null ? 'VGV ' + mi(t.vgv) : <Nada s="Sem VGV" />}</div>
    <div className="t2">{t.un != null ? num(t.un) + ' unidades' : 'Sem unidades'}</div>
    {t.ll != null && <div className="t2" title="Margem líquida do estudo válido: lucro líquido ÷ VGV vendido">L.L. {t.ll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>}</> : <Nada s="Sem estudo válido" />) },
  { k: 'preco', l: 'Negociação', cls: 'num', v: (t) => <>
    <div>Pedida: {t.pedido != null ? mi(t.pedido) : <Nada s="—" />}</div>
    <div className="t2">Proposta: {t.proposta != null ? mi(t.proposta) : '—'}</div></> },
  { k: 'corretor', l: 'Corretor', v: (t) => {
    const c = t.corretores;
    if (!c.length) return <Nada s="Sem corretor" />;
    return <><div>{c[0].nome}</div>
      {c.length > 1 ? <div className="t2" title={c.slice(1).map((x) => x.nome).join(', ')}>+{c.length - 1} corretor{c.length > 2 ? 'es' : ''}</div> : c[0].imob ? <div className="t2">{c[0].imob}</div> : null}</>;
  } },
  { k: 'temp', l: 'Temperatura', v: (t) => <TempMini v={t.temp} /> },
  { k: 'resp', l: 'Responsável', v: (t) => (t.resp ? <span className="tb-resp" title={t.resp.nome}><Av r={t.resp} /><span className="sr-only">{t.resp.nome}</span></span> : <Nada s="—" />) },
];

export default function Pipeline() {
  const { empresa } = useSessao();
  const { busca } = useOutletContext<ContextoMoldura>();
  const navegar = useNavigate();
  const p = useParams(), gav = p.codigo ? p.codigo.toUpperCase() : null;
  /* a chave começa por 'mapa': o que a ficha grava já recarrega o mapa (invalidateQueries ['mapa']), e a tabela vem junto */
  const q = useQuery({ queryKey: ['mapa', 'pipeline', empresa?.id], enabled: !!empresa, queryFn: () => carregar(empresa!.id) });
  const fx = useFiltros('terrenos');
  const pre = usePreCarregarFicha();
  const [cheia, setCheia] = useState(false);
  const api = useRef(false);
  const [th, setTh] = useState<HTMLTableCellElement | null>(null);
  /* mouse parado na linha: a ficha já começa a carregar, para a gaveta abrir na hora (como no Mapa) */
  const preT = useRef(0);
  const parado = (cod: string) => { clearTimeout(preT.current); preT.current = window.setTimeout(() => pre(cod), 250); };

  const todos = q.data ?? [];
  const passam = useMemo(() => todos.filter((t) => fx.ok(t.id)), [todos, fx]);
  const linhas = useMemo(() => {
    const L = passam.filter((t) => bate(t.busca, busca));
    return L.sort((a, b) => (fx.o.length ? fx.cmp(a.id, b.id) : 0) || (fx.o.length ? 0 : (b.temp || 0) - (a.temp || 0) || b.codigo.localeCompare(a.codigo)));
  }, [passam, busca, fx]);

  /* tela cheia: como a do quadro de tarefas do protótipo; onde o navegador deixa, esconde as barras dele */
  function telaCheia(on = !cheia) {
    setCheia(on);
    if (on) { try { const pr = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); api.current = !!pr; pr?.catch?.(() => { api.current = false; }); } catch { api.current = false; } }
    else if (document.fullscreenElement && api.current) { api.current = false; void document.exitFullscreen?.().catch?.(() => {}); }
    if (on) scrollTo({ top: 0 });
  }
  const cheiaR = useRef(telaCheia);
  cheiaR.current = telaCheia;
  useEffect(() => {
    document.body.classList.toggle('tb-cheia', cheia);
    return () => document.body.classList.remove('tb-cheia');
  }, [cheia]);
  useEffect(() => {
    const fs = () => { if (!document.fullscreenElement && api.current) { api.current = false; cheiaR.current(false); } };
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || gav || fx.aberto || document.querySelector('.dialog,.scrim,#fx-dr,#vb-pop')) return;
      if (cheia && !document.fullscreenElement) { cheiaR.current(false); e.preventDefault(); }
    };
    document.addEventListener('fullscreenchange', fs);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('fullscreenchange', fs); document.removeEventListener('keydown', k); };
  }, [cheia, gav, fx.aberto]);
  useEffect(() => () => { if (document.fullscreenElement && api.current) void document.exitFullscreen?.().catch?.(() => {}); }, []);

  /* a gaveta e a dos filtros não abrem juntas */
  useEffect(() => { if (gav && fx.aberto) fx.setAberto(false); }, [gav]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fx.aberto && gav) navegar('/terrenos' + location.hash); }, [fx.aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  /* com a gaveta aberta, a linha do terreno vai para a vista */
  useEffect(() => {
    if (!gav) return;
    const tr = document.querySelector(`.lista-ter tr[data-cod="${gav}"]`);
    if (tr) { const r = tr.getBoundingClientRect(); if (r.top < 80 || r.bottom > innerHeight) tr.scrollIntoView({ block: 'center' }); }
  }, [gav, q.data]);

  /* olho da coluna Projeto: o popup do estudo válido sobre a tabela, sem abrir a ficha da linha (pedido do Moises,
     11/nov/2026); com a gaveta do mesmo terreno aberta, o popup é o da própria ficha da gaveta */
  const [viab, setViab] = useState<{ cod: string; vid: string } | null>(null);
  const qc = useQueryClient();
  const verViab = (t: Linha) => { if (!t.vid) return; if (gav === t.codigo) abrirEstudo(t.vid); else setViab({ cod: t.codigo, vid: t.vid }); };
  const fecharViab = () => { setViab(null); void qc.invalidateQueries({ queryKey: ['mapa', 'pipeline'] }); };
  const abrirGav = (t: Linha) => navegar(gav === t.codigo ? '/terrenos' + location.hash : `/terrenos/${t.codigo}/gaveta${location.hash}`, { replace: !!gav });
    const total = todos.length, n = passam.length;
  const L = fx.o;
  const cab = (c: Col) => {
    const i = L.findIndex((x) => x.k === c.k), st = L[i];
    return (
      <th key={c.k} ref={c.k === 'ter' ? setTh : undefined} className={`col-${c.k} ${c.cls ?? ''}`} scope="col" aria-sort={st ? (st.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
        <button type="button" className="dt-sort" onClick={() => fx.setO(alternar(L, c.k))}
          title={st ? (st.dir === 'asc' ? 'Crescente: clique para decrescente' : 'Decrescente: clique para tirar a ordem') : 'Ordenar em ordem crescente'}>
          {c.l}<span className="dt-ar" aria-hidden="true">{st ? (st.dir === 'desc' ? '↓' : '↑') : '↕'}</span>
          {st && L.length > 1 && <span className="tb-ord" aria-label={`${i + 1}ª ordem`}>{i + 1}</span>}
        </button>
      </th>
    );
  };

  return (
    <div className={`ter-pg${cheia ? ' on' : ''}`}>
      <div className="page-h ph-barra">
        <div><h1>Pipeline</h1><div className="sub">{q.data ? (n === total ? `${total} terrenos` : `${n} de ${total} terrenos`) : ' '}</div></div>
        <div className="ph-l"><BarraFx fx={fx} />
          <div className="ter-ac">
            {L.length > 0 && <button className="btn text sm" title="Volta à ordem padrão (temperatura e código)" onClick={() => fx.setO([])}>Tirar ordenação</button>}
            <button className="btn text sm" aria-pressed={cheia} title={cheia ? 'Sair da tela cheia (Esc)' : 'Abrir a tabela em tela cheia'} onClick={() => telaCheia()}>
              <Ic n={cheia ? 'telaSair' : 'tela'} s={18} />{cheia ? 'Sair da tela cheia' : 'Tela cheia'}</button>
          </div>
        </div>
      </div>
      <section className="sec lista"><div id="rows">
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !linhas.length
          ? <div className="empty">Nenhum terreno{busca.trim() ? ` para “${busca.trim()}”` : ''}.<br /><button className="btn sm" style={{ marginTop: 12 }} onClick={() => abrirNovo()}><Ic n="add" s={16} />Novo terreno</button></div>
          : <div className="dt-wrap"><table className="dt lista-ter">
            <thead><tr>{COLS.map(cab)}</tr></thead>
            <tbody>{linhas.map((t) => (
              <tr key={t.id} data-cod={t.codigo} tabIndex={0} className={gav === t.codigo ? 'tb-sel' : undefined} aria-current={gav === t.codigo ? 'true' : undefined}
                onClick={() => abrirGav(t)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) abrirGav(t); }} onMouseEnter={() => parado(t.codigo)} onMouseLeave={() => clearTimeout(preT.current)}>
                {COLS.map((c) => <td key={c.k} className={`col-${c.k} ${c.cls ?? ''}`}>{c.v(t, verViab)}</td>)}
              </tr>
            ))}</tbody>
          </table></div>}
      </div></section>
      <GavetaFx fx={fx} />
      {gav && <GavetaFicha codigo={gav} lado={th} naTabela cheia={cheia} fechar={() => navegar('/terrenos' + location.hash, { replace: true })}
        aoSair={() => navegar('/terrenos', { replace: true })}
        abrirPagina={(aba) => navegar(`/terrenos/${gav}${aba === 'geral' ? '' : '/' + aba}`, { state: { de: 'terrenos' } })}
        abrirMapa={() => navegar(`/mapa/${gav}`)} />}
      {viab && viab.cod !== gav && <ViabPop key={viab.vid} cod={viab.cod} vid={viab.vid} fechar={fecharViab} />}
    </div>
  );
}

/** o popup do estudo válido aberto pela tabela: carrega a ficha do terreno (o popup precisa dela) e fecha junto com ele */
function ViabPop({ cod, vid, fechar }: { cod: string; vid: string; fechar: () => void }) {
  const q = useFicha(cod), aberto = useAberto(), abriu = useRef(false);
  useEffect(() => { if (q.data && !abriu.current) { abriu.current = true; abrirEstudo(vid); } }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (abriu.current && aberto == null) fechar(); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (q.isFetched && !q.data) fechar(); }, [q.isFetched, q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return q.data ? <PopEstudo f={q.data} /> : null;
}
