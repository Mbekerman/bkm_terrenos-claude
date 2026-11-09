/* eslint-disable @typescript-eslint/no-explicit-any */
// Frentes, esquina e testada do terreno pela poligonal (pedido do Moises, 8/nov/2026).
// O terreno inteiro sai da poligonal, não da soma dos lotes: dois lotes de meio de quadra juntos têm uma frente só, e um de
// esquina com um de meio de quadra dá um terreno de esquina.
// Em São Paulo, pelo GeoSampa: cada lado da poligonal é percorrido de metro em metro; o metro é frente quando, um pouco
// para fora (1,5, 4 ou 8 m), não há lote da prefeitura (é rua). O nome é o do eixo de logradouro paralelo ao lado a até
// 12 m (vale também quando o desenho caiu no meio da rua); sem ele, o do primeiro eixo que um raio para fora cruza (até
// 45 m, para avenida larga); sem cruzar nenhum, o mais perto a até 25 m.
// Testada de cada rua = os metros de divisa que dão para ela. Esquina = duas ruas cujas frentes se encontram ao longo da
// divisa (até 15 m entre uma e outra, por causa do chanfro e da curva da esquina). Quadra inteira = 85% ou mais do
// perímetro dando para rua, com três ruas ou mais.
import { geoAneis, geoNoAnel, nomeVia } from './geosampa';

export type Posicao = 'nao_informado' | 'meio_quadra' | 'esquina' | 'duas_frentes' | 'quadra_inteira';
export interface FrenteMedida { logradouro: string; testada_m: number }
export interface Medicao { frentes: FrenteMedida[]; posicao: Posicao; perimetro_m: number; frente_total_m: number }

type Pt = number[];
type Anel = Pt[];
interface Via { nome: string; a: Pt; b: Pt }
interface Caixa { bb: number[]; an: Anel }

const PASSO = 1;                 // m entre um ponto e outro ao longo da divisa
const AFASTAR = [1.5, 4, 8];     // m para fora da divisa
const VIA_MAX = 25;              // m do ponto até o eixo da rua, quando o raio não cruza nenhum
const PARALELA_MAX = 12;         // m do eixo paralelo ao lado, que é a rua da frente
const RAIO = 45;                 // m: até onde o raio para fora procura o eixo da rua
const ESQUINA_MAX = 15;          // m de divisa entre a frente de uma rua e a da outra
const RUA_MIN = 3;               // m: menos que isso numa rua é ruído do desenho

const caixa = (an: Anel): number[] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of an) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
const dentroCaixa = (p: Pt, b: number[]) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
function distSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Mede as frentes. `ter`: a poligonal em UTM (sem repetir o primeiro ponto no fim); `lotes`: os lotes da prefeitura em
 * volta (anéis UTM); `vias`: os eixos dos logradouros em volta (features do GeoSampa, em UTM). Função pura, para teste. */
