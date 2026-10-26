import { useState, type FormEvent } from 'react';
import { useAcao, useMembros, useTarefas, useViabilidade } from '../../lib/api';
import { data, hojeISO, m2, milhoes, reais, somarDias } from '../../lib/format';
import { useSessao } from '../../lib/sessao';
import { mensagemErro, supabase } from '../../lib/supabase';
import type { Oferta, ProcessoResumo, Terreno } from '../../lib/types';
import { Avatar, Icon, useToast } from '../../components/ui';

export default function AbaResumo({ t, p, ofertas, onVincular }: { t: Terreno; p: ProcessoResumo; ofertas: Oferta[]; onVincular: () => void }) {
  const primeira = ofertas[0];
  return (
    <div className="grid-6040">
      <div className="stack">
        <section className="card"><div className="card-h"><h2>Viabilidade</h2></div>
          <div className="card-b"><Viab p={p} onVincular={onVincular} /></div></section>
        <Tarefas p={p} />
      </div>
      <section className="card"><div className="card-h"><h2>Terreno</h2></div>
        <div className="card-b"><dl className="kv">
          <dt>Endereço</dt><dd>{t.endereco}, {t.bairro}, {t.cidade}</dd>
          <dt>Área</dt><dd>{m2(t.area_m2)}</dd>
          <dt>Frente</dt><dd>{t.frente_m != null ? `${Number(t.frente_m).toLocaleString('pt-BR')} m` : '—'}</dd>
          <dt>Zoneamento</dt><dd>{t.zoneamento ?? '—'}</dd>
          <dt>Matrículas</dt><dd>{t.terreno_matriculas.length ? t.terreno_matriculas.map((m) => <div key={m.id}>{m.numero} · {m.cartorio}</div>) : '—'}</dd>
          <dt>Proprietários</dt><dd>{t.terreno_proprietarios.length ? t.terreno_proprietarios.map((x) => (
            <div key={x.pessoas.id}>{x.pessoas.nome}{t.terreno_proprietarios.length > 1 && <span className="faint"> ({x.participacao_pct}%)</span>}</div>
          )) : '—'}</dd>
          <dt>Pedido por m²</dt><dd>{primeira?.valor_pedido && t.area_m2 ? reais(Math.round(primeira.valor_pedido / t.area_m2)) : '—'}</dd>
        </dl></div></section>
    </div>
  );
}

function Viab({ p, onVincular }: { p: ProcessoResumo; onVincular: () => void }) {
  const v = useViabilidade(p.viabilidade_id).data;
  if (!p.viabilidade_id) {
    return (
      <div className="banner blue"><Icon n="link" /><div style={{ flex: 1 }}>
        <div className="bt">Sem estudo vinculado</div>
        <div>Rode a viabilidade no BKM e vincule aqui para ver a margem do estudo.</div>
        {p.status === 'ativo' && <button className="btn sm" style={{ marginTop: 10 }} onClick={onVincular}><Icon n="link" s={16} />Vincular estudo</button>}
      </div></div>
    );
  }
  if (!v) return <div className="muted">Carregando…</div>;
  const fmt = (x: number | null) => (x != null ? `${Number(x).toLocaleString('pt-BR')}%` : '—');
  return (
    <>
      <div className="metrics">
        <div className="metric"><div className="ml">VGV</div><div className="mv">{milhoes(v.vgv)}</div></div>
        <div className="metric"><div className="ml">Margem</div><div className="mv">{fmt(v.margem_pct)}</div></div>
        <div className="metric"><div className="ml">Rentabilidade mínima</div><div className="mv">{fmt(p.margem_minima_pct)}</div></div>
      </div>
      {p.abaixo_margem_min && (
        <div className="banner warn" style={{ marginTop: 12 }}><Icon n="warn" /><div>Rentabilidade abaixo da mínima da empresa.</div></div>
      )}
      <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>{v.nome} · {data(v.calculado_em)}</div>
    </>
  );
}

function Tarefas({ p }: { p: ProcessoResumo }) {
  const toast = useToast();
  const { empresa, session } = useSessao();
  const membros = useMembros().data ?? [];
  const tarefas = useTarefas(p.id).data ?? [];
  const hoje = hojeISO();
  const [titulo, setTitulo] = useState('');
  const [prazo, setPrazo] = useState(somarDias(hoje, 7));
  const [resp, setResp] = useState(p.responsavel_id ?? session?.user.id ?? '');
  const nome = (id: string | null) => membros.find((m) => m.user_id === id)?.nome ?? '—';

  const marcar = useAcao(async ({ id, feito }: { id: string; feito: boolean }) => {
    const { error } = await supabase.from('tarefas').update({ concluida_em: feito ? new Date().toISOString() : null }).eq('id', id);
    if (error) throw error;
  });
  const criar = useAcao(async () => {
    const { error } = await supabase.from('tarefas').insert({ empresa_id: empresa!.id, processo_id: p.id, titulo, prazo, responsavel_id: resp || null });
    if (error) throw error;
  });
  async function enviar(e: FormEvent) {
    e.preventDefault();
    try { await criar.mutateAsync(undefined); setTitulo(''); toast('Tarefa adicionada.'); }
    catch (err) { toast(mensagemErro(err), true); }
  }
  const ordenadas = [...tarefas].sort((a, b) => Number(!!a.concluida_em) - Number(!!b.concluida_em) || a.prazo.localeCompare(b.prazo));

  return (
    <section className="card">
      <div className="card-h"><h2>Tarefas</h2><span className="faint" style={{ fontSize: 13 }}>{tarefas.filter((x) => !x.concluida_em).length} abertas</span></div>
      <div className="card-b" style={{ paddingTop: 8 }}>
        {ordenadas.length ? ordenadas.map((k) => {
          const atrasada = !k.concluida_em && k.prazo < hoje;
          return (
            <label key={k.id} className={`task ${k.concluida_em ? 'done' : ''}`}>
              <input type="checkbox" checked={!!k.concluida_em}
                onChange={(e) => marcar.mutate({ id: k.id, feito: e.target.checked }, { onError: (er) => toast(mensagemErro(er), true) })} />
              <span className="tt"><div className="t1">{k.titulo}</div>
                <div className={`tm ${atrasada ? 'late' : ''}`}>{nome(k.responsavel_id)} · {atrasada ? 'atrasada desde ' : 'até '}{data(k.prazo)}</div></span>
              <Avatar nome={nome(k.responsavel_id)} sm />
            </label>
          );
        }) : <div className="muted">Nenhuma tarefa.</div>}
        {p.status !== 'perdida' && (
          <form className="inline-form" onSubmit={enviar}>
            <div className="field grow"><label htmlFor="tk-t">Nova tarefa</label>
              <input id="tk-t" required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: pedir certidão atualizada" /></div>
            <div className="field"><label htmlFor="tk-p">Prazo</label><input id="tk-p" type="date" required value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>
            <div className="field"><label htmlFor="tk-r">Responsável</label>
              <select id="tk-r" value={resp} onChange={(e) => setResp(e.target.value)}>
                {membros.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
              </select></div>
            <button className="btn sm" type="submit" disabled={criar.isPending}><Icon n="add" s={16} />Adicionar</button>
          </form>
        )}
      </div>
    </section>
  );
}
