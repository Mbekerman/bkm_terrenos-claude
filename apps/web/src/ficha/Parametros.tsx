/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { m2 } from '../lib/format';
import { CAMADA, geoLinhas, geoVals, type LinhaToca } from '../lib/camadas';
import { consultarArea } from '../novo/consulta';
import type { Ficha, R } from './dados';
import { lerNum, num, numStr, Quadro } from './edicao';

// Aba Parâmetros da ficha (proto.js › abaUrbanismo(t,'param')): Parâmetros urbanísticos por lote e zona (proto_zonas.js ›
// secAnaliseUrb; no banco v_lote_zonas e v_urbanismo_vigente), Restrições e entorno e Histórico de uso (proto_restricoes.js).
// O terreno não guarda tipo de empreendimento: Mercado, HIS e HMP lado a lado (decisão do Moisés, 4/nov/2026).

const TIPOS: [string, string][] = [['mercado', 'Mercado'], ['his', 'HIS'], ['hmp', 'HMP']];
const TIPO_N = Object.fromEntries(TIPOS);
const MACROS: Record<string, string> = { MC: 'Consolidação', ME: 'Estruturação', MOC: 'Ocupação Controlada' };
const EXC_K = ['ca_minimo', 'ca_basico', 'ca_maximo', 'to_maximo', 'gabarito_m', 'gabarito_sem_limite', 'recuo_frente_m', 'recuo_lateral_m', 'recuo_lateral_alto_m',
  'cota_parte_m2', 'max_unidades', 'permeabilidade', 'lote_minimo_m2', 'frente_minima_m', 'outorga_gratuita'];
const EXC_CAMPOS: [string, string][] = [['ca_minimo', 'CA mínimo'], ['ca_basico', 'CA básico'], ['ca_maximo', 'CA máximo'], ['to_maximo', 'Taxa de ocupação'],
  ['recuo_frente_m', 'Recuo de frente (m)'], ['recuo_lateral_m', 'Recuo lateral e de fundo, até 10 m de altura (m)'], ['recuo_lateral_alto_m', 'Recuo lateral e de fundo, acima (m)'],
  ['cota_parte_m2', 'Cota-parte máxima (m²)'], ['max_unidades', 'Unidades por lote'], ['lote_minimo_m2', 'Lote mínimo (m²)'], ['frente_minima_m', 'Frente mínima (m)']];

const ni = <span className="ni">—</span>;
const V = (v: any, suf = '', d = 2): ReactNode => (v == null ? ni : num(v, d) + suf);
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

export default function AbaParametros({ f }: { f: Ficha }) {
  const q = useParam(f);
  if (q.isLoading) return <section className="sec"><div className="sec-b"><div className="muted">Carregando…</div></div></section>;
  if (q.error || !q.data) return <section className="sec"><div className="sec-b"><div className="muted">Não foi possível carregar os parâmetros: {String((q.error as any)?.message ?? q.error)}</div></div></section>;
  return (
    <div className="stack">
      <SecAnalise f={f} d={q.data} />
      <SecRestricoes f={f} d={q.data} />
      <SecHistUso f={f} d={q.data} />
    </div>
  );
}

