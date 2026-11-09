/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { LapisMapa } from '../novo/TrocarEndereco';
import { atualizarFrentes, FONTE_FRENTES } from '../novo/frentes';
import { GEO_BASE } from '../novo/geosampa';
import { reais as brl, m2 } from '../lib/format';
import { Adorno, metros } from '../lib/mascara';
import { ehSP, type Ficha, type R } from './dados';
import PartesLotes from './Partes';
import SecParametros from './Parametros';
import {
  CampoVivo, fmtCampo, lerNum, num, OPT, Quadro, SECOES, useListas, useSalvar, useVivo, valoresDe,
  type VivoProps, abrirQuadro, focar, tomarPedido,
} from './edicao';

// Aba Terreno da ficha (proto.js › abaCadastro): Identificação, Endereço e localização, Áreas e dimensões, Características
// físicas e Proprietários e contatos; Partes e Matrículas e SQLs (etiquetas) em Partes.tsx.

const ni = <span className="v ni">Não informado</span>;

/** campos do endereço que só mudam pelo mapa (Editar no mapa: poligonal e pino) */
const END_MAPA = ['cep', 'logradouro', 'bairro', 'municipio_id'];
/** número de porta de cada SQL do terreno, pelo endereço da prefeitura ("R BRESSER, 120" → "120") */
async function numerosDosLotes(terreno: string): Promise<{ sql: string; n: string }[]> {
  const { data } = await supabase.from('inscricoes_municipais').select('inscricao,endereco_prefeitura').eq('terreno_id', terreno);
  return ((data ?? []) as R[]).map((x) => ({ sql: x.inscricao as string, n: (/,\s*(\d+[A-Za-z]?)\b/.exec(x.endereco_prefeitura ?? '')?.[1] ?? '').replace(/^0+(?=\d)/, '') })).filter((x) => x.n);
}

/* lendo ou editando, a mesma grade no mesmo lugar: quem edita já vê o valor como campo, sem Editar nem Salvar, e cada
   campo grava ao sair dele (pedidos do Moisés, 5 e 6/nov/2026) */
function SecGenerica({ f, id, primeiro }: { f: Ficha; id: 'ident' | 'loc' | 'fis'; primeiro?: boolean }) {
  const { edita } = useSessao();
  const listas = useListas().data;
  const salvarT = useSalvar(f);
  const s = SECOES[id], t = f.t;
  /* o número é só informativo (não mexe no pino nem na poligonal); diferente dos números de porta dos SQLs, pergunta antes
     (pedido do Moises, 6/nov/2026) */
  const [conf, setConf] = useState<{ n: string; lotes: { sql: string; n: string }[]; ok: (b: boolean) => void } | null>(null);
  const salvarNum = async (d: R) => {
    const n = String(d.numero ?? '').trim().replace(/^0+(?=\d)/, '');
    if (n) {
      const lotes = await numerosDosLotes(f.id);
      if (lotes.length && !lotes.some((l) => l.n.toLowerCase() === n.toLowerCase())) {
        const ok = await new Promise<boolean>((res) => setConf({ n, lotes, ok: res }));
        setConf(null);
        if (!ok) return false;
      }
    }
    return salvarT(d);
  };
  const vis = s.campos.filter((c) => !['latitude', 'longitude'].includes(c[0]));
  return (
    <Quadro aba="terreno" id={id} primeiro={primeiro} titulo={s.titulo}
      acoes={edita && id === 'loc' ? <div className="qd-acoes"><LapisMapa codigo={f.codigo} id="f-end-mapa" className="btn sm text" rotulo="Editar no mapa" /></div> : undefined}>
      <div className="sec-b"><div className={`kvg${edita ? ' kvg-ed vivo' : ''}`}>{vis.map((c) => {
        /* o endereço não se edita na ficha: muda pelo mapa, com a poligonal e o pino (pedido do Moises, 6/nov/2026) */
        const so = id === 'loc' && END_MAPA.includes(c[0]);
        if (edita && !so) return <CampoVivo key={c[0]} f={f} c={c} listas={listas} salvar={c[0] === 'numero' ? salvarNum : salvarT} />;
        const v = fmtCampo(f, c, listas);
        return <div key={c[0]} className={`${c[4] || ''}${so && edita ? ' kv-so' : ''}`}><div className="k">{c[1]}</div>{v == null ? ni : <div className="v">{v}</div>}</div>;
      })}</div>
        {id === 'fis' && t.area_construida_existente_m2 != null && t.area_construida_demolir_m2 != null && +t.area_construida_demolir_m2 < +t.area_construida_existente_m2
          && <div className="hint" style={{ marginTop: 10 }}>Demolição parcial: {m2(t.area_construida_existente_m2 - t.area_construida_demolir_m2)} permanecem.</div>}</div>
      {conf && (
        <Dialogo titulo="Número diferente do cadastro da prefeitura" onFechar={() => conf.ok(false)}
          rodape={<><button className="btn text" onClick={() => conf.ok(false)}>Cancelar</button><button className="btn primary" onClick={() => conf.ok(true)}>Alterar mesmo assim</button></>}>
          <p style={{ marginTop: 0 }}>O número informado ({conf.n}) diverge dos números cadastrados no município para os lotes selecionados:</p>
          <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>{conf.lotes.map((l) => <li key={l.sql}><span className="num">{l.sql}</span>: nº {l.n}</li>)}</ul>
          <p style={{ marginBottom: 0 }}>Tem certeza que quer alterar? O número é só informativo: o pino e a poligonal não mudam.</p>
        </Dialogo>
      )}
    </Quadro>
  );
}

