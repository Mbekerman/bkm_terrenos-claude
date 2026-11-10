import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { instanteNoFuso, prazoDaNoite } from '../src/horario.ts';

describe('horário de São Paulo', () => {
  it('07:00 no fuso é 10:00 UTC', () => {
    assert.equal(instanteNoFuso(2026, 11, 10, 7, 0).toISOString(), '2026-11-10T10:00:00.000Z');
  });

  it('de madrugada para às 06:55', () => {
    const p = prazoDaNoite(new Date('2026-11-10T04:30:00.000Z'), { margemMin: 5, foraDaJanela: false });
    assert.equal(p?.toISOString(), '2026-11-10T09:55:00.000Z');
  });

  it('às 22:00 o limite é a manhã seguinte', () => {
    const p = prazoDaNoite(new Date('2026-11-11T01:00:00.000Z'), { margemMin: 5, foraDaJanela: false });
    assert.equal(p?.toISOString(), '2026-11-11T09:55:00.000Z');
  });

  it('de dia não roda, a menos que a janela seja liberada', () => {
    const tarde = new Date('2026-11-10T18:00:00.000Z');
    assert.equal(prazoDaNoite(tarde, { margemMin: 5, foraDaJanela: false }), null);
    assert.equal(prazoDaNoite(tarde, { margemMin: 5, foraDaJanela: true })?.toISOString(), '2026-11-11T09:55:00.000Z');
  });
});