/* ---------- Parâmetros urbanísticos ---------- */
function SecAnalise({ f, d }: { f: Ficha; d: D }) {
  const { edita } = useSessao();
  const [reg, setReg] = useState(false);
  const sjc = d.base?.codigo === 'geosanja';
  const R = d.res;
  const merc = d.lz.filter((r) => r.tipo === 'mercado');
  /* lotes: os com inscrição pela ordem, a parte sem inscrição por último */
  const lotes = [...new Set(merc.map((r) => r.inscricao_id ?? null))].sort((a, b) => (a === null ? 1 : 0) - (b === null ? 1 : 0)
    || String(merc.find((r) => r.inscricao_id === a)?.inscricao).localeCompare(String(merc.find((r) => r.inscricao_id === b)?.inscricao)));
  const zonasArea = Object.entries(merc.reduce((o: Record<string, number>, z) => ((o[z.sigla] = (o[z.sigla] || 0) + Number(z.area_abrangida_m2 || 0)), o), {})).sort((x, y) => y[1] - x[1]);
  const pot = (k: string) => {
    const L = d.lz.filter((r) => r.tipo === k), na = L.filter((r) => r.parametro_id && r.permitido === false).map((r) => r.sigla), sem = L.filter((r) => r.permitido !== false && r.ca_maximo == null).map((r) => r.sigla);
    const v = R?.[`potencial_${k}_m2`], caMax = Math.max(...L.filter((r) => r.permitido !== false).map((r) => Number(r.ca_maximo ?? -1)));
    return <div className="kv" key={k}><dt>Potencial {TIPO_N[k]}</dt><dd>{v != null ? <b>{m2(v)}</b> : <span className="ni">{na.length ? 'Não admitido em ' + [...new Set(na)].join(', ') : sem.length ? 'Falta o CA de ' + [...new Set(sem)].join(', ') : 'Não calculado'}</span>}
      {caMax > 0 ? <span className="muted"> · maior CA {num(caMax, 3)}</span> : null}</dd></div>;
  };
  const somaLotes = d.ins.reduce((s, i) => s + Number(i.area_cadastral_m2 || 0), 0), sobra = f.area && somaLotes && f.area - somaLotes > 1 ? f.area - somaLotes : null;
  const fontes = [...new Map(d.lz.filter((r) => r.parametro_id).map((r) => [r.parametro_id, d.cat.get(r.parametro_id)] as [unknown, R | undefined]).filter((x) => x[1])).values()] as R[];
  const sig = new Map(d.lz.map((r) => [r.zoneamento_id, r.sigla]));
  return (
    <Quadro aba="parametros" id="analise" primeiro titulo="Parâmetros urbanísticos" aberto={reg || undefined}
      acoes={edita && !reg ? <button className="btn sm zn-reg" aria-label="Registrar zonas" title="Registrar zonas" onClick={() => setReg(true)}><Ic n="add" s={16} /><span className="oc-m">Registrar zonas</span></button> : null}>
      <div className="sec-b">
        {reg ? <FormZonas f={f} d={d} sjc={sjc} fechar={() => setReg(false)} /> : null}
        {d.vig ? <div className="lz-topo"><span className="muted" style={{ fontSize: 13 }}>Zonas vigentes desde {fd(d.vig.data_verificacao)} · {d.vig.fonte}</span></div> : null}
        {R && merc.length ? <>
          <dl className="kvl lz-res">
            <div className="kv"><dt>Zonas da área</dt><dd>{zonasArea.map(([s, v], i) => <span key={s}>{i ? ' · ' : ''}<b>{s}</b> {m2(v)}</span>)}</dd></div>
            {TIPOS.map(([k]) => pot(k))}
            <div className="kv"><dt>Sem outorga (CA básico)</dt><dd>{R.potencial_basico_m2 != null ? m2(R.potencial_basico_m2) : ni}</dd></div>
          </dl>
          {R.tem_parametro_a_validar ? <div className="hint">Há parâmetros a validar no catálogo.</div> : null}
          {lotes.map((ins) => (
            <div className="lz-lote" key={ins ?? 'sem'}>
              <div className="lz-h"><CabLote d={d} ins={ins} /></div>
              {merc.filter((r) => (r.inscricao_id ?? null) === ins).map((z) => <Zona key={z.id} f={f} d={d} z={z} sjc={sjc} />)}
              {ins ? <CamadasLote d={d} ins={ins} /> : null}
            </div>
          ))}
          {d.vig?.observacoes ? <div className="hint">{d.vig.observacoes}</div> : null}
          {sobra && !lotes.includes(null) ? <div className="hint">A área adotada passa a soma das inscrições em {m2(sobra)}. Se essa parte não tem inscrição, registre a zona dela como "Parte sem inscrição".</div> : null}
          <details className="details lz-fontes"><summary>Regras e fontes</summary>
            {fontes.map((p) => <div className="lz-fonte" key={p.id}><b>{sig.get(p.zoneamento_id)}</b>{p.uso ? ' · ' + p.uso : ''}{p.macrozona ? ' · ' + MACROS[p.macrozona] : ''} · {TIPO_N[p.tipo]}
              {p.regras ? <div className="muted">{p.regras}</div> : null}
              <div className="faint">{p.fonte_norma}{p.fonte_dispositivo ? ', ' + p.fonte_dispositivo : ''}{p.fonte_url ? <> · <a href={p.fonte_url} target="_blank" rel="noopener">texto da lei</a></> : null}</div></div>)}
          </details>
        </> : <div className="muted">Nenhuma zona registrada. Incluir o SQL em Terreno › Matrículas e SQLs (consulta do GeoSampa ou GeoSanja) registra as zonas de cada lote; ou registre à mão.</div>}
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
    return cel('CA máximo ' + TIPO_N[k], !q ? ni : x!.permitido === false ? <span className="ni">Não admitido</span> : <b>{V(x!.ca_maximo, '', 3)}</b>, x?.permitido === false ? '' : dica, 'ca_maximo');
  };
  const ogs = TIPOS.map((t) => t[0]).filter((k) => Ls[k]?.permitido !== false && Ls[k]?.parametro_id), og = (k: string) => Ls[k]?.outorga_gratuita;
  const ogTxt = (v: any) => (v === true ? <span className="chip good">Gratuita</span> : v === false ? 'Paga acima do básico' : ni);
  const outorga = new Set(ogs.map(og)).size <= 1 ? ogTxt(og(ogs[0] || 'mercado')) : ogs.map((k) => `${TIPO_N[k]}: ${og(k) === true ? 'gratuita' : og(k) === false ? 'paga' : '—'}`).join(' · ');
  /* a mesma regra em texto nos três tipos aparece uma vez só */
  const regras = Object.entries(TIPOS.reduce((o: Record<string, string[]>, [k]) => { const t = Ls[k]?.regras; if (t) (o[t] ||= []).push(TIPO_N[k]); return o; }, {}));
  const ate = sjc ? 'até o 2º pavimento' : 'até 10 m de altura';
  const recLat = l.recuo_lateral_m == null && l.recuo_lateral_alto_m == null ? ni : l.recuo_lateral_alto_m == null ? num(l.recuo_lateral_m, 2) + ' m'
    : `${l.recuo_lateral_m == null || Number(l.recuo_lateral_m) === 0 ? 'Dispensado' : num(l.recuo_lateral_m, 2) + ' m'} ${ate}; ${num(l.recuo_lateral_alto_m, 2)} m acima`;
  const gab = l.gabarito_sem_limite ? 'Sem limite' : l.gabarito_m != null ? num(l.gabarito_m, 2) + ' m' : ni;
  const area = Number(z.area_abrangida_m2) || 0;
  const corpo = !p ? <div className="muted lz-sem">{sjc && !z.macrozona ? 'Informe a macrozona: em SJC o CA depende dela.' : 'Zona sem parâmetros no catálogo.'}</div>
    : !TIPOS.some(([k]) => Ls[k]?.permitido) ? <div className="muted lz-sem">Uso residencial não admitido{p.regras ? ': ' + p.regras : ''}</div>
    : <>
      <dl className="lz-par">
        {TIPOS.map(([k]) => caTipo(k))}
        {cel('CA básico', V(l.ca_basico, '', 3), l.potencial_basico_m2 != null ? `sem outorga ${m2(l.potencial_basico_m2)}` : '', 'ca_basico')}
        {cel('CA mínimo', V(l.ca_minimo, '', 3), '', 'ca_minimo')}
        {cel('Taxa de ocupação', V(l.to_maximo, '', 2), p.to_corte_m2 ? `${num(p.to_maximo, 2)} em lote até ${num(p.to_corte_m2)} m²; ${num(p.to_lote_grande, 2)} acima${f.area == null ? ' (sem área adotada, vale a de lote grande)' : ''}` : '', 'to_maximo')}
        {cel('Gabarito', gab, '', alt.has('gabarito_sem_limite') ? 'gabarito_sem_limite' : 'gabarito_m')}
        {cel('Recuo de frente', V(l.recuo_frente_m, ' m'), '', 'recuo_frente_m')}
        {cel('Recuos laterais e fundo', recLat, '', alt.has('recuo_lateral_m') ? 'recuo_lateral_m' : 'recuo_lateral_alto_m')}
        {cel('Cota-parte máxima', l.cota_parte_m2 != null ? num(l.cota_parte_m2) + ' m² por unidade' : ni, l.cota_parte_m2 != null && area ? `até ${num(Math.floor(area / Number(l.cota_parte_m2)))} unidades nesta área` : '', 'cota_parte_m2')}
        {l.max_unidades != null ? cel('Unidades por lote', num(l.max_unidades), '', 'max_unidades') : null}
        {cel('Permeabilidade mínima', P(l.permeabilidade), '', 'permeabilidade')}
        {cel('Lote mínimo', V(l.lote_minimo_m2, ' m²', 0), '', 'lote_minimo_m2')}
        {cel('Frente mínima', V(l.frente_minima_m, ' m'), '', 'frente_minima_m')}
        {cel('Outorga onerosa', outorga, '', 'outorga_gratuita')}
      </dl>
      {regras.map(([t, ks]) => <div className="lz-regra" key={t}>{regras.length > 1 ? <b>{ks.join(', ')}: </b> : null}{t}</div>)}
    </>;
  return (
    <div className="lz-z" id={`lz-${z.id}`}>
      <div className="lz-zh"><b>{z.sigla}</b><span className="muted">{m2(z.area_abrangida_m2)}</span>{mk}
        {edita && !ed ? <button className="linkbtn lz-zb" onClick={() => setEd(true)}>{alt.size ? 'Editar valores' : 'Alterar valores'}</button> : null}</div>
      {corpo}
      {ed ? <FormExc f={f} raw={raw} p={p} sjc={sjc} z={z} fechar={() => setEd(false)} /> : null}
    </div>
  );
}

