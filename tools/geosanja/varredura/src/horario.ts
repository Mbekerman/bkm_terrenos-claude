/** Janela da varredura em America/Sao_Paulo. Padrão 19:00 até 09:00; o processo para na margem, antes das 09:00. */

export const FUSO = 'America/Sao_Paulo';

export interface Partes {
  ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number;
}

export function partesNoFuso(d: Date, tz = FUSO): Partes {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, minuto: +p.minute, segundo: +p.second };
}

function deslocamento(tz: string, d: Date): number {
  const p = partesNoFuso(d, tz);
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - d.getTime();
}

/** hora de parede no fuso, como instante UTC */
export function instanteNoFuso(ano: number, mes: number, dia: number, hora: number, minuto: number, tz = FUSO): Date {
  const chute = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, 0));
  const ajustado = new Date(chute.getTime() - deslocamento(tz, chute));
  return new Date(chute.getTime() - deslocamento(tz, ajustado));
}

function diaSeguinte(p: Partes) {
  const t = new Date(Date.UTC(p.ano, p.mes - 1, p.dia));
  t.setUTCDate(t.getUTCDate() + 1);
  return { ano: t.getUTCFullYear(), mes: t.getUTCMonth() + 1, dia: t.getUTCDate() };
}

export const INICIO_HORA_PADRAO = 19;
export const FIM_HORA_PADRAO = 9;

/** A hora de fim cai no dia seguinte quando a janela atravessa a meia-noite (19 → 9). */
export function dentroDaJanela(hora: number, inicio: number, fim: number) {
  if (inicio === fim) return false;
  if (inicio < fim) return hora >= inicio && hora < fim;
  return hora >= inicio || hora < fim;
}

/**
 * Instante em que o processo tem de estar parado (hora de fim no fuso, menos a margem).
 * null fora da janela, quando VARREDURA_FORA_DA_JANELA não está ligado.
 * Com a margem padrão de 5 min e fim às 9, para às 08:55.
 */
export function prazoDaNoite(agora: Date, o: { margemMin: number; foraDaJanela: boolean; inicioHora?: number; fimHora?: number }): Date | null {
  const inicio = o.inicioHora ?? INICIO_HORA_PADRAO;
  const fim = o.fimHora ?? FIM_HORA_PADRAO;
  const p = partesNoFuso(agora);
  if (!dentroDaJanela(p.hora, inicio, fim) && !o.foraDaJanela) return null;
  const dia = p.hora < fim ? p : diaSeguinte(p);
  const limite = instanteNoFuso(dia.ano, dia.mes, dia.dia, fim, 0);
  return new Date(limite.getTime() - o.margemMin * 60_000);
}
