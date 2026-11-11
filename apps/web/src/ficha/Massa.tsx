/* eslint-disable @typescript-eslint/no-explicit-any */
// Aba Estudos de massa, porte de tools/prototipo/proto_massa.js (abaMassa, emsFicha, emsModalHtml): mesma marcação e
// classes (.ems-*, em styles.css). O analista pede o estudo a um arquiteto da equipe (briefing e prazo); o arquiteto
// lança as tipologias, as áreas, as vagas, a área construída e os CAs; entregue, o analista marca o válido (um por
// terreno) e cria o estudo de viabilidade preso a ele. Tudo pelas RPCs de 20261015001500_estudos_massa.sql
// (solicitar_estudo_massa, salvar_estudo_massa, marcar_massa_valido, apagar_estudo_massa, criar_viabilidade_da_massa).
// O PDF e o DWG entram com a aba Documentos (precisa da ligação com o Drive).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { Adorno } from '../lib/mascara';
import { data as fd, m2 } from '../lib/format';
import { apagarRasc, comRasc, LimparRasc, useGuardarRasc } from '../components/Rascunho';
import { lerNum, numStr, Quadro, useListas, Vivo } from './edicao';
import type { Ficha, R } from './dados';
import { abrirEstudo } from '../viab/Viabilidade';
import { SeloValido } from '../components/SeloValido';

const SIT: Record<string, [string, string]> = { solicitado: ['Solicitado', 'warn'], em_elaboracao: ['Em elaboração', 'blue'], entregue: ['Entregue', 'good'] };
const AREAS: [string, string][] = [['lazer_coberto_torre_m2', 'Lazer coberto na torre'], ['lazer_descoberto_torre_m2', 'Lazer descoberto na torre'],
  ['lazer_coberto_fora_m2', 'Lazer coberto fora da torre'], ['lazer_descoberto_fora_m2', 'Lazer descoberto fora da torre'],
  ['circulacao_m2', 'Área de circulação total'], ['anexos_m2', 'Área de anexos'], ['estacionamento_coberto_m2', 'Estacionamento coberto'],
  ['estacionamento_descoberto_m2', 'Estacionamento descoberto'], ['contencao_ate_1_5_m2', 'Contenção com h até 1,5 m'], ['contencao_acima_1_5_m2', 'Contenção com h acima de 1,5 m']];
const VAGAS: [string, string][] = [['vagas_cobertas', 'Vagas cobertas'], ['vagas_descobertas', 'Vagas descobertas']];
const num = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
const r2 = (x: number) => Math.round(x * 100) / 100;

interface Tip { id?: string; nome: string; area_privativa: number | null; quantidade: number | null; k: string }
interface Dados { ms: R[]; viabs: R[] }

/** área privativa total, unidades e eficiência pelas tipologias (emsCalc) */
function calc(tips: Tip[], constr: number | null) {
  let A = 0, un = 0;
  for (const p of tips) { const q = p.quantidade || 0; un += q; if (p.area_privativa != null) A += p.area_privativa * q; }
  A = r2(A);
  const temA = tips.some((p) => p.area_privativa != null);
  return { A: temA ? A : null, un, efic: constr && constr > 0 && temA && A ? r2(A / constr * 100) : null };
}

function useMassa(f: Ficha) {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['ficha-massa', f.id], enabled: !!empresa,
    queryFn: async (): Promise<Dados> => {
      const [m, v] = await Promise.all([
        supabase.from('estudos_massa').select('*,estudo_massa_tipologias(id,nome,area_privativa,quantidade,ordem)').eq('terreno_id', f.id).order('ordem'),
        supabase.from('viabilidades').select('id,nome,estudo_massa_id,segue_massa_valido').eq('terreno_id', f.id).eq('tipo', 'estatica').order('criado_em'),
      ]);
      if (m.error) throw m.error;
      if (v.error) throw v.error;
      const ms = ((m.data ?? []) as R[]).map((x) => ({ ...x, tips: ((x.estudo_massa_tipologias ?? []) as R[]).slice().sort((a, b) => a.ordem - b.ordem) }));
      return { ms, viabs: (v.data ?? []) as R[] };
    },
  });
}