/** Alterar valores do lote: vazio segue o catálogo; o que mudar precisa da fonte (decisão do Moisés, 25/out/2026) */
function FormExc({ f, raw, p, sjc, z, fechar }: { f: Ficha; raw: R; p: R | null | undefined; sjc: boolean; z: R; fechar: () => void }) {
  const qc = useQueryClient(), toast = useToast();
  const [v, setV] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(EXC_CAMPOS.map(([k]) => [k, numStr(raw[k])])),
    permeabilidade: raw.permeabilidade != null ? numStr(Math.round(raw.permeabilidade * 1000) / 10, 1) : '',
    gabSt: raw.gabarito_sem_limite ? 'sem' : raw.gabarito_m != null ? 'limitado' : '', gab: numStr(raw.gabarito_m),
    outorga: raw.outorga_gratuita == null ? '' : raw.outorga_gratuita ? '1' : '0', fonte: raw.excecao_fonte ?? '', macro: z.macrozona ?? '',
  }));
  const [grav, setGrav] = useState(false);
  const m = (k: string) => (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value }));
  const base = (k: string) => (p ? ({ ca_maximo: p.ca_maximo, to_maximo: p.to_corte_m2 && f.area != null && f.area >= p.to_corte_m2 ? p.to_lote_grande : p.to_maximo } as R)[k] ?? p[k] : null);
  const ph = (x: any) => (x == null ? 'A lei não fixa' : 'Catálogo: ' + num(x, 3));
  const salvar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (grav) return;
    const e: R = Object.fromEntries(EXC_CAMPOS.map(([k]) => [k, lerNum(v[k])]));
    const pm = lerNum(v.permeabilidade); e.permeabilidade = pm == null ? null : Math.round(pm * 10) / 1000;
    e.gabarito_m = v.gabSt === 'limitado' ? lerNum(v.gab) : null; e.gabarito_sem_limite = v.gabSt === 'sem' ? true : v.gabSt === 'limitado' ? false : null;
    e.outorga_gratuita = v.outorga === '' ? null : v.outorga === '1';
    if (v.gabSt === 'limitado' && !(e.gabarito_m > 0)) { toast('Informe o gabarito limitado.'); return; }
    if (e.to_maximo != null && !(e.to_maximo > 0 && e.to_maximo <= 1)) { toast('Taxa de ocupação vai de 0 a 1.'); return; }
    if (e.permeabilidade != null && !(e.permeabilidade > 0 && e.permeabilidade <= 1)) { toast('Permeabilidade vai de 0 a 100%.'); return; }
    if (['ca_minimo', 'ca_basico', 'ca_maximo', 'cota_parte_m2', 'max_unidades', 'lote_minimo_m2', 'frente_minima_m'].some((k) => e[k] != null && !(e[k] > 0))) { toast('CA, cota-parte, unidades, lote e frente: número maior que zero, ou vazio para seguir o catálogo.'); return; }
    if (['recuo_frente_m', 'recuo_lateral_m', 'recuo_lateral_alto_m'].some((k) => e[k] != null && e[k] < 0)) { toast('Recuo não pode ser negativo.'); return; }
    const tem = EXC_K.some((k) => e[k] != null);
    if (tem && !v.fonte.trim()) { toast('Alteração só com a fonte.'); return; }
    e.excecao_fonte = tem ? v.fonte.trim() : null;
    if (sjc) e.macrozona = v.macro || null;
    setGrav(true);
    try {
      const r = await supabase.from('analise_zoneamentos').update(e).eq('id', z.id);
      if (r.error) throw r.error;
      await qc.invalidateQueries({ queryKey: ['parametros', f.id] });
      toast('Salvo.'); fechar();
    } catch (er: any) { toast(er?.message ?? String(er)); } finally { setGrav(false); }
  };
  return (
    <form className="lz-exc" onSubmit={salvar}><div className="editgrid">
      {sjc ? <div className="field"><label htmlFor={`ze-m${z.id}`}>Macrozona</label><select id={`ze-m${z.id}`} value={v.macro} onChange={m('macro')}><option value="">Não informada</option>{Object.entries(MACROS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div> : null}
      {EXC_CAMPOS.map(([k, l]) => <div className="field" key={k}><label htmlFor={`ze-${k}${z.id}`}>{l}</label>
        <input id={`ze-${k}${z.id}`} inputMode="decimal" data-fmt={k === 'max_unidades' ? 'int' : 'num'} value={v[k]} onChange={m(k)} placeholder={ph(base(k))} /></div>)}
      <div className="field"><label htmlFor={`ze-pm${z.id}`}>Permeabilidade mínima (%)</label><input id={`ze-pm${z.id}`} inputMode="decimal" data-fmt="pct" value={v.permeabilidade} onChange={m('permeabilidade')}
        placeholder={p?.permeabilidade != null ? 'Catálogo: ' + num(p.permeabilidade * 100, 0) + '%' : 'A lei não fixa'} /></div>
      <div className="field"><label htmlFor={`ze-g${z.id}`}>Gabarito</label><select id={`ze-g${z.id}`} value={v.gabSt} onChange={m('gabSt')}><option value="">Segue o catálogo</option><option value="limitado">Limitado</option><option value="sem">Sem limite</option></select></div>
      <div className="field"><label htmlFor={`ze-gv${z.id}`}>Gabarito (m)</label><input id={`ze-gv${z.id}`} inputMode="decimal" data-fmt="num" value={v.gab} onChange={m('gab')} disabled={v.gabSt !== 'limitado'} /></div>
      <div className="field"><label htmlFor={`ze-o${z.id}`}>Outorga onerosa</label><select id={`ze-o${z.id}`} value={v.outorga} onChange={m('outorga')}><option value="">Segue o catálogo</option><option value="1">Gratuita</option><option value="0">Paga acima do básico</option></select></div>
      <div className="field full"><label htmlFor={`ze-f${z.id}`}>Fonte da alteração</label><input id={`ze-f${z.id}`} value={v.fonte} onChange={m('fonte')} placeholder="Consulta prévia, operação urbana, certidão, projeto aprovado..." /></div>
    </div>
      <div className="sec-f" style={{ padding: '12px 0 0' }}><button type="button" className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" disabled={grav}>Salvar</button></div>
    </form>
  );
}

/** Registrar zonas à mão: o lote (ou a parte sem inscrição), a fonte e até 3 zonas com a área */
function FormZonas({ f, d, sjc, fechar }: { f: Ficha; d: D; sjc: boolean; fechar: () => void }) {
  const qc = useQueryClient(), toast = useToast();
  const [lote, setLote] = useState(d.ins[0]?.id ?? '');
  const [fonte, setFonte] = useState('');
  const [zs, setZs] = useState([0, 1, 2].map(() => ({ sigla: '', area: '', macro: '' })));
  const [grav, setGrav] = useState(false);
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
      toast(r.data ? 'Zonas registradas. A análise anterior foi preservada.' : 'As zonas deste lote já eram essas.'); fechar();
    } catch (er: any) { toast(er?.message ?? String(er)); } finally { setGrav(false); }
  };
  return (
    <form style={{ marginTop: 12 }} onSubmit={salvar} ref={(el) => { if (el && !el.dataset.visto) { el.dataset.visto = '1'; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); } }}>
      <div className="editgrid">
        <div className="field"><label htmlFor="an-l">Lote</label><select id="an-l" value={lote} onChange={(e) => setLote(e.target.value)}>
          {d.ins.map((i) => <option key={i.id} value={i.id}>{d.base?.rotulo ?? 'Inscrição'} {i.inscricao}</option>)}<option value="">Parte sem inscrição (pela poligonal)</option></select></div>
        <div className="field"><label htmlFor="an-f">Fonte</label><input id="an-f" required value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="GeoSampa, certidão de uso do solo..." /></div>
      </div>
      {zs.map((z, i) => (
        <div className="editgrid" key={i} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--linha)' }}>
          <div className="field"><label htmlFor={`z${i}`}>Zona {i + 1}{i ? ' (opcional)' : ''}</label><select id={`z${i}`} required={!i} value={z.sigla} onChange={(e) => mz(i, 'sigla', e.target.value)}>
            <option value="">—</option>{d.zonas.map((x) => <option key={x.id}>{x.sigla}</option>)}</select></div>
          <div className="field"><label htmlFor={`za${i}`}>Área da zona no lote (m²)</label><input id={`za${i}`} inputMode="decimal" value={z.area} onChange={(e) => mz(i, 'area', e.target.value)} /></div>
          {sjc ? <div className="field"><label htmlFor={`zm${i}`}>Macrozona</label><select id={`zm${i}`} value={z.macro} onChange={(e) => mz(i, 'macro', e.target.value)}><option value="">Não informada</option>{Object.entries(MACROS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div> : null}
        </div>
      ))}
      <div className="sec-f" style={{ padding: '12px 0 0' }}><button type="button" className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" disabled={grav}>Registrar zonas</button></div>
    </form>
  );
}

