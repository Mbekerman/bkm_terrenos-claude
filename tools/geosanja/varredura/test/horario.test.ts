import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { instanteNoFuso, prazoDaNoite } from '../src/horario.ts';

const janela = { margemMin: 5, foraDaJanela: false };

describe('horário de São Paulo', () => {
  it('09:00 no fuso é 12:00 UTC', () => {
    assert.equal(instanteNoFuso(2026, 11, 10, 9, 0).toISOString(), '2026-11-10T12:00:00.000Z');
  });

  it('de madrugada para às 08:55', () => {
    const p = prazoDaNoite(new Date('2026-11-10T04:30:00.000Z'), janela);
    assert.equal(p?.toISOString(), '2026-11-10T11:55:00.000Z');
  });

  it('às 19:00 o limite é 08:55 da manhã seguinte', () => {
    const p = prazoDaNoite(new Date('2026-11-10T22:00:00.000Z'), janela);
    assert.equal(p?.toISOString(), '2026-11-11T11:55:00.000Z');
  });

  it('às 18:00 ainda está fora; às 20:00 já entrou', () => {
    assert.equal(prazoDaNoite(new Date('2026-11-10T21:00:00.000Z'), janela), null);
    assert.equal(prazoDaNoite(new Date('2026-11-10T23:00:00.000Z'), janela)?.toISOString(), '2026-11-11T11:55:00.000Z');
  });

  it('de dia não roda, a menos que a janela seja liberada', () => {
    const tarde = new Date('2026-11-10T18:00:00.000Z');
    assert.equal(prazoDaNoite(tarde, janela), null);
    assert.equal(prazoDaNoite(tarde, { ...janela, foraDaJanela: true })?.toISOString(), '2026-11-11T11:55:00.000Z');
  });

  it('a hora de início e a de fim vêm da configuração', () => {
    const antiga = { margemMin: 5, foraDaJanela: false, inicioHora: 22, fimHora: 7 };
    assert.equal(prazoDaNoite(new Date('2026-11-10T04:30:00.000Z'), antiga)?.toISOString(), '2026-11-10T09:55:00.000Z');
    assert.equal(prazoDaNoite(new Date('2026-11-11T01:00:00.000Z'), antiga)?.toISOString(), '2026-11-11T09:55:00.000Z');
    assert.equal(prazoDaNoite(new Date('2026-11-10T18:00:00.000Z'), antiga), null);
  });
});