/** marca ou tira a marca de válido (um por terreno, só entregue); o que era o válido deixa de ser */
function useMarcarValido(viabs: () => R[], recarregar: () => void) {
  const toast = useToast();
  return async (m: R, valido: boolean) => {
    const { error } = await supabase.rpc('marcar_massa_valido', { p_id: m.id, p_valido: valido });
    if (error) { toast(error.message, true); return; }
    if (!valido) { toast(`${m.nome} deixou de ser o válido. O terreno fica sem estudo de massa válido.`); recarregar(); return; }
    const n = viabs().filter((v) => v.segue_massa_valido).length;
    toast(`${m.nome} é o válido.${n ? ` ${n > 1 ? `${n} estudos de viabilidade que seguem o válido foram atualizados` : 'O estudo de viabilidade que segue o válido foi atualizado'}.` : ''}`);
    recarregar();
  };
}

/* ---------- a aba: a lista dos estudos, como a de viabilidade (pedido do Moises, 11/nov/2026); inserir, ver e editar
   cada estudo é na janela (PopMassa) ---------- */
export default function AbaMassa({ f }: { f: Ficha; irAba?: (k: string) => void }) {
  const { edita } = useSessao();
  const qc = useQueryClient();
  const q = useMassa(f), L = useListas();
  const membros = L.data?.membros ?? [];
  const [form, setForm] = useState<false | 'pedir' | 'lancar'>(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ['ficha-massa', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); qc.invalidateQueries({ queryKey: ['mapa'] }); };
  const marcar = useMarcarValido(() => q.data?.viabs ?? [], recarregar);
  if (q.isLoading) return <section className="sec"><div className="empty">Carregando…</div></section>;
  if (q.error) return <section className="sec"><div className="empty">Não foi possível ler os estudos de massa: {(q.error as any).message}</div></section>;
  const { ms } = q.data!;
  return (
    <div className="stack">
      <Quadro aba="massa" id="massa-lista" primeiro chip="Estudos de massa" titulo={<>Estudos de massa <span className="h-n">{ms.length}</span></>}
        acoes={edita ? <span style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn sm" onClick={() => setForm('lancar')} title="Para o estudo que já está pronto: cria o estudo e abre a janela para lançar as tipologias, as áreas e os índices"><Ic n="upload" s={16} />Lançar estudo</button>
          <button className="btn sm" onClick={() => setForm('pedir')}><Ic n="add" s={16} />Solicitar estudo</button></span> : null}>
        <div className="sec-b">
          {ms.length ? (
            <div className="dt-wrap vb-lista"><table className="dt compacta ems-lista"><thead><tr><th className="esq">Estudo</th><th>Unidades</th><th>Tipologias</th><th>Área privativa total</th><th>Área privativa média</th><th>Atualizado</th><th>Válido</th></tr></thead>
              <tbody>{ms.map((m) => {
                const [st, cor] = SIT[m.situacao] ?? [m.situacao, ''];
                const un = Number(m.unidades) || 0;
                const media = un && m.area_privativa_m2 != null ? r2(Number(m.area_privativa_m2) / un) : null;
                const entregue = m.situacao === 'entregue';
                return (
                  <tr key={m.id}>
                    <td className="esq"><button className="linkbtn" onClick={() => setAberto(m.id)}>{m.nome}</button>
                      {entregue ? null : <span className={`chip ${cor} ems-sit`}>{st}</span>}</td>
                    <td className="num">{un ? num(un) : '—'}</td>
                    <td className="num">{(m.tips as R[]).length || '—'}</td>
                    <td className="num">{m.area_privativa_m2 != null ? m2(m.area_privativa_m2) : '—'}</td>
                    <td className="num">{media != null ? m2(media) : '—'}</td>
                    <td>{fd(m.atualizado_em)}</td>
                    <td><SeloValido valido={!!m.valido} pode={edita && (entregue || !!m.valido)} nome={m.nome}
                      porque={edita ? 'Só o estudo entregue pode ser o válido' : ''} clicar={() => marcar(m, !m.valido)} /></td>
                  </tr>
                );
              })}</tbody></table></div>
          ) : (
            <div className="banner blue"><Ic n="layers" /><div style={{ flex: 1 }}><div className="bt">Nenhum estudo de massa</div>
              <div>Peça o estudo ao arquiteto em Solicitar estudo, ou, com o estudo já pronto em mãos, use Lançar estudo para digitar as tipologias, as áreas e os índices.</div></div></div>
          )}
        </div>
      </Quadro>
      {form && edita ? (
        <Dialogo titulo={form === 'lancar' ? 'Lançar estudo de massa' : 'Solicitar estudo de massa'} sub={`${f.codigo} · ${f.nome}`} onFechar={() => setForm(false)}>
          <FormSolicitar key={form} modo={form} f={f} membros={membros} fechar={() => setForm(false)} criado={(id) => {
            const lancou = form === 'lancar';
            setForm(false); recarregar();
            if (lancou) setAberto(id);
          }} />
        </Dialogo>
      ) : null}
      {aberto ? <PopMassa f={f} id={aberto} fechar={() => setAberto(null)} /> : null}
    </div>
  );
}

