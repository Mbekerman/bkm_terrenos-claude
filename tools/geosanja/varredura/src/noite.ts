import type { CelulaGrade } from './celulas.ts';
import type { ClienteMontagem } from '../../../../apps/web/src/novo/lotesSjcPuro.ts';
import { Freio } from './cliente.ts';
import type { BancoVarredura, Stats } from './banco.ts';
import { varrerCelula } from './varrer.ts';

export interface ClienteContado extends ClienteMontagem { consultas: number }

const vazia = (): Stats => ({ consultas: 0, novos: 0, atualizados: 0, apagados: 0, quadras: 0, celulas: 0 });

/**
 * Varre células pendentes até acabar a grade, dar o horário ou o freio disparar.
 * Célula interrompida volta a pendente. No terceiro estouro de limite, segue em frente
 * para a grade não travar numa célula só.
 */
export async function rodarNoite(o: {
  banco: BancoVarredura;
  cliente: ClienteContado;
  celulas: CelulaGrade[];
  deveParar: () => boolean;
  maxTentativas?: number;
}): Promise<{ motivo: string; detalhe: string; stats: Stats }> {
  await o.banco.garantir(o.celulas);
  const exec = await o.banco.abrirExecucao();
  const stats = vazia();
  let motivo = 'concluida';
  let detalhe = 'Todas as células foram varridas';
  const limite = o.maxTentativas ?? 3;
  try {
    for (;;) {
      if (o.deveParar()) { motivo = 'horario'; detalhe = 'Relógio passou do limite da noite'; break; }
      const cel = await o.banco.proxima();
      if (!cel) break;
      const c0 = o.cliente.consultas;
      const res = await varrerCelula(cel, o.cliente, o.banco);
      const usadas = o.cliente.consultas - c0;
      stats.consultas += usadas;
      stats.novos += res.novos;
      stats.atualizados += res.atualizados;
      stats.apagados += res.apagados;
      stats.quadras += res.quadras;
      if (res.freio) {
        await o.banco.fecharCelula(cel.id, 'pendente', usadas, res.lotes, res.freio.message);
        motivo = res.freio.motivo;
        detalhe = res.freio.message;
        break;
      }
      if (!res.completo) {
        const desiste = cel.tentativas >= limite;
        await o.banco.fecharCelula(cel.id, desiste ? 'concluida' : 'pendente', usadas, res.lotes,
          desiste ? 'limite de pontos; a célula fica para trás para a grade andar' : 'continua na próxima passagem');
        if (desiste) stats.celulas += 1;
      } else {
        await o.banco.fecharCelula(cel.id, res.vazio ? 'vazia' : 'concluida', usadas, res.lotes, null);
        stats.celulas += 1;
      }
      await o.banco.anotar(exec, stats);
    }
  } catch (e) {
    motivo = e instanceof Freio ? e.motivo : 'erros';
    detalhe = e instanceof Error ? e.message : String(e);
  } finally {
    try { await o.banco.fecharExecucao(exec, motivo, stats, detalhe); }
    catch (e) {
      if (motivo === 'concluida') motivo = 'erros';
      detalhe = e instanceof Error ? e.message : String(e);
    }
  }
  return { motivo, detalhe, stats };
}