/** Lista "O que toca o lote" */
function Toca({ linhas, titulo }: { linhas: LinhaToca[]; titulo: ReactNode }) {
  const toca = linhas.filter((l) => l.vals.length), nada = linhas.filter((l) => !l.vals.length && !l.erro), falhou = linhas.filter((l) => l.erro);
  return (
    <div className="geo-toca"><div className="geo-st">{titulo}</div>
      {toca.length ? toca.map((l) => <div className="geo-l" key={l.tema}><span className="k">{l.tema}</span><span className="v">{l.vals.map((v) => <span key={v} className={`chip ${l.grav}`}>{v}</span>).reduce((a: ReactNode[], x, i) => (i ? [...a, ' ', x] : [x]), [])}</span></div>)
        : <div className="muted">Nenhuma restrição nem perímetro especial.</div>}
      {nada.length ? <div className="hint" style={{ marginTop: 6 }}>Não toca: {nada.map((l) => l.tema).join(', ')}.</div> : null}
      {falhou.length ? <div className="hint" style={{ color: 'var(--crit-tx,#b3261e)' }}>Não responderam nesta consulta: {falhou.map((l) => l.tema).join(', ')}.</div> : null}
    </div>
  );
}

/** abaixo das zonas do lote, as demais camadas da última consulta do lote */
function CamadasLote({ d, ins }: { d: D; ins: string }) {
  const g = d.ultLote.get(ins);
  if (!g) return <div className="hint lz-cam">Sem consulta à prefeitura neste lote (tombamento, ZEIS, mananciais e outras restrições).</div>;
  if (g.base !== 'geosampa') return null;
  return <div className="lz-cam"><Toca linhas={geoLinhas(g.camadas || {}, g.camadas_com_erro || [])}
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
    ['Vila a até 20 m', { k: ['enquadramento_vila'] }],
    ['Linha de alta tensão a até 30 m', { k: ['linha_alta_tensao_v2', 'linha_subterranea_alta_tensao'] }],
    ['Ferrovia a até 30 m', { k: ['ferrovia_mdc_v2'] }],
    ['Rede da Comgás', { k: ['rede_comgas'], info: 1, vazio: 'Nenhuma a até 100 m' }]]],
  ['Riscos e interferências', [
    ['Risco geológico', { k: ['area_risco_geologico_v2'] }],
    ['Restrição geotécnica', { k: ['restricao_geotecnica'] }],
    ['Influência do Metrô ou da CPTM', { k: ['area_influencia_metro', 'area_influencia_trem'] }]]]];