export function medirFrentes(ter: Anel, lotes: Anel[], viasFs: any[], pontos?: { p: Pt; r: string | null }[]): Medicao {
  const Q = ter.length > 2 && ter[0][0] === ter.at(-1)![0] && ter[0][1] === ter.at(-1)![1] ? ter.slice(0, -1) : ter;
  const anelT = [...Q, Q[0]];
  const cx: Caixa[] = lotes.map((an) => ({ an, bb: caixa(an) }));
  const vias: Via[] = [];
  for (const f of viasFs) {
    const nome = nomeVia(f.properties);
    for (const L of geoAneis(f.geometry)) for (let i = 0; i < L.length - 1; i++) vias.push({ nome, a: L[i], b: L[i + 1] });
  }
  /* sentido do desenho, para saber qual lado é "fora" */
  const area2 = Q.reduce((s, p, i) => { const q = Q[(i + 1) % Q.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const sinal = Math.sign(area2) || 1;
  const emLote = (p: Pt) => cx.some((c) => dentroCaixa(p, c.bb) && geoNoAnel(p, c.an));
  /* a rua para onde o lado olha: o primeiro eixo que o raio para fora cruza (até RAIO m); sem cruzar nenhum, o eixo
     mais perto (até VIA_MAX m), como na ponta de rua sem saída */
  const ruaDoRaio = (s: Pt, nx: number, ny: number) => {
    let best: Via | null = null, tb = Infinity;
    /* eixo paralelo ao lado e bem perto: é a rua da frente (vale também para o desenho que caiu no meio da rua) */
    let dp = PARALELA_MAX;
    for (const v of vias) {
      const ex = v.b[0] - v.a[0], ey = v.b[1] - v.a[1], L = Math.hypot(ex, ey);
      if (!L || Math.abs(nx * ex + ny * ey) / L > 0.5) continue;   // o lado anda na direção (−ny, nx): paralelo = eixo ⟂ normal
      const x = distSeg(s, v.a, v.b);
      if (x < dp) { dp = x; best = v; }
    }
    if (best) return best;
    for (const v of vias) {
      const ex = v.b[0] - v.a[0], ey = v.b[1] - v.a[1], den = nx * ey - ny * ex;
      if (Math.abs(den) < 1e-9) continue;
      const wx = v.a[0] - s[0], wy = v.a[1] - s[1], t = (wx * ey - wy * ex) / den, u = (wx * ny - wy * nx) / den;
      if (t > 0 && t <= RAIO && u >= 0 && u <= 1 && t < tb) { tb = t; best = v; }
    }
    if (best) return best;
    let d = VIA_MAX;
    for (const v of vias) { const x = distSeg(s, v.a, v.b); if (x < d) { d = x; best = v; } }
    return best;
  };

  /* um rótulo por metro de divisa: o nome da rua, ou null quando dá para lote vizinho */
  const rot: (string | null)[] = [];
  let perim = 0;
  for (let i = 0; i < Q.length; i++) {
    const a = Q[i], b = Q[(i + 1) % Q.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (!L) continue;
    perim += L;
    const nx = (sinal * dy) / L, ny = (-sinal * dx) / L, n = Math.max(1, Math.round(L / PASSO));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, s = [a[0] + dx * t, a[1] + dy * t];
      let r: string | null = null;
      for (const d of AFASTAR) {
        const p = [s[0] + nx * d, s[1] + ny * d];
        if (geoNoAnel(p, anelT)) break;       // reentrância: o "fora" cai dentro do próprio terreno
        if (emLote(p)) continue;              // lote vizinho (ou o próprio lote, quando o desenho ficou aquém da rua)
        const v = ruaDoRaio(s, nx, ny);
        if (v) { r = v.nome || 'Rua sem nome'; break; }
      }
      rot.push(r); pontos?.push({ p: s, r });
    }
  }
  const m = perim / Math.max(rot.length, 1);

  /* metros por rua; rua com menos de RUA_MIN some (vira divisa) */
  const tot: Record<string, number> = {};
  rot.forEach((r) => { if (r) tot[r] = (tot[r] || 0) + m; });
  for (const k of Object.keys(tot)) if (tot[k] < RUA_MIN) delete tot[k];
  const lim = rot.map((r) => (r && tot[r] ? r : null));
  const frentes = Object.entries(tot).map(([logradouro, x]) => ({ logradouro, testada_m: Math.round(x * 100) / 100 }))
    .sort((x, y) => y.testada_m - x.testada_m);
  const frenteTotal = frentes.reduce((s, f) => s + f.testada_m, 0);

  /* esquina: andando pela divisa, uma rua termina e outra começa com no máximo ESQUINA_MAX de divisa no meio */
  let esquina = false;
  const N = lim.length, i0 = lim.findIndex((r) => r);
  if (i0 >= 0 && frentes.length > 1) {
    let ult = lim[i0]!, gap = 0;
    for (let j = 1; j <= N; j++) {
      const r = lim[(i0 + j) % N];
      if (!r) { gap += m; continue; }
      if (r !== ult && gap <= ESQUINA_MAX) { esquina = true; break; }
      ult = r; gap = 0;
    }
  }
  const posicao: Posicao = !frentes.length ? 'nao_informado'
    : frentes.length >= 3 && frenteTotal >= 0.85 * perim ? 'quadra_inteira'
    : frentes.length === 1 ? 'meio_quadra' : esquina ? 'esquina' : 'duas_frentes';
  return { frentes, posicao, perimetro_m: Math.round(perim * 100) / 100, frente_total_m: Math.round(frenteTotal * 100) / 100 };
}

