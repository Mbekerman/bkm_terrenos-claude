/** Janela da varredura: 22:00 até 07:00 em America/Sao_Paulo. O job para na margem, antes das 07:00. */

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

/**
 * Instante em que o job tem de estar parado (07:00 no fuso, menos a margem).
 * null de dia, quando VARREDURA_FORA_DA_JANELA não está ligado: um disparo às 15h não varre até a manhã seguinte.
 * De madrugada (já passou da 22h, ou ainda não deu 7h) devolve o limite desta noite.
 */
export function prazoDaNoite(agora: Date, o: { margemMin: number; foraDaJanela: boolean }): Date | null {
  const p = partesNoFuso(agora);
  const dentro = p.hora >= 22 || p.hora < 7;
  if (!dentro && !o.foraDaJanela) return null;
  const dia = p.hora < 7 ? p : diaSeguinte(p);
  const sete = instanteNoFuso(dia.ano, dia.mes, dia.dia, 7, 0);
  return new Date(sete.getTime() - o.margemMin * 60_000);
}