interface Rest { fonte: 'poligonal' | 'lotes'; n?: number; em: string; user: string | null; camadas: Record<string, any[]>; erros: string[] }
/** a consulta pela poligonal ou, sem ela, a soma das consultas dos lotes (árvores e redes sem repetir) */
function restDados(d: D): Rest | null {
  if (d.area) return { fonte: 'poligonal', em: d.area.consultado_em, user: d.nomes.get(d.area.consultado_por) ?? null, camadas: d.area.camadas || {}, erros: d.area.camadas_com_erro || [] };
  const gs = [...d.ultLote.values()].filter((g) => g.base === 'geosampa');
  if (!gs.length) return null;
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
  const ult = gs.slice().sort((a, b) => String(b.consultado_em).localeCompare(String(a.consultado_em)))[0];
  return { fonte: 'lotes', n: gs.length, em: ult.consultado_em, user: d.nomes.get(ult.consultado_por) ?? null, camadas, erros: [...erros] };
}

function SecRestricoes({ f, d }: { f: Ficha; d: D }) {
  const { edita } = useSessao();
  const qc = useQueryClient(), toast = useToast();
  const [busc, setBusc] = useState(false);
  const sp = d.base?.codigo === 'geosampa', r = sp ? restDados(d) : null;
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
  if (!sp) return <Quadro aba="parametros" id="rest" titulo="Restrições e entorno"><div className="sec-b"><div className="muted">Não disponível nesta cidade. O que a prefeitura traz está em cada lote, acima.</div></div></Quadro>;
  const orig = r ? (r.fonte === 'poligonal' ? `GeoSampa pela poligonal do terreno, ${fdh(r.em)}${r.user ? ' por ' + r.user : ''}` : `GeoSampa por ${r.n} lote${r.n! > 1 ? 's' : ''} (inscrições), último em ${fdh(r.em)}`) : '';
  const linha = ([tema, o]: Item) => {
    const cel = (v: ReactNode) => <div className="rs-l" key={tema}><span className="k">{tema}</span><span className="v">{v}</span></div>;
    if (o.pa) { const q = r?.camadas.quota_ambiental; return cel(q && q.length ? <><b>{q.map((x) => x.pa).join(' / ')}</b><span className="faint rs-src">Lei 16.402/2016, Mapa 3</span></> : <span className="faint">{r ? 'Fora dos perímetros' : '—'}</span>); }
    if (!r) return cel(<span className="faint">—</span>);
    const ks = o.sn ? [o.sn] : o.k!, erro = ks.some((k) => r.erros.includes(k)), vals = [...new Set(ks.flatMap((k) => geoVals(k, r.camadas[k])))];
    const grav = o.grav || CAMADA[ks[0]]?.[3] || '';
    if (o.sn) return cel(vals.length ? <><span className={`chip ${grav}`}>Sim</span> <span className="faint">{vals.join(', ')}</span></> : erro ? <span className="faint">Não respondeu</span> : 'Não');
    if (!vals.length) return cel(erro ? <span className="faint">Não respondeu</span> : o.vazio || 'Não');
    return cel(vals.map((v, i) => <span key={v}>{i ? ' ' : ''}<span className={`chip ${o.info ? '' : grav}`}>{v}</span></span>));
  };
  return (
    <Quadro aba="parametros" id="rest" titulo="Restrições e entorno" acoes={acoes}>
      <div className="sec-b">
        <div className="hint rs-fonte">{r ? orig : f.poly ? 'Sem consulta ao GeoSampa: consulte pela poligonal ou inclua os SQLs em Terreno › Matrículas e SQLs.' : 'Desenhe a poligonal do terreno para consultar.'}</div>
        {REST_GRUPOS.map(([g, itens]) => <div className="rs-g" key={g}><div className="rs-gt">{g}</div>{itens.map(linha)}</div>)}
      </div>
    </Quadro>
  );
}

