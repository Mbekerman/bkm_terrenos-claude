import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { Adorno } from '../lib/mascara';
import { data as fd } from '../lib/format';
import { lerNum, Quadro } from '../ficha/edicao';
import type { Ficha } from '../ficha/dados';
import { brl, calcular, mi, nf, normTip, VB_RESTRITO, VB_SECAO, vin, type Calc, type Tip, type Viab } from './calc';
import { SecDre, SecLinhas, SecObra, SecTerreno, vbQPadrao, type Ctx } from './Secoes';
import { NovoEstudo, SalvarModelo, useModelos } from './Modelos';
import { carregarEstudo, erroTxt, useDespesas, useEstudos, useRecarregar, type ResumoViab } from './dados';

// Aba Viabilidades da ficha e o popup do estudo de viabilidade estática (porte de tools/prototipo/proto_viab.js ›
// viabSecao, vbPopHtml, e proto_mod.js › abaGeral(t,'viab'), o Resumo da viabilidade). Mesma marcação e classes do
// protótipo (estilos em styles.css). Primeira entrega: a lista, o Resumo, o popup com os indicadores, os botões das
// seções e a seção Tipologias; as outras seções entram nas próximas.

type Sec = 'tip' | 'terreno' | 'comercial' | 'obra' | 'despesas' | 'financeiro' | 'taxas' | 'res';
const VB_ORDEM: Sec[] = ['tip', 'terreno', 'comercial', 'obra', 'despesas', 'financeiro', 'taxas', 'res'];
const VB_ROT: Record<Sec, string> = { tip: 'Tipologias', terreno: 'Terreno', comercial: 'Comercial', obra: 'Obras', despesas: 'Gerais', taxas: 'Taxas', financeiro: 'Financeiras', res: 'DRE' };

/* ---------- o estudo aberto no popup (um por vez, de qualquer lugar da ficha) ---------- */
let aberto: string | null = null;
const subs = new Set<() => void>();
export function abrirEstudo(id: string | null) { aberto = id; subs.forEach((f) => f()); }
const useAberto = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => aberto);

function useDiretoria() {
  const { membro } = useSessao();
  return membro?.papel === 'diretor' || !!membro?.administrador;
}

const pct1 = (x: number | null | undefined) => (x == null ? '—' : nf(x, 1) + '%');
const kpiV = (s: string) => {
  const m = /^R\$\s?(.*)$/.exec(s.replace(/ /g, ' '));
  return m ? <><span className="vb-rs">R$ </span>{m[1]}</> : s;
};

/* ---------- criar, duplicar, marcar como válido ---------- */
function useAcoes(f: Ficha) {
  const empresa = useSessao().empresa?.id;
  const toast = useToast(), recarregar = useRecarregar();
  const modelos = useModelos(empresa).data ?? [];
  const [pedirModelo, setPedirModelo] = useState<string | null>(null);
  /** cria o estudo (com o modelo escolhido; sem escolha, o banco usa o padrão da empresa) e já o abre */
  const criar = async (nome: string, modelo: string | null, perguntou: boolean) => {
    const { data, error } = await supabase.rpc('criar_viabilidade', { p_terreno: f.id, p_nome: nome, p_modelo: modelo, p_sem_modelo: perguntou && !modelo });
    if (error) { toast(erroTxt(error), true); return; }
    /* como no protótipo, o estudo novo já vem com a primeira tipologia para preencher */
    await supabase.from('viabilidade_tipologias').insert({ empresa_id: f.t.empresa_id ?? empresa, viabilidade_id: data, nome: 'Tipologia 1', ordem: 1 });
    setPedirModelo(null); recarregar(); abrirEstudo(data as string);
  };
  /** Novo estudo pergunta o modelo; sem nenhum modelo, cria direto */
  const novo = (lista: ResumoViab[]) => {
    const nome = lista.length ? `Estudo ${lista.length + 1}` : 'Estudo base';
    if (modelos.length) setPedirModelo(nome); else void criar(nome, null, false);
  };
  const dlgNovo = pedirModelo != null && <NovoEstudo nomeIni={pedirModelo} modelos={modelos} onCriar={(n, m) => criar(n, m, true)} onFechar={() => setPedirModelo(null)} />;
  const duplicar = async (id: string, nome: string) => {
    const { data, error } = await supabase.rpc('criar_viabilidade', { p_terreno: f.id, p_nome: 'Cópia de ' + nome, p_copiar_de: id });
    if (error) { toast(erroTxt(error), true); return; }
    recarregar(); abrirEstudo(data as string); toast('Estudo duplicado.');
  };
  const vincular = async (id: string, nome: string) => {
    if (!f.negId) { toast('A negociação não está ativa.', true); return; }
    const { error } = await supabase.rpc('vincular_estudo', { p_processo: f.negId, p_viabilidade: id });
    if (error) { toast(erroTxt(error), true); return; }
    recarregar(); toast(`${nome} é o estudo válido.`);
  };
  return { novo, duplicar, vincular, dlgNovo };
}