const AREAS: [string, string, string, string][] = [['area_documental_m2', 'Documental', 'documental', 'matrícula'], ['area_cadastral_m2', 'Cadastral', 'cadastral', 'IPTU'],
  ['area_levantamento_m2', 'Levantamento', 'levantamento', 'topografia'], ['estimativa', 'Estimativa', 'estimativa', 'sem documento']];
/** a estimativa não tem coluna própria: é a área adotada quando a fonte é a estimativa */
const estimativa = (t: R) => (t.fonte_area_adotada === 'estimativa' ? t.area_adotada_m2 : null);
export const valoresArea = (t: R): Record<string, string> => ({ ...valoresDe(t, ['area_documental_m2', 'area_cadastral_m2', 'area_levantamento_m2', 'testada_principal_m', 'fonte_area_adotada']),
  estimativa: estimativa(t) == null ? '' : String(estimativa(t)).replace('.', ',') });
/** áreas do formulário → dados; a área adotada é a da fonte escolhida (a da poligonal o banco calcula) */
export function dadosArea(f: Ficha, v: Record<string, string>): R | string {
  const d: R = {
    area_documental_m2: lerNum(v.area_documental_m2), area_cadastral_m2: lerNum(v.area_cadastral_m2), area_levantamento_m2: lerNum(v.area_levantamento_m2),
    testada_principal_m: lerNum(v.testada_principal_m),
  };
  for (const k of Object.keys(d)) if (d[k] != null && !(d[k] > 0)) return 'As áreas e a testada precisam ser maiores que zero.';
  const fonte = v.fonte_area_adotada || null, est = lerNum(v.estimativa);
  if (est != null && !(est > 0)) return 'As áreas e a testada precisam ser maiores que zero.';
  d.fonte_area_adotada = fonte;
  if (!fonte) d.area_adotada_m2 = null;
  else if (fonte === 'poligonal') { if (!f.poly) return 'O terreno não tem poligonal.'; d.area_adotada_m2 = f.t.area_adotada_m2 ?? 1; }
  else {
    const a = fonte === 'estimativa' ? est : d[`area_${fonte}_m2`];
    if (a == null) return `Preencha a área ${OPT.fonteArea[fonte].split(' (')[0].toLowerCase()} ou escolha outra fonte.`;
    d.area_adotada_m2 = a;
  }
  return d;
}
export const fonteSel = (id: string, p: VivoProps, opts: [string, string][], vazio: string) => (
  <select id={id} {...p}><option value="">{vazio}</option>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
);

