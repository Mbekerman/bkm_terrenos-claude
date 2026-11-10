// Grade da cidade. Os setores do Censo 2022 (docs/dados/setores-3549904-2022.json) dizem onde há cidade.
// Fica de fora o rural (São Francisco Xavier e a serra): densidade abaixo de 800 hab/km², menos de 30 moradores
// ou setor maior que 2 km². O que passa é cortado em quadrados de 200 m.
// Ordem: distância em metros à Praça Afonso Pena, menos a densidade (hab/km²) ÷ 50.
// Uma área de 10 mil hab/km² fica 200 m à frente de um vazio na mesma distância: o centro denso vem primeiro.
import { readFileSync } from 'node:fs';
import { latLngUtm, utmLatLng } from '../../../../apps/web/src/novo/lotesSjcPuro.ts';

export const CENTRO_SJC = { lat: -23.1794, lng: -45.8869 };
export const PASSO_M = 200;
export const DENS_MIN = 800;
export const POP_MIN = 30;
export const AREA_MAX_M2 = 2_000_000;

export interface CelulaGrade {
  id: string;
  ordem: number;
  x0: number; y0: number; x1: number; y1: number;
  lat: number; lng: number;
  densidade: number;
}

interface SetoresArquivo {
  n: number;
  g: number[][][];
  pop: number[];
  area: number[];
  cd: string[];
}

const Q = 1e5;

export function carregarSetores(caminho: string): SetoresArquivo {
  return JSON.parse(readFileSync(caminho, 'utf8')) as SetoresArquivo;
}

function aneisGrau(rs: number[][]): number[][][] {
  return rs.map((r) => {
    const a: number[][] = [];
    let x = 0, y = 0;
    for (let k = 0; k + 1 < r.length; k += 2) {
      x += r[k]; y += r[k + 1];
      a.push([x / Q, y / Q]);
    }
    return a;
  }).filter((a) => a.length >= 3);
}

function dentro(aneis: number[][][], lng: number, lat: number) {
  let ok = false;
  for (const a of aneis) {
    for (let k = 0, m = a.length - 1; k < a.length; m = k++) {
      const [xi, yi] = a[k], [xj, yj] = a[m];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ok = !ok;
    }
  }
  return ok;
}

function canto(e: number, n: number) {
  return { x0: Math.round(Math.floor(e / PASSO_M) * PASSO_M), y0: Math.round(Math.floor(n / PASSO_M) * PASSO_M) };
}

/** Células de 200 m cujo miolo ou uma amostra de 100 m cai em setor urbano. Sem repetir id. */
export function celulasUrbanas(j: SetoresArquivo): CelulaGrade[] {
  const [ce, cn] = latLngUtm(CENTRO_SJC.lat, CENTRO_SJC.lng);
  const map = new Map<string, CelulaGrade>();
  for (let i = 0; i < j.n; i++) {
    const pop = j.pop[i] || 0, area = j.area[i] || 0;
    if (pop < POP_MIN || area <= 0 || area > AREA_MAX_M2) continue;
    const dens = pop / (area / 1e6);
    if (dens < DENS_MIN) continue;
    const aneis = aneisGrau(j.g[i] || []);
    if (!aneis.length) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const a of aneis) for (const [lng, lat] of a) {
      const [x, y] = latLngUtm(lat, lng);
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    const por = (e: number, n: number) => {
      const [lat, lng] = utmLatLng(e, n);
      if (!dentro(aneis, lng, lat)) return;
      const c = canto(e, n);
      const id = `c${c.x0}_${c.y0}`;
      const cx = c.x0 + PASSO_M / 2, cy = c.y0 + PASSO_M / 2;
      const [clat, clng] = utmLatLng(cx, cy);
      const dist = Math.hypot(cx - ce, cy - cn);
      const cel: CelulaGrade = {
        id, ordem: Math.round(dist - dens / 50),
        x0: c.x0, y0: c.y0, x1: c.x0 + PASSO_M, y1: c.y0 + PASSO_M,
        lat: Math.round(clat * 1e6) / 1e6, lng: Math.round(clng * 1e6) / 1e6,
        densidade: Math.round(dens * 10) / 10,
      };
      const tinha = map.get(id);
      if (!tinha || cel.densidade > tinha.densidade) map.set(id, cel);
    };
    for (let x = Math.floor(x0 / PASSO_M) * PASSO_M; x < x1; x += PASSO_M) {
      for (let y = Math.floor(y0 / PASSO_M) * PASSO_M; y < y1; y += PASSO_M) por(x + PASSO_M / 2, y + PASSO_M / 2);
    }
    for (let x = x0; x <= x1; x += 100) for (let y = y0; y <= y1; y += 100) por(x, y);
  }
  return [...map.values()].sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : 1));
}