/* ---------- aba Viabilidades: Resumo da viabilidade e a lista dos estudos ---------- */
/** margem do estudo válido abaixo da mínima da empresa (Configurações › Viabilidade): o aviso da negociação, da proposta e de "Levar ao comitê" */
export function useRentabilidade(f: Ficha): { margem: number; minima: number; txt: string } | null {
  const { empresa } = useSessao();
  const d = useEstudos(f.id, f.negId, empresa?.id).data;
  const vi = d?.lista.find((x) => x.id === d.valido);
  if (!d || vi?.margem == null || d.margemMin == null || vi.margem >= d.margemMin) return null;
  return { margem: vi.margem, minima: d.margemMin, txt: `margem de ${nf(vi.margem, 1)}% no estudo válido, mínima de ${nf(d.margemMin, 1)}%` };
}

export default function AbaViabilidade({ f }: { f: Ficha }) {
  const { empresa, edita } = useSessao();
  const q = useEstudos(f.id, f.negId, empresa?.id);
  const ac = useAcoes(f);
  if (q.isLoading) return <div className="empty muted">Carregando…</div>;
  if (q.error || !q.data) return <div className="banner crit"><Ic n="warn" /><div>Não foi possível carregar os estudos.</div></div>;
  const { lista, valido, negAtiva, margemMin } = q.data;
  const vi = lista.find((x) => x.id === valido) ?? null;
  const ro = !edita;
  const abaixo = vi?.margem != null && margemMin != null && vi.margem < margemMin;
  const abaixoTxt = vi && `Rentabilidade abaixo da mínima: margem de ${nf(vi.margem, 1)}% no estudo válido, mínima de ${nf(margemMin, 1)}%`;
  const aviso = abaixo && <div className="banner warn" style={{ marginTop: 12 }}><Ic n="warn" /><div>{abaixoTxt}.</div></div>;
  const vl = vi ? vi.liq ?? vi.vgv : null;
  const pc = (x: number | null | undefined, b: number | null) => (x != null && b ? nf(x / b * 100, 1) + '%' : '—');
  const novoBtn = !ro && <button className="btn sm" onClick={() => ac.novo(lista)}><Ic n="add" s={16} />Novo estudo</button>;
  return (
    <div className="stack">
      {ac.dlgNovo}
      <Quadro aba="viabilidade" id="viab-res" primeiro titulo="Resumo da viabilidade">
        <div className="sec-b">
          {lista.length > 0 && (
            <div className="vb-escolha">
              <label htmlFor={`vb-val-${f.id}`}>Estudo válido</label>
              <select id={`vb-val-${f.id}`} value={vi?.id ?? ''} disabled={ro || !negAtiva}
                onChange={(e) => { const x = lista.find((y) => y.id === e.target.value); if (x) void ac.vincular(x.id, x.nome); }}>
                {!vi && <option value="">Escolha o estudo</option>}
                {lista.map((x) => <option key={x.id} value={x.id}>{x.nome} · {pct1(x.margem)}</option>)}
              </select>
              {vi && <button className="btn sm" onClick={() => abrirEstudo(vi.id)}>Abrir estudo</button>}
              {!ro && <button className="btn text sm" onClick={() => ac.novo(lista)}><Ic n="add" s={16} />Novo estudo</button>}
            </div>
          )}
          {vi ? <>
            <div className="cond2 vb-res2">
              <div><div className="lbl">Margem líquida</div><div className="big">{pct1(vi.margem)}</div></div>
              {margemMin != null && <div><div className="lbl">Mínima da empresa</div><div className="big">{nf(margemMin, 1)}%</div></div>}
            </div>
            <div className="dt-wrap"><table className="dt compacta"><thead><tr><th className="esq"><span className="sr-only">Item</span></th><th className="num">Valor</th><th className="num">% do VGV</th></tr></thead><tbody>
              <tr><td className="esq">VGV líquido</td><td className="num">{mi(vl)}</td><td className="num">100%</td></tr>
              <tr><td className="esq">Valor pedido</td><td className="num">{f.valorPedido ? mi(f.valorPedido) : '—'}</td><td className="num">{f.valorPedido ? pc(f.valorPedido, vl) : '—'}</td></tr>
              {q.data.ultProposta != null && <tr><td className="esq">Última proposta</td><td className="num">{mi(q.data.ultProposta)}</td><td className="num">{pc(q.data.ultProposta, vl)}</td></tr>}
              {vi.lucro != null && <tr><td className="esq">Lucro líquido</td><td className="num">{mi(vi.lucro)}</td><td className="num">{pc(vi.lucro, vl)}</td></tr>}
            </tbody></table></div>
            {aviso}
          </> : <div className="muted">{lista.length ? 'Nenhum estudo marcado como válido.' : <>Sem estudo.{!ro && <> <button className="linkbtn ed" onClick={() => ac.novo(lista)}>Montar estudo</button></>}</>}</div>}
        </div>
      </Quadro>
      <Quadro aba="viabilidade" id="viab" titulo="Viabilidade" acoes={novoBtn}>
        <div className="sec-b">
          {vi && <>
            <div className="metrics vb-met">
              <div className="metric"><div className="ml">VGV líquido</div><div className="mv">{mi(vi.liq ?? vi.vgv)}</div></div>
              <div className="metric"><div className="ml">Margem líquida</div><div className="mv">{pct1(vi.margem)}</div></div>
              <div className="metric"><div className="ml">Mínima da empresa</div><div className="mv">{margemMin == null ? '—' : nf(margemMin, 1) + '%'}</div></div>
            </div>
            {aviso}
            <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>Estudo válido: {vi.nome} · {fd(vi.atualizado)}</div>
            {lista.length > 0 && <div style={{ height: 16 }} />}
          </>}
          {lista.length ? (
            <div className="dt-wrap vb-lista"><table className="dt compacta"><thead><tr><th className="esq">Estudo</th><th>VGV líquido</th><th>Lucro líquido</th><th>Margem</th><th>Atualizado</th><th>Válido</th></tr></thead><tbody>
              {lista.map((v) => {
                const lig = vi?.id === v.id;
                return (
                  <tr key={v.id}>
                    <td className="esq"><button className="linkbtn" onClick={() => abrirEstudo(v.id)}>{v.nome}</button></td>
                    <td className="num">{mi(v.liq)}</td><td className="num">{mi(v.lucro)}</td><td className="num">{pct1(v.margem)}</td><td>{fd(v.atualizado)}</td>
                    <td><label className="vb-radio"><input type="radio" name={`vb-valido-${f.id}`} checked={lig} disabled={!lig && (!negAtiva || ro)}
                      onChange={() => { if (!lig) void ac.vincular(v.id, v.nome); }} aria-label={`${v.nome} é o estudo válido`} /></label></td>
                  </tr>
                );
              })}
            </tbody></table></div>
          ) : (
            <div className="banner blue"><Ic n="money" /><div style={{ flex: 1 }}><div className="bt">Nenhum estudo</div><div>Monte o estudo de viabilidade estática: tipologias, custos e resultado (VGV líquido, lucro e margem).</div></div></div>
          )}
        </div>
      </Quadro>
    </div>
  );
}

