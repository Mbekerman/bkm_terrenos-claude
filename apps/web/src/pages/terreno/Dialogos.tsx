import { useState, type FormEvent } from 'react';
import { rpc, useAcao, useAvanco } from '../../lib/api';
import { hojeISO, lerValor, MOTIVOS_PERDA, somarDias } from '../../lib/format';
import { mensagemErro } from '../../lib/supabase';
import type { ProcessoResumo } from '../../lib/types';
import { Dialogo, useToast } from '../../components/ui';

interface Props { p: ProcessoResumo; onFechar: () => void }

export function DialogoPerda({ p, onFechar }: Props) {
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const acao = useAcao(() => rpc('encerrar_processo', { p_processo: p.id, p_status: 'perdida', p_motivo: motivo, p_detalhe: detalhe || null }));
  async function enviar(e: FormEvent) {
    e.preventDefault();
    try { await acao.mutateAsync(undefined); toast('Negociação encerrada como perdida.'); onFechar(); }
    catch (err) { toast(mensagemErro(err), true); }
  }
  return (
    <Dialogo titulo="Encerrar como perdida" onFechar={onFechar}
      rodape={<><button className="btn text" onClick={onFechar}>Cancelar</button>
        <button className="btn primary" type="submit" form="f-perda" disabled={acao.isPending}>Encerrar negociação</button></>}>
      <form id="f-perda" onSubmit={enviar}><div className="fields">
        <div className="field full"><label htmlFor="pd-m">Motivo</label>
          <select id="pd-m" required value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">Escolha um motivo</option>{MOTIVOS_PERDA.map((m) => <option key={m}>{m}</option>)}
          </select></div>
        <div className="field full"><label htmlFor="pd-t">Detalhe</label>
          <textarea id="pd-t" value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="O que levou à perda. Ajuda a calibrar as próximas compras." /></div>
      </div></form>
    </Dialogo>
  );
}

export function DialogoSuspensao({ p, onFechar }: Props) {
  const toast = useToast();
  const [retorno, setRetorno] = useState(somarDias(hojeISO(), 30));
  const [detalhe, setDetalhe] = useState('');
  const acao = useAcao(() => rpc('encerrar_processo', { p_processo: p.id, p_status: 'suspensa', p_detalhe: detalhe, p_retomar_em: retorno }));
  async function enviar(e: FormEvent) {
    e.preventDefault();
    try { await acao.mutateAsync(undefined); toast('Negociação suspensa.'); onFechar(); }
    catch (err) { toast(mensagemErro(err), true); }
  }
  return (
    <Dialogo titulo="Suspender negociação" onFechar={onFechar}
      rodape={<><button className="btn text" onClick={onFechar}>Cancelar</button>
        <button className="btn primary" type="submit" form="f-susp" disabled={acao.isPending}>Suspender</button></>}>
      <form id="f-susp" onSubmit={enviar}><div className="fields">
        <div className="field"><label htmlFor="sp-d">Retomar em</label>
          <input id="sp-d" type="date" required min={somarDias(hojeISO(), 1)} value={retorno} onChange={(e) => setRetorno(e.target.value)} /></div>
        <div className="field full"><label htmlFor="sp-t">Motivo</label>
          <textarea id="sp-t" required value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Ex.: inventário em andamento" /></div>
      </div></form>
    </Dialogo>
  );
}

export function DialogoForcar({ p, onFechar }: Props) {
  const toast = useToast();
  const av = useAvanco(p.id).data;
  const [coment, setComent] = useState('');
  const acao = useAcao(() => rpc('mover_etapa', { p_processo: p.id, p_forcar: true, p_comentario: coment }));
  const pend = av?.itens.filter((i) => !i.ok) ?? [];
  return (
    <Dialogo titulo="Avançar sem checklist completo?" onFechar={onFechar}
      rodape={<><button className="btn text" onClick={onFechar}>Cancelar</button>
        <button className="btn primary" disabled={acao.isPending || !coment.trim()}
          onClick={() => acao.mutate(undefined, {
            onSuccess: () => { toast(`Movida para ${av?.proxima_nome}. Avanço forçado registrado.`); onFechar(); },
            onError: (e) => toast(mensagemErro(e), true),
          })}>Avançar para {av?.proxima_nome}</button></>}>
      <div>Pendências: {pend.map((i) => i.texto).join('; ')}.</div>
      <div className="field"><label htmlFor="fc-c">Justificativa (fica no histórico com seu nome)</label>
        <textarea id="fc-c" value={coment} onChange={(e) => setComent(e.target.value)} placeholder="Ex.: sondagem será contratada após a proposta" /></div>
    </Dialogo>
  );
}

/** Enquanto o BKM não está integrado, os números do estudo são digitados aqui. */
export function DialogoViabilidade({ p, area, onFechar }: Props & { area: number | null }) {
  const toast = useToast();
  const [f, setF] = useState({ nome: 'Estudo base', vgv: '', margem: '', pmax: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const acao = useAcao(() => rpc('vincular_viabilidade', {
    p_processo: p.id, p_nome: f.nome, p_vgv: lerValor(f.vgv) || null,
    p_margem_pct: lerValor(f.margem) || null, p_preco_max: lerValor(f.pmax) || null,
  }));
  async function enviar(e: FormEvent) {
    e.preventDefault();
    try { await acao.mutateAsync(undefined); toast('Estudo vinculado.'); onFechar(); }
    catch (err) { toast(mensagemErro(err), true); }
  }
  return (
    <Dialogo titulo="Vincular estudo de viabilidade" sub={`Copie do BKM os números do estudo${area ? ` deste terreno (${area.toLocaleString('pt-BR')} m²)` : ''}.`} onFechar={onFechar}
      rodape={<><button className="btn text" onClick={onFechar}>Cancelar</button>
        <button className="btn primary" type="submit" form="f-viab" disabled={acao.isPending}>Vincular</button></>}>
      <form id="f-viab" onSubmit={enviar}><div className="fields">
        <div className="field full"><label htmlFor="vb-n">Nome do estudo</label><input id="vb-n" required value={f.nome} onChange={set('nome')} /></div>
        <div className="field"><label htmlFor="vb-v">VGV (R$)</label><input id="vb-v" inputMode="numeric" value={f.vgv} onChange={set('vgv')} placeholder="46.800.000" /></div>
        <div className="field"><label htmlFor="vb-m">Margem (%)</label><input id="vb-m" inputMode="decimal" value={f.margem} onChange={set('margem')} placeholder="14,8" /></div>
        <div className="field full"><label htmlFor="vb-p">Preço máximo do terreno (R$)</label><input id="vb-p" inputMode="numeric" required value={f.pmax} onChange={set('pmax')} placeholder="6.200.000" /></div>
      </div></form>
      <div className="hint">Quando o BKM estiver no mesmo banco, esta tela vira uma lista dos estudos do terreno e nada é digitado.</div>
    </Dialogo>
  );
}
