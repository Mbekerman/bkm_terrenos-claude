import { finTxt, fisTxt, modDe, temMod, type Modalidades } from '../lib/modalidades';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { PopMassa } from '../ficha/Massa';
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
  zonas: string | null; topo: string | null; vgv: number | null; un: number | null; mUn: number | null; mArea: number | null; temMassa: boolean; temEstudo: boolean; vid: string | null; ll: number | null; pedido: number | null; proposta: number | null; ped: Modalidades; prop: Modalidades;
  corretores: { nome: string; imob: string | null }[]; temp: number | null; resp: { nome: string; foto: string | null } | null;
  /* só para a busca da barra superior */
  busca: TerrenoMapa;
}

async function carregar(emp: string): Promise<Linha[]> {
  const [v, t, pr, cor, mat, ins, em] = await Promise.all([
    supabase.from('v_terrenos').select('id,codigo,nome,logradouro,numero,bairro,zona,municipio,area_adotada_m2,zonas_siglas,vgv,margem_pct,valor_pedido,pedido_fin_pct,pedido_fis_pct,pedido_fis_unidades,proposta_ativa_valor,proposta_ativa_fin_pct,proposta_ativa_fis_pct,proposta_ativa_fis_unidades,pedido_fin_minimo,pedido_fis_min_unidades,proposta_ativa_fin_minimo,proposta_ativa_fis_min_unidades,corretor_ids,temperatura,responsavel_id,negociacao_id').eq('empresa_id', emp),
    supabase.from('terrenos').select('id,topo_perfil,topo_declividade_pct').eq('empresa_id', emp),
    supabase.from('processos').select('id,viabilidade_id').eq('empresa_id', emp).not('viabilidade_id', 'is', null),
    supabase.from('corretores').select('id,imobiliaria,pessoas(nome_razao_social)').eq('empresa_id', emp),
    supabase.from('matriculas').select('terreno_id,numero').eq('empresa_id', emp),
    supabase.from('inscricoes_municipais').select('terreno_id,inscricao').eq('empresa_id', emp),
    supabase.from('estudos_massa').select('terreno_id,unidades,area_privativa_m2').eq('empresa_id', emp).eq('valido', true),
  ]);
  for (const r of [v, t, pr, cor, mat, ins, em]) if (r.error) throw r.error;
  /* estudo de massa válido (um por terreno) */
  const massa = Object.fromEntries((em.data as R[]).map((x) => [x.terreno_id, x]));
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
    const tp = tr[x.id] ?? {}, vid = viabDe[x.negociacao_id], ms = massa[x.id];
    const endereco = [[x.logradouro, x.numero].filter(Boolean).join(', '), x.bairro].filter(Boolean).join(' · ');
    const corretores = ((x.corretor_ids ?? []) as string[]).map((id) => cN[id]).filter(Boolean);
    const topo = tp.topo_perfil
      ? tp.topo_perfil === 'inclinado' && tp.topo_declividade_pct != null ? `Inclinado · ${Number(tp.topo_declividade_pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : TP_N[tp.topo_perfil] ?? tp.topo_perfil
      : null;
    return {
      id: x.id, codigo: x.codigo ?? '', nome: x.nome ?? x.codigo ?? '', endereco, cidade: x.municipio ?? null, zona: x.zona ?? null,
      area: x.area_adotada_m2 == null ? null : +x.area_adotada_m2, zonas: zs(x.zonas_siglas), topo,
      vgv: x.vgv == null ? null : +x.vgv, un: vid ? unDe[vid] ?? null : null, temEstudo: !!vid, mUn: ms?.unidades == null ? null : +ms.unidades, mArea: ms?.area_privativa_m2 == null ? null : +ms.area_privativa_m2, temMassa: !!ms, vid: vid ?? null, ll: x.margem_pct == null ? null : +x.margem_pct,
      pedido: x.valor_pedido == null ? null : +x.valor_pedido, proposta: x.proposta_ativa_valor == null ? null : +x.proposta_ativa_valor,
      ped: modDe({ valor: x.valor_pedido, fin: x.pedido_fin_pct, fisPct: x.pedido_fis_pct, fisUn: x.pedido_fis_unidades, finMin: x.pedido_fin_minimo, fisMinUn: x.pedido_fis_min_unidades }),
      prop: modDe({ valor: x.proposta_ativa_valor, fin: x.proposta_ativa_fin_pct, fisPct: x.proposta_ativa_fis_pct, fisUn: x.proposta_ativa_fis_unidades, finMin: x.proposta_ativa_fin_minimo, fisMinUn: x.proposta_ativa_fis_min_unidades }),
      corretores, temp: x.temperatura ?? null, resp: uN[x.responsavel_id] ?? null,
      busca: { codigo: x.codigo, nome: x.nome, bairro: x.bairro, zona: x.zona, municipio: x.municipio, corretor: corretores.map((c) => c.nome).join(' '),
        endereco, matriculas: mats[x.id], sqls: sqls[x.id] } as unknown as TerrenoMapa,
    };
  });
}

/* R$ em milhões; abaixo de 1 milhão, em mil (R$ 850 mil, não R$ 0,85 mi) */
const mi = (v: number | null) => {
  if (v == null) return '—';
  if (v === 0) return 'R$ 0';
  if (Math.abs(v) < 1e6) return 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil';
  return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi';
};
const num = (v: number) => v.toLocaleString('pt-BR');
const m2 = (v: number) => num(v) + ' m²';
const regiao = (z: string | null) => (z ? (z === 'centro' ? 'Centro' : 'Zona ' + (ZONA[z] ?? z)) : null);
const Nada = ({ s }: { s: string }) => <span className="faint">{s}</span>;
/** vazio discreto: o traço, com o motivo na dica (o olho lê o que existe; revisão de design de 11/nov/2026) */
const Vazio = ({ s }: { s: string }) => <span className="faint tb-vazio" title={s} aria-label={s}>—</span>;

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

type Ver = (t: Linha, qual: 'viab' | 'massa') => void;
/** o que cada linha da célula mostra, no balão do ⓘ do título (as células só mostram os valores; pedido do Moises, 11/nov/2026) */
interface Info { t: string; d: string; forte?: boolean }
interface Col { k: string; l: string; cls?: string; w: number | null; v: (t: Linha, ver: Ver) => React.ReactNode; info?: Info[] }
/** o olho fica à direita da coluna, com respiro do texto (pedido do Moises, 11/nov/2026) */
const ComOlho = ({ olhos, children }: { olhos: React.ReactNode[]; children: React.ReactNode }) => (
  <div className="tb-olhos"><div className="tb-olhos-c">{children}</div><div className="tb-olhos-b">{olhos}</div></div>
);
const Olho = ({ rot, onClick }: { rot: string; onClick: () => void }) => (
  <button type="button" className="iconbtn tb-viab" aria-label={rot} title={rot} onClick={(e) => { e.stopPropagation(); onClick(); }}><Ic n="olho" s={18} /></button>
);
const olhoViab = (t: Linha, ver: Ver) => <Olho key="v" rot={`Abrir a viabilidade válida de ${t.nome}`} onClick={() => ver(t, 'viab')} />;
const olhoMassa = (t: Linha, ver: Ver) => <Olho key="m" rot={`Abrir o estudo de massa válido de ${t.nome}`} onClick={() => ver(t, 'massa')} />;
/** linha rótulo e valor das colunas de números (Projeto e Negociação): o rótulo à esquerda, o valor à direita */
const Kv = ({ l, v, fraco }: { l: string; v: React.ReactNode; fraco?: boolean }) => (
  <div className={`tb-kv${fraco ? ' fraco' : ''}`} title={l}><span className="tb-kvv">{v}</span></div>
);
const pct2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
const INFO_MOD = (de: string) => [{ t: 'Dinheiro', d: `valor em dinheiro da ${de}`, forte: true }, { t: '% VGVL', d: 'permuta financeira, em % do VGV líquido, com o mínimo garantido quando houver' },
  { t: 'Unid. ou % física', d: 'permuta física, em unidades ou em percentual (com o mínimo de unidades quando houver)' }];
/** as três linhas das modalidades; a que não foi pedida fica com o traço discreto */
const Mods = ({ m, vazio }: { m: Modalidades; vazio: string }) => (!temMod(m) ? <Vazio s={vazio} /> : <>
  <Kv l="Dinheiro" v={m.din != null ? mi(m.din) : <Nada s="—" />} />
  <Kv fraco l={`Permuta financeira: ${finTxt(m) ?? 'não pedida'}`} v={finTxt(m) ?? <Nada s="—" />} />
  <Kv fraco l={`Permuta física: ${fisTxt(m) ?? 'não pedida'}`} v={fisTxt(m) ?? <Nada s="—" />} /></>);
/* títulos do Moisés (4/nov/2026, segunda versão); as chaves são as da ordenação (filtros/ordem.ts); w = largura fixa da coluna
   (a coluna Terreno fica com o resto); reorganização de 11/nov/2026, pedida pelo Moises */
const COLS: Col[] = [
  { k: 'ter', l: 'Terreno', cls: 'esq', w: null, v: (t) => (
    <div className="tb-c1t"><div className="t1">{t.nome}</div>
      <div className="t2 tb-end" title={t.endereco || undefined}><span className="tb-cod">{t.codigo}</span>{t.endereco && <> · {t.endereco}</>}</div></div>) },
  { k: 'zona', l: 'Região', w: 132, v: (t) => regiao(t.zona) ?? <Vazio s="Sem região" /> },
  { k: 'area', l: 'Imóvel', w: 200, v: (t) => <>
    <div>{t.area != null ? m2(t.area) : <Nada s="Sem área" />}</div>
    <div className="t2 tb-zt" title={[t.zonas, t.topo].filter(Boolean).join(' · ') || undefined}>{[t.zonas, t.topo].filter(Boolean).join(' · ') || <Nada s="Sem zoneamento" />}</div></> },
  { k: 'massa', l: 'Estudo de massa', w: 176, info: [
    { t: 'Unidades', d: 'quantidade de unidades', forte: true }, { t: 'Área privativa total', d: 'soma das áreas privativas das tipologias' }], v: (t, ver) => (t.temMassa ? <ComOlho olhos={[olhoMassa(t, ver)]}>
    <Kv l="Unidades" v={t.mUn != null ? num(t.mUn) : '—'} />
    <Kv fraco l="Área privativa total" v={t.mArea != null ? m2(Math.round(t.mArea)) : '—'} /></ComOlho> : <Vazio s="Sem estudo de massa válido" />) },
  { k: 'viab', l: 'Viabilidade', w: 160, info: [
    { t: 'VGV', d: 'valor geral de vendas', forte: true }, { t: 'L.L.', d: 'margem líquida: lucro líquido ÷ VGV líquido' }], v: (t, ver) => (t.temEstudo ? <ComOlho olhos={[olhoViab(t, ver)]}>
    <Kv l="VGV" v={t.vgv != null ? mi(t.vgv) : <Nada s="—" />} />
    <Kv fraco l="L.L., margem líquida" v={t.ll != null ? pct2(t.ll) : '—'} /></ComOlho> : <Vazio s="Sem estudo de viabilidade válido" />) },
  /* a junção das duas, quando a tela estreita: VGV e L.L. da viabilidade; unidades da viabilidade ou, sem ela, do estudo de
     massa; cada olho na linha do dado que ele abre (VGV: viabilidade; Unidades: estudo de massa) */
  { k: 'estudo', l: 'Empreendimento', w: 212, info: [
    { t: 'VGV', d: 'valor geral de vendas da viabilidade válida', forte: true }, { t: 'Unidades', d: 'da viabilidade; sem ela, do estudo de massa' }, { t: 'L.L.', d: 'margem líquida: lucro líquido ÷ VGV líquido' }], v: (t, ver) => (t.temEstudo || t.temMassa ? <div className="tb-emp">
    {t.temEstudo && <><Kv l="VGV" v={t.vgv != null ? mi(t.vgv) : <Nada s="—" />} />{olhoViab(t, ver)}</>}
    <Kv fraco l="Unidades" v={(t.temEstudo ? t.un : t.mUn) != null ? num((t.temEstudo ? t.un : t.mUn)!) : '—'} />{t.temMassa ? olhoMassa(t, ver) : <span />}
    {t.temEstudo && <><Kv fraco l="L.L., margem líquida" v={t.ll != null ? pct2(t.ll) : '—'} /><span /></>}</div> : <Vazio s="Sem estudo de massa nem de viabilidade válido" />) },
  /* Pedida e Proposta (pedido do Moises, 11/nov/2026, no lugar de Negociação): três linhas, na mesma ordem nas duas,
     dinheiro, permuta financeira em % do VGV líquido e permuta física em unidades ou em % */
  { k: 'preco', l: 'Pedida', w: 176, info: INFO_MOD('oferta de referência'), v: (t) => <Mods m={t.ped} vazio="Sem pedido" /> },
  { k: 'prop', l: 'Proposta', w: 176, info: INFO_MOD('proposta ativa'), v: (t) => <Mods m={t.prop} vazio="Sem proposta ativa" /> },
  { k: 'corretor', l: 'Corretor', w: 168, v: (t) => {
    const c = t.corretores;
    if (!c.length) return <Vazio s="Sem corretor" />;
    return <><div>{c[0].nome}</div>
      {c.length > 1 ? <div className="t2" title={c.slice(1).map((x) => x.nome).join(', ')}>+{c.length - 1} corretor{c.length > 2 ? 'es' : ''}</div> : c[0].imob ? <div className="t2">{c[0].imob}</div> : null}</>;
  } },
  { k: 'temp', l: 'Temperatura', w: 116, v: (t) => <TempMini v={t.temp} /> },
  { k: 'resp', l: 'Responsável', cls: 'meio', w: 112, v: (t) => (t.resp ? <span className="tb-resp" title={t.resp.nome}><Av r={t.resp} /><span className="sr-only">{t.resp.nome}</span></span> : <Vazio s="Sem responsável" />) },
];

/* colunas que saem quando a tabela não cabe, nesta ordem (pedido do Moises, 11/nov/2026); a cidade não é coluna: as linhas
   ficam sempre agrupadas por cidade, com um título para cada uma */
const SAI = ['resp', 'temp', 'corretor', 'junta', 'zona', 'prop', 'preco', 'estudo'];
/** colunas visíveis em cada nível; no passo "junta", Estudo de massa e Viabilidade viram uma coluna só, Empreendimento
    (pedido do Moises, 11/nov/2026) */
const visiveis = (nivel: number) => {
  const fora = new Set(SAI.slice(0, nivel));
  return COLS.filter((c) => (c.k === 'massa' || c.k === 'viab' ? !fora.has('junta') : c.k === 'estudo' ? fora.has('junta') && !fora.has('estudo') : !fora.has(c.k)));
};
const TER_MIN = 340;
/* com folga, o Terreno para em 560 px e o resto se reparte pelas outras colunas (revisão de design de 11/nov/2026) */
const TER_MAX = 560;
/* Estudo de massa e Viabilidade não ganham a folga: ficam na medida do título com o ⓘ ou dos valores com o olho, e o olho
   fica no eixo do ⓘ (pedido do Moises, 11/nov/2026; `useOlhoX`) */
const JUSTAS = ['massa', 'viab'];
/** distância do título ao ⓘ e dos valores ao olho */
const GAP_I = 6, GAP_O = 6;
/** onde fica o eixo do ⓘ e do olho de cada coluna justa, em px da borda esquerda da coluna: o maior entre o fim do título
    (com a seta da ordem) e o fim do valor mais largo, mais o respiro; a coluna termina meio olho depois, mais o recuo */
function useOlhoX(dep: unknown[], ativo: boolean) {
  const [ox, setOx] = useState<Record<string, { x: number; w: number }>>({});
  useLayoutEffect(() => {
    const t = document.querySelector('.lista-ter');
    const n: Record<string, { x: number; w: number }> = {};
    if (t && ativo) for (const k of JUSTAS) {
      const th = t.querySelector<HTMLElement>(`thead th.col-${k}`), s = th?.querySelector('.dt-sort');
      if (!th || !s) continue;
      const l = th.getBoundingClientRect().left;
      let v = 0;
      t.querySelectorAll(`td.col-${k} .tb-kvv`).forEach((e) => { v = Math.max(v, e.getBoundingClientRect().right - l); });
      const x = Math.ceil(Math.max(s.getBoundingClientRect().right - l + GAP_I + 12, v + GAP_O + 16));
      n[k] = { x, w: x + 16 + (parseFloat(getComputedStyle(th).paddingRight) || 0) + 2 };
    }
    if (JSON.stringify(n) !== JSON.stringify(ox)) setOx(n);
  }, dep); // eslint-disable-line react-hooks/exhaustive-deps
  return ox;
}
/* no celular o Imóvel fica estreito, alinhado à direita */
const larg = (c: Col, estreito: boolean) => (estreito && c.k === 'area' ? 96 : c.w);
const largura = (nivel: number, estreito: boolean) => {
  return (estreito ? 150 : TER_MIN) + visiveis(nivel).filter((c) => c.w).reduce((s, c) => s + (larg(c, estreito) ?? 0), 0);
};
/** quantas colunas saem para a tabela caber na largura do quadro (0 = todas aparecem) */
function useNivel() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const estreito = w > 0 && w < 600;
  let nivel = 0;
  if (w > 0) while (nivel < SAI.length && largura(nivel, estreito) > w) nivel++;
  /* folga: o que passa de TER_MAX no Terreno vai, por igual, para as outras colunas */
  const outras = visiveis(nivel).filter((c) => c.w && !JUSTAS.includes(c.k));
  const folga = w > 0 && !estreito ? Math.max(0, w - largura(nivel, false) - (TER_MAX - TER_MIN)) : 0;
  const extra = outras.length ? Math.floor(folga / outras.length) : 0;
  return { ref: setEl, nivel, estreito, extra };
}
const SEM_CIDADE = 'Sem cidade';
/* ordem das cidades (arrastada pela pessoa) e cidades recolhidas, guardadas no navegador (pedido do Moises, 11/nov/2026) */
const K_ORDEM = 'bkm-terrenos-pipeline-cidades', K_FECHADAS = 'bkm-terrenos-pipeline-fechadas';
const ler = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const gravar = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: vale só nesta visita */ } };
/** alça de arrastar (seis pontos) */
/** seta com haste, para mover a cidade (o chevron fica só para recolher) */
const Seta = ({ cima }: { cima?: boolean }) => <svg className="ic" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
  <path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" d={cima ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'} /></svg>;
const Alca = () => <svg className="ic" viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
  {[8, 16].flatMap((x) => [6, 12, 18].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.6} fill="currentColor" />))}</svg>;

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
  const [massaPop, setMassaPop] = useState<string | null>(null);
  const qc = useQueryClient();
  const verViab: Ver = (t, qual) => {
    if (qual === 'massa') { setMassaPop(t.codigo); return; }
    if (!t.vid) return; if (gav === t.codigo) abrirEstudo(t.vid); else setViab({ cod: t.codigo, vid: t.vid });
  };
  const fecharViab = () => { setViab(null); void qc.invalidateQueries({ queryKey: ['mapa', 'pipeline'] }); };
  const abrirGav = (t: Linha) => navegar(gav === t.codigo ? '/terrenos' + location.hash : `/terrenos/${t.codigo}/gaveta${location.hash}`, { replace: !!gav });
  const total = todos.length, n = passam.length;
  const L = fx.o;
  const nv = useNivel();
  const cols = visiveis(nv.nivel);
  /* cidades: primeiro na ordem que a pessoa arrastou; as que ela ainda não arrumou, em ordem alfabética, e "Sem cidade" por
     último; dentro de cada uma, a ordem da tabela */
  const [ordem, setOrdem] = useState<string[]>(() => ler(K_ORDEM));
  const [fechadas, setFechadas] = useState<Set<string>>(() => new Set(ler(K_FECHADAS)));
  const ox = useOlhoX([linhas, nv.nivel, nv.estreito, fx.o, fechadas], !nv.estreito);
  const grupos = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const t of linhas) { const c = t.cidade || SEM_CIDADE; if (!m.has(c)) m.set(c, []); m.get(c)!.push(t); }
    const pos = (c: string) => { const i = ordem.indexOf(c); return i < 0 ? Infinity : i; };
    return [...m.entries()].sort(([a], [b]) => pos(a) - pos(b) || (a === SEM_CIDADE ? 1 : b === SEM_CIDADE ? -1 : a.localeCompare(b, 'pt-BR')));
  }, [linhas, ordem]);
  const alternarCidade = (c: string) => setFechadas((f) => { const n = new Set(f); if (n.has(c)) n.delete(c); else n.add(c); gravar(K_FECHADAS, [...n]); return n; });
  /** põe a cidade `c` antes (ou depois) de `alvo`, guardando a ordem de todas as que aparecem */
  const mover = (c: string, alvo: string, depois: boolean) => {
    if (c === alvo) return;
    const L = grupos.map(([x]) => x).filter((x) => x !== c);
    L.splice(L.indexOf(alvo) + (depois ? 1 : 0), 0, c);
    const novo = [...L, ...ordem.filter((x) => !L.includes(x))];
    setOrdem(novo); gravar(K_ORDEM, novo);
  };
  const [arr, setArr] = useState<string | null>(null);
  const [sobre, setSobre] = useState<{ c: string; depois: boolean } | null>(null);
  /* alturas para o título da cidade ficar preso logo abaixo do cabeçalho da tabela (que fica abaixo da barra do topo) */
  const [alt, setAlt] = useState({ top: 0, th: 48 });
  const thead = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    const medir = () => {
      const top = cheia ? 0 : Math.round(document.querySelector('header.top')?.getBoundingClientRect().height ?? 0);
      const th = Math.round(thead.current?.getBoundingClientRect().height ?? 48);
      setAlt((a) => (a.top === top && a.th === th ? a : { top, th }));
    };
    medir();
    addEventListener('resize', medir);
    return () => removeEventListener('resize', medir);
  }, [cheia, nv.estreito, q.data]);
  const linha = (t: Linha) => (
    <tr key={t.id} data-cod={t.codigo} tabIndex={0} className={gav === t.codigo ? 'tb-sel' : undefined} aria-current={gav === t.codigo ? 'true' : undefined}
      onClick={() => abrirGav(t)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) abrirGav(t); }} onMouseEnter={() => parado(t.codigo)} onMouseLeave={() => clearTimeout(preT.current)}>
      {cols.map((c) => <td key={c.k} className={`col-${c.k} ${c.cls ?? ''}`} data-l={c.l}>{c.v(t, verViab)}</td>)}
    </tr>
  );
  const cab = (c: Col) => {
    const i = L.findIndex((x) => x.k === c.k), st = L[i];
    return (
      <th key={c.k} ref={c.k === 'ter' ? setTh : undefined} className={`col-${c.k} ${c.cls ?? ''}`} scope="col" aria-sort={st ? (st.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
        <button type="button" className="dt-sort" onClick={() => fx.setO(alternar(L, c.k))}
          title={st ? (st.dir === 'asc' ? 'Crescente: clique para decrescente' : 'Decrescente: clique para tirar a ordem') : 'Ordenar em ordem crescente'}>
          {c.l}<span className="dt-ar" aria-hidden="true">{st ? (st.dir === 'desc' ? '↓' : '↑') : '↕'}</span>
          {st && L.length > 1 && <span className="tb-ord" aria-label={`${i + 1}ª ordem`}>{i + 1}</span>}
        </button>
        {c.info && <InfoCol c={c} />}
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
            <button className="btn text sm tb-tela" aria-pressed={cheia} title={cheia ? 'Sair da tela cheia (Esc)' : 'Abrir a tabela em tela cheia'} onClick={() => telaCheia()}>
              <Ic n={cheia ? 'telaSair' : 'tela'} s={18} />{cheia ? 'Sair da tela cheia' : 'Tela cheia'}</button>
          </div>
        </div>
      </div>
      <section className="sec lista"><div id="rows">
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !linhas.length
          ? <div className="empty">Nenhum terreno{busca.trim() ? ` para “${busca.trim()}”` : ''}.<br /><button className="btn sm" style={{ marginTop: 12 }} onClick={() => abrirNovo()}><Ic n="add" s={16} />Novo terreno</button></div>
          : <div ref={nv.ref} className={`dt-wrap rola tb-wrap${nv.estreito ? ' estreito' : ''}${arr ? ' arrastando' : ''}`}
            style={{ '--tb-top': alt.top + 'px', '--tb-th': alt.th + 'px' } as React.CSSProperties}><table className="dt lista-ter"
            style={Object.fromEntries(Object.entries(ox).map(([k, o]) => [`--ox-${k}`, o.x + 'px'])) as React.CSSProperties}>
            <colgroup>{cols.map((c) => <col key={c.k} className={`cg-${c.k}`} style={c.w ? { width: ox[c.k]?.w ?? larg(c, nv.estreito)! + (JUSTAS.includes(c.k) ? 0 : nv.extra) } : undefined} />)}</colgroup>
            <thead ref={thead}><tr>{cols.map(cab)}</tr></thead>
            {grupos.map(([cid, ts], gi) => {
              const fechada = fechadas.has(cid);
              const alvo = sobre?.c === cid && arr && arr !== cid ? (sobre.depois ? ' alvo-dep' : ' alvo-ant') : '';
              return (
                <tbody key={cid} className={`tb-cid${fechada ? ' fechada' : ''}${arr === cid ? ' arrastada' : ''}${alvo}`}
                  onDragOver={(e) => { if (!arr) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const r = e.currentTarget.getBoundingClientRect(); const depois = e.clientY > r.top + Math.min(r.height, 120) / 2 && (fechada || e.clientY > r.top + r.height / 2); if (sobre?.c !== cid || sobre.depois !== depois) setSobre({ c: cid, depois }); }}
                  onDrop={(e) => { e.preventDefault(); if (arr && sobre) mover(arr, sobre.c, sobre.depois); setArr(null); setSobre(null); }}>
                  <tr className="tb-grp" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cid); setArr(cid); }}
                    onDragEnd={() => { setArr(null); setSobre(null); }} onClick={() => alternarCidade(cid)}>
                    <th colSpan={cols.length} scope="colgroup">
                      <span className="tb-alca" title="Arraste para mudar a ordem das cidades"><Alca /></span>
                      <button type="button" className="tb-grpb" aria-expanded={!fechada} title={fechada ? 'Mostrar os terrenos desta cidade' : 'Recolher os terrenos desta cidade'}
                        onClick={(e) => { e.stopPropagation(); alternarCidade(cid); }}
                        onKeyDown={(e) => {
                          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                          e.preventDefault();
                          const j = gi + (e.key === 'ArrowUp' ? -1 : 1);
                          if (j >= 0 && j < grupos.length) mover(cid, grupos[j][0], e.key === 'ArrowDown');
                        }}>
                        <span className="tb-chev"><Ic n="chev" s={16} /></span>{cid}<span className="tb-grpn">{ts.length}</span>
                      </button>
                      <span className="tb-mov" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="cima" disabled={gi === 0} aria-label={`Mover ${cid} para cima`} onClick={() => mover(cid, grupos[gi - 1][0], false)}><Seta cima /></button>
                        <button type="button" className="baixo" disabled={gi === grupos.length - 1} aria-label={`Mover ${cid} para baixo`} onClick={() => mover(cid, grupos[gi + 1][0], true)}><Seta /></button>
                      </span>
                    </th>
                  </tr>
                  {!fechada && ts.map(linha)}
                </tbody>
              );
            })}
          </table></div>}
      </div></section>
      <GavetaFx fx={fx} />
      {gav && <GavetaFicha codigo={gav} lado={th} naTabela cheia={cheia} fechar={() => navegar('/terrenos' + location.hash, { replace: true })}
        aoSair={() => navegar('/terrenos', { replace: true })}
        abrirPagina={(aba) => navegar(`/terrenos/${gav}${aba === 'geral' ? '' : '/' + aba}`, { state: { de: 'terrenos' } })}
        abrirMapa={() => navegar(`/mapa/${gav}`)} />}
      {viab && viab.cod !== gav && <ViabPop key={viab.vid} cod={viab.cod} vid={viab.vid} fechar={fecharViab} />}
      {massaPop && <MassaPop key={massaPop} cod={massaPop} fechar={() => setMassaPop(null)} />}
    </div>
  );
}

/** o popup do estudo válido aberto pela tabela: carrega a ficha do terreno (o popup precisa dela) e fecha junto com ele */
function ViabPop({ cod, vid, fechar }: { cod: string; vid: string; fechar: () => void }) {
  const q = useFicha(cod), aberto = useAberto(), abriu = useRef(false), visto = useRef(false);
  useEffect(() => { if (q.data && !abriu.current) { abriu.current = true; abrirEstudo(vid); } }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  /* fecha só depois de ver o estudo aberto: com a ficha já carregada (o mouse parado na linha a pré-carrega), o efeito de
     cima abre e este roda no mesmo instante ainda com o valor antigo, vazio, e fechava na hora (o popup só piscava) */
  useEffect(() => { if (aberto) visto.current = true; else if (visto.current) fechar(); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (q.isFetched && !q.data) fechar(); }, [q.isFetched, q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return q.data ? <PopEstudo f={q.data} /> : null;
}

/** o estudo de massa válido aberto pela tabela: carrega a ficha do terreno e mostra a janela do estudo */
function MassaPop({ cod, fechar }: { cod: string; fechar: () => void }) {
  const q = useFicha(cod);
  useEffect(() => { if (q.isFetched && !q.data) fechar(); }, [q.isFetched, q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return q.data ? <PopMassa f={q.data} fechar={fechar} /> : null;
}

/** ⓘ antes do título: o clique abre o balão com o que cada linha da célula mostra; fecha no clique fora, no Esc ou no ⓘ */
function InfoCol({ c }: { c: Col }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setAberto(false); } };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc, true); };
  }, [aberto]);
  return (
    <span className="tb-info" ref={ref}>
      <button type="button" className="tb-info-b" aria-expanded={aberto} aria-label={`O que a coluna ${c.l} mostra`} title={`O que a coluna ${c.l} mostra`}
        onClick={(e) => { e.stopPropagation(); setAberto((a) => !a); }}>
        <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" /><path d="M12 11v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /><circle cx="12" cy="7.6" r="1.2" fill="currentColor" /></svg>
      </button>
      {aberto && <span className="tb-info-pop" role="tooltip">
        <span className="tb-info-t">{c.l}</span>
        <span className="tb-info-s">De cima para baixo, em cada linha:</span>
        {c.info!.map((x, i) => <span key={x.t} className="tb-info-l"><span className="tb-info-n">{i + 1}</span><span><b className={x.forte ? 'forte' : undefined}>{x.t}</b><span className="tb-info-d">{x.d}</span></span></span>)}
      </span>}
    </span>
  );
}
