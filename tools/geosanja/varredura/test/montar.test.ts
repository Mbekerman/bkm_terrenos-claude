import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  anelUtm, bbDe, geoNoAnel, latLngUtm, montarQuadras, pontosVizinhos, quadraDe,
  type Anel, type ClienteMontagem,
} from '../../../../apps/web/src/novo/lotesSjcPuro.ts';

const arq = fileURLToPath(new URL('../../../prototipo/testes/geosanja/localizar_41002400110000.json', import.meta.url));
const geom = JSON.parse(JSON.parse(readFileSync(arq, 'utf8'))[0].data.geom);
const an = anelUtm(geom)!;
const ic = '41.0024.0011.0000';

function cliente(): ClienteMontagem & { pontos: number; desenhos: number } {
  return {
    pontos: 0, desenhos: 0,
    async noPonto(lat, lng) {
      this.pontos++;
      const [e, n] = latLngUtm(lat, lng);
      return geoNoAnel([e, n], an) ? ic : null;
    },
    async anel() { this.desenhos++; return an; },
  };
}

describe('montagem da quadra', () => {
  it('acha o lote gravado e para na rua', async () => {
    assert.equal(quadraDe(ic), '41.0024');
    const [x0, y0, x1, y1] = bbDe(an);
    const m = 4;
    const ter: Anel = [[x0 - m, y0 - m], [x1 + m, y0 - m], [x1 + m, y1 + m], [x0 - m, y1 + m], [x0 - m, y0 - m]];
    const c = cliente();
    const r = await montarQuadras({ ter, paralelo: 1, engolirErro: false, vazioOk: true, cliente: c });
    assert.equal(r.quadras.includes('41.0024'), true);
    assert.equal(r.lotes.some((l) => l.ic === ic && !l.daBase), true);
    assert.equal(c.desenhos, 1);
    assert.equal(r.completo, true);
    assert.ok(c.pontos > 1 && c.pontos < 400);
    const fora = pontosVizinhos(an);
    assert.ok(fora.length > 0);
    assert.ok(fora.every((p) => !geoNoAnel(p, an)));
  });

  it('quadra pronta e lote conhecido não geram pedido', async () => {
    const c = cliente();
    const r = await montarQuadras({
      ter: an, paralelo: 1, conhecidos: [{ ic, an }],
      filtrarProntas: async () => ({ prontas: ['41.0024'], lotes: [{ ic, an }] }),
      cliente: c,
    });
    assert.equal(c.pontos, 0);
    assert.equal(c.desenhos, 0);
    assert.deepEqual(r.prontas, ['41.0024']);
    assert.equal(r.lotes[0]?.daBase, true);
  });
});
