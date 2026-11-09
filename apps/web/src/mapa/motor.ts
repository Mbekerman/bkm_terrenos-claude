/* eslint-disable @typescript-eslint/no-explicit-any */
import { gLib } from './google';
import { aneis, desenhaLadrilho, type Camada } from './setores';
import { mkMarcaHtml, mkTitulo, type Emp } from './mercado';

// Motor do mapa do Google, portado de tools/prototipo/proto_gmap.js (G_initMapa, G_desenhaPins, gPinsSel, gEnquadrar,
// G_eu, G_focar, svFechar, lugarAbrir, gStreetView) e proto_novo.js (mpBuscar, achadoPin). Imperativo, como lá:
// o React desenha a página e entrega os dados; o motor mexe só dentro do contêiner do mapa.

export interface Pino { id: string; nome: string; lat: number; lng: number; poly: [number, number][] | null; cor: string; fg: string }
export interface Ganchos {
  pino(id: string): void;
  vazio(lat: number, lng: number): void;
  /** clique direito; `terreno` = o pino ou a poligonal de um terreno cadastrado estava sob o mouse */
  menu(x: number, y: number, lat: number, lng: number, terreno?: string): void;
  duplo(lat: number, lng: number, alvo: EventTarget | null): void;
  fecharMenu(): void;
  streetView(on: boolean): void;
  aviso(msg: string, erro?: boolean): void;
  pronto(): void;
  /** clique num lugar do Google; true = já tratado (escolher a origem da rota), não abre o quadro do lugar */
  lugar?(placeId: string, lat: number, lng: number): boolean;
  /** clique no mapa no modo de desenho */
  clique(lat: number, lng: number): void;
  /** o mapa começou (true) ou parou (false) de se mexer: o menu do ponto some e volta no lugar */
  movendo(on: boolean): void;
  /** dois cliques sobre a poligonal: editar (proto_mod.js › editarPoligonal) */
  editar?(id: string): void;
  /** o mouse parou sobre o pino ou a poligonal: a ficha já começa a carregar (pedido do Moisés, 6/nov/2026) */
  passar?(id: string): void;
}
/** gestos nos pontos do rascunho (proto_mod.js › vGestos, vArrastado) */
export interface GestosPonto {
  toque(): void;
  menu(i: number): void;
  duplo(i: number): void;
  arrastando(): void;
  arrastado(i: number, lat: number, lng: number): void;
}
export type Base = 'mapa' | 'satelite';
const TIPO: Record<Base, string> = { mapa: 'roadmap', satelite: 'hybrid' };
const gLL = (lat: number, lng: number) => ({ lat, lng });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const icX = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6 6 18"/></svg>';

/** vista do mapa (centro e zoom) guardada no navegador: a página Mapa abre onde a pessoa deixou, mesmo depois de fechar
    (pedido do Moisés, 5/nov/2026; proto_mod.js › mpVistaGuardada, chave bkm-terrenos-mapa-vista) */