/** o estudo de massa numa janela: inserir, ver e editar (pedido do Moises, 11/nov/2026). Sem id, o válido do terreno
    (o olho da tabela do Pipeline); com id, aquele estudo (a lista da aba). Editável para quem edita, com Ver pedido,
    Marcar como válido, Criar estudo de viabilidade e Apagar. */
export function PopMassa({ f, fechar, id }: { f: Ficha; fechar: () => void; id?: string }) {
  const { edita } = useSessao();
  const toast = useToast();
  const qc = useQueryClient(), q = useMassa(f), L = useListas();
  const membros = L.data?.membros ?? [];
  const nome = (x: string | null | undefined) => (x ? membros.find((y) => y.user_id === x)?.nome ?? '—' : '—');
  const [janela, setJanela] = useState<null | 'pedido' | 'viab' | 'apagar'>(null);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ['ficha-massa', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); qc.invalidateQueries({ queryKey: ['mapa'] }); };
  const marcar = useMarcarValido(() => q.data?.viabs ?? [], recarregar);
  const m = (id ? q.data?.ms.find((x) => x.id === id) : q.data?.ms.find((x) => x.valido)) ?? null;
  /* abre sem cursor num campo (o Dialogo foca o primeiro; aqui seria o título da primeira tipologia) */
  useEffect(() => { const t = setTimeout(() => { const a = document.activeElement as HTMLElement | null; if (a?.closest('.ems-pop')) a.blur(); }, 0); return () => clearTimeout(t); }, [m?.id]);
  return (
    <Dialogo titulo={`${f.codigo} · ${f.nome}`} sub={id ? 'Estudo de massa' : 'Estudo de massa válido'} cls="ems-pop" onFechar={() => { if (!janela) fechar(); }}>
      <div className="ems-pop-b">
        {q.isLoading ? <div className="empty">Carregando…</div>
          : q.error ? <div className="banner warn">Não foi possível ler o estudo de massa: {(q.error as Error).message}</div>
          : m ? <FichaEstudo key={m.id} m={m} viabs={q.data!.viabs} edita={edita} recarregar={recarregar}
            abrir={(t) => setJanela(t)} marcarValido={() => marcar(m, true)} />
          : <div className="empty">{id ? 'Este estudo de massa não existe mais.' : 'Este terreno não tem estudo de massa válido.'}</div>}
      </div>
      {janela === 'pedido' && m ? <JanelaPedido m={m} membros={membros} nome={nome} edita={edita} fechar={() => setJanela(null)} recarregar={recarregar} /> : null}
      {janela === 'viab' && m ? <JanelaViab m={m} fechar={() => setJanela(null)} criado={() => { setJanela(null); recarregar(); }} /> : null}
      {janela === 'apagar' && m ? (
        <Dialogo titulo={`Apagar ${m.nome}?`} onFechar={() => setJanela(null)}
          rodape={<><button className="btn text" onClick={() => setJanela(null)}>Cancelar</button><button className="btn primary danger" onClick={async () => {
            const { error } = await supabase.rpc('apagar_estudo_massa', { p_id: m.id });
            if (error) { toast(error.message, true); return; }
            setJanela(null); recarregar(); toast('Estudo de massa apagado.'); fechar();
          }}>Apagar</button></>}>
          <div className="db">O estudo e as tipologias dele saem do terreno.</div>
        </Dialogo>
      ) : null}
    </Dialogo>
  );
}

