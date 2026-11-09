/* eslint-disable @typescript-eslint/no-explicit-any */
import { GMAPS_KEY } from '../lib/config';

// Carregador oficial do Maps JS (bootstrap dinâmico), como em tools/prototipo/proto_gmap.js › carregarGoogle.
// Chave única do Google, injetada pelo Caddy na meta gmaps-key; restrita por domínio no Cloud Console.
declare global { interface Window { google: any; gm_authFailure?: () => void } }

export const gLib: Record<string, any> = {};
let carga: Promise<boolean> | null = null;
let recusada = false;

export function carregarGoogle(): Promise<boolean> {
  if (!GMAPS_KEY) return Promise.resolve(false);
  if (carga) return carga;
  window.gm_authFailure = () => { recusada = true; window.dispatchEvent(new Event('bkm-gmaps-recusada')); };
  /* eslint-disable */
  ((g: any) => { var h: any, a: any, k: any, p = 'The Google Maps JavaScript API', c = 'google', l = 'importLibrary', q = '__ib__', m = document, b: any = window; b = b[c] || (b[c] = {}); var d = b.maps || (b.maps = {}), r = new Set(), e = new URLSearchParams(), u = () => h || (h = new Promise(async (f, n) => { await (a = m.createElement('script')); e.set('libraries', [...r] + ''); for (k in g) e.set(k.replace(/[A-Z]/g, (t: string) => '_' + t[0].toLowerCase()), g[k]); e.set('callback', c + '.maps.' + q); a.src = `https://maps.${c}apis.com/maps/api/js?` + e; d[q] = f; a.onerror = () => h = n(Error(p + ' could not load.')); a.nonce = (m.querySelector('script[nonce]') as any)?.nonce || ''; m.head.append(a); })); d[l] ? console.warn(p + ' only loads once. Ignoring:', g) : d[l] = (f: any, ...n: any[]) => r.add(f) && u().then(() => d[l](f, ...n)); })({ key: GMAPS_KEY, v: 'weekly', language: 'pt-BR', region: 'BR' });
  /* eslint-enable */
  carga = Promise.all(['maps', 'marker', 'geometry', 'places', 'streetView'].map((n) => window.google.maps.importLibrary(n).then((x: any) => { gLib[n] = x; })))
    .then(() => !recusada)
    .catch((e) => { console.warn('Google Maps indisponível', e); return false; });
  return carga;
}
export const googleRecusado = () => recusada;
