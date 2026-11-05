/* eslint-disable @typescript-eslint/no-explicit-any */
import { gLib } from './google';
import { aneis, desenhaLadrilho, type Camada } from './setores';

// Motor do mapa do Google, portado de tools/prototipo/proto_gmap.js (G_initMapa, G_desenhaPins, gPinsSel, gEnquadrar,
// G_eu, G_focar, svFechar, lugarAbrir, gStreetView) e proto_novo.js (mpBuscar, achadoPin). Imperativo, como lá:
// o React desenha a página e entrega os dados; o motor mexe só dentro do contêiner do mapa.

export interface Pino { id: string; nome: string; lat: number; lng: number; poly: [number, number][] | null; cor: string; fg: string }
export interface Ganchos {
  pino(id: string): void;
  vazio(lat: number, lng: number): void;
  menu(x: number, y: number, lat: number, lng: number): void;
  duplo(lat: number, lng: number, alvo: EventTarget | null): void;
  fecharMenu(): void;
  streetView(on: boolean): void;
  aviso(msg: string, erro?: boolean): void;
  pronto(): void;
}
export type Base = 'mapa' | 'satelite';
const TIPO: Record<Base, string> = { mapa: 'roadmap', satelite: 'hybrid' };
const gLL = (lat: number, lng: number) => ({ lat, lng });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const icX = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6 6 18"/></svg>';

/** vista do mapa guardada na sessão (volta ao mesmo lugar ao sair e voltar à página) */
export let vista: { c: { lat: number; lng: number }; z: number } | null = null;

const LUGARES: Record<string, any> = {};
const estrelas = (n: number) => { const r = Math.max(0, Math.min(5, Math.round(n))); return '★'.repeat(r) + '☆'.repeat(5 - r); };
function lugarHtml(p: any) {
  const revs = (p.reviews || []).slice(0, 3);
  const nota = p.rating != null
    ? `<div class="lug-nota"><b>${String(p.rating.toFixed ? p.rating.toFixed(1) : p.rating).replace('.', ',')}</b> <span class="lug-est" aria-hidden="true">${estrelas(p.rating)}</span> <span class="muted">${p.userRatingCount != null ? Number(p.userRatingCount).toLocaleString('pt-BR') + ' avaliações' : ''}</span></div>`
    : '<div class="muted">Sem avaliações no Google</div>';
  return `<div class="lug"><button type="button" class="lug-x" aria-label="Fechar" title="Fechar">${icX}</button><div class="lug-n">${esc(p.displayName || 'Lugar')}</div>${p.formattedAddress ? `<div class="lug-e muted">${esc(p.formattedAddress)}</div>` : ''}${nota}
  ${revs.length ? `<ul class="lug-revs">${revs.map((r: any) => { const a = r.authorAttribution || {}, txt = String(r.text || ''); return `<li><div class="lug-ra">${a.uri ? `<a href="${esc(a.uri)}" target="_blank" rel="noopener">${esc(a.displayName || 'Usuário do Google')}</a>` : esc(a.displayName || 'Usuário do Google')} <span class="lug-est" aria-label="nota ${r.rating}">${estrelas(r.rating || 0)}</span> <span class="muted">${esc(r.relativePublishTimeDescription || '')}</span></div>${txt ? `<div class="lug-rt">${esc(txt.length > 220 ? txt.slice(0, 220).trim() + '…' : txt)}</div>` : ''}</li>`; }).join('')}</ul>` : ''}
  ${p.googleMapsURI ? `<a class="lug-l" href="${esc(p.googleMapsURI)}" target="_blank" rel="noopener">Ver todas no Google Maps</a>` : ''}<div class="lug-g muted">Avaliações do Google</div></div>`;
}