/* ---------- Solicitar estudo (formulário de inclusão, com rascunho no navegador) ---------- */
function FormSolicitar({ modo, f, membros, fechar, criado }: { modo: 'pedir' | 'lancar'; f: Ficha; membros: R[]; fechar: () => void; criado: (id: string) => void }) {
  const toast = useToast();
  const { usuario } = useSessao();
  const lancar = modo === 'lancar';
  /* Lançar estudo: o estudo já pronto (de um arquiteto da equipe ou de fora) entra direto em elaboração, sem pedido;
     o arquiteto é obrigatório no banco e vem marcado com quem lança (avisar a si mesmo não gera aviso) */
  const V0: Record<string, string> = lancar ? { arq: usuario?.user_id ?? '', nome: '' } : { arq: '', prazo: '', briefing: '' };
  const k = `${f.id}:${lancar ? 'massa-lancar' : 'massa-pedido'}`;
  const [v, setV] = useState<Record<string, string>>(() => comRasc(k, V0));
  const [grav, setGrav] = useState(false);
  const tem = lancar ? (v.nome ?? '').trim() !== '' : Object.values(v).some((x) => x.trim() !== '');
  useGuardarRasc(k, v, tem);
  const m = (c: string) => (e: { target: { value: string } }) => setV((o) => ({ ...o, [c]: e.target.value }));
  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.arq) { toast(lancar ? 'Marque o responsável na equipe.' : 'Marque o arquiteto.', true); return; }
    setGrav(true);
    const { data, error } = await supabase.rpc('solicitar_estudo_massa', lancar
      ? { p_terreno: f.id, p_arquiteto: v.arq, p_nome: v.nome.trim() || null }
      : { p_terreno: f.id, p_arquiteto: v.arq, p_briefing: v.briefing.trim() || null, p_prazo: v.prazo || null });
    if (error) { setGrav(false); toast(error.message, true); return; }
    if (lancar) {
      const r = await supabase.rpc('salvar_estudo_massa', { p_id: data, p_dados: { situacao: 'em_elaboracao' } });
      if (r.error) toast(r.error.message, true);
    }
    setGrav(false);
    apagarRasc(k);
    toast(lancar ? 'Estudo criado. Lance as tipologias, as áreas e os índices.' : `Estudo pedido a ${membros.find((x) => x.user_id === v.arq)?.nome ?? 'o arquiteto'}.`);
    criado(data as string);
  }
  return (
    <form className="inline-form ems-form" onSubmit={enviar}>
      {lancar ? <div className="field"><label htmlFor="ems-nome">Nome do estudo</label><input id="ems-nome" value={v.nome} onChange={m('nome')} placeholder="Em branco, numera sozinho" autoFocus /></div> : null}
      <div className="field"><label htmlFor="ems-arq">{lancar ? 'Responsável na equipe' : 'Arquiteto'}</label><select id="ems-arq" value={v.arq} onChange={m('arq')} autoFocus={!lancar}>
        <option value="">Escolha o arquiteto</option>{membros.map((x) => <option key={x.user_id} value={x.user_id}>{x.nome}</option>)}</select></div>
      {lancar ? null : <>
        <div className="field" style={{ flex: '0 1 170px' }}><label htmlFor="ems-prazo">Prazo</label><input id="ems-prazo" type="date" value={v.prazo} onChange={m('prazo')} /></div>
        <div className="field full" style={{ flexBasis: '100%' }}><label htmlFor="ems-brief">Briefing</label>
          <textarea id="ems-brief" rows={3} placeholder="O que o estudo precisa considerar. Uma linha por item." value={v.briefing} onChange={m('briefing')} /></div></>}
      <button className="btn sm primary" disabled={grav}><Ic n={lancar ? 'upload' : 'add'} s={16} />{lancar ? 'Criar e lançar' : 'Solicitar'}</button>
      <button type="button" className="btn text sm" onClick={fechar}>Cancelar</button>
      <LimparRasc chave={k} mostrar={tem} limpar={() => setV(V0)} />
    </form>
  );
}

