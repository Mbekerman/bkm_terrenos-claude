import { textoTransicao, useEtapas, useNomes, useTransicoes } from '../../lib/api';
import { data } from '../../lib/format';
import type { ProcessoResumo } from '../../lib/types';
import { Icon, type NomeIcone } from '../../components/ui';

const VISUAL: Record<string, [NomeIcone, string]> = {
  abertura: ['fwd', 'blue'], avanco: ['fwd', 'blue'], ganho: ['check', 'good'],
  perda: ['block', 'crit'], stand_by: ['pause', 'warn'], retomada: ['fwd', 'blue'],
};

export default function AbaHistorico({ p }: { p: ProcessoResumo }) {
  const itens = useTransicoes(p.id).data ?? [];
  const etapas = useEtapas().data ?? [];
  const nomes = useNomes();
  const nomeEtapa = (c: string | null) => etapas.find((e) => e.codigo === c)?.nome ?? c ?? '';
  return (
    <>
      <section className="card"><div className="tl">
        {itens.map((h) => {
          const [ic, cor] = h.forcado ? (['warn', 'warn'] as [NomeIcone, string]) : VISUAL[h.evento];
          return (
            <div key={h.id} className="tli">
              <span className={`ai ${cor}`}><Icon n={ic} s={16} /></span>
              <div>
                <div className="tx">{textoTransicao(h, nomeEtapa)}</div>
                <div className="ts">{nomes(h.user_id)}{h.forcado && h.comentario ? ` · ${h.comentario}` : ''}</div>
              </div>
              <span className="when">{data(h.em)}</span>
            </div>
          );
        })}
      </div></section>
      <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Registro automático e imutável. Avanços forçados aparecem destacados com a justificativa.</div>
    </>
  );
}