export class Motor {
  mapa: any;
  private info: any;
  private pinos: any[] = [];
  private eu: any[] = [];
  private achado: any = null;
  private proj: any = null;
  private lug = false;
  constructor(private el: HTMLElement, base: Base, private g: Ganchos) {
    const { google } = window;
    this.mapa = new google.maps.Map(el, {
      mapId: 'DEMO_MAP_ID', colorScheme: 'LIGHT', center: vista ? vista.c : gLL(-23.55, -46.63), zoom: vista ? vista.z : 11, mapTypeId: TIPO[base],
      mapTypeControl: false, streetViewControl: true, streetViewControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM }, cameraControl: false,
      fullscreenControl: false, clickableIcons: true, gestureHandling: 'greedy', scaleControl: true, tilt: 0, disableDoubleClickZoom: true,
    });
    this.info = new google.maps.InfoWindow({ maxWidth: 320, headerDisabled: true });
    const M = this.mapa;
    this.proj = new google.maps.OverlayView();
    this.proj.onAdd = () => {}; this.proj.draw = () => {}; this.proj.onRemove = () => {};
    this.proj.setMap(M);
    /* clique direito no contêiner: o menu "Novo terreno aqui" */
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const ll = this.proj.getProjection()?.fromContainerPixelToLatLng(new google.maps.Point(x, y));
      if (ll) g.menu(x, y, ll.lat(), ll.lng());
    });
    M.addListener('dragstart', g.fecharMenu); M.addListener('zoom_changed', g.fecharMenu);
    M.addListener('dblclick', (e: any) => { if (e.latLng && !e.placeId) g.duplo(e.latLng.lat(), e.latLng.lng(), e.domEvent?.target ?? null); });
    M.addListener('idle', () => { const c = M.getCenter(); vista = { c: { lat: c.lat(), lng: c.lng() }, z: M.getZoom() }; });
    /* Street View: fecha no nosso X ou no Esc; o fechar do Google fica escondido para não haver dois */
    const sv = M.getStreetView();
    sv.setOptions({ enableCloseButton: false, fullscreenControl: false });
    sv.addListener('visible_changed', () => g.streetView(sv.getVisible()));
    google.maps.event.addListenerOnce(M, 'tilesloaded', () => setTimeout(g.pronto, 300));
    M.addListener('click', (e: any) => {
      if (e.placeId) { e.stop(); this.lugarAbrir(e.placeId, e.latLng); return; }
      if (this.lugarFechar()) return;
      if (e.latLng) g.vazio(e.latLng.lat(), e.latLng.lng());
    });
  }
  temVista() { return !!vista; }
  setBase(b: Base) { this.mapa.setMapTypeId(TIPO[b]); }
  /** pinos e poligonais na cor do item da legenda */
  desenhar(ps: Pino[], sel: string | null) {
    this.pinos.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null)));
    this.pinos = [];

    const { AdvancedMarkerElement } = gLib.marker, { google } = window;
    for (const t of ps) {
      const d = document.createElement('div');
      d.className = 'pin g' + (sel === t.id ? ' sel' : '');
      d.innerHTML = `<span class="pin-b" style="background:${t.cor}"><b class="pin-d" style="background:${t.fg}"></b></span>`;
      const mk = new AdvancedMarkerElement({ map: this.mapa, position: gLL(t.lat, t.lng), content: d, title: t.nome, gmpClickable: true, zIndex: sel === t.id ? 10 : 1 });
      mk.addEventListener('gmp-click', () => this.g.pino(t.id));
      mk._terreno = t.id;
      this.pinos.push(mk);
      if (t.poly) {
        const pg = new google.maps.Polygon({ map: this.mapa, paths: t.poly.map((p) => gLL(p[0], p[1])), strokeColor: t.cor, strokeWeight: 2, fillColor: t.cor, fillOpacity: 0.18, clickable: true });
        let tc: ReturnType<typeof setTimeout> | undefined;
        pg.addListener('click', () => { clearTimeout(tc); tc = setTimeout(() => this.g.pino(t.id), 260); });
        pg.addListener('dblclick', (e: any) => { e?.stop?.(); clearTimeout(tc); });
        this.pinos.push(pg);
      }
    }
  }
  /** destaca o pino selecionado sem recriar os marcadores */
  marcar(sel: string | null) {

    this.pinos.forEach((m) => { if (m._terreno && m.content) { m.content.classList.toggle('sel', sel === m._terreno); m.zIndex = sel === m._terreno ? 10 : 1; } });
  }
  enquadrar(pts: { lat: number; lng: number }[], maxZoom?: number) {
    const M = this.mapa, { google } = window;
    if (!pts.length) return;
    if (pts.length === 1) { M.setCenter(pts[0]); M.setZoom(maxZoom || 17); return; }
    const b = new google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    M.fitBounds(b, 48);
    if (maxZoom) google.maps.event.addListenerOnce(M, 'idle', () => { if (M.getZoom() > maxZoom) M.setZoom(maxZoom); });
  }
  focar(t: Pino) {
    if (t.poly) this.enquadrar(t.poly.map((p) => gLL(p[0], p[1])), 19);
    else { this.mapa.setCenter(gLL(t.lat, t.lng)); if (this.mapa.getZoom() < 17) this.mapa.setZoom(17); }
  }
  /** minha localização: ponto azul com o círculo da precisão */
  euEm(u: { lat: number; lng: number; acc: number }, centrar: boolean) {
    const { google } = window;
    this.eu.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null)));
    const d = document.createElement('div');
    d.className = 'eu-dot'; d.title = 'Você está aqui';
    this.eu = [
      new google.maps.Circle({ map: this.mapa, center: gLL(u.lat, u.lng), radius: u.acc || 0, strokeColor: '#1a73e8', strokeWeight: 1, strokeOpacity: 0.5, fillColor: '#1a73e8', fillOpacity: 0.12, clickable: false }),
      new gLib.marker.AdvancedMarkerElement({ map: this.mapa, position: gLL(u.lat, u.lng), content: d, title: 'Você está aqui', gmpClickable: false, zIndex: 5 }),
    ];
    if (centrar) { this.mapa.panTo(gLL(u.lat, u.lng)); if ((this.mapa.getZoom() || 0) < 17) this.mapa.setZoom(17); }
  }
  /** busca de endereço (Places, texto) perto do centro do mapa */
  async buscar(q: string): Promise<{ nome: string; lat: number; lng: number }[]> {
    q = q.trim();
    if (q.length < 3) return [];
    const { Place } = gLib.places;
    const { places } = await Place.searchByText({ textQuery: q, fields: ['displayName', 'formattedAddress', 'location', 'viewport'], region: 'br', maxResultCount: 5, locationBias: this.mapa.getCenter() || gLL(-23.55, -46.63) });
    return (places || []).map((p: any) => ({ nome: p.formattedAddress || p.displayName, lat: p.location.lat(), lng: p.location.lng() }));
  }
  /** vai ao endereço achado e deixa o pino dele até a próxima busca */
  irPara(x: { nome: string; lat: number; lng: number }, z = 18) {
    this.mapa.setCenter(gLL(x.lat, x.lng)); this.mapa.setZoom(z);
    if (this.achado) this.achado.map = null;
    const d = document.createElement('div');
    d.className = 'achado g'; d.innerHTML = '<span class="achado-b"></span>';
    this.achado = new gLib.marker.AdvancedMarkerElement({ map: this.mapa, position: gLL(x.lat, x.lng), content: d, title: x.nome, gmpClickable: false, zIndex: 900 });
  }
  svFechar() { const sv = this.mapa.getStreetView(); if (sv.getVisible()) { sv.setVisible(false); return true; } return false; }
  async streetView(t: Pino) {
    const { google } = window, sv = this.mapa.getStreetView();
    try {
      const { data } = await new google.maps.StreetViewService().getPanorama({ location: gLL(t.lat, t.lng), radius: 120, preference: google.maps.StreetViewPreference.NEAREST, sources: [google.maps.StreetViewSource.OUTDOOR] });
      const pano = data.location.latLng, alvo = new google.maps.LatLng(t.lat, t.lng);
      sv.setPano(data.location.pano); sv.setPov({ heading: google.maps.geometry.spherical.computeHeading(pano, alvo), pitch: 0 }); sv.setVisible(true);
      const d = google.maps.geometry.spherical.computeDistanceBetween(pano, alvo);
      if (d > 40) this.g.aviso(`Imagem mais próxima a ${Math.round(d)} m do ponto do terreno.`);
    } catch { this.g.aviso('Sem imagem do Street View a até 120 m deste terreno.', true); }
  }
  /* lugares do Google: o toque abre nome, nota e até 3 avaliações (Place Details; guardado na sessão) */
  private conteudo(h: string) {
    const d = document.createElement('div');
    d.innerHTML = h;
    d.querySelector('.lug-x')?.addEventListener('click', (e) => { e.stopPropagation(); this.lugarFechar(); });
    this.info.setContent(d);
  }
  lugarFechar() { if (this.lug) { this.info.close(); this.lug = false; return true; } return false; }
  private async lugarAbrir(id: string, ll: any) {
    this.lug = true;
    this.conteudo(`<div class="lug muted"><button type="button" class="lug-x" aria-label="Fechar">${icX}</button>Carregando avaliações…</div>`);
    this.info.setPosition(ll); this.info.open({ map: this.mapa });
    try {
      let p = LUGARES[id];
      if (!p) {
        const pl = new gLib.places.Place({ id });
        await pl.fetchFields({ fields: ['displayName', 'formattedAddress', 'rating', 'userRatingCount', 'reviews', 'googleMapsURI'] });
        p = LUGARES[id] = {
          displayName: pl.displayName, formattedAddress: pl.formattedAddress, rating: pl.rating, userRatingCount: pl.userRatingCount, googleMapsURI: pl.googleMapsURI,
          reviews: (pl.reviews || []).map((r: any) => ({ rating: r.rating, text: r.text, relativePublishTimeDescription: r.relativePublishTimeDescription, authorAttribution: r.authorAttribution && { displayName: r.authorAttribution.displayName, uri: r.authorAttribution.uri } })),
        };
      }
      this.conteudo(lugarHtml(p));
    } catch (e) {
      console.warn('Place Details', e);
      this.conteudo(`<div class="lug muted"><button type="button" class="lug-x" aria-label="Fechar">${icX}</button>Não foi possível carregar as avaliações deste lugar.</div>`);
    }
  }
  /* camada por setor censitário em ladrilhos desenhados no navegador */
  private ladrilhos: any = null;
  private setorSel: any = null;
  camada(c: Camada | null) {
    const ov = this.mapa.overlayMapTypes;
    if (this.ladrilhos) { const i = ov.getArray().indexOf(this.ladrilhos); if (i >= 0) ov.removeAt(i); this.ladrilhos = null; }
    if (!c) return;
    const { google } = window;
    this.ladrilhos = {
      tileSize: new google.maps.Size(256, 256), maxZoom: 22, name: 'setores',
      getTile(co: any, z: number, doc: Document) { const cv = doc.createElement('canvas'), n = 2 ** z; desenhaLadrilho(cv, ((co.x % n) + n) % n, co.y, z, c); return cv; },
      releaseTile() {},
    };
    ov.insertAt(0, this.ladrilhos);
  }
  /** o setor tocado fica contornado */
  contornoSetor(i: number | null) {
    this.setorSel?.setMap(null);
    this.setorSel = null;
    if (i == null) return;
    this.setorSel = new window.google.maps.Polygon({ map: this.mapa, paths: aneis(i).map((r) => r.map((p) => gLL(p[0], p[1]))), strokeColor: '#1f1f1f', strokeWeight: 2.5, fillOpacity: 0, clickable: false, zIndex: 5 });
  }
  destruir() { this.pinos.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null))); this.el.innerHTML = ''; }
}
