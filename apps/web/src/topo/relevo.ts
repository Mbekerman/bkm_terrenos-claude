/* eslint-disable @typescript-eslint/no-explicit-any */
// Relevo medido sozinho (porte de tools/prototipo/proto_infra.js › tpAuto, tpMedir, tpPlano; decisões do Moisés de 3 e
// 4/nov/2026): as cotas dentro da poligonal (laser 2020 da prefeitura em São Paulo, Google fora, numa grade de 5 m) dão a
// declividade média (média da inclinação em cada ponto), que decide o perfil; o plano que melhor se ajusta às cotas dá a
// inclinação (só mostrada) e a terra mexida até ele (média de |cota − plano|, m³ por m²), que só pesa no crítico e só
// vale com o laser. O perfil sai do banco (app.registrar_topografia › app.classificar_topografia). Mede ao abrir a
// ficha, em qualquer aba, quem edita e quando o terreno tem poligonal e não tem medição: a poligonal nova apaga a medição
// no banco (t_norm), então salvar a poligonal leva a medir de novo. Falha não tenta sozinha de novo para a mesma
// poligonal na sessão; "Tentar de novo" e "Medir de novo" no quadro Relevo.
import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { GEO_BASE, geoAreaAnel, latLngUtm } from '../novo/geosampa';
import { centroPoly, type P } from '../novo/geo';
import { cotasGoogle, cotasLaser, grade, PASSO_G, type Grade } from './gerar';

export interface Plano { decl: number; incl: number; terra: number; desnivel: number; min: number; max: number; n: number }

/** plano z = a·x + b·y + c pelas células dentro da poligonal (D = 0); inclinação = |∇| e terra mexida = média de |resíduo|;
 *  declividade média = média de |∇z| em cada célula (diferença centrada com as vizinhas, ou de um lado só na borda) */
export function plano(G: Grade): Plano | null {
  let n = 0, sx = 0, sy = 0, sz = 0;
  const X: number[] = [], Y: number[] = [], Z: number[] = [];
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    const c = j * G.nx + i, z = G.Z[c];
    if (G.D[c] !== 0 || z !== z) continue;
    const x = i * G.s, y = j * G.s;
    X.push(x); Y.push(y); Z.push(z); sx += x; sy += y; sz += z; n++;
  }
  if (n < 3) return null;
  const mx = sx / n, my = sy / n, mz = sz / n;
  let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0, mn = Infinity, mxz = -Infinity;
  for (let q = 0; q < n; q++) {
    const x = X[q] - mx, y = Y[q] - my, z = Z[q] - mz;
    xx += x * x; xy += x * y; yy += y * y; xz += x * z; yz += y * z;
    if (Z[q] < mn) mn = Z[q];
    if (Z[q] > mxz) mxz = Z[q];
  }
  const det = xx * yy - xy * xy, a = det ? (xz * yy - yz * xy) / det : 0, b = det ? (yz * xx - xz * xy) / det : 0;
  let res = 0;
  for (let q = 0; q < n; q++) res += Math.abs(Z[q] - mz - a * (X[q] - mx) - b * (Y[q] - my));
  const ZG = G.Z, v = (c: number) => { const z = ZG[c]; return z === z ? z : null; };
  let sd = 0, nd = 0;
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    const c = j * G.nx + i;
    if (G.D[c] !== 0 || v(c) == null) continue;
    const d = (p: number | null, q: number | null, k: number) => {
      const zp = p != null ? v(p) : null, zq = q != null ? v(q) : null;
      return zp != null && zq != null ? (zp - zq) / (k * G.s) : zp != null ? (zp - ZG[c]) / G.s : zq != null ? (ZG[c] - zq) / G.s : 0;
    };
    const gx = d(i < G.nx - 1 ? c + 1 : null, i > 0 ? c - 1 : null, 2), gy = d(j < G.ny - 1 ? c + G.nx : null, j > 0 ? c - G.nx : null, 2);
    sd += Math.hypot(gx, gy); nd++;
  }
  return { decl: +(sd / nd * 100).toFixed(2), incl: +(Math.hypot(a, b) * 100).toFixed(2), terra: +(res / n).toFixed(3), desnivel: +(mxz - mn).toFixed(2), min: mn, max: mxz, n };
}

