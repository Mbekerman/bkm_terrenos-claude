import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { anelUtm } from '../../../../apps/web/src/novo/lotesSjcPuro.ts';
import { ClienteGeoSanja, Freio, USER_AGENT } from '../src/cliente.ts';

const dir = fileURLToPath(new URL('../../../prototipo/testes/geosanja/', import.meta.url));
const autenticar = readFileSync(dir + 'autenticar.json', 'utf8');
const localizar = readFileSync(dir + 'localizar_41002400110000.json', 'utf8');

function cliente(fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) {
  const dormiu: number[] = [];
  const c = new ClienteGeoSanja({
    base: 'https://geo.sjc.sp.gov.br/v1/',
    intervaloMin: 2000,
    intervaloMax: 3000,
    rand: () => 0,
    sleep: async (ms) => { dormiu.push(ms); },
    fetch,
    ...extra,
  });
  return { c, dormiu };
}

describe('cliente do GeoSanja', () => {
  it('usa as respostas gravadas, com o mesmo User-Agent em todo pedido', async () => {
    const agentes = new Set<string>();
    let voo = 0, max = 0;
    const { c, dormiu } = cliente(async (url, init) => {
      voo++; max = Math.max(max, voo);
      const h = init?.headers as Record<string, string>;
      agentes.add(h['User-Agent']);
      await new Promise((r) => setTimeout(r, 10));
      voo--;
      const u = String(url);
      if (u.includes('autenticar')) return new Response(autenticar, { status: 200, headers: { 'content-type': 'application/json' } });
      if (u.includes('localizar')) return new Response(localizar, { status: 200, headers: { 'content-type': 'application/json' } });
      assert.match(u, /bycoord\?x=/);
      return new Response('41.0024.0011.0000', { status: 200 });
    });
    const ic = await c.noPonto(-23.2, -45.89);
    const an = await c.anel(ic!);
    const gravado = anelUtm(JSON.parse(JSON.parse(localizar)[0].data.geom));
    assert.equal(ic, '41.0024.0011.0000');
    assert.equal(an?.length, gravado?.length);
    assert.deepEqual([...agentes], [USER_AGENT]);
    assert.equal(max, 1);
    assert.equal(dormiu.reduce((s, n) => s + n, 0), 4000);
    assert.equal(c.consultas, 3);
  });

  it('não sobrepõe pedidos', async () => {
    let voo = 0, max = 0, n = 0;
    const { c } = cliente(async (url) => {
      voo++; max = Math.max(max, voo);
      await new Promise((r) => setTimeout(r, 15));
      voo--;
      n++;
      if (String(url).includes('autenticar')) return new Response(autenticar, { status: 200 });
      return new Response('', { status: 200 });
    });
    await Promise.all([c.noPonto(1, 2), c.noPonto(3, 4), c.noPonto(5, 6)]);
    assert.equal(max, 1);
    assert.equal(n, 4);
  });

  it('403 para na hora', async () => {
    let bycoord = 0;
    const { c } = cliente(async (url) => {
      if (String(url).includes('autenticar')) return new Response(autenticar, { status: 200 });
      bycoord++;
      return new Response('bloqueado', { status: 403 });
    });
    await assert.rejects(() => c.noPonto(0, 0), (e: unknown) => e instanceof Freio && e.motivo === 'bloqueio' && /403/.test(e.message));
    assert.equal(bycoord, 1);
  });

  it('cinco falhas seguidas encerram a noite', async () => {
    let falhas = 0;
    const { c } = cliente(async (url) => {
      if (String(url).includes('autenticar')) return new Response(autenticar, { status: 200 });
      falhas++;
      return new Response('ocupado', { status: 503 });
    }, { errosSeguidos: 5, backoffInicialMs: 1000, backoffTetoMs: 100_000 });
    await assert.rejects(() => c.noPonto(0, 0), (e: unknown) => e instanceof Freio && e.motivo === 'erros');
    assert.equal(falhas, 5);
  });

  it('429 espera e, se passar, segue', async () => {
    let n = 0;
    const { c } = cliente(async (url) => {
      if (String(url).includes('autenticar')) return new Response(autenticar, { status: 200 });
      n++;
      return n === 1 ? new Response('calma', { status: 429 }) : new Response('', { status: 200 });
    }, { backoffInicialMs: 1000, backoffTetoMs: 1000 });
    assert.equal(await c.noPonto(0, 0), null);
    assert.equal(n, 2);
  });
});