/* ---------- vínculo com o estudo de massa (proto_viab.js › vbMassaSel): presa, título, área e quantidade das
   tipologias e a área construída vêm do estudo de massa; "Quebrar vínculo" solta na hora (app.vincular_massa) ---------- */
function MassaSel({ v, terreno, ro, aoMudar }: { v: Viab; terreno: string; ro: boolean; aoMudar: () => Promise<void> }) {
  const toast = useToast(), qc = useQueryClient();
  const q = useQuery({
    queryKey: ['viab-massas', terreno],
    queryFn: async () => {
      const { data, error } = await supabase.from('estudos_massa').select('id,nome,situacao,valido').eq('terreno_id', terreno).order('ordem');
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; situacao: string; valido: boolean }[];
    },
  });
  const todos = q.data ?? [];
  const ms = todos.filter((m) => m.situacao === 'entregue'), val = todos.find((m) => m.valido) ?? null, m = todos.find((x) => x.id === v.estudo_massa_id) ?? null;
  const [grav, setGrav] = useState(false);
  if (!ms.length && !v.estudo_massa_id) return null;
  const atual = v.segue_massa_valido ? 'valido' : v.estudo_massa_id ?? '';
  const mudar = async (x: string) => {
    if (grav || x === atual) return;
    setGrav(true);
    const { error } = await supabase.rpc('vincular_massa', { p_viab: v.id, p_estudo: x && x !== 'valido' ? x : null, p_seguir_valido: x === 'valido' });
    setGrav(false);
    if (error) { toast(erroTxt(error), true); return; }
    await aoMudar(); qc.invalidateQueries({ queryKey: ['ficha-massa', terreno] });
    const novo = x === 'valido' ? val : todos.find((y) => y.id === x);
    toast(!x ? 'Vínculo quebrado: tipologias e área construída ficam e passam a se editar aqui.'
      : v.estudo_massa_id ? `Trocado: tipologias e área construída do ${novo?.nome ?? 'estudo de massa'}.` : `Vinculada: tipologias e área construída voltaram às do ${novo?.nome ?? 'estudo de massa'}.`);
  };
  const ops = <>
    <option value="valido" disabled={!val}>{val ? `Seguir o válido (${val.nome})` : 'Seguir o válido: nenhum ainda'}</option>
    {ms.map((x) => <option key={x.id} value={x.id}>{x.nome}{x.valido ? ' · válido' : ''}</option>)}
  </>;
  if (!v.estudo_massa_id) return (
    <div className="vb-ms"><label className="field"><span className="lbl-f">Vincular a um estudo de massa</span>
      <select value="" disabled={ro || grav} onChange={(e) => mudar(e.target.value)}><option value="">Sem vínculo (tipologias e áreas digitadas aqui)</option>{ops}</select></label>
      {!ro && <div className="hint">Vinculando, as tipologias e a área construída voltam a ser as do estudo de massa; preços, permuta e comissão ficam.</div>}</div>
  );
  return (
    <div className="vb-ms"><div className="vb-ms-l"><label className="field"><span className="lbl-f">Vinculada ao estudo de massa</span>
      <select value={atual} aria-label="Trocar o estudo de massa vinculado" disabled={ro || grav} onChange={(e) => mudar(e.target.value)}>{ops}</select></label>
      {!ro && <button type="button" className="btn sm" disabled={grav} onClick={() => mudar('')}><Ic n="link" s={16} />Quebrar vínculo</button>}</div>
      <div className="hint">Título, área e quantidade das tipologias e a área construída vêm do {m?.nome ?? 'estudo de massa'}{v.segue_massa_valido ? ' (o válido; trocou o válido, troca aqui)' : ''} e não se editam; aqui, preços, permuta e comissão.</div></div>
  );
}

