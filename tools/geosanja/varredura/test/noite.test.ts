import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Anel } from '../../../../apps/web/src/novo/lotesSjcPuro.ts';
import type { BancoVarredura, CelulaSeed, Stats } from '../src/banco.ts';
import { Freio } from '../src/cliente.ts';
import type { CelulaGrade } from '../src/celulas.ts';
import { rodarNoite, type ClienteContado } from '../src/noite.ts';

function grade(n: number): CelulaGrade[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, ordem: i, x0: i * 200, y0: 0, x1: i * 200 + 200, y1: 200, lat: 0, lng: 0, densidade: 1000,
  }));
}

function banco() {
  const cels = new Map<string, { situacao: string; tentativas: number; ordem: number; x0: number; y0: number; x1: number; y1: number }>();
  const fechadas: string[] = [];
  const execs: { motivo: string | null }[] = [];
  const b: BancoVarredura = {
    tabelasLotes: async () => true,
    async garantir(cs: CelulaSeed[]) {
      for (const c of cs) if (!cels.has(c.id)) cels.set(c.id, { situacao: 'pendente', tentativas: 0, ordem: c.ordem, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 });
    },
    async abrirExecucao() {
      for (const e of execs) if (e.motivo == null) e.motivo = 'queda';
      for (const c of cels.values()) if (c.situacao === 'em_andamento') c.situacao = 'pendente';
      execs.push({ motivo: null });
      return execs.length;
    },
    anotar: async (_id: number, _s: Stats) => {},
    async fecharExecucao(id, motivo) {
      const e = execs[id - 1];
      if (!e || e.motivo) throw new Error('execução não está aberta');
      e.motivo = motivo;
    },
    async proxima() {
      const lista = [...cels.entries()].filter(([, c]) => c.situacao === 'pendente').sort((a, b) => a[1].ordem - b[1].ordem);
      const item = lista[0];
      if (!item) return null;
      const [id, c] = item;
      c.situacao = 'em_andamento';
      c.tentativas++;
      return { id, ordem: c.ordem, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, tentativas: c.tentativas };
    },
    async fecharCelula(id, situacao) {
      const c = cels.get(id);
      if (!c || c.situacao !== 'em_andamento') throw new Error('célula');
      c.situacao = situacao;
      fechadas.push(`${id}:${situacao}`);
    },
    conhecidos: async () => [],
    prontas: async () => ({ prontas: [], lotes: [] }),
    guardar: async () => ({ novos: 1, atualizados: 0, apagados: 0 }),
  };
  return { b, cels, fechadas, execs };
}

const rua: ClienteContado = {
  consultas: 0,
  async noPonto() { this.consultas++; return null; },
  async anel() { return null as Anel | null; },
};

describe('noite', () => {
  it('célula sem lote fica vazia e a grade termina', async () => {
    const m = banco();
    const c: ClienteContado = { consultas: 0, noPonto: rua.noPonto, anel: rua.anel };
    const r = await rodarNoite({ banco: m.b, cliente: c, celulas: grade(1), deveParar: () => false });
    assert.equal(r.motivo, 'concluida');
    assert.equal(m.fechadas[0], 'c0:vazia');
    assert.equal(m.execs[0]?.motivo, 'concluida');
    assert.ok(c.consultas > 0);
  });

  it('bloqueio devolve a célula e não pega a próxima', async () => {
    const m = banco();
    const c: ClienteContado = {
      consultas: 0,
      async noPonto() { this.consultas++; throw new Freio('bloqueio', 'GeoSanja respondeu 403'); },
      async anel() { return null; },
    };
    const r = await rodarNoite({ banco: m.b, cliente: c, celulas: grade(2), deveParar: () => false });
    assert.equal(r.motivo, 'bloqueio');
    assert.deepEqual(m.fechadas, ['c0:pendente']);
    assert.equal(m.cels.get('c1')?.situacao, 'pendente');
    assert.equal(m.cels.get('c1')?.tentativas, 0);
  });

  it('o relógio para antes da próxima célula', async () => {
    const m = banco();
    let ticks = 0;
    const c: ClienteContado = { consultas: 0, noPonto: async function (this: ClienteContado) { this.consultas++; return null; }, anel: async () => null };
    const r = await rodarNoite({
      banco: m.b, cliente: c, celulas: grade(2),
      deveParar: () => { ticks++; return ticks > 1; },
    });
    assert.equal(r.motivo, 'horario');
    assert.deepEqual(m.fechadas, ['c0:vazia']);
    assert.equal(m.cels.get('c1')?.tentativas, 0);
  });
});
