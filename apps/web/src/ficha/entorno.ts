/* eslint-disable @typescript-eslint/no-explicit-any */
// Pontos de interesse do terreno (proto_gmap.js › gEntornoTerreno, gMatriz, entFiltro, gDistEmpresa): lugares do Google
// a até 1,5 km a pé pelas categorias de app.entorno_categorias (tipo principal do lugar e o filtro do ruído), com a
// distância pela rota a pé (Routes computeRouteMatrix; reserva Distance Matrix; sem rota, linha reta avisada).
// Busca uma vez por localização (app.salvar_entorno guarda a coordenada); o que foi excluído continua excluído.
import { supabase } from '../lib/supabase';
import { GMAPS_KEY } from '../lib/config';
import { carregarGoogle, gLib } from '../mapa/google';

export const distM = (la1: number, ln1: number, la2: number, ln2: number) => {
  const R = 6371008.8, r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (ln2 - ln1) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const normNome = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** trechos separados por |, que valem no começo de uma palavra do nome */
const tem = (nome: string, lista: string | null) => {
  if (!lista) return false;
  const n = ' ' + normNome(nome).replace(/[^a-z0-9]+/g, ' ') + ' ';
  return lista.split('|').some((x) => n.includes(' ' + x));
};
export interface Categoria { codigo: string; nome: string; tipos_google: string[]; raio_pe_m: number; min_avaliacoes: number | null; isento_nomes: string | null; excluir_nomes: string | null; um_por_local_m: number | null; ordem: number }
interface Lugar { gid: string; nome: string; cat: string; av: number; lat: number; lng: number; reta?: number; pe?: number | null; seg?: number | null }

function filtrar(ps: Lugar[], c: Categoria) {
  let l = ps.filter((p) => !tem(p.nome, c.excluir_nomes) && (c.min_avaliacoes == null || p.av >= c.min_avaliacoes || tem(p.nome, c.isento_nomes)));
  if (c.um_por_local_m) {
    const fica: Lugar[] = [];
    [...l].sort((a, b) => b.av - a.av).forEach((p) => { if (!fica.some((q) => distM(p.lat, p.lng, q.lat, q.lng) <= c.um_por_local_m!)) fica.push(p); });
    l = l.filter((p) => fica.includes(p));
  }
  return l;
}

/** matriz de rotas do ponto até os destinos: [{m, s}|null]; lança erro se nenhuma rota responder */
export async function matriz(lat: number, lng: number, dest: { lat: number; lng: number }[], modo: 'WALK' | 'DRIVE') {
  const out: ({ m: number; s: number } | null)[] = dest.map(() => null);
  const ll = (a: number, b: number) => ({ waypoint: { location: { latLng: { latitude: a, longitude: b } } } });
  try {
    for (let i = 0; i < dest.length; i += 25) {
      const ch = dest.slice(i, i + 25);
      const r = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GMAPS_KEY, 'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition' },
        body: JSON.stringify({ origins: [ll(lat, lng)], destinations: ch.map((p) => ll(p.lat, p.lng)), travelMode: modo, languageCode: 'pt-BR', regionCode: 'BR' }),
      });
      if (!r.ok) throw new Error('Routes ' + r.status);
      const els = await r.json();
      if (!Array.isArray(els)) throw new Error('resposta inesperada');
      els.forEach((e: any) => { const k = i + (e.destinationIndex || 0); if (k < out.length && e.condition === 'ROUTE_EXISTS' && e.distanceMeters != null) out[k] = { m: e.distanceMeters, s: parseInt(e.duration || '0') }; });
    }
    if (!out.some(Boolean)) throw new Error('sem rotas');
  } catch {
    const svc = new window.google.maps.DistanceMatrixService();
    for (let i = 0; i < dest.length; i += 25) {
      const ch = dest.slice(i, i + 25);
      const res = await svc.getDistanceMatrix({ origins: [{ lat, lng }], destinations: ch.map((p) => ({ lat: p.lat, lng: p.lng })), travelMode: modo === 'WALK' ? 'WALKING' : 'DRIVING' });
      (res?.rows?.[0]?.elements || []).forEach((e: any, j: number) => { if (e && e.status === 'OK') out[i + j] = { m: e.distance.value, s: e.duration.value }; });
    }
    if (!out.some(Boolean)) throw new Error('sem rotas');
  }
  return out;
}