/* ---------- Histórico de uso ---------- */
function SecHistUso({ f, d }: { f: Ficha; d: D }) {
  const { edita } = useSessao();
  const qc = useQueryClient(), toast = useToast();
  const sp = d.base?.codigo === 'geosampa', r = sp ? restDados(d) : null;
  const [txt, setTxt] = useState<string>(f.t.historico_uso ?? '');
  const ks = ['area_contaminada_reabilitada_svma', 'GEOSAMPA_area_contaminada_sigac', 'area_contaminada_reabilitada_svma@30', 'GEOSAMPA_area_contaminada_sigac@30'];
  const ac = r ? [...new Set(ks.flatMap((k) => (r.camadas[k] || []).map((x) => { try { return CAMADA[k][2](x) + (x._dist_m > 0 ? ` (a ${num(x._dist_m)} m)` : /@/.test(k) ? '' : ' (no terreno)'); } catch { return null; } })).filter(Boolean) as string[])] : [];
  const gravar = async () => {
    const v = txt.trim();
    if (v === (f.t.historico_uso ?? '')) return;
    const x = await supabase.rpc('salvar_terreno', { p_terreno: f.id, p_versao: f.versao, p_dados: { historico_uso: v || null } });
    if (x.error) { toast(x.error.message); if (x.error.code === '40001') qc.invalidateQueries({ queryKey: ['ficha'] }); return; }
    await qc.invalidateQueries({ queryKey: ['ficha'] });
    toast('Salvo.');
  };
  return (
    <Quadro aba="parametros" id="histuso" titulo="Histórico de uso">
      <div className="sec-b">
        <div className="rs-l"><span className="k">Cadastro de áreas contaminadas (prefeitura e Cetesb)</span><span className="v">
          {!sp ? <span className="faint">Não disponível nesta cidade</span> : !r ? <span className="faint">Sem consulta ao GeoSampa</span>
            : ac.length ? ac.map((v, i) => <span key={v}>{i ? ' ' : ''}<span className="chip warn">{v}</span></span>) : 'Nada cadastrado no terreno nem a até 30 m'}</span></div>
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="hu-t">Pesquisa do histórico</label>
          <textarea id="hu-t" readOnly={!edita} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={gravar}
            placeholder="Fotos aéreas antigas, matrícula, Cetesb, vizinhos: o que funcionou aqui e em volta (posto, indústria, oficina...)" /></div>
      </div>
    </Quadro>
  );
}
