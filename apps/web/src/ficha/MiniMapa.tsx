/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { carregarGoogle, gLib } from '../mapa/google';
import { TOQUE, vGestos, type GestosPonto } from '../mapa/motor';
import { MenuPonto } from '../mapa/MenuPonto';
import { areaPoly, dentroPoly, fixa, m2, type P } from '../novo/geo';
import { useToast } from '../components/ui';

// Mini-mapa da Localização na Visão geral (proto_gmap.js › G_initMini, proto_mod.js › miniGestos, miniAbrirMapa): satélite com
// rótulos, poligonal em azul BKM e o pino; a roda rola a página e Shift + roda dá zoom; dois cliques abrem a página Mapa
// centrada no ponto clicado, no mesmo zoom, com o terreno selecionado. Dois cliques sobre a poligonal a editam ali mesmo, como na
// página Mapa (proto_mod.js › editarPoligonal com mini): arrastar o ponto, clique direito ou dois cliques nele abrem o menu, clique
// no mini-mapa fora da poligonal, dois cliques ou Enter salvam, clique fora do mini-mapa ou Esc cancelam, Ctrl+Z desfaz. Leitura não edita.
export default function MiniMapa({ lat, lng, poly, cor, fg, abrirMapa, salvar }: {
  lat: number; lng: number; poly: [number, number][] | null; cor: string; fg: string;
  abrirMapa: (lat: number, lng: number, z: number) => void;
  /** grava a poligonal editada; sem ela (Leitura), não edita */
  salvar?: (p: P[]) => Promise<boolean>;
}) {
  const toast = useToast();
  const [des, setDes] = useState<P[] | null>(null);
  const [vSel, setVSel] = useState<number | null>(null);
  const [vMenu, setVMenu] = useState(false);
  const hist = useRef<P[][]>([]);
  const desR = useRef(des);
  desR.current = des;
  const marca = useRef({ toque: 0, inicio: 0 });
  const pgR = useRef<any>(null), proj = useRef<any>(null), rasc = useRef<any[]>([]), wrap = useRef<HTMLDivElement>(null);
  const salvarR = useRef(salvar);
  salvarR.current = salvar;
  const edComecar = () => {
    if (!salvarR.current || !poly || poly.length < 3 || desR.current || TOQUE()) return;
    hist.current = []; setVSel(null); setVMenu(false);
    setDes(poly.map((q) => [q[0], q[1]] as P));
    marca.current.inicio = Date.now();
    toast('Editando a poligonal. Clique direito num ponto para mais opções; clique fora para salvar.');
  };
  const sair = () => { setDes(null); hist.current = []; setVSel(null); setVMenu(false); };
  const cancelar = () => { sair(); toast('Edição cancelada, poligonal sem mudanças.'); };
  const concluir = async () => {
    const p = desR.current;
    if (!p) return;
    sair();
    if (JSON.stringify(fixa(p)) === JSON.stringify(fixa(poly || []))) { toast('Edição encerrada, sem mudanças.'); return; }
    if (await salvarR.current!(p)) toast(`Poligonal salva: ${m2(Math.round(areaPoly(p) || 0))}.`);
  };
  const guardar = () => { hist.current.push((desR.current || []).map((x) => [x[0], x[1]] as P)); if (hist.current.length > 60) hist.current.shift(); };
  const desfazer = () => { const h = hist.current; if (!h.length) return false; setDes(h.pop()!); setVSel(null); setVMenu(false); return true; };
  const fechaMenu = () => { setVMenu(false); setVSel(null); };
  function vAcao(a: 'v-depois' | 'v-excluir' | 'v-desfazer' | 'v-cancelar') {
    marca.current.toque = Date.now();
    const i = vSel, p = (desR.current || []).map((x) => [x[0], x[1]] as P);
    if (a === 'v-desfazer') { if (!desfazer()) fechaMenu(); return; }
    if (a === 'v-cancelar') { cancelar(); return; }
    if (i == null) return;
    if (a === 'v-excluir') {
      if (p.length <= 3) { toast('A poligonal precisa de pelo menos 3 pontos.', true); fechaMenu(); return; }
      guardar(); p.splice(i, 1); setDes(p); fechaMenu(); toast(`Ponto ${i + 1} excluído.`); return;
    }
    guardar();
    const b = p[(i + 1) % p.length];
    p.splice(i + 1, 0, [(p[i][0] + b[0]) / 2, (p[i][1] + b[1]) / 2]);
    setDes(p); setVMenu(false); setVSel(i + 1);
    toast(`Ponto ${i + 2} adicionado. Arraste-o para o lugar.`);
  }
  const gp = useRef<GestosPonto>({
    toque: () => { marca.current.toque = Date.now(); },
    menu: (i) => { setVSel(i); setVMenu(true); marca.current.toque = Date.now(); },
    duplo: (i) => { setVSel(i); setVMenu(true); marca.current.toque = Date.now(); },
    arrastando: () => setVMenu(false),
    arrastado: (i, a, b) => { guardar(); const p = (desR.current || []).map((x) => [x[0], x[1]] as P); p[i] = [a, b]; setDes(p); setVMenu(false); setVSel(null); marca.current.toque = Date.now(); },
  }).current;
  const ganchos = useRef({ clique: (_a: number, _b: number) => {}, duplo: () => {}, editar: () => {} });
  ganchos.current = {
    /* clique no mini-mapa: fora da poligonal salva; dentro, só fecha o menu do ponto */
    clique: (a, b) => {
      const p = desR.current;
      if (!p || Date.now() - marca.current.toque < 300) return;
      if (vMenu) { fechaMenu(); return; }
      if (Date.now() - marca.current.inicio > 500 && !dentroPoly(a, b, p)) concluir();
    },
    duplo: () => { if (desR.current && Date.now() - marca.current.inicio > 500) concluir(); },
    editar: edComecar,
  };
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
      proj.current = new google.maps.OverlayView();
      proj.current.onAdd = () => {}; proj.current.draw = () => {}; proj.current.onRemove = () => {};
      proj.current.setMap(M);
      M.addListener('click', (e: any) => { if (e.latLng) ganchos.current.clique(e.latLng.lat(), e.latLng.lng()); });
      M.addListener('dblclick', (e: any) => {
        if (desR.current) { ganchos.current.duplo(); return; }
        if (e.latLng) abrir.current(e.latLng.lat(), e.latLng.lng(), M.getZoom());
      });
      const pin = document.createElement('div');
      pin.className = 'pin g';
      pin.innerHTML = `<span class="pin-b" style="background:${cor}"><b class="pin-d" style="background:${fg}"></b></span>`;
      new gLib.marker.AdvancedMarkerElement({ map: M, position: gLL(lat, lng), content: pin });
      if (poly) {
        const pg = new google.maps.Polygon({ map: M, paths: poly.map((p) => gLL(p[0], p[1])), strokeColor: '#0094fe', strokeWeight: 2, fillColor: '#0094fe', fillOpacity: 0.2, clickable: true });
        pgR.current = pg;
        pg.addListener('click', (e: any) => { if (e.latLng) ganchos.current.clique(e.latLng.lat(), e.latLng.lng()); });
        pg.addListener('dblclick', (e: any) => {
          e?.stop?.();
          if (salvarR.current && !TOQUE()) { ganchos.current.editar(); return; }
          if (e.latLng) abrir.current(e.latLng.lat(), e.latLng.lng(), M.getZoom());
        });
        const b = new google.maps.LatLngBounds();
        poly.forEach((p) => b.extend(gLL(p[0], p[1])));
        M.fitBounds(b, 24);
      }
    });
    return () => { vivo = false; d.removeEventListener('wheel', roda, { capture: true }); };
  }, [lat, lng, poly, cor, fg]);
  /* o rascunho da edição: a poligonal some e ficam os pontos arrastáveis */
  useEffect(() => {
    const M = mapa.current;
    rasc.current.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null)));
    rasc.current = [];
    pgR.current?.setMap(des ? null : M);
    if (!M || !des) return;
    const { google } = window, gLL = (a: number, b: number) => ({ lat: a, lng: b }), p = des.map((q) => gLL(q[0], q[1]));
    const poli = new google.maps.Polygon({ map: M, paths: p, strokeColor: '#0094fe', strokeWeight: 2.5, fillColor: '#0094fe', fillOpacity: 0.2, clickable: false });
    rasc.current.push(poli);
    const ll = (pos: any) => [typeof pos.lat === 'function' ? pos.lat() : pos.lat, typeof pos.lng === 'function' ? pos.lng() : pos.lng] as P;
    p.forEach((q, i) => {
      const el = document.createElement('div');
      el.className = 'v-alvo'; el.innerHTML = `<span class="v-dot${vSel === i ? ' sel' : ''}"></span>`;
      const mk = new gLib.marker.AdvancedMarkerElement({ map: M, position: q, content: el, gmpDraggable: true, zIndex: vSel === i ? 1000 : 10 });
      vGestos(el, i, gp);
      mk.addListener('drag', () => { const pp = p.slice(), [a, b] = ll(mk.position); pp[i] = gLL(a, b); poli.setPaths(pp); });
      mk.addListener('dragstart', () => gp.arrastando());
      mk.addListener('dragend', () => { const [a, b] = ll(mk.position); gp.arrastado(i, a, b); });
      rasc.current.push(mk);
    });
    el.current?.classList.add('modo');
    return () => { el.current?.classList.remove('modo'); };
  }, [des, vSel, gp]);
  /* teclado e clique fora, só editando */
  useEffect(() => {
    if (!des) return;
    const fora = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement;
      if (Date.now() - marca.current.inicio < 500 || !document.contains(t) || wrap.current?.contains(t) || t.closest?.('.v-menu,.toast,#toast')) return;
      cancelar();
    };
    const esc = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || (ev.target as HTMLElement).matches?.('input,textarea,select')) return;
      if (vMenu) fechaMenu(); else cancelar();
      ev.preventDefault(); ev.stopImmediatePropagation();
    };
    const tecla = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t.matches?.('input,textarea,select')) return;
      if (ev.key === 'Enter' && !vMenu && !t.closest?.('button,a,summary')) { concluir(); ev.preventDefault(); }
      else if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') { desfazer(); ev.preventDefault(); }
      else if ((ev.key === 'Delete' || ev.key === 'Backspace') && vSel != null) { vAcao('v-excluir'); ev.preventDefault(); }
    };
    document.addEventListener('click', fora, true);
    window.addEventListener('keydown', esc, true);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('click', fora, true); window.removeEventListener('keydown', esc, true); document.removeEventListener('keydown', tecla); };
  });
  return (
    <>
      <div className="mini-wrap" ref={wrap}><div id="mini-mapa" className="mini-mapa" ref={el} />
        {des && vMenu && vSel != null && des[vSel] && (
          <MenuPonto area={wrap.current} px={proj.current?.getProjection()?.fromLatLngToContainerPixel(new window.google.maps.LatLng(des[vSel][0], des[vSel][1])) ?? null}
            i={vSel} n={des.length} area2={areaPoly(des) || 0} desfazer={hist.current.length > 0} acao={vAcao} editando />
        )}</div>
      <div className="mini-pe"><span /><span>
        {ok && <button className="btn sm" data-a="g-sv-mini" onClick={() => { const sv = mapa.current?.getStreetView(); if (sv) { sv.setPosition({ lat, lng }); sv.setVisible(true); } }}>Street View</button>}
        <button className="btn sm mini-ir" onClick={() => abrir.current(lat, lng, mapa.current?.getZoom() ?? 17)}>Ver no mapa</button>
      </span></div>
      {sem && <div className="mp-aviso mini">Fundo do mapa indisponível nesta visualização.</div>}
    </>
  );
}