export const ehSP = (municipioId: string | null | undefined, municipio?: string | null) => municipioId === '3550308' || /^são paulo$/i.test(municipio ?? '');
/** medição válida só para esta forma (a de outra poligonal não vale) */
export const chavePoly = (poly: P[] | null) => (poly && poly.length >= 3 ? poly.map((p) => (+p[0]).toFixed(6) + ',' + (+p[1]).toFixed(6)).join(';') : '');

/** mede as cotas dentro da poligonal; laser em São Paulo (grade de 1 m, 2 m acima de 4 ha), Google fora (grade de 5 m) */
export async function medirRelevo(poly: P[], sp: boolean): Promise<Plano & { fonte: 'laser' | 'google' }> {
  const c0 = centroPoly(poly), zona = Math.floor((c0[1] + 180) / 6) + 1, l0 = -183 + 6 * zona;
  const P = [poly.map(([la, lo]) => latLngUtm(la, lo, l0) as number[])];
  const area = geoAreaAnel(P[0]), passo = sp ? (area > 40000 ? 2 : 1) : PASSO_G, m = sp ? 4 : 3 * PASSO_G;
  const e = P[0].reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  const bb = [e[0] - m, e[1] - m, e[2] + m, e[3] + m].map((x) => Math.round(x));
  const G = grade(P, bb, passo), nada = () => {};
  if (sp) await cotasLaser(G, bb, nada); else await cotasGoogle(G, l0, nada);
  const r = plano(G);
  if (!r) throw new Error('nenhuma cota dentro da poligonal.');
  return { ...r, fonte: sp ? 'laser' : 'google' };
}

/* ---------- estado da medição na sessão, por terreno: o quadro Relevo e o Resumo leem daqui ---------- */
export interface EstRelevo { em: boolean; erro: string | null; local?: boolean; chave?: string; pontos?: number; min?: number; max?: number }
const VAZIO: EstRelevo = { em: false, erro: null };
const EST: Record<string, EstRelevo> = {};
const ouvintes = new Set<() => void>();
const por = (id: string, e: EstRelevo) => { EST[id] = e; ouvintes.forEach((f) => f()); };
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export function useEstRelevo(id: string) { return useSyncExternalStore(assinar, () => EST[id] ?? VAZIO); }

interface Alvo { id: string; poly: P[] | null; sp: boolean }
export async function medirEGravar(t: Alvo, qc: ReturnType<typeof useQueryClient>) {
  const chave = chavePoly(t.poly);
  if (!chave || EST[t.id]?.em) return;
  /* fora da versão publicada (npm run dev, localhost): o laser não responde e o Google pode não ter chave */
  if (t.sp && !GEO_BASE) { por(t.id, { em: false, erro: 'em São Paulo as cotas vêm do laser da prefeitura, que só responde na versão publicada.', local: true, chave }); return; }
  por(t.id, { em: true, erro: null, chave });
  try {
    const r = await medirRelevo(t.poly!, t.sp);
    const { error } = await supabase.rpc('registrar_topografia', {
      p_terreno: t.id, p_declividade: r.decl, p_inclinacao: r.incl, p_terra: r.fonte === 'laser' ? r.terra : null, p_desnivel: r.desnivel, p_fonte: r.fonte,
    });
    if (error) throw new Error(error.message);
    por(t.id, { em: false, erro: null, chave, pontos: r.n, min: r.min, max: r.max });
    await qc.invalidateQueries({ queryKey: ['ficha'] });
    void qc.invalidateQueries({ queryKey: ['ficha-logs'] });
    void qc.invalidateQueries({ queryKey: ['mapa'] });
  } catch (e: any) {
    console.error('relevo', e);
    por(t.id, { em: false, erro: e?.message ?? String(e), chave });
  }
}

/** mede sozinho ao abrir a ficha: quem edita, com poligonal e sem medição; uma tentativa por poligonal na sessão */
export function useRelevoAuto(f: { id: string; poly: P[] | null; topo: unknown; municipio: string | null; t: any }) {
  const { edita } = useSessao(), qc = useQueryClient();
  const chave = chavePoly(f.poly), tem = !!f.topo, sp = ehSP(f.t?.municipio_id, f.municipio);
  useEffect(() => {
    if (!edita || !chave || tem) return;
    const e = EST[f.id];
    if (e?.em || (e?.chave === chave && (e.erro || e.pontos != null))) return;
    void medirEGravar({ id: f.id, poly: f.poly, sp }, qc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id, chave, tem, edita, sp]);
}