/** busca no Google e grava; devolve quantos lugares e se valeu a linha reta */
export async function buscarEntorno(terreno: string, lat: number, lng: number) {
  if (!(await carregarGoogle()) || !gLib.places) throw new Error('Google indisponível');
  const { data: cats, error } = await supabase.from('entorno_categorias').select('*').eq('ativo', true).order('ordem');
  if (error) throw error;
  const { Place, SearchNearbyRankPreference } = gLib.places;
  const res = await Promise.all((cats as Categoria[]).map((c) => Place.searchNearby({
    fields: ['id', 'displayName', 'location', 'userRatingCount'], locationRestriction: { center: { lat, lng }, radius: c.raio_pe_m },
    includedPrimaryTypes: c.tipos_google, maxResultCount: 20, rankPreference: SearchNearbyRankPreference.DISTANCE, language: 'pt-BR', region: 'br',
  }).then((r: any) => filtrar((r.places || []).map((p: any) => ({ gid: p.id, nome: p.displayName, cat: c.codigo, av: p.userRatingCount || 0, lat: p.location.lat(), lng: p.location.lng() })), c))));
  /* um lugar entra uma vez (na primeira categoria); mesmo nome na mesma categoria = mesma estação ou hospital, fica o mais perto */
  const ids = new Set<string>(), nomes = new Set<string>(), itens: Lugar[] = [];
  res.flat().forEach((p: Lugar) => { const n = p.cat + '|' + normNome(p.nome); if (ids.has(p.gid) || nomes.has(n)) return; ids.add(p.gid); nomes.add(n); p.reta = Math.round(distM(lat, lng, p.lat, p.lng)); itens.push(p); });
  let rota = true;
  if (itens.length) {
    try { (await matriz(lat, lng, itens, 'WALK')).forEach((x, i) => { if (x) { itens[i].pe = x.m; itens[i].seg = x.s; } }); }
    catch { rota = false; itens.forEach((p) => { p.pe = p.reta; p.seg = null; }); }
  }
  const raio = new Map((cats as Categoria[]).map((c) => [c.codigo, c.raio_pe_m]));
  const ok = itens.filter((p) => p.pe != null && p.pe <= (raio.get(p.cat) ?? 1500));
  const { data: n, error: e2 } = await supabase.rpc('salvar_entorno', {
    p_terreno: terreno, p_latitude: lat, p_longitude: lng, p_rota_a_pe: rota,
    p_itens: ok.map((p) => ({ categoria: p.cat, google_place_id: p.gid, nome: p.nome, latitude: p.lat, longitude: p.lng, distancia_pe_m: p.pe, duracao_pe_s: p.seg ?? null, distancia_reta_m: p.reta })),
  });
  if (e2) throw e2;
  return { n: n as number, rota };
}

/** distâncias a pé, pela rota, até os pontos da empresa */
export async function medirPontos(terreno: string, lat: number, lng: number, pontos: { id: string; latitude: number; longitude: number }[]) {
  if (!pontos.length || !(await carregarGoogle())) return 0;
  const pe = await matriz(lat, lng, pontos.map((p) => ({ lat: p.latitude, lng: p.longitude })), 'WALK');
  const { data, error } = await supabase.rpc('salvar_distancias_pontos', {
    p_terreno: terreno, p_latitude: lat, p_longitude: lng,
    p_itens: pontos.map((p, i) => ({ ponto_id: p.id, distancia_pe_m: pe[i]?.m ?? null, duracao_pe_s: pe[i]?.s ?? null })),
  });
  if (error) throw error;
  return data as number;
}

/** rota a pé no Google Maps */
export const rotaPe = (la: number, ln: number, la2: number, ln2: number) => `https://www.google.com/maps/dir/?api=1&origin=${la},${ln}&destination=${la2},${ln2}&travelmode=walking`;
