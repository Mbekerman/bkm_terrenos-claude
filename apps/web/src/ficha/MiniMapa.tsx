/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { carregarGoogle, gLib } from '../mapa/google';

// Mini-mapa da Localização na Visão geral (proto_gmap.js › G_initMini, proto_mod.js › miniGestos, miniAbrirMapa): satélite com
// rótulos, poligonal em azul BKM e o pino; a roda rola a página e Shift + roda dá zoom; dois cliques abrem a página Mapa
// centrada no ponto clicado, no mesmo zoom, com o terreno selecionado. Editar a poligonal ali mesmo entra com a edição da poligonal.
export default function MiniMapa({ lat, lng, poly, cor, fg, abrirMapa }: {
  lat: number; lng: number; poly: [number, number][] | null; cor: string; fg: string;
  abrirMapa: (lat: number, lng: number, z: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const abrir = useRef(abrirMapa);
  abrir.current = abrirMapa;
  const [sem, setSem] = useState(false);
  const [ok, setOk] = useState(false);
  const mapa = useRef<any>(null);
  useEffect(() => {
    let vivo = true;
    const d = el.current;
    if (!d) return;
    /* Shift + roda: zoom; sem Shift, a roda rola a página */
    let acc = 0, ult = 0, M: any = null;
    const roda = (e: WheelEvent) => {
      if (!e.shiftKey) { e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
      const dd = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * (e.deltaMode === 1 ? 40 : 1);
      if (Date.now() - ult > 400) acc = 0;
      acc += dd;
      if (M && Math.abs(acc) >= 60 && Date.now() - ult > 180) { M.setZoom(M.getZoom() + (acc < 0 ? 1 : -1)); acc = 0; ult = Date.now(); }
    };
    d.addEventListener('wheel', roda, { capture: true, passive: false });
    carregarGoogle().then((ok) => {
      if (!vivo) return;
      if (!ok) { setSem(true); d.closest('.sec')?.classList.add('sem-fundo'); return; }
      setOk(true);
      const { google } = window, gLL = (a: number, b: number) => ({ lat: a, lng: b });
      d.innerHTML = '';
      M = new google.maps.Map(d, {
        mapId: 'DEMO_MAP_ID', center: gLL(lat, lng), zoom: 18, mapTypeId: 'hybrid', mapTypeControl: false, streetViewControl: true, fullscreenControl: true,
        clickableIcons: false, gestureHandling: 'cooperative', disableDoubleClickZoom: true, tilt: 0,
      });
      mapa.current = M;
      M.addListener('dblclick', (e: any) => { if (e.latLng) abrir.current(e.latLng.lat(), e.latLng.lng(), M.getZoom()); });
      const pin = document.createElement('div');
      pin.className = 'pin g';
      pin.innerHTML = `<span class="pin-b" style="background:${cor}"><b class="pin-d" style="background:${fg}"></b></span>`;
      new gLib.marker.AdvancedMarkerElement({ map: M, position: gLL(lat, lng), content: pin });
      if (poly) {
        const pg = new google.maps.Polygon({ map: M, paths: poly.map((p) => gLL(p[0], p[1])), strokeColor: '#0094fe', strokeWeight: 2, fillColor: '#0094fe', fillOpacity: 0.2, clickable: true });
        pg.addListener('dblclick', (e: any) => { e?.stop?.(); if (e.latLng) abrir.current(e.latLng.lat(), e.latLng.lng(), M.getZoom()); });
        const b = new google.maps.LatLngBounds();
        poly.forEach((p) => b.extend(gLL(p[0], p[1])));
        M.fitBounds(b, 24);
      }
    });
    return () => { vivo = false; d.removeEventListener('wheel', roda, { capture: true }); };
  }, [lat, lng, poly, cor, fg]);
  return (
    <>
      <div className="mini-wrap"><div id="mini-mapa" className="mini-mapa" ref={el} /></div>
      <div className="mini-pe"><span /><span>
        {ok && <button className="btn sm" data-a="g-sv-mini" onClick={() => { const sv = mapa.current?.getStreetView(); if (sv) { sv.setPosition({ lat, lng }); sv.setVisible(true); } }}>Street View</button>}
        <button className="btn sm mini-ir" onClick={() => abrir.current(lat, lng, mapa.current?.getZoom() ?? 17)}>Ver no mapa</button>
      </span></div>
      {sem && <div className="mp-aviso mini">Fundo do mapa indisponível nesta visualização.</div>}
    </>
  );
}