/* ---------- campo de número do estudo: formata ao digitar (máscara global), grava ao sair ---------- */
function Num({ v, d = 2, fmt, aoMudar, aoSair, onFocus, ...rest }: {
  v: number | null; d?: number; fmt: string; aoMudar: (n: number | null) => void; aoSair: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [txt, setTxt] = useState(vin(v, d));
  const foco = useRef(false), ult = useRef(v);
  ult.current = v;
  useEffect(() => { if (!foco.current) setTxt(vin(v, d)); }, [v, d]);
  return (
    <input data-fmt={fmt} inputMode="decimal" value={txt} {...rest}
      onFocus={(e) => { foco.current = true; onFocus?.(e); }}
      onChange={(e) => { setTxt(e.target.value); aoMudar(lerNum(e.target.value)); }}
      onBlur={() => { foco.current = false; setTxt(vin(ult.current, d)); aoSair(); }} />
  );
}

/* ---------- o popup ---------- */
export function PopEstudo({ f }: { f: Ficha }) {
  const id = useAberto();
  const { empresa } = useSessao();
  const q = useEstudos(f.id, f.negId, empresa?.id);
  const loc = useLocation(), navegar = useNavigate();
  const naPagina = loc.pathname.startsWith(`/terrenos/${f.codigo}`);
  const lista = q.data?.lista;
  /* o endereço abre o estudo pela ordem no terreno: /terrenos/A123/viabilidade/2 */
  const ini = useRef(false);
  useEffect(() => {
    if (ini.current || !lista || !naPagina) return;
    ini.current = true;
    const m = new RegExp(`^/terrenos/${f.codigo}/viabilidade/(\\d+)`).exec(loc.pathname);
    const x = m && lista[+m[1] - 1];
    if (x) abrirEstudo(x.id);
  }, [lista]); // eslint-disable-line react-hooks/exhaustive-deps
  const ordem = lista ? lista.findIndex((x) => x.id === id) : -1;
  useEffect(() => {
    if (!naPagina || !lista) return;
    const base = `/terrenos/${f.codigo}/viabilidade`;
    if (id && ordem >= 0) { if (loc.pathname !== `${base}/${ordem + 1}`) navegar(`${base}/${ordem + 1}`, { replace: true, state: loc.state }); }
    else if (/\/viabilidade\/\d+/.test(loc.pathname)) navegar(base, { replace: true, state: loc.state });
  }, [id, ordem]); // eslint-disable-line react-hooks/exhaustive-deps
  /* estudo criado fora desta lista (ex.: pela aba Estudos de massa): busca a lista de novo, uma vez por estudo */
  const buscou = useRef<string | null>(null);
  useEffect(() => {
    if (id && lista && ordem < 0 && buscou.current !== id) { buscou.current = id; void q.refetch(); }
  }, [id, ordem, lista]); // eslint-disable-line react-hooks/exhaustive-deps
  /* trocou de terreno (gaveta) ou saiu da ficha: fecha */
  useEffect(() => () => abrirEstudo(null), [f.id]);
  if (!id || !lista || ordem < 0) return null;
  return createPortal(<Pop key={id} id={id} f={f} valido={q.data!.valido === id} negAtiva={q.data!.negAtiva} />, document.body);
}

function Pop({ id, f, valido, negAtiva }: { id: string; f: Ficha; valido: boolean; negAtiva: boolean }) {
  const { empresa, edita } = useSessao();
  const dir = useDiretoria(), ro = !edita;
  const toast = useToast(), recarregar = useRecarregar(), ac = useAcoes(f);
  const D = useDespesas(empresa?.id);
  const [v, setV] = useState<Viab | null>(null);
  const [aba, setAba] = useState<Sec>('tip');
  const [fechados, setFechados] = useState<Set<string>>(vbQPadrao);
  const [apagar, setApagar] = useState(false);
  const [modelo, setModelo] = useState(false);
  const sc = useRef<HTMLDivElement>(null);
  const atual = useRef<Viab | null>(null);
  atual.current = v;
  useEffect(() => {
    let vivo = true;
    carregarEstudo(id).then((x) => { if (vivo) { if (x) setV(x); else abrirEstudo(null); } }, (e) => toast(erroTxt(e), true));
    return () => { vivo = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.body.classList.add('vb-aberto');
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.scrim')) return;
      e.preventDefault(); abrirEstudo(null);
    };
    document.addEventListener('keydown', esc);
    return () => { document.body.classList.remove('vb-aberto'); document.removeEventListener('keydown', esc); };
  }, []);

  /* gravações em fila, uma depois da outra; depois de cada uma, os totais que o banco guarda (Taxas e Financeiras fora
     da diretoria) e, um pouco depois, a lista, a ficha e os filtros */
  const fila = useRef<Promise<void>>(Promise.resolve());
  const tempo = useRef<number>();
  const gravar = (fn: () => PromiseLike<{ error: unknown }>, depois?: (r: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    fila.current = fila.current.then(async () => {
      const r = await fn();
      if (r.error) { toast(erroTxt(r.error), true); const x = await carregarEstudo(id); if (x) setV(x); return; }
      depois?.(r);
      const t = await supabase.from('viabilidades').select('taxas,despesas_financeiras,atualizado_em').eq('id', id).maybeSingle();
      const g = t.data as { taxas: number | null; despesas_financeiras: number | null; atualizado_em: string } | null;
      if (g) setV((o) => o && { ...o, taxas: g.taxas == null ? null : +g.taxas, despesas_financeiras: g.despesas_financeiras == null ? null : +g.despesas_financeiras, atualizado_em: g.atualizado_em });
      clearTimeout(tempo.current);
      tempo.current = window.setTimeout(recarregar, 500);
    });
  };
  useEffect(() => () => { clearTimeout(tempo.current); recarregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desp = D.data ?? [];
  const c = useMemo(() => (v ? calcular(v, desp, !dir) : null), [v, desp, dir]);
  const ordem = dir ? VB_ORDEM : VB_ORDEM.filter((k) => !VB_RESTRITO.includes(k));
  const ab = ordem.includes(aba) ? aba : 'tip';
  const fechar = () => abrirEstudo(null);
  const sobre = <><span>Viabilidade · {f.codigo} · {f.nome}</span>{valido && <span className="chip good"><span className="d" />Válido</span>}</>;
  const acoes = ro ? null : <>
    {!valido && negAtiva && <button className="btn sm" onClick={() => v && ac.vincular(v.id, v.nome)}>Marcar como válido</button>}
    <button className="btn sm" onClick={() => v && ac.duplicar(v.id, v.nome)}>Duplicar</button>
    <button className="btn sm" onClick={() => setModelo(true)}>Salvar como modelo</button>
    {!valido && <button className="btn text sm danger" onClick={() => setApagar(true)}>Apagar</button>}
  </>;

  /* nome do estudo */
  const nomeIni = useRef('');
  const nome = v && (
    <input id="vb-pop-t" className="vb-pop-nome" value={v.nome} aria-label="Nome do estudo" disabled={ro}
      onFocus={() => { nomeIni.current = v.nome; }}
      onChange={(e) => setV({ ...v, nome: e.target.value })}
      onBlur={() => {
        const n = v.nome.trim() || 'Estudo';
        if (n !== v.nome) setV({ ...v, nome: n });
        if (n !== nomeIni.current) gravar(() => supabase.rpc('salvar_viabilidade', { p_id: id, p_dados: { nome: n } }));
      }} />
  );

  const irSec = (k: Sec) => {
    if (k === 'obra' && ab !== 'obra') setFechados(vbQPadrao());
    setAba(k);
    requestAnimationFrame(() => {
      const s = sc.current, fx = s?.querySelector<HTMLElement>('.vb-fixo');
      if (s && fx) s.scrollTop = Math.min(s.scrollTop, fx.offsetTop);
      s?.querySelector('.vb-aba[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
  };

  const ctx: Ctx | null = v && c ? {
    v, c, desp, ro, dir, empresa: empresa!.id, setV, gravar, fechados,
    alternar: (k) => setFechados((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; }),
  } : null;
  const corpo = !v || !c ? <div className="empty muted">Carregando…</div> : (
    <>
      <div className="vb-fixo">
        <div className="kpis vb-kpis" id="vb-kpis">
          {([['VGV', mi(c.vgv)], ['VGV líquido', mi(c.liq)], ['Lucro líquido', mi(c.lucro)], ['Margem líquida', pct1(c.margem)]] as const).map(([l, x]) => (
            <div key={l} className="kpi"><span className="v sm">{kpiV(x)}</span><span className="l">{l}</span></div>
          ))}
        </div>
        <nav className="vb-nav" aria-label="Seções do estudo">
          {ordem.map((k) => <button key={k} className="vb-aba" aria-current={k === ab ? 'page' : undefined} onClick={() => irSec(k)}><b>{VB_ROT[k]}</b><small>{navTxt(k, c)}</small></button>)}
        </nav>
      </div>
      <Secao k={ab} ordem={ordem} c={c} irSec={irSec}
        acao={ab === 'tip' && !ro && !v.estudo_massa_id ? <button className="btn text sm" onClick={() => {
          const p = { nome: 'Tipologia ' + (v.tips.length + 1), ordem: Math.max(0, ...v.tips.map((x) => x.ordem)) + 1 };
          gravar(() => supabase.from('viabilidade_tipologias').insert({ empresa_id: empresa!.id, viabilidade_id: id, ...p }).select().single(), (r) => {
            const t = r.data;
            setV((o) => o && { ...o, tips: [...o.tips, { ...t, area_privativa: null, preco_unitario: null, preco_m2: null }] });
            setTimeout(() => { const i = document.querySelector<HTMLInputElement>(`[data-tp="${t.id}"] .vb-nome input`); i?.focus(); i?.select(); }, 30);
          });
        }}><Ic n="add" s={16} />Adicionar tipologia</button> : null}>
        {ab === 'tip' ? <><MassaSel v={v} terreno={f.id} ro={ro} aoMudar={async () => { const x = await carregarEstudo(id); if (x) setV(x); recarregar(); }} />
          <Tipologias v={v} c={c} ro={ro} setV={setV} gravar={gravar} toast={toast} /></>
          : ab === 'terreno' ? <SecTerreno x={ctx!} />
          : ab === 'obra' ? <SecObra x={ctx!} />
          : ab === 'res' ? <SecDre x={ctx!} />
          : <SecLinhas x={ctx!} sec={ab} />}
      </Secao>
    </>
  );

  return (
    <div id="vb-pop" className="vb-pop">
      <div className="vb-pop-fundo" onClick={fechar} />
      <div className="vb-pop-d" role="dialog" aria-modal="true" aria-labelledby="vb-pop-t">
        <div className="vb-pop-h">
          <div className="vb-pop-tt">
            <div className="eyebrow">{sobre}</div>
            {nome}
            {v && <div className="faint vb-sub">Atualizado em {fd(v.atualizado_em)}.</div>}
          </div>
          <div className="vb-acoes">{acoes}</div>
          <button className="iconbtn vb-pop-x" onClick={fechar} aria-label="Fechar o estudo" title="Fechar (Esc)"><Ic n="close" /></button>
        </div>
        <div className="vb-pop-sc" ref={sc}>
          <div className="vb-pop-meta"><div className="eyebrow">{sobre}</div>{acoes && <div className="vb-acoes">{acoes}</div>}</div>
          {corpo}
        </div>
      </div>
      {modelo && v && <SalvarModelo viab={v.id} dir={dir} onFechar={() => setModelo(false)} />}
      {apagar && v && (
        <Dialogo titulo="Apagar o estudo?" onFechar={() => setApagar(false)}
          rodape={<><button className="btn text" onClick={() => setApagar(false)}>Cancelar</button>
            <button className="btn primary danger" onClick={async () => {
              const { error } = await supabase.rpc('apagar_viabilidade', { p_id: v.id });
              if (error) { toast(erroTxt(error), true); return; }
              setApagar(false); abrirEstudo(null); recarregar(); toast('Estudo apagado.');
            }}>Apagar</button></>}>
          <p style={{ margin: '0 0 8px' }}>{v.nome} sai do terreno, com as tipologias e os custos. Estudo vinculado à negociação não se apaga.</p>
        </Dialogo>
      )}
    </div>
  );
}

function navTxt(k: Sec, c: Calc) {
  const sem = (s: string) => s.replace(/^R\$\s/, '');
  if (k === 'tip') return sem(mi(c.vgv));
  if (k === 'res') return 'Margem ' + pct1(c.margem);
  const x = c.SEC[k];
  if (!x) return '—';
  return `${sem(mi(x))} · ${c.vgv > 0 ? nf(x / c.vgv * 100, 1) + '%' : '—'}`;
}
function shTxt(k: Sec, c: Calc) {
  if (k === 'tip') return `${brl(c.vgv)} · ${nf(c.un)} unidades`;
  if (k === 'res') return `Lucro ${brl(c.lucro)} · margem ${pct1(c.margem)}`;
  const x = c.SEC[k];
  return `${brl(x)} · ${c.vgv > 0 ? nf(x / c.vgv * 100, 1) + '%' : '—'} do VGV`;
}

function Secao({ k, ordem, c, irSec, acao, children }: { k: Sec; ordem: Sec[]; c: Calc; irSec: (k: Sec) => void; acao: ReactNode; children: ReactNode }) {
  const i = ordem.indexOf(k), ant = ordem[i - 1], prox = ordem[i + 1];
  const titulo = k === 'tip' ? 'Tipologias' : k === 'res' ? 'DRE' : VB_SECAO[k];
  const passo = (x: Sec | undefined, seta: number) => x
    ? <button className="btn text sm" onClick={() => irSec(x)}>{seta < 0 ? '‹ ' : ''}{VB_ROT[x]}{seta > 0 ? ' ›' : ''}</button> : <span />;
  return (
    <section className="sec vb-sec" id={`vb-sec-${k}`} aria-labelledby={`vb-st-${k}`}>
      <div className="sec-h vb-sh"><h2 id={`vb-st-${k}`}>{titulo}</h2><span className="vb-sh-t">{shTxt(k, c)}</span>{acao}</div>
      <div className="sec-b">{children}</div>
      <div className="vb-passo">{passo(ant, -1)}{passo(prox, 1)}</div>
    </section>
  );
}

/* ---------- Tipologias ---------- */
type Gravar = (fn: () => PromiseLike<{ error: unknown }>, depois?: (r: any) => void) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
const TK = { nome: 'nome', area: 'area_privativa', qtd: 'quantidade', perm: 'quantidade_permuta', com: 'quantidade_comissao', pu: 'preco_unitario', pm2: 'preco_m2' } as const;
type TKey = keyof typeof TK;
const TROT: Record<TKey, string> = { nome: 'Tipologia', area: 'Área privativa (m²)', qtd: 'Quantidade', perm: 'Em permuta', com: 'Comissão', pu: 'Preço unitário (R$)', pm2: 'Preço por m² (R$)' };

function Tipologias({ v, c, ro, setV, gravar, toast }: {
  v: Viab; c: Calc; ro: boolean; setV: (fn: (o: Viab | null) => Viab | null) => void; gravar: Gravar; toast: (m: string, e?: boolean) => void;
}) {
  const preso = !!v.estudo_massa_id;
  const ini = useRef<Record<string, unknown>>({});
  const mudar = (p: Tip, k: TKey, x: number | string | null) => setV((o) => {
    if (!o) return o;
    return { ...o, tips: o.tips.map((t) => {
      if (t.id !== p.id) return t;
      const n = { ...t };
      if (k === 'nome') n.nome = String(x ?? '');
      else {
        let y = x as number | null;
        if (y != null && ['qtd', 'perm', 'com'].includes(k)) y = Math.max(0, Math.round(y));
        if (y != null && y < 0) y = null;
        if (k === 'area' && y === 0) y = null;
        (n as any)[TK[k]] = ['qtd', 'perm', 'com'].includes(k) ? y ?? 0 : y; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (k === 'area' || k === 'pu' || k === 'pm2') normTip(n, TK[k] as 'area_privativa' | 'preco_unitario' | 'preco_m2');
      }
      return n;
    }) };
  });
  const sair = (p0: Tip, k: TKey) => {
    const p = v.tips.find((t) => t.id === p0.id);
    if (!p) return;
    const col = TK[k];
    let val: unknown = (p as any)[col]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (k === 'nome' && !String(val).trim()) { val = 'Tipologia'; mudar(p, 'nome', 'Tipologia'); }
    if ((k === 'perm' || k === 'com') && p.quantidade_permuta + p.quantidade_comissao > p.quantidade) {
      const outro = k === 'com' ? p.quantidade_permuta : p.quantidade_comissao;
      val = Math.max(0, p.quantidade - outro); mudar(p, k, val as number);
      toast('Permuta e comissão não passam da quantidade da tipologia.', true);
    }
    if (k === 'qtd' && p.quantidade_permuta + p.quantidade_comissao > p.quantidade) {
      toast('Permuta e comissão passam da quantidade: ajuste a permuta ou a comissão.', true);
      setV((o) => o && { ...o, tips: o.tips.map((t) => (t.id === p.id ? { ...t, quantidade: Number(ini.current[p.id + k] ?? t.quantidade) } : t)) });
      return;
    }
    if (ini.current[p.id + k] === val) return;
    gravar(() => supabase.from('viabilidade_tipologias').update({ [col]: val }).eq('id', p.id).select('area_privativa,preco_unitario,preco_m2').single(), (r) => {
      const d = r.data;
      setV((o) => o && { ...o, tips: o.tips.map((t) => (t.id === p.id ? { ...t, area_privativa: d.area_privativa == null ? null : +d.area_privativa, preco_unitario: d.preco_unitario == null ? null : +d.preco_unitario, preco_m2: d.preco_m2 == null ? null : +d.preco_m2 } : t)) });
    });
  };
  const foco = (p: Tip, k: TKey) => { ini.current[p.id + k] = (p as any)[TK[k]]; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const inp = (p: Tip, k: TKey) => {
    const trava = preso && (k === 'nome' || k === 'area' || k === 'qtd');
    const dis = trava || ro;
    const ruim = (k === 'perm' || k === 'com') && p.quantidade_permuta + p.quantidade_comissao > p.quantidade;
    const comum = { 'aria-label': TROT[k], disabled: dis, title: trava ? 'Vem do estudo de massa' : ruim ? 'Permuta e comissão passam da quantidade' : undefined };
    const campo = k === 'nome'
      ? <input value={p.nome} {...comum} onFocus={() => foco(p, k)} onChange={(e) => mudar(p, 'nome', e.target.value)} onBlur={() => sair(p, k)} />
      : <Num v={(p as any)[TK[k]] ?? null} d={['qtd', 'perm', 'com'].includes(k) ? 0 : 2} // eslint-disable-line @typescript-eslint/no-explicit-any
        fmt={k === 'pu' || k === 'pm2' ? 'moeda' : ['qtd', 'perm', 'com'].includes(k) ? 'int' : 'num'} {...comum} aria-invalid={ruim || undefined}
        onFocus={() => foco(p, k)} aoMudar={(n) => mudar(p, k, n)} aoSair={() => sair(p, k)} />;
    const ad = k === 'pu' || k === 'pm2' ? <Adorno t="moeda">{campo}</Adorno> : k === 'area' ? <Adorno t="m2">{campo}</Adorno> : campo;
    return <label key={k} className={`vb-c vb-${k}`}><span className="vb-l">{TROT[k]}</span>{ad}</label>;
  };
  const tirar = (p: Tip) => {
    setV((o) => o && { ...o, tips: o.tips.filter((t) => t.id !== p.id) });
    gravar(() => supabase.from('viabilidade_tipologias').delete().eq('id', p.id));
  };
  return (
    <div className="vb-tab vb-tips">
      <div className="vb-r vb-hd" aria-hidden="true"><span>Tipologia</span><span>Área privativa (m²)</span><span>Quantidade</span><span>Em permuta</span><span>Comissão</span><span>Preço unitário (R$)</span><span>Preço por m² (R$)</span><span className="vb-hr">VGV</span><span /></div>
      {v.tips.length ? v.tips.map((p) => (
        <div key={p.id} className="vb-r" data-tp={p.id}>
          {(['nome', 'area', 'qtd', 'perm', 'com', 'pu', 'pm2'] as TKey[]).map((k) => inp(p, k))}
          <span className="vb-c vb-out"><span className="vb-l">VGV</span><b>{brl(p.preco_unitario != null ? (p.quantidade || 0) * p.preco_unitario : null)}</b></span>
          {ro || preso ? <span /> : <button className="iconbtn sm vb-del" onClick={() => tirar(p)} aria-label={`Remover ${p.nome}`} title="Remover tipologia"><Ic n="close" s={18} /></button>}
        </div>
      )) : <div className="muted vb-vazio">Nenhuma tipologia.</div>}
      <div className="vb-r vb-tot" id="vb-tot-tips">
        <span className="vb-c"><b>Total</b></span>
        <span className="vb-c vb-area"><span className="vb-l">Área privativa total</span>{c.A ? nf(c.A, 2) + ' m²' : '—'}</span>
        <span className="vb-c vb-qtd"><span className="vb-l">Unidades</span>{nf(c.un)}</span>
        <span className="vb-c vb-perm"><span className="vb-l">Em permuta</span>{nf(c.unp)}</span>
        <span className="vb-c vb-com"><span className="vb-l">Comissão</span>{nf(c.unc)}</span>
        <span className="vb-c vb-pu"><span className="vb-l">Preço médio</span>{c.un ? <><small className="faint vb-med">média </small>{brl(c.vgv / c.un)}</> : '—'}</span>
        <span className="vb-c vb-pm2"><span className="vb-l">Preço médio por m²</span>{c.A ? <><small className="faint vb-med">média </small>{brl(c.vgv / c.A)}</> : '—'}</span>
        <span className="vb-c vb-out"><span className="vb-l">VGV</span><b>{brl(c.vgv)}</b></span><span />
      </div>
    </div>
  );
}
