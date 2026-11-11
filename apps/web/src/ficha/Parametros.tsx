/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { mudou, comRasc, useGuardarRasc, apagarRasc, LimparRasc } from '../components/Rascunho';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { m2 } from '../lib/format';
import { Adorno, metros } from '../lib/mascara';
import { CAMADA, geoLinhas, geoVals, type LinhaToca } from '../lib/camadas';
import { gsjLinhas } from '../novo/geosanja';
import { consultarArea } from '../novo/consulta';
import { Busca } from '../lib/buscando';
import { ehSP, type Ficha, type R } from './dados';
import { CONT_KS, DetalhesContaminacao, registrosCont } from './Contaminacao';
import { abrirQuadroJa, focar, lerNum, num, numStr, proximoCampo, Quadro, usePedido, useSalvar } from './edicao';

// Seção Parâmetros urbanísticos da aba Terreno (antes aba própria; pedido do Moises, 9/nov/2026), logo depois de Endereço e
// localização, com três quadros: Índices urbanísticos por lote e zona (proto_zonas.js › secAnaliseUrb; no banco v_lote_zonas e
// v_urbanismo_vigente), Restrições e entorno e Histórico de uso (proto_restricoes.js). Os índices não mostram CA básico,
// CA mínimo, lote e frente mínimos nem outorga onerosa (pedido do Moises, 9/nov/2026; os dados continuam no catálogo).
// O terreno não guarda tipo de empreendimento: Mercado, HIS e HMP lado a lado (decisão do Moisés, 4/nov/2026).

const TIPOS: [string, string][] = [['mercado', 'Mercado'], ['his', 'HIS'], ['hmp', 'HMP']];
/* fora de São Paulo não há HIS e HMP na lei: um potencial e um CA máximo só, os do tipo mercado (pedido do Moises, 10/nov/2026) */
const UM: [string, string][] = [['mercado', '']];
const tiposDe = (um: boolean) => (um ? UM : TIPOS);
const nomeTipo = (um: boolean, k: string) => (um ? '' : ' ' + TIPO_N[k]);
const TIPO_N = Object.fromEntries(TIPOS);
const MACROS: Record<string, string> = { MC: 'Consolidação', ME: 'Estruturação', MOC: 'Ocupação Controlada' };
const EXC_K = ['ca_minimo', 'ca_basico', 'ca_maximo', 'to_maximo', 'gabarito_m', 'gabarito_sem_limite', 'recuo_frente_m', 'recuo_lateral_m', 'recuo_lateral_alto_m',
  'cota_parte_m2', 'max_unidades', 'permeabilidade', 'lote_minimo_m2', 'frente_minima_m', 'outorga_gratuita'];
/* no Alterar valores, só o que os índices mostram (CA básico fica: entra no potencial sem outorga) */
const EXC_CAMPOS: [string, string][] = [['ca_basico', 'CA básico'], ['ca_maximo', 'CA máximo'], ['to_maximo', 'Taxa de ocupação'],
  ['recuo_frente_m', 'Recuo de frente (m)'], ['recuo_lateral_m', 'Recuo lateral e de fundo, até 10 m de altura (m)'], ['recuo_lateral_alto_m', 'Recuo lateral e de fundo, acima (m)'],
  ['cota_parte_m2', 'Cota-parte máxima (m²)'], ['max_unidades', 'Unidades por lote']];

const ni = <span className="ni">—</span>;
const V = (v: any, suf = '', d = 2): ReactNode => (v == null ? ni : (suf === ' m' ? metros(v) : num(v, d)) + suf);
const P = (v: any): ReactNode => (v == null ? ni : num(v * 100, 0) + '%');
const fdh = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(+d) ? s : d.toLocaleString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' de ', ' ').replace('.', '');
};
const fd = (s: string | null | undefined) => (s ? new Date(s.slice(0, 10) + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ de /g, ' ').replace('.', '') : '—');

