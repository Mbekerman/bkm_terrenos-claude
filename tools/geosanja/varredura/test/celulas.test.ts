import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { latLngUtm } from '../../../../apps/web/src/novo/lotesSjcPuro.ts';
import { carregarSetores, celulasUrbanas, CENTRO_SJC, PASSO_M } from '../src/celulas.ts';

describe('grade urbana de São José', () => {
  it('começa pelo centro e cobre a cidade em quadrados de 200 m', () => {
    const j = carregarSetores(fileURLToPath(new URL('../../../../docs/dados/setores-3549904-2022.json', import.meta.url)));
    const cs = celulasUrbanas(j);
    assert.ok(cs.length > 1500 && cs.length < 8000, `células: ${cs.length}`);
    const [ce, cn] = latLngUtm(CENTRO_SJC.lat, CENTRO_SJC.lng);
    const dist = (c: { x0: number; y0: number }) => Math.hypot(c.x0 + PASSO_M / 2 - ce, c.y0 + PASSO_M / 2 - cn);
    assert.ok(dist(cs[0]) < 1500, `primeira célula a ${dist(cs[0]).toFixed(0)} m do centro`);
    assert.ok(dist(cs[cs.length - 1]) > dist(cs[0]));
    assert.ok(cs.slice(0, 20).every((c) => dist(c) < 3000));
    const ids = new Set(cs.map((c) => c.id));
    assert.equal(ids.size, cs.length);
    assert.ok(cs.every((c) => c.x1 - c.x0 === PASSO_M && c.y1 - c.y0 === PASSO_M));
    for (let i = 1; i < cs.length; i++) assert.ok(cs[i - 1].ordem < cs[i].ordem || (cs[i - 1].ordem === cs[i].ordem && cs[i - 1].id <= cs[i].id));
  });
});