/* ---------- a ficha do estudo (emsFicha): cada campo grava ao sair dele ---------- */
function FichaEstudo({ m, viabs, edita, recarregar, abrir, marcarValido }: {
  m: R; viabs: R[]; edita: boolean; recarregar: () => void;
  abrir: (t: 'pedido' | 'viab' | 'apagar') => void; marcarValido: () => void;
}) {
  const toast = useToast();
  const [st, cor] = SIT[m.situacao] ?? [m.situacao, ''];
  /* as tipologias ficam aqui enquanto se edita; cada gravação manda a lista inteira, uma de cada vez (fila), e depois
     traz os ids das novas pela posição (o banco grava a ordem = posição) */
  const [tips, setTips] = useState<Tip[]>(() => (m.tips as R[]).map((p) => ({ id: p.id, nome: p.nome, area_privativa: p.area_privativa, quantidade: p.quantidade, k: p.id })));
  const tipsRef = useRef(tips); tipsRef.current = tips;
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const focarNova = useRef<string | null>(null);
  const [constr, setConstr] = useState<number | null>(m.area_construida_m2);
  useEffect(() => setConstr(m.area_construida_m2), [m.area_construida_m2]);
  useEffect(() => {
    if (!focarNova.current) return;
    const el = document.querySelector<HTMLInputElement>(`[data-emtp="${focarNova.current}"] input`);
    focarNova.current = null; el?.focus(); el?.select();
  });
  const c = calc(tips, constr);
  const vs = viabs.filter((v) => v.estudo_massa_id === m.id || (m.valido && v.segue_massa_valido));

  /* toda gravação do estudo vai na mesma fila: "Salvar" logo depois de digitar a área espera ela gravar */
  function salvar(d: R): Promise<boolean> {
    const p = fila.current.then(async () => {
      const { error } = await supabase.rpc('salvar_estudo_massa', { p_id: m.id, p_dados: d });
      if (error) { toast(error.message, true); return false; }
      recarregar();
      return true;
    });
    fila.current = p.catch(() => false);
    return p;
  }
  function gravarTips(novas: Tip[]): Promise<boolean> {
    setTips(novas); tipsRef.current = novas;
    const p = fila.current.then(async () => {
      const lista = tipsRef.current.map((t) => ({ ...(t.id ? { id: t.id } : {}), nome: t.nome, area_privativa: t.area_privativa, quantidade: t.quantidade ?? 0 }));
      const { error } = await supabase.rpc('salvar_estudo_massa', { p_id: m.id, p_dados: { tipologias: lista } });
      if (error) { toast(error.message, true); return false; }
      const r = await supabase.from('estudo_massa_tipologias').select('id,ordem').eq('estudo_id', m.id).order('ordem');
      const ids = ((r.data ?? []) as R[]).map((x) => x.id);
      const cur = tipsRef.current.map((t, i) => (t.id || !ids[i] ? t : { ...t, id: ids[i] }));
      tipsRef.current = cur; setTips(cur);
      recarregar();
      return true;
    });
    fila.current = p.catch(() => false);
    return p;
  }
  const mudarTip = (k: string, campo: 'nome' | 'area_privativa' | 'quantidade', s: string): Promise<boolean> | boolean => {
    const t = tipsRef.current.find((x) => x.k === k);
    if (!t) return false;
    if (campo === 'nome') {
      const nm = s.trim();
      if (!nm) { toast('A tipologia precisa de um título.', true); return false; }
      if (tipsRef.current.some((x) => x !== t && x.nome.trim().toLowerCase() === nm.toLowerCase())) { toast('Já existe uma tipologia com este título.', true); return false; }
      return gravarTips(tipsRef.current.map((x) => (x === t ? { ...x, nome: nm } : x)));
    }
    let n = lerNum(s);
    if (n != null && n < 0) n = null;
    if (campo === 'quantidade' && n != null) n = Math.round(n);
    if (campo === 'area_privativa' && n === 0) n = null;
    return gravarTips(tipsRef.current.map((x) => (x === t ? { ...x, [campo]: n } : x)));
  };
  function addTip() {
    let i = tipsRef.current.length + 1, nm = `Tipologia ${i}`;
    while (tipsRef.current.some((x) => x.nome === nm)) nm = `Tipologia ${++i}`;
    const k = 'n' + Date.now();
    focarNova.current = k;
    gravarTips([...tipsRef.current, { nome: nm, area_privativa: null, quantidade: null, k }]);
  }

  /** campo de número do estudo (área, vagas, índice) editado no lugar */
  const campo = (col: string, rot: string, d: number, un?: 'm2') => {
    const inp = (p: any) => <input inputMode="decimal" data-fmt={d ? 'num' : 'int'} data-dec={d || undefined} aria-label={rot} placeholder="—" disabled={!edita} {...p} />;
    return (
      <label className="field" key={col}><span className="lbl-f">{rot}</span>
        <Vivo ini={numStr(m[col], d)} gravar={(s) => {
          let n = lerNum(s);
          if (n != null && n < 0) n = null;
          if (d === 0 && n != null) n = Math.round(n);
          if (col === 'area_construida_m2') { if (n === 0) n = null; setConstr(n); }
          if (n === (m[col] == null ? null : Number(m[col]))) return true;
          return salvar({ [col]: n });
        }}>{(p) => (un ? <Adorno t="m2">{inp(p)}</Adorno> : inp(p))}</Vivo>
      </label>
    );
  };
  const ler = (rot: string, x: string) => <div className="field"><span className="lbl-f">{rot}</span><span className="v">{x}</span></div>;
  /* Salvar = entregar (avisa quem pediu); a única exigência é uma unidade lançada (pedido do Moises, 11/nov/2026) */
  async function entregar() {
    if (!c.un) { toast('Para salvar, lance pelo menos uma unidade.', true); return; }
    if (await salvar({ situacao: 'entregue' })) toast('Estudo salvo.');
  }
  /* do válido, a janela pergunta se segue o válido; de outro estudo, já cria preso a ele (emsCriarViab) */
  async function criarViab() {
    if (m.valido) { abrir('viab'); return; }
    const { data, error } = await supabase.rpc('criar_viabilidade_da_massa', { p_estudo: m.id, p_seguir_valido: false });
    if (error) { toast(error.message, true); return; }
    toast('Estudo de viabilidade criado com as tipologias e a área construída deste estudo de massa.');
    recarregar(); abrirEstudo(data as string);
  }
  const acoes = edita ? <>
    {m.situacao === 'entregue' && !m.valido ? <button className="btn sm" onClick={marcarValido}>Marcar como válido</button> : null}
    {m.situacao === 'entregue' ? <button className="btn sm primary" onClick={criarViab}><Ic n="add" s={16} />Criar estudo de viabilidade</button> : null}
    {!m.valido && !viabs.some((v) => v.estudo_massa_id === m.id) ? <button className="btn text sm danger" onClick={() => abrir('apagar')}>Apagar</button> : null}
  </> : null;
  return (
    <Quadro aba="massa" id="massa" primeiro chip={false} titulo={m.nome}
      acoes={<><span className={`chip ${cor}`}>{st}</span>{m.valido ? <span className="chip good"><span className="d" />Válido</span> : null}
        <button type="button" className="btn text sm ems-vped" onClick={() => abrir('pedido')}><Ic n="doc" s={16} />Ver pedido</button></>}>
      <div className="sec-b ems">
        {acoes ? <div className="ems-acoes">{acoes}</div> : null}
        <h3 className="ems-h3">Tipologias</h3>
        <div className="ems-tips">
          <div className="ems-tr ems-th" aria-hidden="true"><span>Tipologia</span><span>Área privativa (m²)</span><span>Quantidade</span><span>Área privativa total</span><span /></div>
          {tips.length ? tips.map((p) => (
            <div className="ems-tr" key={p.k} data-emtp={p.k}>
              <label><span className="lbl-f ems-ml">Tipologia</span>
                <Vivo ini={p.nome} gravar={(s) => mudarTip(p.k, 'nome', s)}>{(x) => <input aria-label="Tipologia" disabled={!edita} {...x} />}</Vivo></label>
              <label><span className="lbl-f ems-ml">Área privativa (m²)</span>
                <Vivo ini={numStr(p.area_privativa, 2)} gravar={(s) => mudarTip(p.k, 'area_privativa', s)}>{(x) => <input inputMode="decimal" data-fmt="num" data-dec={2} aria-label="Área privativa (m²)" disabled={!edita} {...x} />}</Vivo></label>
              <label><span className="lbl-f ems-ml">Quantidade</span>
                <Vivo ini={numStr(p.quantidade, 0)} gravar={(s) => mudarTip(p.k, 'quantidade', s)}>{(x) => <input inputMode="numeric" data-fmt="int" aria-label="Quantidade" disabled={!edita} {...x} />}</Vivo></label>
              <span className="num"><span className="lbl-f ems-ml">Área privativa total</span><span>{p.area_privativa != null && p.quantidade ? m2(r2(p.area_privativa * p.quantidade)) : '—'}</span></span>
              {edita ? <button className="iconbtn sm" onClick={() => gravarTips(tipsRef.current.filter((x) => x.k !== p.k))} aria-label={`Remover ${p.nome}`} title="Remover tipologia"><Ic n="close" s={18} /></button> : <span />}
            </div>
          )) : <div className="muted ems-vazio">Nenhuma tipologia ainda.</div>}
          <div className="ems-tr ems-tot"><b>Total</b><span /><span className="num"><span className="lbl-f ems-ml">Unidades</span><b>{num(c.un)}</b></span>
            <span className="num"><span className="lbl-f ems-ml">Área privativa total</span><b>{c.A != null ? m2(c.A) : '—'}</b></span><span /></div>
        </div>
        {edita ? <button className="btn text sm qd-add" onClick={addTip}><Ic n="add" s={16} />Adicionar tipologia</button> : null}
        <h3 className="ems-h3">Áreas</h3><div className="ems-g">{AREAS.map(([k, r]) => campo(k, r, 2, 'm2'))}</div>
        <h3 className="ems-h3">Vagas</h3><div className="ems-g">{VAGAS.map(([k, r]) => campo(k, r, 0))}</div>
        <h3 className="ems-h3">Índices</h3>
        <div className="ems-g">
          {ler('Área privativa total', c.A != null ? m2(c.A) : '—')}
          {campo('area_construida_m2', 'Área construída total', 2, 'm2')}
          {ler('Eficiência venal (privativa ÷ construída)', c.efic != null ? num(c.efic, 1) + '%' : '—')}
          {campo('ca_legal', 'C.A. legal', 3)}
          {campo('ca_venal', 'C.A. venal', 3)}
        </div>
        <h3 className="ems-h3">Arquivos</h3>
        <div className="ems-arqs">{['pdf', 'dwg'].map((k) => (
          <div className="ems-arq" key={k}><span className="ems-arq-t"><b>{k.toUpperCase()}</b><span className="faint">O envio entra com a aba Documentos</span></span></div>
        ))}</div>
        <h3 className="ems-h3">Análise</h3>
        <div className="ems-g"><label className="field ems-full"><span className="lbl-f">Observações</span>
          <Vivo ini={m.observacoes ?? ''} gravar={(s) => ((m.observacoes ?? '') === s.trim() ? true : salvar({ observacoes: s.trim() || null }))}>
            {(x) => <textarea rows={2} disabled={!edita} {...x} />}</Vivo></label></div>
        <div className="ems-vbs"><span className="lbl-f">Estudos de viabilidade com este estudo de massa</span>
          {vs.length ? vs.map((v, i) => <span key={v.id}>{i ? ' · ' : ''}<button className="linkbtn" onClick={() => abrirEstudo(v.id)}>{v.nome}</button>{v.segue_massa_valido ? <span className="faint"> (segue o válido)</span> : null}</span>)
            : <span className="faint">Nenhum.</span>}</div>
        {edita && m.situacao !== 'entregue' ? <div className="ems-salvar"><button className="btn primary" onClick={entregar}>Salvar</button></div> : null}
        {m.entregue_em ? <div className="hint" style={{ marginTop: 12 }}>Entregue em {fd(m.entregue_em)}.</div> : null}
      </div>
    </Quadro>
  );
}