/** tudo que a aba precisa, numa consulta */
function useParam(f: Ficha) {
  return useQuery({
    queryKey: ['parametros', f.id],
    queryFn: async () => {
      const [lz, res, az, hist, ins, cl, ca, base] = await Promise.all([
        supabase.from('v_lote_zonas').select('*').eq('terreno_id', f.id),
        supabase.from('v_urbanismo_vigente').select('*').eq('terreno_id', f.id).maybeSingle(),
        supabase.from('analise_zoneamentos').select('*,analises_urbanisticas!inner(terreno_id,status)').eq('analises_urbanisticas.terreno_id', f.id).eq('analises_urbanisticas.status', 'vigente'),
        supabase.from('analises_urbanisticas').select('id,data_verificacao,fonte,observacoes,status,analise_zoneamentos(area_abrangida_m2,zoneamentos(sigla))').eq('terreno_id', f.id).order('criado_em', { ascending: false }),
        supabase.from('inscricoes_municipais').select('id,inscricao,area_cadastral_m2').eq('terreno_id', f.id).order('inscricao'),
        supabase.from('consultas_lote').select('inscricao_id,base,consultado_em,consultado_por,camadas,camadas_com_erro').eq('terreno_id', f.id).order('consultado_em', { ascending: false }),
        supabase.from('consultas_area').select('base,consultado_em,consultado_por,camadas,camadas_com_erro').eq('terreno_id', f.id).order('consultado_em', { ascending: false }).limit(1),
        f.t.municipio_id ? supabase.from('bases_cadastrais').select('codigo,nome,rotulo').eq('municipio_id', f.t.municipio_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      for (const r of [lz, res, az, hist, ins, cl, ca, base]) if (r.error) throw r.error;
      const pids = [...new Set((lz.data as R[]).map((r) => r.parametro_id).filter(Boolean))];
      const [cat, zs, us] = await Promise.all([
        pids.length ? supabase.from('zona_parametros').select('*').in('id', pids) : Promise.resolve({ data: [], error: null }),
        f.t.municipio_id ? supabase.from('zoneamentos').select('id,sigla').eq('municipio_id', f.t.municipio_id).eq('ativo', true).order('sigla') : Promise.resolve({ data: [], error: null }),
        supabase.from('usuarios').select('user_id,nome,email'),
      ]);
      for (const r of [cat, zs, us]) if (r.error) throw r.error;
      const nomes = new Map((us.data as R[]).map((u) => [u.user_id, u.nome || u.email]));
      /* última consulta de cada lote */
      const ultLote = new Map<string, R>();
      for (const c of cl.data as R[]) if (c.inscricao_id && !ultLote.has(c.inscricao_id)) ultLote.set(c.inscricao_id, c);
      return {
        lz: lz.data as R[], res: res.data as R | null, az: az.data as R[], hist: (hist.data as R[]).filter((h) => h.status === 'substituida'),
        vig: (hist.data as R[]).find((h) => h.status === 'vigente') ?? null,
        ins: ins.data as R[], ultLote, consLote: cl.data as R[], area: (ca.data as R[])[0] ?? null, base: base.data as R | null,
        cat: new Map((cat.data as R[]).map((p) => [p.id, p])), zonas: zs.data as R[], nomes,
      };
    },
  });
}
type D = NonNullable<ReturnType<typeof useParam>['data']>;

/** a seção da aba Terreno: Índices urbanísticos (o quadro Parâmetros urbanísticos, que juntava os três, saiu com as seções em
    chips; Restrições e entorno e Histórico de uso foram para Estudos Técnicos; pedidos do Moises, 10/nov/2026) */
export default function SecParametros({ f }: { f: Ficha }) {
  const q = useParam(f);
  if (q.isLoading || q.error || !q.data) return (
    <Quadro aba="terreno" id="indices" primeiro chip="Índices" titulo="Índices Urbanísticos">
      <div className="sec-b"><div className="muted">{q.isLoading ? 'Carregando…' : `Não foi possível carregar os parâmetros: ${String((q.error as any)?.message ?? q.error)}`}</div></div>
    </Quadro>
  );
  return <SecAnalise f={f} d={q.data} />;
}

/** Estudos Técnicos › Restrições e entorno e › Histórico de uso (saíram da aba Terreno; pedido do Moises, 10/nov/2026) */
export function AbaRestricoes({ f }: { f: Ficha }) {
  const q = useParam(f);
  return q.data ? <SecRestricoes f={f} d={q.data} /> : <Carregando q={q} aba="restricoes" id="rest" titulo="Restrições e entorno" />;
}
export function AbaHistUso({ f }: { f: Ficha }) {
  const q = useParam(f);
  return q.data ? <SecHistUso f={f} d={q.data} /> : <Carregando q={q} aba="historico-uso" id="histuso" titulo="Histórico de uso" />;
}
function Carregando({ q, aba, id, titulo }: { q: { isLoading: boolean; error: unknown }; aba: string; id: string; titulo: string }) {
  return <Quadro aba={aba} id={id} primeiro titulo={titulo}><div className="sec-b"><div className="muted">{q.isLoading ? 'Carregando…' : `Não foi possível carregar: ${String((q.error as any)?.message ?? q.error)}`}</div></div></Quadro>;
}

/* ---------- Índices urbanísticos ---------- */
function SecAnalise({ f, d }: { f: Ficha; d: D }) {
  const { edita } = useSessao();
  const [reg, setReg] = useState(false);
  /* "Zoneamento" do que falta na ficha: abre Registrar zonas, com o foco no lote */
  usePedido(['analise'], () => { abrirQuadroJa('terreno', 'indices'); if (edita) { setReg(true); focar('an-l'); } });
  const sjc = d.base?.codigo === 'geosanja', um = !ehSP(f);
  const R = d.res;
  const merc = d.lz.filter((r) => r.tipo === 'mercado');
  /* lotes: os com inscrição pela ordem, a parte sem inscrição por último */
  const lotes = [...new Set(merc.map((r) => r.inscricao_id ?? null))].sort((a, b) => (a === null ? 1 : 0) - (b === null ? 1 : 0)
    || String(merc.find((r) => r.inscricao_id === a)?.inscricao).localeCompare(String(merc.find((r) => r.inscricao_id === b)?.inscricao)));
  const zonasArea = Object.entries(merc.reduce((o: Record<string, number>, z) => ((o[z.sigla] = (o[z.sigla] || 0) + Number(z.area_abrangida_m2 || 0)), o), {})).sort((x, y) => y[1] - x[1]);
  const pot = (k: string) => {
    const L = d.lz.filter((r) => r.tipo === k), na = L.filter((r) => r.parametro_id && r.permitido === false).map((r) => r.sigla), sem = L.filter((r) => r.permitido !== false && r.ca_maximo == null).map((r) => r.sigla);
    const v = R?.[`potencial_${k}_m2`];
    return <div className="kv" key={k}><dt>Potencial{nomeTipo(um, k)}</dt><dd>{v != null ? <b>{m2(v)}</b> : <span className="ni">{na.length ? 'Não admitido em ' + [...new Set(na)].join(', ') : sem.length ? 'Falta o CA de ' + [...new Set(sem)].join(', ') : 'Não calculado'}</span>}</dd></div>;
  };
  const somaLotes = d.ins.reduce((s, i) => s + Number(i.area_cadastral_m2 || 0), 0), sobra = f.area && somaLotes && f.area - somaLotes > 1 ? f.area - somaLotes : null;
  const fontes = [...new Map(d.lz.filter((r) => r.parametro_id && (!um || r.tipo === 'mercado')).map((r) => [r.parametro_id, d.cat.get(r.parametro_id)] as [unknown, R | undefined]).filter((x) => x[1])).values()] as R[];
  const sig = new Map(d.lz.map((r) => [r.zoneamento_id, r.sigla]));
  return (
    <Quadro aba="terreno" id="indices" primeiro chip="Índices" titulo={<>Índices Urbanísticos<Busca terreno={f.id} fontes={['geosampa', 'geosanja']} /></>} aberto={reg || undefined}
      acoes={edita && !reg ? <button className="btn sm zn-reg" aria-label="Registrar zonas" title="Registrar zonas" onClick={() => setReg(true)}><Ic n="add" s={16} /><span className="oc-m">Registrar zonas</span></button> : null}>
      <div className="sec-b">
        {reg ? <FormZonas f={f} d={d} sjc={sjc} fechar={() => setReg(false)} /> : null}
        {d.vig ? <div className="lz-topo"><span className="muted" style={{ fontSize: 13 }}>Zonas vigentes desde {fd(d.vig.data_verificacao)} · {d.vig.fonte}</span></div> : null}
        {R && merc.length ? <>
          <dl className="kvl lz-res">
            <div className="kv"><dt>Zonas da área</dt><dd>{zonasArea.map(([s, v], i) => <span key={s}>{i ? ' · ' : ''}<b>{s}</b> {m2(v)}</span>)}</dd></div>
            {tiposDe(um).map(([k]) => pot(k))}
            <div className="kv"><dt>Sem outorga (CA básico)</dt><dd>{R.potencial_basico_m2 != null ? m2(R.potencial_basico_m2) : ni}</dd></div>
          </dl>
          {R.tem_parametro_a_validar ? <div className="hint">Há parâmetros a validar no catálogo.</div> : null}
          <Panorama d={d} merc={merc} sjc={sjc} um={um} lotes={lotes} />
          <details className="details lz-lotes" open={reg || undefined}><summary>Ver lote por lote ({lotes.length})</summary>
            {lotes.map((ins) => (
              <div className="lz-lote" key={ins ?? 'sem'}>
                <div className="lz-h"><CabLote d={d} ins={ins} /></div>
                {merc.filter((r) => (r.inscricao_id ?? null) === ins).map((z) => <Zona key={z.id} f={f} d={d} z={z} sjc={sjc} />)}
                {ins ? <CamadasLote d={d} ins={ins} /> : null}
              </div>
            ))}
          </details>
          {d.vig?.observacoes ? <div className="hint">{d.vig.observacoes}</div> : null}
          {sobra && !lotes.includes(null) ? <div className="hint">A área adotada passa a soma das inscrições em {m2(sobra)}. Se essa parte não tem inscrição, registre a zona dela como "Parte sem inscrição".</div> : null}
          <details className="details lz-fontes"><summary>Regras e fontes</summary>
            {fontes.map((p) => <div className="lz-fonte" key={p.id}><b>{sig.get(p.zoneamento_id)}</b>{p.uso ? ' · ' + p.uso : ''}{p.macrozona ? ' · ' + MACROS[p.macrozona] : ''}{um ? '' : ' · ' + TIPO_N[p.tipo]}
              {p.regras ? <div className="muted">{p.regras}</div> : null}
              <div className="faint">{p.fonte_norma}{p.fonte_dispositivo ? ', ' + p.fonte_dispositivo : ''}{p.fonte_url ? <> · <a href={p.fonte_url} target="_blank" rel="noopener">texto da lei</a></> : null}</div></div>)}
          </details>
        </> : <div className="muted">Nenhuma zona registrada. Incluir o SQL em Terreno › Matrículas e Lotes (consulta do GeoSampa ou GeoSanja) registra as zonas de cada lote; ou registre à mão.</div>}
        {d.hist.length ? <details className="details" style={{ marginTop: 12 }}><summary>{d.hist.length} análise{d.hist.length > 1 ? 's' : ''} anterior{d.hist.length > 1 ? 'es' : ''}</summary>
          {d.hist.map((h) => <div key={h.id} className="muted" style={{ fontSize: 13, padding: '4px 0' }}>{fd(h.data_verificacao)} · {h.fonte} · {(h.analise_zoneamentos as R[]).map((z) => `${z.zoneamentos?.sigla} ${m2(z.area_abrangida_m2)}`).join(', ')}</div>)}
        </details> : null}
      </div>
    </Quadro>
  );
}

function CabLote({ d, ins }: { d: D; ins: string | null }) {
  if (!ins) return <><b>Parte sem inscrição</b> <span className="muted">· zona pela poligonal do terreno</span></>;
  const i = d.ins.find((x) => x.id === ins);
  return <><b>{d.base?.rotulo ?? 'Inscrição'} {i?.inscricao}</b>{i?.area_cadastral_m2 != null ? <span className="muted"> · {m2(i.area_cadastral_m2)} cadastrais</span> : null}</>;
}

/** uma zona no lote: os parâmetros comuns (os do primeiro tipo admitido) e o CA máximo e o potencial de cada tipo */
function Zona({ f, d, z, sjc }: { f: Ficha; d: D; z: R; sjc: boolean }) {
  const { edita } = useSessao();
  const um = !ehSP(f);
  const [ed, setEd] = useState(false);
  const Ls = Object.fromEntries(TIPOS.map(([k]) => [k, d.lz.find((r) => r.id === z.id && r.tipo === k) ?? null])) as Record<string, R | null>;
  const raw = d.az.find((a) => a.id === z.id) ?? {};
  const alt = new Set(EXC_K.filter((k) => raw[k] != null));
  const k0 = TIPOS.map((t) => t[0]).find((k) => Ls[k]?.parametro_id && Ls[k]?.permitido) ?? 'mercado', l = Ls[k0]!, p = l?.parametro_id ? d.cat.get(l.parametro_id) : null;
  const mk: ReactNode[] = [];
  if (sjc) mk.push(z.macrozona ? <span key="m" className="chip">{MACROS[z.macrozona]}</span> : <span key="m" className="chip warn">sem macrozona</span>);
  if (TIPOS.some(([k]) => Ls[k]?.parametro_id && Ls[k]?.situacao !== 'confirmado')) mk.push(<span key="v" className="chip warn" title="Há parâmetros a validar no catálogo">A validar</span>);
  if (alt.size) mk.push(<span key="e" className="chip blue" title={raw.excecao_fonte || ''}>valores alterados no lote</span>);
  const cel = (k: string, v: ReactNode, dica: ReactNode, ch?: string) => {
    const a = ch && alt.has(ch);
    return <div className={`lz-c${a ? ' alt' : ''}`} key={k}><dt>{k}</dt><dd>{v}</dd>{a ? <div className="lz-d">alterado no lote</div> : dica ? <div className="lz-d">{dica}</div> : null}</div>;
  };
  const caTipo = (k: string) => {
    const x = Ls[k], q = x?.parametro_id ? d.cat.get(x.parametro_id) : null;
    const dica = [q && q.tipo !== k ? 'regra de mercado' : '', x?.potencial_maximo_m2 != null ? 'potencial ' + m2(x.potencial_maximo_m2) : ''].filter(Boolean).join(' · ');
    return cel('CA máximo' + nomeTipo(um, k), !q ? ni : x!.permitido === false ? <span className="ni">Não admitido</span> : <b>{V(x!.ca_maximo, '', 3)}</b>, x?.permitido === false ? '' : dica, 'ca_maximo');
  };
  /* a mesma regra em texto nos três tipos aparece uma vez só */
  const regras = Object.entries(tiposDe(um).reduce((o: Record<string, string[]>, [k]) => { const t = Ls[k]?.regras; if (t) (o[t] ||= []).push(TIPO_N[k]); return o; }, {}));
  const ate = sjc ? 'até o 2º pavimento' : 'até 10 m de altura';
  const recLat = l.recuo_lateral_m == null && l.recuo_lateral_alto_m == null ? ni : l.recuo_lateral_alto_m == null ? metros(l.recuo_lateral_m) + ' m'
    : `${l.recuo_lateral_m == null || Number(l.recuo_lateral_m) === 0 ? 'Dispensado' : metros(l.recuo_lateral_m) + ' m'} ${ate}; ${metros(l.recuo_lateral_alto_m)} m acima`;
  const gab = l.gabarito_sem_limite ? 'Sem limite' : l.gabarito_m != null ? metros(l.gabarito_m) + ' m' : ni;
  const area = Number(z.area_abrangida_m2) || 0;
  const corpo = !p ? <div className="muted lz-sem">{sjc && !z.macrozona ? 'Informe a macrozona: em SJC o CA depende dela.' : 'Zona sem parâmetros no catálogo.'}</div>
    : !TIPOS.some(([k]) => Ls[k]?.permitido) ? <div className="muted lz-sem">Uso residencial não admitido{p.regras ? ': ' + p.regras : ''}</div>
    : <>
      <dl className="lz-par">
        {tiposDe(um).map(([k]) => caTipo(k))}
        {cel('Taxa de ocupação', V(l.to_maximo, '', 2), p.to_corte_m2 ? `${num(p.to_maximo, 2)} em lote até ${num(p.to_corte_m2)} m²; ${num(p.to_lote_grande, 2)} acima${f.area == null ? ' (sem área adotada, vale a de lote grande)' : ''}` : '', 'to_maximo')}
        {cel('Gabarito', gab, '', alt.has('gabarito_sem_limite') ? 'gabarito_sem_limite' : 'gabarito_m')}
        {cel('Recuo de frente', V(l.recuo_frente_m, ' m'), '', 'recuo_frente_m')}
        {cel('Recuos laterais e fundo', recLat, '', alt.has('recuo_lateral_m') ? 'recuo_lateral_m' : 'recuo_lateral_alto_m')}
        {cel('Cota-parte máxima', l.cota_parte_m2 != null ? num(l.cota_parte_m2) + ' m² por unidade' : ni, l.cota_parte_m2 != null && area ? `até ${num(Math.floor(area / Number(l.cota_parte_m2)))} unidades nesta área` : '', 'cota_parte_m2')}
        {l.max_unidades != null ? cel('Unidades por lote', num(l.max_unidades), '', 'max_unidades') : null}
        {cel('Permeabilidade mínima', P(l.permeabilidade), '', 'permeabilidade')}
      </dl>
      {regras.map(([t, ks]) => <div className="lz-regra" key={t}>{regras.length > 1 ? <b>{ks.join(', ')}: </b> : null}{t}</div>)}
    </>;
  return (
    <div className="lz-z" id={`lz-${z.id}`}>
      <div className="lz-zh"><b>{z.sigla}</b><span className="muted">{m2(z.area_abrangida_m2)}</span>{mk}
        {edita ? <button className="linkbtn lz-zb" aria-expanded={ed} onClick={() => setEd(!ed)}>{ed ? 'Fechar' : 'Alterar valores'}</button> : null}</div>
      {corpo}
      {ed ? <FormExc f={f} raw={raw} p={p} sjc={sjc} z={z} fechar={() => setEd(false)} /> : null}
    </div>
  );
}

/** Alterar valores do lote: vazio segue o catálogo; a fonte da alteração é opcional (decisão do Moisés, 6/nov/2026).
    Editado no lugar, sem Salvar: grava ao sair de cada campo ou ao escolher */
function FormExc({ f, raw, p, sjc, z, fechar }: { f: Ficha; raw: R; p: R | null | undefined; sjc: boolean; z: R; fechar: () => void }) {
  const qc = useQueryClient(), toast = useToast();
  const [v, setV] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(EXC_CAMPOS.map(([k]) => [k, /_m$/.test(k) ? metros(raw[k]) : numStr(raw[k])])),
    permeabilidade: raw.permeabilidade != null ? numStr(Math.round(raw.permeabilidade * 1000) / 10, 1) : '',
    gabSt: raw.gabarito_sem_limite ? 'sem' : raw.gabarito_m != null ? 'limitado' : '', gab: metros(raw.gabarito_m),
    fonte: raw.excecao_fonte ?? '', macro: z.macrozona ?? '',
  }));
  const vR = useRef(v);
  vR.current = v;
  const ult = useRef<string | null>(null), fila = useRef<Promise<unknown>>(Promise.resolve());
  const base = (k: string) => (p ? ({ ca_maximo: p.ca_maximo, to_maximo: p.to_corte_m2 && f.area != null && f.area >= p.to_corte_m2 ? p.to_lote_grande : p.to_maximo } as R)[k] ?? p[k] : null);
  const ph = (x: any) => (x == null ? 'A lei não fixa' : 'Catálogo: ' + num(x, 3));
  const montar = (v: Record<string, string>): R | string => {
    const e: R = Object.fromEntries(EXC_CAMPOS.map(([k]) => [k, lerNum(v[k])]));
    const pm = lerNum(v.permeabilidade); e.permeabilidade = pm == null ? null : Math.round(pm * 10) / 1000;
    e.gabarito_m = v.gabSt === 'limitado' ? lerNum(v.gab) : null; e.gabarito_sem_limite = v.gabSt === 'sem' ? true : v.gabSt === 'limitado' ? false : null;
    if (v.gabSt === 'limitado' && !(e.gabarito_m > 0)) return 'Informe a altura do gabarito limitado.';
    if (e.to_maximo != null && !(e.to_maximo > 0 && e.to_maximo <= 1)) return 'Taxa de ocupação vai de 0 a 1.';
    if (e.permeabilidade != null && !(e.permeabilidade > 0 && e.permeabilidade <= 1)) return 'Permeabilidade vai de 0 a 100%.';
    if (['ca_basico', 'ca_maximo', 'cota_parte_m2', 'max_unidades'].some((k) => e[k] != null && !(e[k] > 0))) return 'CA, cota-parte e unidades: número maior que zero, ou vazio para seguir o catálogo.';
    if (['recuo_frente_m', 'recuo_lateral_m', 'recuo_lateral_alto_m'].some((k) => e[k] != null && e[k] < 0)) return 'Recuo não pode ser negativo.';
    /* a fonte é opcional (decisão do Moisés, 6/nov/2026) */
    e.excecao_fonte = EXC_K.some((k) => e[k] != null) ? v.fonte.trim() || null : null;
    if (sjc) e.macrozona = v.macro || null;
    return e;
  };
  if (ult.current == null) { const e0 = montar(v); ult.current = typeof e0 === 'string' ? '' : JSON.stringify(e0); }
  /** grava o que mudou desde a última gravação; uma de cada vez */
  const gravar = () => {
    fila.current = fila.current.then(async () => {
      const e = montar(vR.current);
      if (typeof e === 'string') { toast(e); return; }
      const js = JSON.stringify(e);
      if (js === ult.current) return;
      const r = await supabase.from('analise_zoneamentos').update(e).eq('id', z.id);
      if (r.error) { toast(r.error.message); return; }
      ult.current = js;
      await qc.invalidateQueries({ queryKey: ['parametros', f.id] });
      toast('Salvo.');
    });
  };
  const m = (k: string, ja?: boolean) => (e: { target: { value: string } }) => { const nv = { ...vR.current, [k]: e.target.value }; vR.current = nv; setV(nv); if (ja) gravar(); };
  const x = { 'data-vivo': '', onBlur: () => gravar(),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') { e.preventDefault(); proximoCampo(e.currentTarget); } else if (e.key === 'Escape') { e.stopPropagation(); fechar(); } } };
  const un = (k: string) => (/_m2$/.test(k) ? 'm2' : /_m$/.test(k) ? 'm' : null) as 'm' | 'm2' | null;
  const sem = (l: string) => l.replace(/ \((m|m²)\)$/, '');
  return (
    <div className="lz-exc"><div className="editgrid">
      {sjc ? <div className="field"><label htmlFor={`ze-m${z.id}`}>Macrozona</label><select id={`ze-m${z.id}`} value={v.macro} onChange={m('macro', true)} {...x}><option value="">Não informada</option>{Object.entries(MACROS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div> : null}
      {EXC_CAMPOS.map(([k, l]) => {
        const i = <input id={`ze-${k}${z.id}`} inputMode="decimal" data-fmt={k === 'max_unidades' ? 'int' : /_m$/.test(k) ? 'm' : 'num'} value={v[k]} onChange={m(k)} placeholder={ph(base(k))} {...x} />, u = un(k);
        return <div className="field" key={k}><label htmlFor={`ze-${k}${z.id}`}>{sem(l)}</label>{u ? <Adorno t={u}>{i}</Adorno> : i}</div>;
      })}
      <div className="field"><label htmlFor={`ze-pm${z.id}`}>Permeabilidade mínima</label><Adorno t="pct"><input id={`ze-pm${z.id}`} inputMode="decimal" data-fmt="pct" value={v.permeabilidade} onChange={m('permeabilidade')}
        placeholder={p?.permeabilidade != null ? 'Catálogo: ' + num(p.permeabilidade * 100, 0) + '%' : 'A lei não fixa'} {...x} /></Adorno></div>
      <div className="field"><label htmlFor={`ze-g${z.id}`}>Gabarito</label><select id={`ze-g${z.id}`} value={v.gabSt} onChange={m('gabSt', true)} {...x}><option value="">Segue o catálogo</option><option value="limitado">Limitado</option><option value="sem">Sem limite</option></select></div>
      <div className="field"><label htmlFor={`ze-gv${z.id}`}>Altura do gabarito</label><Adorno t="m"><input id={`ze-gv${z.id}`} inputMode="decimal" data-fmt="m" value={v.gab} onChange={m('gab')} disabled={v.gabSt !== 'limitado'} {...x} /></Adorno></div>
      <div className="field full"><label htmlFor={`ze-f${z.id}`}>Fonte da alteração (opcional)</label><input id={`ze-f${z.id}`} value={v.fonte} onChange={m('fonte')} placeholder="Consulta prévia, operação urbana, certidão, projeto aprovado..." {...x} /></div>
    </div>
      <div className="hint" style={{ marginTop: 8 }}>Cada valor grava ao sair do campo. Vazio segue o catálogo.</div>
    </div>
  );
}

/** Registrar zonas à mão: o lote (ou a parte sem inscrição), a fonte e até 3 zonas com a área */
function FormZonas({ f, d, sjc, fechar }: { f: Ficha; d: D; sjc: boolean; fechar: () => void }) {
  const qc = useQueryClient(), toast = useToast();
  const kZ = `${f.id}:zonas`, ZS0 = () => [0, 1, 2].map(() => ({ sigla: '', area: '', macro: '' }));
  const g0 = comRasc<{ lote?: string; fonte?: string; zs?: { sigla: string; area: string; macro: string }[] }>(kZ, {});
  const [lote, setLote] = useState(g0.lote != null && (g0.lote === '' || d.ins.some((i) => i.id === g0.lote)) ? g0.lote : d.ins[0]?.id ?? '');
  const [fonte, setFonte] = useState(g0.fonte ?? '');
  const [zs, setZs] = useState(g0.zs?.length === 3 ? g0.zs : ZS0());
  const [grav, setGrav] = useState(false);
  const fref = useRef<HTMLFormElement | null>(null);
  const sujoZ = !!fonte.trim() || zs.some((z) => mudou(z, { sigla: '', area: '', macro: '' }));
  useGuardarRasc(kZ, { lote, fonte, zs }, sujoZ);
  const mz = (i: number, k: string, v: string) => setZs((o) => o.map((z, j) => (j === i ? { ...z, [k]: v } : z)));
  const salvar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (grav) return;
    const zonas = zs.filter((z) => z.sigla).map((z) => ({ sigla: z.sigla, area_m2: lerNum(z.area), macrozona: sjc ? z.macro || null : null }));
    if (!zonas.length) { toast('Escolha ao menos uma zona.'); return; }
    if (zonas.some((z) => z.area_m2 != null && !(z.area_m2 > 0))) { toast('Área da zona tem que ser maior que zero.'); return; }
    if (!fonte.trim()) { toast('Informe a fonte.'); return; }
    setGrav(true);
    try {
      const r = await supabase.rpc('registrar_zonas_lote', { p_terreno: f.id, p_inscricao: lote || null, p_zonas: zonas, p_fonte: fonte.trim() });
      if (r.error) throw r.error;
      await qc.invalidateQueries({ queryKey: ['parametros', f.id] });
      apagarRasc(kZ);
      toast(r.data ? 'Zonas registradas. A análise anterior foi preservada.' : 'As zonas deste lote já eram essas.'); fechar();
    } catch (er: any) { toast(er?.message ?? String(er)); } finally { setGrav(false); }
  };
  return (
    <form style={{ marginTop: 12 }} onSubmit={salvar} ref={(el) => { fref.current = el; if (el && !el.dataset.visto) { el.dataset.visto = '1'; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); } }}>
      <div className="editgrid">
        <div className="field"><label htmlFor="an-l">Lote</label><select id="an-l" value={lote} onChange={(e) => setLote(e.target.value)}>
          {d.ins.map((i) => <option key={i.id} value={i.id}>{d.base?.rotulo ?? 'Inscrição'} {i.inscricao}</option>)}<option value="">Parte sem inscrição (pela poligonal)</option></select></div>
        <div className="field"><label htmlFor="an-f">Fonte</label><input id="an-f" required value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="GeoSampa, certidão de uso do solo..." /></div>
      </div>
      {zs.map((z, i) => (
        <div className="editgrid" key={i} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--linha)' }}>
          <div className="field"><label htmlFor={`z${i}`}>Zona {i + 1}{i ? ' (opcional)' : ''}</label><select id={`z${i}`} required={!i} value={z.sigla} onChange={(e) => mz(i, 'sigla', e.target.value)}>
            <option value="">—</option>{d.zonas.map((x) => <option key={x.id}>{x.sigla}</option>)}</select></div>
          <div className="field"><label htmlFor={`za${i}`}>Área da zona no lote</label><Adorno t="m2"><input id={`za${i}`} inputMode="decimal" value={z.area} onChange={(e) => mz(i, 'area', e.target.value)} /></Adorno></div>
          {sjc ? <div className="field"><label htmlFor={`zm${i}`}>Macrozona</label><select id={`zm${i}`} value={z.macro} onChange={(e) => mz(i, 'macro', e.target.value)}><option value="">Não informada</option>{Object.entries(MACROS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div> : null}
        </div>
      ))}
      <div className="sec-f" style={{ padding: '12px 0 0' }}><LimparRasc chave={kZ} mostrar={sujoZ} limpar={() => { setFonte(''); setZs(ZS0()); }} /><button type="button" className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" disabled={grav}>Registrar zonas</button></div>
    </form>
  );
}

/** os parâmetros de uma zona no lote em texto, para o panorama (os mesmos que Zona mostra) */
function parZona(d: D, z: R, sjc: boolean, um = false): [string, string][] {
  const Ls = Object.fromEntries(TIPOS.map(([k]) => [k, d.lz.find((r) => r.id === z.id && r.tipo === k) ?? null])) as Record<string, R | null>;
  const k0 = TIPOS.map((t) => t[0]).find((k) => Ls[k]?.parametro_id && Ls[k]?.permitido) ?? 'mercado', l = Ls[k0];
  if (!l?.parametro_id || !TIPOS.some(([k]) => Ls[k]?.permitido)) return [];
  const T = (v: any, suf = '', dd = 2) => (v == null ? '—' : (suf === ' m' ? metros(v) : num(v, dd)) + suf);
  const ate = sjc ? 'até o 2º pav.' : 'até 10 m';
  const recLat = l.recuo_lateral_m == null && l.recuo_lateral_alto_m == null ? '—' : l.recuo_lateral_alto_m == null ? metros(l.recuo_lateral_m) + ' m'
    : `${l.recuo_lateral_m == null || Number(l.recuo_lateral_m) === 0 ? 'Dispensado' : metros(l.recuo_lateral_m) + ' m'} ${ate}; ${metros(l.recuo_lateral_alto_m)} m acima`;
  return [
    ...tiposDe(um).map(([k]) => ['CA máximo' + nomeTipo(um, k), !Ls[k]?.parametro_id ? '—' : Ls[k]!.permitido === false ? 'Não admitido' : T(Ls[k]!.ca_maximo, '', 3)] as [string, string]),
    ['Taxa de ocupação', T(l.to_maximo, '', 2)],
    ['Gabarito', l.gabarito_sem_limite ? 'Sem limite' : l.gabarito_m != null ? metros(l.gabarito_m) + ' m' : '—'],
    ['Recuo de frente', T(l.recuo_frente_m, ' m')], ['Recuos laterais e fundo', recLat],
    ['Cota-parte máxima', l.cota_parte_m2 != null ? num(l.cota_parte_m2) + ' m²' : '—'],
    ['Permeabilidade mínima', l.permeabilidade == null ? '—' : num(l.permeabilidade * 100, 0) + '%'],
  ];
}

/** Panorama do terreno inteiro (pedido do Moisés, 9/nov/2026): cada parâmetro com todos os valores dos lotes e zonas,
 * separados por " / " (o título da célula diz de qual zona é cada um), e as demais camadas da prefeitura somadas;
 * o que nenhum lote toca aparece uma vez só, aqui. Lote por lote fica no "Ver lote por lote", logo abaixo. */
function Panorama({ d, merc, sjc, um, lotes }: { d: D; merc: R[]; sjc: boolean; um: boolean; lotes: (string | null)[] }) {
  const ordem: string[] = [], vals = new Map<string, Map<string, string[]>>();
  for (const z of merc) for (const [k, v] of parZona(d, z, sjc, um)) {
    if (!vals.has(k)) { ordem.push(k); vals.set(k, new Map()); }
    const m = vals.get(k)!; (m.get(v) ?? m.set(v, []).get(v)!).push(z.sigla);
  }
  const n = lotes.filter(Boolean).length;
  /* as camadas da prefeitura de todos os lotes consultados: o que toca algum lote, junto, sem repetir */
  const gs = lotes.map((i) => (i ? d.ultLote.get(i) : undefined)).filter((g): g is R => g?.base === 'geosampa' || g?.base === 'geosanja');
  const jc = juntarCamadas(gs), junto = sjc ? gsjLinhas(jc.camadas, jc.erros) : geoLinhas(jc.camadas, jc.erros);
  const quem = gs.length === 1 && n === 1 ? 'O lote não toca' : gs.length === n ? `Nenhum dos ${n} lotes toca` : `Nenhum dos ${gs.length} lotes consultados toca`;
  if (!ordem.length && !gs.length) return null;
  return (
    <div className="lz-pan">
      <div className="geo-st">Panorama do terreno{lotes.length > 1 ? <span className="faint"> · {lotes.length} lotes</span> : null}</div>
      {ordem.length ? <dl className="lz-par">{ordem.map((k) => {
        const m = vals.get(k)!, vs = [...m.keys()], varios = vs.length > 1;
        return <div className="lz-c" key={k} title={varios ? vs.map((v) => `${[...new Set(m.get(v))].join(', ')}: ${v}`).join(' · ') : undefined}>
          <dt>{k}</dt><dd>{k.startsWith('CA máximo') ? <b>{vs.join(' / ')}</b> : vs.join(' / ')}</dd>{varios ? <div className="lz-d">varia por zona ou lote</div> : null}</div>;
      })}</dl> : null}
      {gs.length ? <Toca linhas={junto} nada={quem}
        titulo={<>Demais parâmetros e restrições <span className="faint">· {gs.length === 1 ? 'consulta' : `${gs.length} consultas`} {d.base?.nome ?? ''}</span></>} /> : null}
    </div>
  );
}

/** Lista "O que toca o lote" (o que não toca vai uma vez só, no Panorama do terreno) */
function Toca({ linhas, titulo, nada }: { linhas: LinhaToca[]; titulo: ReactNode; nada?: string }) {
  const toca = linhas.filter((l) => l.vals.length), falhou = linhas.filter((l) => l.erro);
  return (
    <div className="geo-toca"><div className="geo-st">{titulo}</div>
      {toca.length ? toca.map((l) => <div className="geo-l" key={l.tema}><span className="k">{l.tema}</span><span className="v">{l.vals.map((v) => <span key={v} className={`chip ${l.grav}`}>{v}</span>).reduce((a: ReactNode[], x, i) => (i ? [...a, ' ', x] : [x]), [])}</span></div>)
        : <div className="muted">Nenhuma restrição nem perímetro especial.</div>}
      {nada ? <div className="hint lz-naotoca">{nada}: {linhas.filter((l) => !l.vals.length && !l.erro).map((l) => l.tema).join(', ')}.</div> : null}
      {falhou.length ? <div className="hint" style={{ color: 'var(--crit-tx,#b3261e)' }}>Não responderam nesta consulta: {falhou.map((l) => l.tema).join(', ')}.</div> : null}
    </div>
  );
}

/** abaixo das zonas do lote, as demais camadas da última consulta do lote */
function CamadasLote({ d, ins }: { d: D; ins: string }) {
  const g = d.ultLote.get(ins);
  if (!g) return <div className="hint lz-cam">Sem consulta à prefeitura neste lote (tombamento, ZEIS, mananciais e outras restrições).</div>;
  if (g.base !== 'geosampa' && g.base !== 'geosanja') return null;
  const linhas = (g.base === 'geosanja' ? gsjLinhas : geoLinhas)(g.camadas || {}, g.camadas_com_erro || []);
  return <div className="lz-cam"><Toca linhas={linhas}
    titulo={<>Demais parâmetros e restrições <span className="faint">· {d.base?.nome ?? 'consulta'} de {fdh(g.consultado_em)}</span></>} /></div>;
}

/* ---------- Restrições e entorno ---------- */
type Item = [string, { pa?: 1; sn?: string; k?: string[]; grav?: string; info?: 1; vazio?: string }];
const REST_GRUPOS: [string, Item[]][] = [
  ['Ambiental', [
    ['Perímetro de qualificação ambiental (Quota Ambiental)', { pa: 1 }],
    ['Inundação em 5 anos', { sn: 'mancha_inundacao_5', grav: 'crit' }],
    ['Inundação em 25 anos', { sn: 'mancha_inundacao_25' }],
    ['Inundação em 100 anos', { sn: 'mancha_inundacao_100' }],
    ['Córrego a até 30 m', { k: ['drenagem'] }],
    ['Parque ou unidade de conservação', { k: ['GEOSAMPA_cadparcs_parque_unidade_conservacao', 'pde_outra_unidade_conservacao'] }],
    ['Vegetação significativa', { k: ['GEOSAMPA_cgpabi_vegetacao_significativa'] }],
    ['Árvores na calçada a até 30 m', { k: ['arvore_v2'], info: 1 }],
    ['Manancial', { k: ['manancial_guarapiranga', 'manancial_billings', 'manancial_juquery'] }],
    ['Área contaminada no terreno', { k: ['area_contaminada_reabilitada_svma', 'GEOSAMPA_area_contaminada_sigac'] }],
    ['Área contaminada a até 30 m', { k: ['area_contaminada_reabilitada_svma@30', 'GEOSAMPA_area_contaminada_sigac@30'] }]]],
  ['Patrimônio', [
    ['Bem tombado', { k: ['patrimonio_cultural_bem_tombado'] }],
    ['Área envoltória (Conpresp, Condephaat, Iphan)', { k: ['patrimonio_cultural_area_envoltoria_CONPRESP', 'patrimonio_cultural_area_envoltoria_CONDEPHAAT', 'patrimonio_cultural_area_envoltoria_IPHAN'] }],
    ['ZEPEC-APC', { k: ['zona_especial_preservacao_cultural_apc'] }],
    ['Interesse arqueológico', { k: ['patrimonio_cultural_area_arqueologica'] }]]],
  ['Vias e redes', [
    ['Classificação viária (CET)', { k: ['classificacao_viaria_cet'], info: 1 }],
    ['Melhoramento viário', { k: ['geoconvias_lei_melhoramento_vigente'] }],
    ['Faixa não edificável', { k: ['geoconvias_faixa_nao_edificavel'] }],
    ['Vila ou rua sem saída', { k: ['enquadramento_vila', 'rua_sem_saida'] }],
    ['Linha de alta tensão a até 30 m', { k: ['linha_alta_tensao_v2', 'linha_subterranea_alta_tensao'] }],
    ['Ferrovia a até 30 m', { k: ['ferrovia_mdc_v2'] }],
    ['Rede da Comgás', { k: ['rede_comgas'], info: 1, vazio: 'Nenhuma a até 100 m' }]]],
  ['Riscos e interferências', [
    ['Risco geológico', { k: ['area_risco_geologico_v2'] }],
    ['Restrição geotécnica', { k: ['restricao_geotecnica'] }],
    ['Influência do Metrô ou da CPTM', { k: ['area_influencia_metro', 'area_influencia_trem'] }]]]];

/** as camadas de várias consultas de lote somadas, sem repetir a mesma feição (árvores e redes contam uma vez; vale a menor distância) */
function juntarCamadas(gs: R[]): { camadas: Record<string, any[]>; erros: string[] } {
  const camadas: Record<string, any[]> = {}, erros = new Set<string>();
  for (const g of gs) {
    for (const [k, fs] of Object.entries((g.camadas || {}) as Record<string, any[]>)) {
      const ja = camadas[k] || (camadas[k] = []);
      for (const x of fs) {
        const id = JSON.stringify(Object.entries(x).filter(([c]) => c !== '_dist_m'));
        const o = ja.find((y) => y.__id === id);
        if (!o) ja.push({ ...x, __id: id }); else if (x._dist_m != null && (o._dist_m == null || x._dist_m < o._dist_m)) o._dist_m = x._dist_m;
      }
    }
    for (const e of g.camadas_com_erro || []) erros.add(e);
  }
  for (const fs of Object.values(camadas)) fs.sort((a, b) => (a._dist_m ?? 0) - (b._dist_m ?? 0));
  return { camadas, erros: [...erros] };
}

interface Rest { fonte: 'poligonal' | 'lotes'; n?: number; em: string; user: string | null; camadas: Record<string, any[]>; erros: string[] }
/** a consulta pela poligonal ou, sem ela, a soma das consultas dos lotes (árvores e redes sem repetir) */
function restDados(d: D): Rest | null {
  if (d.area) return { fonte: 'poligonal', em: d.area.consultado_em, user: d.nomes.get(d.area.consultado_por) ?? null, camadas: d.area.camadas || {}, erros: d.area.camadas_com_erro || [] };
  const gs = [...d.ultLote.values()].filter((g) => g.base === 'geosampa');
  if (!gs.length) return null;
  const { camadas, erros } = juntarCamadas(gs);
  const ult = gs.slice().sort((a, b) => String(b.consultado_em).localeCompare(String(a.consultado_em)))[0];
  return { fonte: 'lotes', n: gs.length, em: ult.consultado_em, user: d.nomes.get(ult.consultado_por) ?? null, camadas, erros };
}

function SecRestricoes({ f, d }: { f: Ficha; d: D }) {
  const { edita } = useSessao();
  const qc = useQueryClient(), toast = useToast();
  const [busc, setBusc] = useState(false), [ctAb, setCtAb] = useState(false);
  const sp = d.base?.codigo === 'geosampa', r = sp ? restDados(d) : null, regs = r ? registrosCont(r.camadas) : [];
  const verCt = <button className="linkbtn ct-ver" onClick={() => setCtAb(true)}>Ver detalhes</button>;
  const consultar = async () => {
    if (busc || !f.poly) return;
    setBusc(true);
    try {
      const n = await consultarArea(f.id, f.poly);
      await qc.invalidateQueries({ queryKey: ['parametros', f.id] });
      toast(n ? `GeoSampa consultado; ${n} camada${n > 1 ? 's' : ''} não respondeu.` : 'GeoSampa consultado pela poligonal.');
    } catch (e) { console.error(e); toast('Não foi possível consultar o GeoSampa agora. Tente de novo em instantes.'); } finally { setBusc(false); }
  };
  const acoes = sp && edita && f.poly ? <button className="btn sm text" disabled={busc} onClick={consultar}><Ic n="search" s={16} />{busc ? 'Consultando...' : d.area ? 'Consultar de novo' : 'Consultar pela poligonal'}</button> : null;
  if (!sp) return <Quadro aba="restricoes" id="rest" primeiro titulo="Restrições e entorno"><div className="sec-b"><div className="muted">Não disponível nesta cidade. O que a prefeitura traz está em cada lote, em Terreno › Índices.</div></div></Quadro>;
  const orig = r ? (r.fonte === 'poligonal' ? `GeoSampa pela poligonal do terreno, ${fdh(r.em)}${r.user ? ' por ' + r.user : ''}` : `GeoSampa por ${r.n} lote${r.n! > 1 ? 's' : ''} (inscrições), último em ${fdh(r.em)}`) : '';
  const linha = ([tema, o]: Item) => {
    const cel = (v: ReactNode) => <div className="rs-l" key={tema}><span className="k">{tema}</span><span className="v">{v}</span></div>;
    if (o.pa) { const q = r?.camadas.quota_ambiental; return cel(q && q.length ? <><b>{q.map((x) => x.pa).join(' / ')}</b><span className="faint rs-src">Lei 16.402/2016, Mapa 3</span></> : <span className="faint">{r ? 'Fora dos perímetros' : '—'}</span>); }
    if (!r) return cel(<span className="faint">—</span>);
    const ks = o.sn ? [o.sn] : o.k!, erro = ks.some((k) => r.erros.includes(k)), vals = [...new Set(ks.flatMap((k) => geoVals(k, r.camadas[k])))];
    const grav = o.grav || CAMADA[ks[0]]?.[3] || '';
    if (o.sn) return cel(vals.length ? <><span className={`chip ${grav}`}>Sim</span> <span className="faint">{vals.join(', ')}</span></> : erro ? <span className="faint">Não respondeu</span> : 'Não');
    if (!vals.length) return cel(erro ? <span className="faint">Não respondeu</span> : o.vazio || 'Não');
    const ct = ks.some((k) => CONT_KS.includes(k)) && regs.length;
    return cel(<>{vals.map((v, i) => <span key={v}>{i ? ' ' : ''}<span className={`chip ${o.info ? '' : grav}`}>{v}</span></span>)}{ct ? <> {verCt}</> : null}</>);
  };
  return (
    <Quadro aba="restricoes" id="rest" primeiro titulo={<>Restrições e entorno<Busca terreno={f.id} fontes={['geosampa', 'geosanja']} /></>} acoes={acoes}>
      <div className="sec-b">
        <div className="hint rs-fonte">{r ? orig : f.poly ? 'Sem consulta ao GeoSampa: consulte pela poligonal ou inclua os SQLs em Terreno › Matrículas e Lotes.' : 'Desenhe a poligonal do terreno para consultar.'}</div>
        {REST_GRUPOS.map(([g, itens]) => <div className="rs-g" key={g}><div className="rs-gt">{g}</div>{itens.map(linha)}</div>)}
      </div>
      {ctAb ? <DetalhesContaminacao regs={regs} poly={f.poly} fechar={() => setCtAb(false)} /> : null}
    </Quadro>
  );
}

/* ---------- Histórico de uso ---------- */
function SecHistUso({ f, d }: { f: Ficha; d: D }) {
  const { edita } = useSessao();
  const sp = d.base?.codigo === 'geosampa', r = sp ? restDados(d) : null;
  const [txt, setTxt] = useState<string>(f.t.historico_uso ?? ''), [ctAb, setCtAb] = useState(false);
  const ks = CONT_KS, regs = r ? registrosCont(r.camadas) : [];
  const ac = r ? [...new Set(ks.flatMap((k) => (r.camadas[k] || []).map((x) => { try { return CAMADA[k][2](x) + (x._dist_m > 0 ? ` (a ${num(x._dist_m)} m)` : /@/.test(k) ? '' : ' (no terreno)'); } catch { return null; } })).filter(Boolean) as string[])] : [];
  const salvarT = useSalvar(f);
  const gravar = async () => {
    const v = txt.trim();
    if (v === (f.t.historico_uso ?? '')) return;
    await salvarT({ historico_uso: v || null });
  };
  return (
    <Quadro aba="historico-uso" id="histuso" primeiro titulo="Histórico de uso">
      <div className="sec-b">
        <div className="rs-l"><span className="k">Cadastro de áreas contaminadas (prefeitura e Cetesb)</span><span className="v">
          {!sp ? <span className="faint">Não disponível nesta cidade</span> : !r ? <span className="faint">Sem consulta ao GeoSampa</span>
            : ac.length ? <>{ac.map((v, i) => <span key={v}>{i ? ' ' : ''}<span className="chip warn">{v}</span></span>)}{regs.length ? <> <button className="linkbtn ct-ver" onClick={() => setCtAb(true)}>Ver detalhes</button></> : null}</> : 'Nada cadastrado no terreno nem a até 30 m'}</span></div>
        {ctAb ? <DetalhesContaminacao regs={regs} poly={f.poly} fechar={() => setCtAb(false)} /> : null}
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="hu-t">Pesquisa do histórico</label>
          <textarea id="hu-t" readOnly={!edita} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={gravar}
            placeholder="Fotos aéreas antigas, matrícula, Cetesb, vizinhos: o que funcionou aqui e em volta (posto, indústria, oficina...)" /></div>
      </div>
    </Quadro>
  );
}
