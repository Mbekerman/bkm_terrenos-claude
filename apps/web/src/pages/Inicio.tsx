import { Link, useOutletContext } from 'react-router-dom';
import { rpc, useAcao, useDocumentos, useEtapas, useFeed, useNomes, useOfertasRecentes, useProcessos, useTarefasAbertas } from '../lib/api';
import { data, hojeISO, milhoes } from '../lib/format';
import { diasParaVencer, docEmAlerta } from '../lib/regras';
import { useSessao } from '../lib/sessao';
import { mensagemErro } from '../lib/supabase';
import { Carregando, Erro, Icon, useToast, type NomeIcone } from '../components/ui';
import type { ShellCtx } from '../components/Shell';

interface Alerta { sev: 'crit' | 'warn'; i: NomeIcone; titulo: string; sub: string; para: string; ordem: number }

export default function Inicio() {
  const { membro, empresa, eGestor } = useSessao();
  const { abrirNovaOferta } = useOutletContext<ShellCtx>();
  const toast = useToast();
  const hoje = hojeISO();
  const proc = useProcessos();
  const etapas = useEtapas().data ?? [];
  const docs = useDocumentos().data ?? [];
  const tarefas = useTarefasAbertas().data ?? [];
  const feed = useFeed().data ?? [];
  const nomes = useNomes();
  const ofMes = useOfertasRecentes(hoje.slice(0, 8) + '01').data?.length ?? 0;
  const exemplo = useAcao(() => rpc<number>('carregar_dados_exemplo', { p_empresa: empresa!.id }));

  if (proc.isLoading) return <Carregando />;
  if (proc.error) return <Erro erro={proc.error} />;
  const todos = proc.data ?? [];
  const ativos = todos.filter((p) => p.status === 'ativo');
  const porId = new Map(todos.map((p) => [p.id, p]));
  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (membro?.nome ?? '').split(' ')[0];

  if (!todos.length) {
    return (
      <>
        <div className="page-h"><div><h1>{saudacao}, <span className="hand">{primeiroNome}</span></h1></div></div>
        <section className="card card-b" style={{ maxWidth: 640 }}>
          <h2>Nenhum terreno cadastrado ainda</h2>
          <p className="muted">Cadastre a primeira oferta. O sistema cria o terreno e abre a negociação em Recebida.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={abrirNovaOferta}><Icon n="add" s={18} />Nova oferta</button>
            {eGestor && (
              <button className="btn" disabled={exemplo.isPending} aria-busy={exemplo.isPending}
                onClick={() => exemplo.mutate(undefined, {
                  onSuccess: (n) => toast(`${n} terrenos de exemplo carregados.`),
                  onError: (e) => toast(mensagemErro(e), true),
                })}>
                Carregar dados de exemplo
              </button>
            )}
          </div>
        </section>
      </>
    );
  }

  const ativosIds = new Set(ativos.map((p) => p.id));
  const alertas: Alerta[] = [];
  for (const d of docs) {
    const p = porId.get(d.processo_id);
    if (!p || !ativosIds.has(p.id) || !docEmAlerta(d)) continue;
    const n = diasParaVencer(d.valido_ate);
    alertas.push(d.situacao_efetiva === 'vencido'
      ? { sev: 'crit', i: 'warn', titulo: `${d.tipo_nome} vencida`, sub: `${p.bairro} · venceu em ${data(d.valido_ate)}`, para: `/terrenos/${p.terreno_id}/documentos`, ordem: 0 }
      : { sev: 'warn', i: 'clock', titulo: `${d.tipo_nome} vence em ${n} dias`, sub: `${p.bairro} · ${p.etapa_nome}`, para: `/terrenos/${p.terreno_id}/documentos`, ordem: 2 });
  }
  for (const p of ativos) {
    if (p.acima_preco_max) alertas.push({ sev: 'warn', i: 'money', titulo: `Proposta ${milhoes(p.ultima_proposta_valor)} acima do preço máximo de ${milhoes(p.preco_max_terreno)}`, sub: `${p.bairro} · ${p.etapa_nome}`, para: `/terrenos/${p.terreno_id}/propostas`, ordem: 1 });
    if (p.dias_na_etapa >= 21) alertas.push({ sev: 'warn', i: 'pause', titulo: `Parada há ${p.dias_na_etapa} dias em ${p.etapa_nome}`, sub: `${p.bairro} · ${p.responsavel_nome ?? '—'}`, para: `/terrenos/${p.terreno_id}`, ordem: 3 });
  }
  const atrasadas = tarefas.filter((t) => t.prazo < hoje && ativosIds.has(t.processo_id));
  for (const t of atrasadas) {
    const p = porId.get(t.processo_id)!;
    alertas.push({ sev: 'crit', i: 'clock', titulo: t.titulo, sub: `${p.bairro} · ${nomes(t.responsavel_id)} · venceu ${data(t.prazo)}`, para: `/terrenos/${p.terreno_id}`, ordem: 0 });
  }
  alertas.sort((a, b) => a.ordem - b.ordem);
  const docsAlerta = docs.filter((d) => ativosIds.has(d.processo_id) && docEmAlerta(d)).length;

  const contagem = etapas.map((e) => ({
    e, n: todos.filter((p) => p.etapa_atual === e.codigo && (p.status === 'ativo' || (e.codigo === 'ganha' && p.status === 'ganha'))).length,
  }));
  const max = Math.max(1, ...contagem.map((c) => c.n));

  return (
    <>
      <div className="page-h"><div>
        <h1>{saudacao}, <span className="hand">{primeiroNome}</span></h1>
        <div className="sub">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {ativos.length} negociações em andamento</div>
      </div></div>
      <div className="kpis">
        <Link className="kpi" to="/negociacoes"><span className="v">{ativos.length}</span><span className="l">Negociações ativas</span></Link>
        <Link className="kpi" to="/terrenos"><span className="v">{ofMes}</span><span className="l">Ofertas recebidas no mês</span></Link>
        <Link className={`kpi ${docsAlerta ? 'warn' : ''}`} to="/documentos?f=alerta"><span className="v">{docsAlerta}</span><span className="l">Documentos vencidos ou a vencer em 15 dias</span></Link>
        <Link className={`kpi ${atrasadas.length ? 'crit' : ''}`} to={atrasadas[0] ? `/terrenos/${porId.get(atrasadas[0].processo_id)!.terreno_id}` : '/negociacoes'}>
          <span className="v">{atrasadas.length}</span><span className="l">Tarefas atrasadas</span></Link>
      </div>
      <div className="grid-6040 sect-gap">
        <section className="card">
          <div className="card-h"><h2>Precisa de atenção</h2><span className={`chip ${alertas.some((a) => a.sev === 'crit') ? 'crit' : 'warn'}`}>{alertas.length}</span></div>
          <div className="alist" style={{ marginTop: 8 }}>
            {alertas.length ? alertas.map((a, i) => (
              <Link key={i} className="aitem" to={a.para}>
                <span className={`ai ${a.sev}`}><Icon n={a.i} s={18} /></span>
                <span><div className="at">{a.titulo}</div><div className="as">{a.sub}</div></span>
                <span className="when"><Icon n="chev" s={18} /></span>
              </Link>
            )) : <div className="empty">Nada pendente. Tudo em dia.</div>}
          </div>
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-h"><h2>Funil</h2><Link className="btn text sm" to="/negociacoes">Abrir quadro</Link></div>
            <div className="card-b">
              <div className="funnel">
                {contagem.map(({ e, n }) => (
                  <Link key={e.codigo} to="/negociacoes" className={`frow ${e.codigo === 'ganha' ? 'won' : ''}`} style={{ textDecoration: 'none' }}>
                    <span className="fl">{e.nome}</span>
                    <span className="ft"><span className="fb" style={{ display: 'block', width: `${n ? Math.max(6, (n / max) * 100) : 0}%` }} /></span>
                    <span className="fn">{n}</span>
                  </Link>
                ))}
              </div>
              <div className="funnel-foot">
                <span>Perdidas: <b>{todos.filter((p) => p.status === 'perdida').length}</b></span>
                <span>Suspensas: <b>{todos.filter((p) => p.status === 'suspensa').length}</b></span>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-h"><h2>Atividade recente</h2></div>
            <div className="tl" style={{ marginTop: 8 }}>
              {feed.map((f, i) => {
                const p = porId.get(f.processo_id);
                return (
                  <div className="tli" key={i}>
                    <span className={`ai ${f.tipo === 'atividade' ? 'good' : 'blue'}`}><Icon n={f.tipo === 'atividade' ? 'chat' : 'fwd'} s={16} /></span>
                    <div><div className="tx">{f.texto}</div><div className="ts">{p?.bairro} · {nomes(f.user_id)}</div></div>
                    <span className="when">{data(f.em)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