type Vista = { c: { lat: number; lng: number }; z: number };
const MP_VKEY = 'bkm-terrenos-mapa-vista';
export let vista: Vista | null = (() => {
  try { const v = JSON.parse(localStorage.getItem(MP_VKEY) || 'null'); return v && isFinite(v.c?.lat) && isFinite(v.c?.lng) && isFinite(v.z) ? v : null; } catch { return null; }
})();
function guardarVista(v: Vista) { vista = v; try { localStorage.setItem(MP_VKEY, JSON.stringify({ c: { lat: +v.c.lat.toFixed(6), lng: +v.c.lng.toFixed(6) }, z: v.z })); } catch { /* sem storage */ } }

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
  private ps: Pino[] = [];
  private rt: any[] = [];
  private eu: any[] = [];
  private achado: any = null;
  private proj: any = null;
  private lug = false;
  /** desenhando ou editando a poligonal: pinos, poligonais, concorrência e lugares do Google não respondem ao clique */
  private modo = false;
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
    /* clique direito no contêiner: o menu "Novo terreno aqui" / "Traçar rota até aqui"; sobre o pino ou dentro da poligonal
       de um terreno, avisa qual (aí não há "Novo terreno aqui"; pedido do Moises, 9/nov/2026) */
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const ll = this.proj.getProjection()?.fromContainerPixelToLatLng(new google.maps.Point(x, y));
      if (!ll) return;
      const noPino = (e.target as HTMLElement | null)?.closest?.('[data-terreno]') as HTMLElement | null;
      const t = noPino?.dataset.terreno ?? this.ps.find((p) => p.poly && dentro(ll.lat(), ll.lng(), p.poly))?.id;
      g.menu(x, y, ll.lat(), ll.lng(), t);
    });
    M.addListener('dragstart', g.fecharMenu); M.addListener('zoom_changed', g.fecharMenu);
    M.addListener('dragstart', () => g.movendo(true)); M.addListener('zoom_changed', () => g.movendo(true));
    /* dois cliques em qualquer ponto dentro da poligonal de um terreno editam a poligonal, não só sobre a linha (pedido do Moises,
       9/nov/2026): o Google nem sempre entrega o duplo clique do preenchimento ao polígono, então o mapa confere pela posição.
       Sobre o pino, nada muda (o pino abre a ficha). */
    M.addListener('dblclick', (e: any) => {
      if (!e.latLng || e.placeId) return;
      const alvo = e.domEvent?.target ?? null;
      if (!this.modo && !(alvo as HTMLElement | null)?.closest?.('[data-terreno]')) {
        const t = this.poligonalEm(e.latLng.lat(), e.latLng.lng());
        if (t) { clearTimeout(this.tc); g.editar?.(t); return; }
      }
      g.duplo(e.latLng.lat(), e.latLng.lng(), alvo);
    });
    M.addListener('idle', () => { const c = M.getCenter(); guardarVista({ c: { lat: c.lat(), lng: c.lng() }, z: M.getZoom() }); g.movendo(false); });
    /* Street View: fecha no nosso X ou no Esc; o fechar do Google fica escondido para não haver dois */
    const sv = M.getStreetView();
    sv.setOptions({ enableCloseButton: false, fullscreenControl: false });
    sv.addListener('visible_changed', () => g.streetView(sv.getVisible()));
    google.maps.event.addListenerOnce(M, 'tilesloaded', () => setTimeout(g.pronto, 300));
    M.addListener('click', (e: any) => {
      if (e.placeId) { e.stop(); if (!this.modo) { if (g.lugar?.(e.placeId, e.latLng.lat(), e.latLng.lng())) return; this.lugarAbrir(e.placeId, e.latLng); return; } }
      if (this.lugarFechar() && !this.modo) return;
      if (!e.latLng) return;
      if (this.modo) g.clique(e.latLng.lat(), e.latLng.lng());
      else g.vazio(e.latLng.lat(), e.latLng.lng());
    });
  }
  /** o terreno cuja poligonal contém o ponto (a menor, quando uma está dentro da outra) */
  private poligonalEm(lat: number, lng: number): string | null {
    let id: string | null = null, menor = Infinity;
    for (const p of this.ps) if (p.poly && dentro(lat, lng, p.poly)) { const a = areaGraus(p.poly); if (a < menor) { menor = a; id = p.id; } }
    return id;
  }
  /** clique simples no terreno: espera um pouco para o duplo clique (edição) cancelar a abertura da ficha */
  private tc: ReturnType<typeof setTimeout> | undefined;
  private cliqueTerreno(id: string) { clearTimeout(this.tc); this.g.passar?.(id); this.tc = setTimeout(() => this.g.pino(id), 260); }
  temVista() { return !!vista; }
  setBase(b: Base) { this.mapa.setMapTypeId(TIPO[b]); }
  /** pinos e poligonais na cor do item da legenda */
  desenhar(ps: Pino[], sel: string | null) {
    this.pinos.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null)));
    this.pinos = [];
    this.ps = ps;
    const { AdvancedMarkerElement } = gLib.marker, { google } = window;
    for (const t of ps) {
      const d = document.createElement('div');
      d.className = 'pin g' + (sel === t.id ? ' sel' : '');
      d.dataset.terreno = t.id;
      d.innerHTML = `<span class="pin-b" style="background:${t.cor}"><b class="pin-d" style="background:${t.fg}"></b></span>`;
      const mk = new AdvancedMarkerElement({ map: this.mapa, position: gLL(t.lat, t.lng), content: d, title: t.nome, gmpClickable: !this.modo, zIndex: sel === t.id ? 10 : 1 });
      mk.addEventListener('gmp-click', () => this.g.pino(t.id));
      d.addEventListener('pointerenter', () => this.g.passar?.(t.id));
      mk._terreno = t.id;
      this.pinos.push(mk);
      if (t.poly) {
        const pg = new google.maps.Polygon({ map: this.mapa, paths: t.poly.map((p) => gLL(p[0], p[1])), strokeColor: t.cor, strokeWeight: 2, fillColor: t.cor, fillOpacity: 0.18, clickable: !this.modo });
        pg.addListener('mouseover', () => this.g.passar?.(t.id));
        pg.addListener('click', () => this.cliqueTerreno(t.id));
        pg.addListener('dblclick', (e: any) => { e?.stop?.(); clearTimeout(this.tc); this.g.editar?.(this.poligonalEm(e?.latLng?.lat?.(), e?.latLng?.lng?.()) ?? t.id); });
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
    setTimeout(() => this.lugarSaida(d), 0);
  }
  /* o quadro fecha sozinho 1 s depois que o mouse sai dele e, se o mouse não entrar nele, 1 s depois de aberto (no toque, não; pedido do Moisés, 5/nov/2026) */
  private lugT: ReturnType<typeof setTimeout> | undefined;
  private lugDentro = false;
  private lugarSaida(d: HTMLElement) {
    if (TOQUE()) return;
    const c = d.closest('.gm-style-iw-c') as (HTMLElement & { lugH?: boolean }) | null;
    if (!c || c.lugH) return;
    c.lugH = true;
    c.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(this.lugT); this.lugDentro = true; });
    c.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; this.lugDentro = false; clearTimeout(this.lugT); this.lugT = setTimeout(() => this.lugarFechar(), 1000); });
  }
  lugarFechar() { clearTimeout(this.lugT); if (this.lug) { this.info.close(); this.lug = false; return true; } return false; }
  private async lugarAbrir(id: string, ll: any) {
    clearTimeout(this.lugT); this.lugDentro = false; this.lug = true;
    if (!TOQUE()) this.lugT = setTimeout(() => { if (!this.lugDentro) this.lugarFechar(); }, 1000);
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
  /* concorrência: um quadrado por empreendimento (são ~2 mil); o aberto vai num marcador próprio por cima (mkDestaque) */
  private merc: any[] = [];
  private mercDest: any = null;
  private mercUlt: [Emp[], (id: string) => void] | null = null;
  mercado(lista: Emp[], abrir: (id: string) => void) {
    this.mercUlt = [lista, abrir];
    this.merc.forEach((m) => (m.map = null));
    const { AdvancedMarkerElement } = gLib.marker;
    this.merc = lista.map((e) => {
      const d = document.createElement('div');
      d.className = 'mk g'; d.innerHTML = mkMarcaHtml(e);
      const m = new AdvancedMarkerElement({ map: this.mapa, position: gLL(e.lat, e.lng), content: d, title: mkTitulo(e), gmpClickable: !this.modo });
      m.addEventListener('gmp-click', () => abrir(e.id));
      return m;
    });
  }
  destaque(e: Emp | null, abrir: (id: string) => void) {
    if (this.mercDest) this.mercDest.map = null;
    this.mercDest = null;
    if (!e) return;
    const d = document.createElement('div');
    d.className = 'mk g mk-dest'; d.innerHTML = mkMarcaHtml(e, true);
    this.mercDest = new gLib.marker.AdvancedMarkerElement({ map: this.mapa, position: gLL(e.lat, e.lng), content: d, title: mkTitulo(e), zIndex: 3000, gmpClickable: true });
    this.mercDest.addEventListener('gmp-click', () => abrir(e.id));
  }
  /* ---------- desenho da poligonal (proto_gmap.js › G_desenhaRascunho, gPontoNaTela; proto_mod.js › vGestos) ---------- */
  setModo(on: boolean) {
    if (this.modo === on) return;
    this.modo = on;
    this.el.classList.toggle('modo', on);
    if (on) this.lugarFechar();
    this.pinos.forEach((o) => (o.setOptions ? o.setOptions({ clickable: !on }) : (o.gmpClickable = !on)));
    /* a concorrência são ~2 mil marcadores: refazer com gmpClickable novo é bem mais rápido que trocar um a um (desenhaMerc) */
    if (this.mercUlt) this.mercado(...this.mercUlt);
    if (this.mercDest) this.mercDest.gmpClickable = !on;
  }
  /* marcando pontos, nunca a mãozinha aberta de arrastar (pedido do Moises, 9/nov/2026): dedo indicador no desenho ou
     edição da poligonal e na saída da rota, seta na régua (5/nov, confirmada em 9/nov); null volta ao do Google */
  cursorMarcar(c: 'pointer' | 'default' | null) {
    this.mapa.setOptions({ draggableCursor: c });
  }
  private rasc: any[] = [];
  rascunho(pts: [number, number][], sel: number | null, editar: boolean, gp: GestosPonto) {
    this.rasc.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null)));
    this.rasc = [];
    if (!pts.length) return;
    const { google } = window, M = this.mapa, p = pts.map((q) => gLL(q[0], q[1]));
    const traco = { icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#0094fe', scale: 2 }, offset: '0', repeat: '10px' }], strokeOpacity: 0, clickable: false };
    const poli = p.length >= 3
      ? new google.maps.Polygon({ map: M, paths: p, strokeColor: '#0094fe', strokeWeight: editar ? 2.5 : 2, fillColor: '#0094fe', fillOpacity: editar ? 0.2 : 0.12, clickable: false })
      : new google.maps.Polyline({ map: M, path: p, ...traco });
    this.rasc.push(poli);
    const ll = (pos: any) => [typeof pos.lat === 'function' ? pos.lat() : pos.lat, typeof pos.lng === 'function' ? pos.lng() : pos.lng] as [number, number];
    p.forEach((q, i) => {
      const el = document.createElement('div');
      el.className = 'v-alvo'; el.innerHTML = `<span class="v-dot${sel === i ? ' sel' : ''}"></span>`;
      const mk = new gLib.marker.AdvancedMarkerElement({ map: M, position: q, content: el, gmpDraggable: true, zIndex: sel === i ? 1000 : 10 });
      vGestos(el, i, gp);
      mk.addListener('drag', () => { const pp = p.slice(), [a, b] = ll(mk.position); pp[i] = gLL(a, b); poli.setPath ? poli.setPath(pp) : poli.setPaths(pp); });
      mk.addListener('dragstart', () => gp.arrastando());
      mk.addListener('dragend', () => { const [a, b] = ll(mk.position); gp.arrastado(i, a, b); });
      this.rasc.push(mk);
    });
  }
  /** o pino do terreno em edição, arrastável enquanto a poligonal está em edição (pedido do Moisés, 6/nov/2026); null tira */
  private pinEd: any = null;
  pinoEd(pos: [number, number] | null, cor: string, fg: string, arrastado: (lat: number, lng: number) => void) {
    if (this.pinEd) { this.pinEd.map = null; this.pinEd = null; }
    if (!pos) return;
    const d = document.createElement('div');
    d.className = 'pin g sel pin-ed';
    d.title = 'Arraste para mudar o pino de lugar';
    d.innerHTML = `<span class="pin-b" style="background:${cor}"><b class="pin-d" style="background:${fg}"></b></span>`;
    const mk = new gLib.marker.AdvancedMarkerElement({ map: this.mapa, position: gLL(pos[0], pos[1]), content: d, gmpDraggable: true, zIndex: 2000 });
    d.addEventListener('click', (e) => e.stopPropagation());
    const fim = () => { const q = mk.position; if (q) arrastado(typeof q.lat === 'function' ? q.lat() : q.lat, typeof q.lng === 'function' ? q.lng() : q.lng); };
    mk.addListener('dragend', fim);
    this.pinEd = mk;
  }
  /* ---------- régua (proto_mercado.js › rgDesenha; pedido do Moisés, 5/nov/2026) ----------
     a linha pelos pontos marcados, com a distância de cada trecho no meio dele e o total no último ponto; fechada (clique no primeiro
     ponto, com 3 ou mais), vira a forma com a área no meio */
  private rg: any[] = [];
  regua(pts: [number, number][], fechado: boolean, fechar: () => void, menuPonto?: (i: number, x: number, y: number) => void) {
    this.rg.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null)));
    this.rg = [];
    if (!pts.length) return;
    const { google } = window, M = this.mapa, p = pts.map((q) => gLL(q[0], q[1])), cor = '#0b57d0', AM = gLib.marker.AdvancedMarkerElement;
    this.rg.push(fechado
      ? new google.maps.Polygon({ map: M, paths: p, strokeColor: cor, strokeWeight: 2.5, fillColor: cor, fillOpacity: 0.12, clickable: false })
      : new google.maps.Polyline({ map: M, path: p, strokeColor: cor, strokeWeight: 2.5, clickable: false }));
    /* um ponto sem tamanho no lugar exato, com o desenho centrado nele */
    const w = (el: HTMLElement) => { const d = document.createElement('div'); d.className = 'rg-w'; d.appendChild(el); return d; };
    const ini = pts.length > 2 && !fechado;
    p.forEach((q, i) => {
      const el = document.createElement('div');
      el.className = 'rg-pt' + (i === 0 && ini ? ' rg-ini' : '');
      /* o clique num ponto não marca outro em cima dele; no primeiro (com 3 ou mais) fecha a forma; o direito abre Excluir ponto */
      el.addEventListener('click', (ev) => { ev.stopPropagation(); if (i === 0 && ini) fechar(); });
      el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); menuPonto?.(i, ev.clientX, ev.clientY); });
      this.rg.push(new AM({ map: M, position: q, content: w(el), zIndex: 4001, gmpClickable: i === 0 && ini }));
    });
    reguaRotulos(pts, fechado).forEach((o) => {
      const el = document.createElement('div'); el.className = 'rg-rot ' + o.c; el.textContent = o.t;
      this.rg.push(new AM({ map: M, position: gLL(o.ll[0], o.ll[1]), content: w(el), zIndex: 4000, gmpClickable: false }));
    });
  }
  /** posição de um ponto na tela do mapa (para abrir o menu do ponto ao lado dele) */
  pontoNaTela(lat: number, lng: number) {
    const p = this.proj.getProjection()?.fromLatLngToContainerPixel(new window.google.maps.LatLng(lat, lng));
    return p ? { x: p.x as number, y: p.y as number } : null;
  }
  /** rota (Traçar rota até aqui): o destino aparece logo; a linha e a origem quando a rota chega */
  rotaLimpar() { this.rt.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null))); this.rt = []; }
  /** soltar: a saída se arrasta (mãozinha) e, solta, devolve o ponto novo; enquadrar = false mantém a vista (depois do arraste) */
  rota(d: { lat: number; lng: number }, o?: { lat: number; lng: number } | null, path?: { lat: number; lng: number }[] | null, pe?: boolean,
    soltar?: (p: { lat: number; lng: number }) => void, enquadrar = true) {
    const { google } = window;
    this.rotaLimpar();
    const mk = (p: { lat: number; lng: number }, cls: string, titulo: string, arrasta?: boolean) => {
      const el = document.createElement('div'); el.className = cls;
      return new gLib.marker.AdvancedMarkerElement({ map: this.mapa, position: gLL(p.lat, p.lng), content: el, title: titulo,
        gmpClickable: false, gmpDraggable: !!arrasta, zIndex: arrasta ? 960 : 950 });
    };
    if (path?.length) {
      /* a pé, pontilhada, como no Google Maps; os outros modos, linha cheia com contorno */
      if (pe) this.rt.push(new google.maps.Polyline({ map: this.mapa, path, strokeOpacity: 0, clickable: false, zIndex: 40,
        icons: [{ icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#0b57d0', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5, scale: 4.5 }, offset: '0', repeat: '13px' }] }));
      else {
        this.rt.push(new google.maps.Polyline({ map: this.mapa, path, strokeColor: '#0a3f9c', strokeWeight: 8, strokeOpacity: 0.9, clickable: false, zIndex: 39 }));
        this.rt.push(new google.maps.Polyline({ map: this.mapa, path, strokeColor: '#1a73e8', strokeWeight: 5, strokeOpacity: 1, clickable: false, zIndex: 40 }));
      }
    }
    this.rt.push(mk(d, 'rt-d', 'Destino'));
    if (o) {
      const m = mk(o, 'rt-o', soltar ? 'Saída: arraste para mudar' : 'Saída', !!soltar);
      if (soltar) m.addListener('dragend', () => {
        const ps: any = m.position;
        const lat = typeof ps?.lat === 'function' ? ps.lat() : ps?.lat, lng = typeof ps?.lng === 'function' ? ps.lng() : ps?.lng;
        if (typeof lat === 'number' && typeof lng === 'number') soltar({ lat, lng });
      });
      this.rt.push(m);
    }
    if (path?.length && enquadrar) {
      const b = new google.maps.LatLngBounds();
      path.forEach((p) => b.extend(p));
      this.mapa.fitBounds(b, { top: 80, left: 400, right: 80, bottom: 60 });
    }
  }
  destruir() {
    this.rotaLimpar();
    if (this.pinEd) this.pinEd.map = null;
    this.rasc.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null))); this.merc.forEach((m) => (m.map = null)); if (this.mercDest) this.mercDest.map = null; this.pinos.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null))); this.el.innerHTML = ''; }
}

