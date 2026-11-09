import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSessao } from '../lib/sessao';
import { GEO_BASE } from '../novo/geosampa';
import { cartorioPelaArea } from '../novo/consulta';
import type { Ficha } from './dados';

/* Cartório de registro de imóveis pelo GeoSampa ao abrir a ficha, em São Paulo (pedido do Moises, 9/nov/2026; o protótipo já
   fazia, geoCartorio): uma consulta por localização na sessão; nunca troca o digitado. Também refaz a ficha quando uma consulta
   do GeoSampa em segundo plano (SQLs do cadastro, mapa de lotes) termina e gravou no terreno. */
const TENT = new Set<string>();
export default function CartorioAuto({ f }: { f: Ficha }) {
  const { edita } = useSessao();
  const qc = useQueryClient();
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent).detail !== f.id) return;
      /* a ficha e tudo o que é deste terreno (lotes, parâmetros, restrições, logs) */
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'ficha' || q.queryKey[0] === 'ficha-logs' || q.queryKey.includes(f.id) });
    };
    window.addEventListener('terreno-gravado', h);
    return () => window.removeEventListener('terreno-gravado', h);
  }, [f.id, qc]);
  const loc = f.poly && f.poly.length >= 3 ? JSON.stringify(f.poly) : `${f.lat}|${f.lng}`;
  const sp = !f.municipio || /^São Paulo$/i.test(f.municipio);
  useEffect(() => {
    if (!GEO_BASE || !edita || !sp || f.t.cartorio_origem === 'digitado' || (f.lat == null && !f.poly)) return;
    const k = f.id + '|' + loc;
    if (TENT.has(k)) return;
    TENT.add(k);
    cartorioPelaArea(f.id, f.poly, f.lat, f.lng).catch((e) => console.warn('cartório pelo GeoSampa', e));
  }, [f.id, loc, sp, edita, f.t.cartorio_origem, f.lat, f.lng, f.poly]);
  return null;
}
