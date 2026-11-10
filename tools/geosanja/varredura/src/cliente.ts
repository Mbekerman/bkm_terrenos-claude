// Cliente do GeoSanja para o job. Uma requisição por vez, intervalo entre elas, freio em erro.
// User-Agent fixo. Sem proxy, sem troca de IP, sem trocar o agente: se a prefeitura recusar, a noite para.
import { anelUtm, icFmt, type Anel, type ClienteMontagem } from '../../../../apps/web/src/novo/lotesSjcPuro.ts';

export const USER_AGENT = 'BKMTerrenosVarredura/1.0 (+https://bkm.com.br; contato: moises@bkm.com.br; cadastro de lotes; 1 requisicao a cada 2s)';

export class Freio extends Error {
  motivo: 'bloqueio' | 'erros' | 'horario';
  constructor(motivo: 'bloqueio' | 'erros' | 'horario', message: string) {
    super(message);
    this.name = 'Freio';
    this.motivo = motivo;
  }
}

export interface OpcoesCliente {
  base: string;
  intervaloMin: number;
  intervaloMax: number;
  errosSeguidos?: number;
  backoffInicialMs?: number;
  backoffTetoMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  rand?: () => number;
  deveParar?: () => boolean;
}

export class ClienteGeoSanja implements ClienteMontagem {
  consultas = 0;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly rand: () => number;
  private readonly deveParar: () => boolean;
  private readonly maxSeguidos: number;
  private readonly backoffInicial: number;
  private readonly backoffTeto: number;
  private token: string | null = null;
  private seguidos = 0;
  private jaHouve = false;
  private fila: Promise<void> = Promise.resolve();

  private readonly o: OpcoesCliente;
  constructor(o: OpcoesCliente) {
    this.o = o;
    this.base = o.base.endsWith('/') ? o.base : o.base + '/';
    this.fetchImpl = o.fetch ?? fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.rand = o.rand ?? Math.random;
    this.deveParar = o.deveParar ?? (() => false);
    this.maxSeguidos = o.errosSeguidos ?? 5;
    this.backoffInicial = o.backoffInicialMs ?? 15_000;
    this.backoffTeto = o.backoffTetoMs ?? 300_000;
  }

  async noPonto(lat: number, lng: number): Promise<string | null> {
    return this.exclusivo(async () => {
      const url = `${this.base}inscricao/bycoord?x=${lat.toFixed(8)}&y=${lng.toFixed(8)}`;
      const r = await this.trocar(url, { headers: { Authorization: 'Bearer ' + await this.tokenAtual() } });
      const t = (await r.text()).trim();
      return /^\d{2}\.\d{4}\.\d{4}\.\d{4}$/.test(t) ? t : null;
    });
  }

  async anel(ic: string): Promise<Anel | null> {
    return this.exclusivo(async () => {
      const r = await this.trocar(this.base + 'localizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await this.tokenAtual() },
        body: JSON.stringify({ toolId: 'SearchICTool', parametros: [{ name: 'ic', value: icFmt(ic) }] }),
      });
      const j = await r.json() as { data?: { geom?: string } }[];
      if (!Array.isArray(j) || !j[0]?.data?.geom) return null;
      const g = JSON.parse(j[0].data.geom) as { type?: string; coordinates?: unknown };
      return anelUtm(g);
    });
  }

  private exclusivo<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.fila.then(fn, fn);
    this.fila = run.then(() => undefined, () => undefined);
    return run;
  }

  private async tokenAtual() {
    if (this.token) return this.token;
    const r = await this.trocar(this.base + 'autenticar?token=VISITANTE', {}, true);
    const j = await r.json() as { token?: unknown };
    if (typeof j.token !== 'string' || !j.token) throw new Freio('erros', 'GeoSanja não devolveu token de visitante');
    this.token = j.token;
    return this.token;
  }

  /** semRefresh: o pedido do token não tenta autenticar de novo */
  private async trocar(url: string, init: RequestInit, semRefresh = false): Promise<Response> {
    let renovou = false;
    for (;;) {
      if (this.seguidos >= this.maxSeguidos) {
        throw new Freio('erros', `GeoSanja falhou ${this.seguidos} vezes seguidas (5xx, 429 ou tempo esgotado). A noite para aqui.`);
      }
      this.parar();
      if (this.jaHouve) await this.dormir(this.intervalo());
      this.jaHouve = true;
      this.parar();
      let r: Response;
      try {
        this.consultas++;
        r = await this.fetchImpl(url, {
          ...init,
          headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8', ...init.headers, 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        await this.backoff();
        continue;
      }
      if (r.status === 403) throw new Freio('bloqueio', `GeoSanja respondeu 403 em ${caminho(url)}. Sem nova tentativa.`);
      if (r.status === 401 && !semRefresh && !renovou) {
        this.token = null;
        renovou = true;
        const tk = await this.tokenAtual();
        init = { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + tk } };
        continue;
      }
      if (r.status === 401) throw new Freio('bloqueio', 'GeoSanja recusou o token de visitante (401).');
      if (r.status === 429 || r.status >= 500) {
        await this.backoff();
        continue;
      }
      if (!r.ok) throw new Freio('erros', `GeoSanja respondeu ${r.status} em ${caminho(url)}.`);
      this.seguidos = 0;
      return r;
    }
  }

  private parar() {
    if (this.deveParar()) throw new Freio('horario', 'Janela da noite encerrada.');
  }

  private intervalo() {
    const { intervaloMin: min, intervaloMax: max } = this.o;
    return min + this.rand() * Math.max(0, max - min);
  }

  private async backoff() {
    this.seguidos++;
    const ms = Math.min(this.backoffTeto, this.backoffInicial * 2 ** (this.seguidos - 1));
    await this.dormir(ms);
  }

  private async dormir(ms: number) {
    let resto = ms;
    while (resto > 0) {
      if (this.deveParar()) return;
      const passo = Math.min(250, resto);
      await this.sleep(passo);
      resto -= passo;
    }
  }
}

function caminho(url: string) {
  try { return new URL(url).pathname; } catch { return 'pedido'; }
}