/* gestos num ponto: arrastar move; clique direito ou dois cliques (mouse) abrem o menu; segurar (toque) também.
   O clique direito só vale com mouse: no Android o toque longo também dispara contextmenu, com o dedo ainda na tela. */
/** ponto dentro da poligonal (raio cruzando as arestas) */
function dentro(lat: number, lng: number, poly: [number, number][]) {
  let d = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ai, bi] = poly[i], [aj, bj] = poly[j];
    if ((bi > lng) !== (bj > lng) && lat < ((aj - ai) * (lng - bi)) / (bj - bi) + ai) d = !d;
  }
  return d;
}
/** área aproximada em graus², só para escolher a menor entre poligonais sobrepostas */
function areaGraus(poly: [number, number][]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][1] + poly[i][1]) * (poly[j][0] - poly[i][0]);
  return Math.abs(a / 2);
}
export const TOQUE = () => matchMedia('(pointer: coarse)').matches;
export function vGestos(el: HTMLElement, i: number, gp: GestosPonto) {
  el.classList.add('v-ponto');
  let tm: ReturnType<typeof setTimeout> | null = null, x0 = 0, y0 = 0, tipo = '';
  const limpa = () => { if (tm) clearTimeout(tm); tm = null; };
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (((e as PointerEvent).pointerType || tipo) === 'mouse') { gp.toque(); gp.menu(i); } });
  el.addEventListener('pointerdown', (e) => {
    gp.toque(); x0 = e.clientX; y0 = e.clientY; tipo = e.pointerType;
    if (e.button === 2) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen' || TOQUE()) { limpa(); tm = setTimeout(() => { tm = null; gp.menu(i); }, 500); }
  });
  el.addEventListener('pointermove', (e) => { if (tm && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) limpa(); });
  el.addEventListener('pointerup', () => { gp.toque(); limpa(); });
  ['pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, limpa));
  el.addEventListener('click', (e) => { e.stopPropagation(); gp.toque(); });
  el.addEventListener('dblclick', (e) => { e.stopPropagation(); e.preventDefault(); gp.toque(); gp.duplo(i); });
}