/** a área de uma fonte editada no lugar, dentro do cartão dela */
function AreaVivo({ f, k, l }: { f: Ficha; k: string; l: string }) {
  const salvarT = useSalvar(f), toast = useToast(), t = f.t;
  const ini = valoresArea(t)[k];
  const { props } = useVivo(ini, (v) => {
    const vals = { ...valoresArea(t), [k]: v };
    /* a estimativa não tem coluna: digitar é adotá-la; apagar a adotada deixa o terreno sem área adotada */
    if (k === 'estimativa') vals.fonte_area_adotada = v.trim() ? 'estimativa' : t.fonte_area_adotada === 'estimativa' ? '' : vals.fonte_area_adotada;
    else if (!v.trim() && t.fonte_area_adotada === k.replace(/^area_|_m2$/g, '')) vals.fonte_area_adotada = '';
    /* área do levantamento topográfico digitada vira a adotada; a pessoa pode trocar depois (pedido do Moisés, 6/nov/2026) */
    else if (k === 'area_levantamento_m2' && v.trim()) vals.fonte_area_adotada = 'levantamento';
    const d = dadosArea(f, vals);
    if (typeof d === 'string') { toast(d); return false; }
    return salvarT(d);
  });
  return <Adorno t="m2"><input className="av inl" id={`f-${k}`} inputMode="decimal" placeholder="—" aria-label={`Área ${l.toLowerCase()}`} {...props} /></Adorno>;
}
/** fora de São Paulo a testada se digita (não há os lotes da prefeitura para medir; pedido do Moises, 9/nov/2026) */
function TestadaVivo({ f }: { f: Ficha }) {
  const salvarT = useSalvar(f), toast = useToast();
  const { props } = useVivo(metros(f.t.testada_principal_m), (v) => {
    const n = lerNum(v);
    if (n != null && !(n > 0)) { toast('A testada precisa ser maior que zero.'); return false; }
    return salvarT({ testada_principal_m: n });
  });
  return <div className="inl-c"><label className="k" htmlFor="f-testada_principal_m">Testada principal</label>
    <Adorno t="m"><input id="f-testada_principal_m" inputMode="decimal" data-fmt="m" placeholder="Não informada" {...props} /></Adorno></div>;
}

/* ---------- Frentes (pedido do Moises, 8/nov/2026) ----------
   O terreno inteiro sai da poligonal: as ruas que ela encosta, a testada em cada uma e se é esquina (novo/frentes.ts).
   Medidas sozinhas em São Paulo ao abrir a ficha sem medição e a cada poligonal nova. */