/* ---------- Ver pedido: data, quem pediu, nome, arquiteto, prazo e briefing (editável por quem edita) ---------- */
function JanelaPedido({ m, membros, nome, edita, fechar, recarregar }: { m: R; membros: R[]; nome: (id: string) => string; edita: boolean; fechar: () => void; recarregar: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ nome: m.nome ?? '', arq: m.arquiteto_id ?? '', prazo: m.prazo ?? '', briefing: m.briefing ?? '' });
  const [grav, setGrav] = useState(false);
  const ls = String(m.briefing ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const quem = <div className="ems-ped2">
    <div className="field"><span className="lbl-f">Data do pedido</span><span className="v">{fd(m.solicitado_em)}</span></div>
    <div className="field"><span className="lbl-f">Pedido por</span><span className="v">{nome(m.solicitante_id)}</span></div></div>;
  if (!edita) return (
    <Dialogo titulo="Pedido do estudo" sub={m.nome} onFechar={fechar} rodape={<button className="btn primary" onClick={fechar}>Fechar</button>}>
      <div className="db ems-ped">{quem}
        <div className="field"><span className="lbl-f">Arquiteto</span><span className="v">{nome(m.arquiteto_id)}</span></div>
        <div className="field"><span className="lbl-f">Prazo</span><span className="v">{m.prazo ? fd(m.prazo) : 'Sem prazo'}</span></div>
        <div className="field"><span className="lbl-f">Briefing</span>{ls.length > 1 ? <ul className="ems-blist">{ls.map((x, i) => <li key={i}>{x}</li>)}</ul> : <span className="v">{ls[0] ?? 'Sem briefing'}</span>}</div>
      </div>
    </Dialogo>
  );
  async function enviar(e: FormEvent) {
    e.preventDefault();
    const d: R = {};
    if (!v.nome.trim()) { toast('Dê um nome ao estudo.', true); return; }
    if (v.nome.trim() !== m.nome) d.nome = v.nome.trim();
    if (v.arq && v.arq !== m.arquiteto_id) d.arquiteto_id = v.arq;
    if ((v.prazo || null) !== (m.prazo || null)) d.prazo = v.prazo || null;
    if (v.briefing.trim() !== (m.briefing ?? '')) d.briefing = v.briefing.trim();
    if (!Object.keys(d).length) { fechar(); return; }
    setGrav(true);
    const { error } = await supabase.rpc('salvar_estudo_massa', { p_id: m.id, p_dados: d });
    setGrav(false);
    if (error) { toast(error.message, true); return; }
    recarregar(); toast('Pedido salvo.'); fechar();
  }
  return (
    <Dialogo titulo="Pedido do estudo" sub={m.nome} onFechar={fechar}
      rodape={<><button className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" type="submit" form="f-ems-ped" disabled={grav}>Salvar</button></>}>
      <form id="f-ems-ped" onSubmit={enviar}><div className="db ems-ped">{quem}
        <label className="field"><span className="lbl-f">Nome do estudo</span><input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} /></label>
        <div className="field"><label htmlFor="ems-ped-arq">Arquiteto</label><select id="ems-ped-arq" value={v.arq} onChange={(e) => setV({ ...v, arq: e.target.value })}>
          {membros.map((x) => <option key={x.user_id} value={x.user_id}>{x.nome}</option>)}</select></div>
        <label className="field"><span className="lbl-f">Prazo</span><input type="date" value={v.prazo} onChange={(e) => setV({ ...v, prazo: e.target.value })} /></label>
        <label className="field"><span className="lbl-f">Briefing</span><textarea rows={7} placeholder="O que o estudo precisa considerar. Uma linha por item." value={v.briefing} onChange={(e) => setV({ ...v, briefing: e.target.value })} /></label>
      </div></form>
    </Dialogo>
  );
}