/* ---------- medidas da régua ---------- */
export const distM = (a: [number, number], b: [number, number]) => {
  const R = 6371008.8, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export const reguaM = (v: number) => (v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' km' : Math.round(v).toLocaleString('pt-BR') + ' m');
export const reguaA = (v: number) => (v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' km²' : Math.round(v).toLocaleString('pt-BR') + ' m²');
export function reguaTotal(p: [number, number][], fechado: boolean) {
  let t = 0;
  for (let i = 1; i < p.length; i++) t += distM(p[i - 1], p[i]);
  if (fechado && p.length > 2) t += distM(p[p.length - 1], p[0]);
  return t;
}
/** área da forma fechada pela régua (mesma conta da poligonal) */
export function reguaArea(p: [number, number][]) {
  if (p.length < 3) return null;
  const lat0 = (p.reduce((s, q) => s + q[0], 0) / p.length) * Math.PI / 180, R = 6371008.8;
  const xy = p.map((q) => [(q[1] * Math.PI / 180) * R * Math.cos(lat0), (q[0] * Math.PI / 180) * R]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) { const u = xy[i], v = xy[(i + 1) % xy.length]; a += u[0] * v[1] - v[0] * u[1]; }
  return Math.abs(a) / 2;
}
function reguaRotulos(p: [number, number][], fechado: boolean) {
  const out: { ll: [number, number]; t: string; c: string }[] = [];
  const seg = (a: [number, number], b: [number, number]) => out.push({ ll: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t: reguaM(distM(a, b)), c: 'rg-seg' });
  for (let i = 1; i < p.length; i++) seg(p[i - 1], p[i]);
  if (fechado && p.length > 2) seg(p[p.length - 1], p[0]);
  if (!fechado && p.length > 2) out.push({ ll: p[p.length - 1], t: reguaM(reguaTotal(p, false)), c: 'rg-tot' });
  if (fechado) {
    const ar = reguaArea(p);
    if (ar) out.push({ ll: [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length], t: reguaA(ar), c: 'rg-tot' });
  }
  return out;
}