const TENTADO = new Set<string>();   // terreno|poligonal já tentados nesta sessão (fora de SP não há o que medir)
function useFrentes(f: Ficha) {
  const { edita } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['ficha-frentes', f.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('confrontacoes').select('id,ordem,comprimento_m,confrontante,fonte,observacoes').eq('terreno_id', f.id).eq('tipo', 'frente').order('ordem');
      if (error) throw error;
      return (data ?? []) as R[];
    },
  });
  const [medindo, setMedindo] = useState(false);
  const medir = () => { setMedindo(true); atualizarFrentes(f.id).catch((e) => console.warn('frentes', e)).finally(() => setMedindo(false)); };
  /* depois de medir (aqui, no mapa ou no cadastro), a lista e a ficha se refazem */
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail === f.id) { qc.invalidateQueries({ queryKey: ['ficha-frentes', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); } };
    window.addEventListener('frentes-medidas', h);
    return () => window.removeEventListener('frentes-medidas', h);
  }, [f.id, qc]);
  /* sem medição ainda, ou com a poligonal trocada aqui na ficha (SQLs, desenho), mede de novo */
  const pol = JSON.stringify(f.poly ?? null), antes = useRef<string | null>(null);
  useEffect(() => {
    if (!edita || !ehSP(f) || !GEO_BASE || !f.poly || !q.data) return;
    const mudou = antes.current != null && antes.current !== pol;
    antes.current = pol;
    const k = f.id + '|' + pol;
    if ((mudou || !q.data.some((c) => c.fonte === FONTE_FRENTES)) && !TENTADO.has(k)) { TENTADO.add(k); medir(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pol, q.data, edita]);
  return { lista: (q.data ?? []).filter((c) => c.confrontante), medindo };
}

function Frentes({ f }: { f: Ficha }) {
  const { lista, medindo } = useFrentes(f);
  const t = f.t, pos = OPT.posicao[t.posicao_quadra] ?? null;
  const medidas = lista.some((c) => c.fonte === FONTE_FRENTES);
  return (
    <div className="frentes" id="frentes">
      <div className="kvg" style={{ marginTop: 14 }}>
        <div><div className="k">Posição na quadra</div>{pos && t.posicao_quadra !== 'nao_informado' ? <div className="v">{pos}</div> : <span className="v ni">{medindo ? 'Medindo...' : 'Não informada'}</span>}</div>
        <div className="full"><div className="k">Frentes{lista.length > 1 ? ` (${lista.length})` : ''}</div>
          {lista.length ? <ul className="fr-l">{lista.map((c) => (
            <li key={c.id}><span>{c.confrontante}{c.observacoes === 'Acesso principal' ? <span className="faint"> · acesso principal</span> : null}</span>
              <span className="num">{c.comprimento_m != null ? `${metros(c.comprimento_m)} m` : '—'}</span></li>))}</ul>
            : <span className="v ni">{medindo ? 'Medindo pela poligonal...' : 'Não informadas'}</span>}
        </div>
      </div>
      {medidas && <div className="hint" style={{ marginTop: 8 }}>Medidas pela poligonal sobre os lotes e as ruas da prefeitura (GeoSampa). Na esquina, o canto conta para as duas ruas.</div>}
    </div>
  );
}

function SecAreas({ f }: { f: Ficha }) {
  const { edita } = useSessao();
  const t = f.t, ad = t.area_adotada_m2 as number | null, apol = t.area_poligonal_m2 as number | null;
  const cards: [number | null, string, string, string][] = [...AREAS.map(([k, l, fo, s]) => [k === 'estimativa' ? estimativa(t) : t[k], l, fo, s] as [number | null, string, string, string]),
    [apol, 'Poligonal', 'poligonal', 'desenho']];
  const pre = cards.map((c) => c[0]).filter((v): v is number => v != null).map(Number);
  let div: ReactNode = null;
  if (pre.length > 1) {
    const mx = Math.max(...pre), mn = Math.min(...pre);
    if ((mx - mn) / mx > 0.01) div = <div className="diverg"><Ic n="warn" s={16} />Diferença de {m2(mx - mn)} ({num(((mx - mn) / mx) * 100, 1)}%) entre as fontes. Confira qual entra na viabilidade.</div>;
  }
  /* clicar numa área preenchida a escolhe como adotada e grava na hora (pedido do Moisés, 5/nov/2026) */
  const salvarT = useSalvar(f);
  const [grav, setGrav] = useState(false);
  const fonte = t.fonte_area_adotada;
  /* em São Paulo a cadastral não se digita: é a soma das áreas dos SQLs (GeoSampa); uma digitada antes volta para a soma
     (pedido do Moises, 9/nov/2026; apagar a cadastral faz o banco refazer a soma) */
  const sp = ehSP(f), voltou = useRef('');
  useEffect(() => {
    if (!edita || !sp || t.area_cadastral_origem !== 'digitada' || voltou.current === f.id) return;
    voltou.current = f.id;
    salvarT({ area_cadastral_m2: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edita, sp, t.area_cadastral_origem, f.id]);
  const escolher = async (fo: string) => {
    if (grav || fo === t.fonte_area_adotada) return;
    const d = dadosArea(f, { ...valoresArea(t), fonte_area_adotada: fo });
    if (typeof d === 'string') return;
    setGrav(true);
    try { await salvarT({ fonte_area_adotada: d.fonte_area_adotada, area_adotada_m2: d.area_adotada_m2 }); } finally { setGrav(false); }
  };
  return (
    <Quadro aba="terreno" id="areas" titulo="Áreas e dimensões">
      <div className="sec-b">
        <div className="areas">{cards.map(([v, l, fo, s], i) => {
          const k = i < AREAS.length ? AREAS[i][0] : '', pode = edita && v != null, sel = fonte === fo;
          return (
            <div key={fo} className={`area${sel ? ' sel' : ''}${pode ? ' pode' : ''}`} id={`area-${fo}`}
              role={pode ? 'radio' : undefined} aria-checked={pode ? sel : undefined} tabIndex={pode ? 0 : undefined}
              title={pode && !sel ? 'Usar como área adotada' : fo === 'poligonal' ? 'Calculada pelo desenho; muda quando a poligonal é ajustada' : sp && fo === 'cadastral' ? 'Soma das áreas cadastrais dos SQLs (GeoSampa)' : undefined}
              onClick={(ev) => { if (pode && !(ev.target as HTMLElement).closest('input')) escolher(fo); }}
              onKeyDown={(ev) => { if (pode && (ev.key === 'Enter' || ev.key === ' ') && !(ev.target as HTMLElement).closest('input')) { ev.preventDefault(); escolher(fo); } }}>
              <div className="al">{l} <span className="faint">· {fo === 'cadastral' && v != null ? (t.area_cadastral_origem === 'digitada' ? 'digitada' : 'soma dos SQLs') : s}</span></div>
              {edita && fo !== 'poligonal' && !(sp && fo === 'cadastral')
                ? <AreaVivo f={f} k={k} l={l} />
                : <div className="av">{v == null ? <span className="faint" style={{ fontSize: 14, fontStyle: 'italic' }}>{fo === 'poligonal' ? 'Sem poligonal' : sp && fo === 'cadastral' ? 'Sem área nos SQLs' : 'Não informada'}</span> : m2(v)}</div>}
              <div className="as">{sel ? <><Ic n="check" s={14} />Área adotada</> : '\u00a0'}</div>
            </div>
          );
        })}</div>
        {div}
        <div className={`kvg${edita ? ' kvg-ed vivo' : ''}`} style={{ marginTop: 14 }}>
          <div><div className="k">Área adotada</div>{fonte ? <div className="v">{OPT.fonteArea[fonte]?.split(' (')[0]}</div> : <span className="v ni">{edita ? 'Clique na área que vale' : 'Não informada'}</span>}</div>
          {/* em São Paulo a testada não se digita: é a frente do acesso principal medida pela poligonal (pedido do Moises, 9/nov/2026) */}
          {edita && !sp ? <TestadaVivo f={f} />
            : <div><div className="k">Testada principal</div>{t.testada_principal_m == null ? ni : <div className="v">{metros(t.testada_principal_m)} m</div>}</div>}
          <div><div className="k">Valor pedido por m²</div>{ad && f.valorPedido ? <div className="v">{brl(f.valorPedido / ad)}</div> : ni}</div>
        </div>
        <Frentes f={f} />
      </div>
    </Quadro>
  );
}

export default function AbaTerreno({ f }: { f: Ficha }) {
  const [, re] = useState(0);
  /* "ir ao campo" vindo do que falta na ficha: abre o quadro e põe o foco no campo (já editável no lugar) */
  useEffect(() => {
    const atender = () => {
      const p = tomarPedido(['loc', 'areas', 'fis', 'lotes', 'partes-cad', 'ident']);
      if (!p) return;
      abrirQuadro('terreno', p.sec);
      re((x) => x + 1);
      let alvo = p.campo === 'end-mapa' ? 'f-end-mapa' : /^(em-n|es-sql|p-n)$/.test(p.campo ?? '') ? p.campo! : `f-${p.campo}`;
      if (p.campo === 'area') {
        /* área adotada: a primeira área preenchida (um clique a escolhe); sem nenhuma, o campo da documental */
        const fo = ['documental', 'cadastral', 'levantamento', 'poligonal'].find((x) => (x === 'poligonal' ? f.t.area_poligonal_m2 : f.t[`area_${x}_m2`]) != null);
        alvo = fo ? `area-${fo}` : 'f-area_documental_m2';
      }
      /* proprietário: abre a janela das pessoas da primeira parte */
      if (p.campo === 'pp-ed') { const ir = (t: number) => { const b = document.querySelector<HTMLButtonElement>('[id^="pp-ed-"]'); if (b) b.click(); else if (t) setTimeout(() => ir(t - 1), 60); }; ir(12); return; }
      if (p.campo) focar(alvo);
    };
    atender();
    window.addEventListener('ficha-campo', atender);
    return () => window.removeEventListener('ficha-campo', atender);
  }, [f]);
  return (
    <div className="stack">
      <SecGenerica f={f} id="ident" primeiro />
      <SecGenerica f={f} id="loc" />
      <SecParametros f={f} />
      <PartesLotes f={f} />
      <SecAreas f={f} />
    </div>
  );
}
