/* eslint-disable @typescript-eslint/no-explicit-any */
import { GMAPS_KEY } from '../lib/config';

// "Traçar rota até aqui" no clique direito do mapa (pedido do Moises, 9/nov/2026): rota pela Routes API (computeRoutes),
// como a rota do protótipo (proto_gmap.js › gRotaAte), com o Directions do Maps JS de reserva quando a Routes não responde.
// Modos que o Google atende no Brasil (conferido em 9/nov/2026 na documentação de cobertura): carro, moto (TWO_WHEELER,
// Brasil na lista de países), a pé, bicicleta e transporte público (onde a cidade publica os horários no Google).

export type Modo = 'DRIVE' | 'TWO_WHEELER' | 'WALK' | 'BICYCLE' | 'TRANSIT';
export const MODOS: { k: Modo; l: string; de: string }[] = [
  { k: 'DRIVE', l: 'Carro', de: 'de carro' },
  { k: 'TWO_WHEELER', l: 'Moto', de: 'de moto' },
  { k: 'WALK', l: 'A pé', de: 'a pé' },
  { k: 'BICYCLE', l: 'Bicicleta', de: 'de bicicleta' },
  { k: 'TRANSIT', l: 'Transporte', de: 'de transporte público' },
];
const URL_MODO: Record<Modo, string> = { DRIVE: 'driving', TWO_WHEELER: 'two-wheeler', WALK: 'walking', BICYCLE: 'bicycling', TRANSIT: 'transit' };
const DIR_MODO: Partial<Record<Modo, string>> = { DRIVE: 'DRIVING', WALK: 'WALKING', BICYCLE: 'BICYCLING', TRANSIT: 'TRANSIT' };

export interface PontoRota { lat: number; lng: number }
export interface Rota { m: number; s: number; path: PontoRota[]; linhas: string[] }

/** a rota não existe para esse modo (diferente de erro na chamada) */
export class SemRota extends Error {}

const ll = (p: PontoRota) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

export async function calcularRota(o: PontoRota, d: PontoRota, modo: Modo): Promise<Rota> {
  const transp = modo === 'TRANSIT';
  let falhou: unknown = null;
  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': GMAPS_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' + (transp ? ',routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.name,routes.legs.steps.transitDetails.transitLine.vehicle.name.text' : ''),
      },
      /* sem trânsito em tempo real: o pedido com trânsito é cobrado como Pro (o dobro) */
      body: JSON.stringify({ origin: ll(o), destination: ll(d), travelMode: modo, languageCode: 'pt-BR', regionCode: 'BR', units: 'METRIC',
        ...(modo === 'DRIVE' || modo === 'TWO_WHEELER' ? { routingPreference: 'TRAFFIC_UNAWARE' } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const ro = j.routes?.[0];
      if (!ro?.polyline?.encodedPolyline) throw new SemRota('sem rota');
      const linhas: string[] = [];
      for (const lg of ro.legs || []) for (const st of lg.steps || []) {
        const tl = st.transitDetails?.transitLine;
        if (!tl) continue;
        const nome = [tl.vehicle?.name?.text, tl.nameShort || tl.name].filter(Boolean).join(' ');
        if (nome && !linhas.includes(nome)) linhas.push(nome);
      }
      const path = window.google.maps.geometry.encoding.decodePath(ro.polyline.encodedPolyline).map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
      return { m: ro.distanceMeters ?? 0, s: parseInt(ro.duration || '0'), path, linhas };
    }
    falhou = new Error(j.error?.message || 'Routes ' + r.status);
  } catch (e) {
    if (e instanceof SemRota) throw e;
    falhou = e;
  }
  /* reserva: Directions do Maps JS (não tem moto) */
  const dm = DIR_MODO[modo];
  if (!dm) throw falhou;
  try {
    const res = await new window.google.maps.DirectionsService().route({ origin: o, destination: d, travelMode: dm });
    const ro = res.routes?.[0], lg = ro?.legs?.[0];
    if (!lg) throw new SemRota('sem rota');
    const linhas: string[] = [];
    for (const st of lg.steps || []) { const n = st.transit?.line?.short_name || st.transit?.line?.name; if (n && !linhas.includes(n)) linhas.push(n); }
    return { m: lg.distance?.value ?? 0, s: lg.duration?.value ?? 0, path: ro.overview_path.map((p: any) => ({ lat: p.lat(), lng: p.lng() })), linhas };
  } catch (e: any) {
    if (e instanceof SemRota || e?.code === 'ZERO_RESULTS') throw new SemRota('sem rota');
    throw falhou;
  }
}

/** link da mesma rota no Google Maps (Maps URLs) */
export function urlGoogle(o: PontoRota, d: PontoRota, modo: Modo) {
  return `https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lng}&destination=${d.lat},${d.lng}&travelmode=${URL_MODO[modo]}`;
}

export function tempo(s: number) {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
export function distancia(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: m < 10000 ? 1 : 0 })} km`;
}

const MODO_KEY = 'bkm-terrenos-rota-modo';
export function modoGuardado(): Modo {
  try { const m = localStorage.getItem(MODO_KEY) as Modo | null; if (m && MODOS.some((x) => x.k === m)) return m; } catch { /* sem storage */ }
  return 'DRIVE';
}
export function guardarModo(m: Modo) { try { localStorage.setItem(MODO_KEY, m); } catch { /* sem storage */ } }
