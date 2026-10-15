import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { rpc, useAcao, useAvanco, useChecklist, useOfertas, usePropostas, useProcessoDoTerreno, useTerreno, useAtividades, useEtapas } from '../../lib/api';
import { data, m2 } from '../../lib/format';
import { useSessao } from '../../lib/sessao';
import { mensagemErro } from '../../lib/supabase';
import type { Avanco, ProcessoResumo } from '../../lib/types';
import { Avatar, Carregando, ChipStatus, Erro, Icon, useToast } from '../../components/ui';
import { DialogoPerda, DialogoSuspensao, DialogoForcar, DialogoViabilidade } from './Dialogos';
import AbaResumo from './AbaResumo';
import AbaPropostas from './AbaPropostas';
import AbaDocumentos from './AbaDocumentos';
import AbaAtividades from './AbaAtividades';
import AbaOfertas from './AbaOfertas';
import AbaHistorico from './AbaHistorico';

type Modal = null | 'perder' | 'suspender' | 'forcar' | 'viab';
const ABAS = ['resumo', 'propostas', 'documentos', 'atividades', 'ofertas', 'historico'] as const;
type Aba = (typeof ABAS)[number];

export default function TerrenoPage() {
  const { id, aba: abaUrl } = useParams();
  const nav = useNavigate();
  const aba: Aba = (ABAS as readonly string[]).includes(abaUrl ?? '') ? (abaUrl as Aba) : 'resumo';
  const terreno = useTerreno(id);
  const proc = useProcessoDoTerreno(id);
  const p = proc.data ?? undefined;
  const ofertas = useOfertas(id).data ?? [];
  const propostas = usePropostas(p?.id).data ?? [];
  const atividades = useAtividades(p?.id).data ?? [];
  const checklist = useChecklist(p?.id).data ?? [];
  const [modal, setModal] = useState<Modal>(null);

  if (terreno.isLoading || proc.isLoading) return <Carregando />;
  if (terreno.error) return <Erro erro={terreno.error} />;
  if (!terreno.data || !p) return <Erro erro="Terreno não encontrado." />;
  const t = terreno.data;

  const exigidos = checklist.filter((c) => c.ativo && c.obrigatorio);
  const okDocs = exigidos.filter((c) => c.situacao === 'validado').length;
  const contagem: Record<Aba, string> = {
    resumo: '', propostas: String(propostas.length),
    documentos: exigidos.length ? `${okDocs}/${exigidos.length}` : String(checklist.filter((c) => c.documento_id).length),
    atividades: String(atividades.length), ofertas: String(ofertas.length), historico: '',
  };
  const nomesAba: Record<Aba, string> = { resumo: 'Resumo', propostas: 'Propostas', documentos: 'Documentos', atividades: 'Atividades', ofertas: 'Ofertas', historico: 'Histórico' };
  const irAba = (a: Aba) => nav(`/terrenos/${id}/${a === 'resumo' ? '' : a}`, { replace: true });

  return (
    <>
      <button className="back" onClick={() => (history.length > 1 ? nav(-1) : nav('/terrenos'))}><Icon n="back" />Voltar</button>
      <div className="dhead">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow"><span className="num">{t.codigo}</span><span>·</span><span className="num">Negociação {p.codigo}</span><span>·</span><span>aberta em {data(p.aberto_em)}</span></div>
          <h1>{t.bairro} · {t.endereco}</h1>
          <div className="dchips">
            <ChipStatus status={p.status} etapa={p.etapa_nome} />
            <span className="chip num">{m2(t.area_m2)}</span>
            {t.zoneamento && <span className="chip">{t.zoneamento}</span>}
            {t.frente_m != null && <span className="chip num">Frente {Number(t.frente_m).toLocaleString('pt-BR')} m</span>}
            <span className="chip num">{t.terreno_matriculas.length} matrícula{t.terreno_matriculas.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar nome={p.responsavel_nome} />
          <div><div style={{ fontWeight: 500 }}>{p.responsavel_nome ?? '—'}</div><div className="faint" style={{ fontSize: 12 }}>Responsável</div></div>
        </div>
      </div>

      <Status p={p} onModal={setModal} irAba={irAba} />

      <div className="tabs" role="tablist">
        {ABAS.map((a) => (
          <button key={a} className="tab" role="tab" aria-selected={aba === a} onClick={() => irAba(a)}>
            {nomesAba[a]}{contagem[a] && <span className="n"> {contagem[a]}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'resumo' && <AbaResumo t={t} p={p} ofertas={ofertas} onVincular={() => setModal('viab')} />}
        {aba === 'propostas' && <AbaPropostas p={p} propostas={propostas} />}
        {aba === 'documentos' && <AbaDocumentos p={p} itens={checklist} />}
        {aba === 'atividades' && <AbaAtividades p={p} itens={atividades} />}
        {aba === 'ofertas' && <AbaOfertas area={t.area_m2} ofertas={ofertas} />}
        {aba === 'historico' && <AbaHistorico p={p} />}
      </div>

      {modal === 'perder' && <DialogoPerda p={p} onFechar={() => setModal(null)} />}
      {modal === 'suspender' && <DialogoSuspensao p={p} onFechar={() => setModal(null)} />}
      {modal === 'forcar' && <DialogoForcar p={p} onFechar={() => setModal(null)} />}
      {modal === 'viab' && <DialogoViabilidade p={p} area={t.area_m2} onFechar={() => setModal(null)} />}
    </>
  );
}

function Status({ p, onModal, irAba }: { p: ProcessoResumo; onModal: (m: Modal) => void; irAba: (a: Aba) => void }) {
  const toast = useToast();
  const retomar = useAcao(() => rpc('retomar_processo', { p_processo: p.id }));
  if (p.status === 'perdida') {
    return (
      <div className="banner crit"><Icon n="block" /><div>
        <div className="bt">Perdida em {p.etapa_nome} · {p.motivo_encerramento}</div>
        {p.detalhe_encerramento && <div>{p.detalhe_encerramento}</div>}
      </div></div>
    );
  }
  if (p.status === 'stand_by') {
    return (
      <div className="banner warn" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 12 }}><Icon n="pause" /><span>
          <span className="bt">Suspensa em {p.etapa_nome} até {data(p.retomar_em)}</span><br />
          {p.detalhe_encerramento && <span>{p.detalhe_encerramento}</span>}
        </span></span>
        <button className="btn sm" disabled={retomar.isPending}
          onClick={() => retomar.mutate(undefined, { onSuccess: () => toast('Negociação retomada.'), onError: (e) => toast(mensagemErro(e), true) })}>
          Retomar negociação
        </button>
      </div>
    );
  }
  return (
    <section className="card">
      <Stepper p={p} />
      <PainelAvanco p={p} onModal={onModal} irAba={irAba} />
    </section>
  );
}

function Stepper({ p }: { p: ProcessoResumo }) {
  const etapas = useEtapas().data ?? [];
  return (
    <ol className="stepper" aria-label="Etapas">
      {etapas.map((e, i) => {
        const st = e.ordem < p.etapa_ordem || p.status === 'ganha' ? 'done' : e.ordem === p.etapa_ordem ? 'cur' : 'fut';
        return (
          <li key={e.codigo} className={`step ${st}`} aria-current={st === 'cur' ? 'step' : undefined}>
            <span className="dot">{st === 'done' ? <Icon n="check" s={14} /> : i + 1}</span>
            <span className="sl">{e.nome}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PainelAvanco({ p, onModal, irAba }: { p: ProcessoResumo; onModal: (m: Modal) => void; irAba: (a: Aba) => void }) {
  const toast = useToast();
  const { eGestor } = useSessao();
  const av = useAvanco(p.id);
  const mover = useAcao(() => rpc<Avanco>('mover_etapa', { p_processo: p.id, p_forcar: false }));

  if (p.status === 'ganha') {
    return (
      <div className="adv"><div className="banner good" style={{ flex: 1 }}><Icon n="check" /><div>
        <div className="bt">Negociação ganha</div>
        <div>Aprovação de projeto, incorporação e financiamento Caixa vão se ligar a este terreno nas próximas fases do sistema.</div>
      </div></div></div>
    );
  }
  const a = av.data;
  if (!a) return <div className="adv muted">{av.error ? mensagemErro(av.error) : 'Verificando requisitos…'}</div>;
  if (!a.proxima) return null;

  const corrigir = (tipo: string) =>
    tipo === 'viabilidade' ? <> · <button className="linkbtn" onClick={() => onModal('viab')}>Vincular estudo</button></>
      : tipo === 'documento' ? <> · <button className="linkbtn" onClick={() => irAba('documentos')}>Ver documentos</button></>
        : tipo === 'proposta' ? <> · <button className="linkbtn" onClick={() => irAba('propostas')}>Ver propostas</button></> : null;

  return (
    <div className="adv">
      <div className="req">
        <div className="rt">{a.itens.length ? `Para avançar para ${a.proxima_nome}` : `Próxima etapa: ${a.proxima_nome}`}</div>
        {a.itens.length ? (
          <ul>
            {a.itens.map((i, k) => (
              <li key={k}><span className={i.ok ? 'ok' : 'no'}><Icon n={i.ok ? 'check' : 'close'} s={16} /></span>
                <span>{i.texto}{!i.ok && corrigir(i.tipo)}</span></li>
            ))}
          </ul>
        ) : <div className="muted" style={{ fontSize: 13 }}>Sem requisitos para avançar.</div>}
      </div>
      <div className="acts">
        <button className="btn text" onClick={() => onModal('suspender')}><Icon n="pause" s={18} />Stand by</button>
        <button className="btn text danger" onClick={() => onModal('perder')}><Icon n="block" s={18} />Perdida</button>
        {a.pode_forcar && eGestor && <button className="btn" onClick={() => onModal('forcar')}>Avançar mesmo assim</button>}
        <button className="btn primary" disabled={!a.ok || mover.isPending} aria-busy={mover.isPending}
          onClick={() => mover.mutate(undefined, {
            onSuccess: () => toast(a.proxima === 'ganha' ? 'Negociação ganha.' : `Movida para ${a.proxima_nome}.`),
            onError: (e) => toast(mensagemErro(e), true),
          })}>
          <Icon n="fwd" s={18} />Avançar para {a.proxima_nome}
        </button>
      </div>
    </div>
  );
}