/* ---------- Criar estudo de viabilidade: do válido, seguir o válido ou ficar preso; de outro, preso a ele ---------- */
function JanelaViab({ m, fechar, criado }: { m: R; fechar: () => void; criado: () => void }) {
  const toast = useToast();
  const [segue, setSegue] = useState(!!m.valido);
  const [grav, setGrav] = useState(false);
  async function criar() {
    setGrav(true);
    const { data, error } = await supabase.rpc('criar_viabilidade_da_massa', { p_estudo: m.id, p_seguir_valido: !!m.valido && segue });
    setGrav(false);
    if (error) { toast(error.message, true); return; }
    toast('Estudo de viabilidade criado com as tipologias e a área construída deste estudo de massa.');
    criado(); abrirEstudo(data as string);
  }
  return (
    <Dialogo titulo="Criar estudo de viabilidade" sub={`Com as tipologias e a área construída do ${m.nome}.`} onFechar={fechar}
      rodape={<><button className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" onClick={criar} disabled={grav}>Criar</button></>}>
      <div className="db">
        {m.valido ? (
          <fieldset className="vb-chks" style={{ border: 0, padding: 0, margin: 0 }}><legend className="lbl-f">O estudo de viabilidade</legend>
            <label className="chk"><input type="radio" name="segue" checked={segue} onChange={() => setSegue(true)} /><span>Segue o estudo de massa válido <small className="faint">(trocou o válido, ele troca junto)</small></span></label>
            <label className="chk"><input type="radio" name="segue" checked={!segue} onChange={() => setSegue(false)} /><span>Fica preso a este estudo</span></label>
          </fieldset>
        ) : null}
        <div className="hint" style={{ marginTop: 8 }}>Título, área e quantidade das tipologias vêm do estudo de massa e não se editam na viabilidade; preços, permuta e comissão são da viabilidade.</div>
      </div>
    </Dialogo>
  );
}
