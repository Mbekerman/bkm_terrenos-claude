
/* =====================================================================
   Google Maps Platform (chave única, restrita ao domínio no Cloud Console).
   Mapa, satélite, Street View, rotas, entorno (Places), relevo (Elevation),
   geocodificação e autocompletar de endereço. Sem chave ou se o Google
   recusar, o protótipo continua no Leaflet.
   ===================================================================== */
const GKEY=(()=>{const v=document.querySelector('meta[name="gmaps-key"]')?.content||'';return /^AIza[\w-]{20,}$/.test(v)?v:''})();
let gInfo=null,gPins=[],gPois=[],gDes=[],gRota=[],gEntorno=[],gMiniSv=null,gLib={};
const gSet=(arr,map)=>arr.forEach(o=>{if(o.setMap)o.setMap(map);else o.map=map});
const gLL=(lat,lng)=>({lat,lng});
const TIPO_G={mapa:'roadmap',satelite:'hybrid'};

function carregarGoogle(){
  if(!GKEY)return;
  window.gm_authFailure=()=>{if(!GG)return;GG=false;toast('O Google recusou a chave (domínio ou API não liberados). Voltando ao mapa alternativo.',true);render()};
  /* carregador oficial do Maps JS (bootstrap dinâmico) */
  (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({key:GKEY,v:'weekly',language:'pt-BR',region:'BR'});
  Promise.all(['maps','marker','geometry','places','elevation','streetView','geocoding'].map(n=>google.maps.importLibrary(n).then(x=>gLib[n]=x)))
    .then(()=>{GG=true;if(['mapa','terreno'].includes(UI.route))render()})
    .catch(e=>{console.warn('Google Maps indisponível',e)});
}

/* ---------- mapa principal ---------- */
function gPinEl(k,sel){const d=document.createElement('div');d.className='pin g'+(sel?' sel':'');d.innerHTML=`<span class="pin-b" style="background:${SIT[k][1]}"><b style="color:${SIT[k][3]}">${SIT[k][2]}</b></span>`;return d}
function gPoiEl(){const d=document.createElement('div');d.className='poi g';d.innerHTML='<span class="poi-b"></span>';return d}
function G_setBase(k){UI.mpBase=k;if(MAPA&&MAPA.setMapTypeId)MAPA.setMapTypeId(TIPO_G[k]||'roadmap');document.querySelectorAll('[data-a="mp-base"]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===k))}
function G_fecharPopup(){gInfo?.close()}
function G_mostrarPois(on){gSet(gPois,on?MAPA:null)}
/* destaca o pino selecionado sem recriar os marcadores */
function gPinsSel(){gPins.forEach(m=>{if(m._terreno&&m.content){m.content.classList.toggle('sel',UI.mpSel===m._terreno);m.zIndex=UI.mpSel===m._terreno?10:1}})}
function G_desenhaPins(){if(!MAPA)return;gSet(gPins,null);gPins=[];const {AdvancedMarkerElement}=gLib.marker;
  mpVisiveis().filter(t=>t.lat!=null).forEach(t=>{const k=sitMapa(t);
    const mk=new AdvancedMarkerElement({map:MAPA,position:gLL(t.lat,t.lng),content:gPinEl(k,UI.mpSel===t.id),title:t.nome,gmpClickable:!UI.mpModo,zIndex:UI.mpSel===t.id?10:1});
    mk.addEventListener('gmp-click',()=>{if(Date.now()-(UI.polyLongoEm||0)<900)return;mpSelecionar(t.id)});mk._terreno=t.id;gPins.push(mk);
    if(t.poly&&t.poly.length>=3&&mk.content){polyGestos(mk.content,t.id);mk.content.addEventListener('dblclick',e=>{e.stopPropagation();editarPoligonal(t.id)})}
    if(t.poly&&!(UI.mpModo&&UI.mpAlvo===t.id)){const pg=new google.maps.Polygon({map:MAPA,paths:t.poly.map(p=>gLL(p[0],p[1])),strokeColor:SIT[k][1],strokeWeight:2,fillColor:SIT[k][1],fillOpacity:.18,clickable:!UI.mpModo});
      let tc=null;pg.addListener('click',()=>{if(Date.now()-(UI.polyLongoEm||0)<700)return;clearTimeout(tc);tc=setTimeout(()=>{if(!UI.mpModo)mpSelecionar(t.id)},260)});
      pg.addListener('dblclick',e=>{e?.stop?.();clearTimeout(tc);editarPoligonal(t.id)});
      /* segurar o dedo sobre a poligonal entra em edição */
      let tm=null;const limpa=()=>{clearTimeout(tm);tm=null};
      pg.addListener('mousedown',e=>{if(UI.mpModo||!TOQUE())return;limpa();tm=setTimeout(()=>{tm=null;UI.polyLongoEm=Date.now();aoSoltar(()=>editarPoligonal(t.id))},550)});
      ['mouseup','mouseout'].forEach(ev=>pg.addListener(ev,limpa));google.maps.event.addListener(MAPA,'dragstart',limpa);
      gPins.push(pg)}})}
let gConc=[];
function gConcEl(){const d=document.createElement('div');d.className='conc g';d.innerHTML='<span class="conc-b"></span>';return d}
function G_mostrarConc(on){gSet(gConc,on?MAPA:null)}
function G_desenhaConc(){if(!MAPA)return;gSet(gConc,null);gConc=[];const {AdvancedMarkerElement}=gLib.marker;
  (S.concorrentes||[]).forEach(c=>gConc.push(new AdvancedMarkerElement({map:UI.mpConc===false?null:MAPA,position:gLL(c.lat,c.lng),content:gConcEl(),title:`${c.nome}${c.empresa?' · '+c.empresa:''}`,gmpClickable:false})))}
function G_desenhaPois(){if(!MAPA)return;gSet(gPois,null);gPois=[];const {AdvancedMarkerElement}=gLib.marker;
  (S.pontos||[]).forEach(p=>gPois.push(new AdvancedMarkerElement({map:UI.mpPoi===false?null:MAPA,position:gLL(p.lat,p.lng),content:gPoiEl(),title:`${p.nome} · ${CAT_POI[p.cat]||''}`,gmpClickable:false})))}
function G_desenhaRascunho(){if(!MAPA)return;gSet(gDes,null);gDes=[];const p=(UI.desenho||[]).map(q=>gLL(q[0],q[1]));if(!p.length)return;
  const traco={icons:[{icon:{path:'M 0,-1 0,1',strokeOpacity:1,strokeColor:'#0094fe',scale:2},offset:'0',repeat:'10px'}],strokeOpacity:0,clickable:false};
  gDes.push(p.length>=3?new google.maps.Polygon({map:MAPA,paths:p,strokeColor:'#0094fe',strokeWeight:UI.mpModo==='editar'?2.5:2,fillColor:'#0094fe',fillOpacity:UI.mpModo==='editar'?.2:.12,clickable:false}):new google.maps.Polyline({map:MAPA,path:p,...traco}));
  const poli=gDes[0],{AdvancedMarkerElement}=gLib.marker;
  p.forEach((q,i)=>{const sel=UI.vSel===i;
    const el=document.createElement('div');el.className='v-alvo';el.innerHTML=`<span class="v-dot${sel?' sel':''}"></span>`;
    const mk=new AdvancedMarkerElement({map:MAPA,position:q,content:el,gmpDraggable:true,zIndex:sel?1000:10});
    vGestos(el,i);
    mk.addListener('drag',()=>{const pos=mk.position,pp=p.slice();pp[i]=gLL(typeof pos.lat==='function'?pos.lat():pos.lat,typeof pos.lng==='function'?pos.lng():pos.lng);poli.setPath?poli.setPath(pp):poli.setPaths(pp)});
    mk.addListener('dragstart',()=>{UI.vMenu=false;$('.mapa-area .v-menu')?.remove()});
    mk.addListener('dragend',()=>{const pos=mk.position;vArrastado(i,typeof pos.lat==='function'?pos.lat():pos.lat,typeof pos.lng==='function'?pos.lng():pos.lng)});
    gDes.push(mk)})}
/* posição de um ponto na tela do mapa (para abrir o menu do ponto ao lado dele) */
let gProj=null;
function gPontoNaTela(lat,lng){if(!MAPA)return null;if(!gProj||gProj.getMap()!==MAPA){gProj=new google.maps.OverlayView();gProj.onAdd=()=>{};gProj.draw=()=>{};gProj.onRemove=()=>{};gProj.setMap(MAPA)}
  const pr=gProj.getProjection();if(!pr)return null;const p=pr.fromLatLngToContainerPixel(new google.maps.LatLng(lat,lng));return p?{x:p.x,y:p.y}:null}
function gEnquadrar(pts,maxZoom){if(!MAPA||!pts.length)return;if(pts.length===1){MAPA.setCenter(pts[0]);MAPA.setZoom(maxZoom||17);return}
  const b=new google.maps.LatLngBounds();pts.forEach(p=>b.extend(p));MAPA.fitBounds(b,48);if(maxZoom)google.maps.event.addListenerOnce(MAPA,'idle',()=>{if(MAPA.getZoom()>maxZoom)MAPA.setZoom(maxZoom)})}
function G_initMapa(){const el=$('#mapa');if(!el)return;el.innerHTML='';gPins=[];gPois=[];gConc=[];gDes=[];gRota=[];gEntorno=[];gSet(gEu,null);gEu=[];
  const v=UI.mpView;
  MAPA=new google.maps.Map(el,{mapId:UI.mpLugares===false&&GMAP_SEM_LUGARES?GMAP_SEM_LUGARES:'DEMO_MAP_ID',colorScheme:temaEscuro()?'DARK':'LIGHT',center:v?gLL(v.c.lat??v.c[0],v.c.lng??v.c[1]):gLL(-23.55,-46.63),zoom:v?v.z:11,mapTypeId:TIPO_G[UI.mpBase||'satelite'],
    mapTypeControl:false,streetViewControl:true,streetViewControlOptions:{position:google.maps.ControlPosition.RIGHT_BOTTOM},cameraControl:false,fullscreenControl:false,clickableIcons:UI.mpLugares!==false,gestureHandling:'greedy',scaleControl:true,tilt:0,disableDoubleClickZoom:true});
  MAPA.__escuro=temaEscuro();gInfo=new google.maps.InfoWindow({maxWidth:320,headerDisabled:true});
  el.classList.toggle('modo',!!UI.mpModo);G_desenhaPins();G_desenhaPois();G_desenhaConc();desenhaEu(false);
  ctxGestos(el,(x,y)=>{if(!gProj||gProj.getMap()!==MAPA)gPontoNaTela(0,0);const pr=gProj?.getProjection();const ll=pr?.fromContainerPixelToLatLng(new google.maps.Point(x,y));return ll?{lat:ll.lat(),lng:ll.lng()}:null});
  /* reserva: o Google também avisa o clique direito (se o evento do navegador não chegar ao contêiner) */
  MAPA.addListener('contextmenu',e=>{const de=e.domEvent;if(!de||!e.latLng||(UI.ctxTipo||'mouse')!=='mouse'||$('.mp-ctx'))return;const r=el.getBoundingClientRect();ctxAbrir(de.clientX-r.left,de.clientY-r.top,e.latLng.lat(),e.latLng.lng())});
  MAPA.addListener('dragstart',ctxFechar);MAPA.addListener('zoom_changed',ctxFechar);G_desenhaRascunho();
  if(!v)gEnquadrar(ativosBanco().filter(t=>t.lat!=null).map(t=>gLL(t.lat,t.lng)),15);
  MAPA.addListener('idle',()=>{const c=MAPA.getCenter();UI.mpView={c:{lat:c.lat(),lng:c.lng()},z:MAPA.getZoom()};vMenuDesenha()});
  MAPA.addListener('dragstart',()=>$('.mapa-area .v-menu')?.remove());MAPA.addListener('zoom_changed',()=>$('.mapa-area .v-menu')?.remove());
  /* Street View: fecha no nosso X (canto de cima, à direita) ou no Esc; o fechar do Google fica escondido para não haver dois */
  const sv=MAPA.getStreetView();sv.setOptions({enableCloseButton:false,fullscreenControl:false});
  sv.addListener('visible_changed',()=>{$('.mapa-area')?.classList.toggle('sv-on',sv.getVisible());mpCtrlPos()});
  /* o bonequinho chega depois do mapa: os botões do canto se ajeitam acima dele */
  google.maps.event.addListenerOnce(MAPA,'tilesloaded',()=>setTimeout(mpCtrlPos,300));
  MAPA.addListener('click',e=>{if(e.placeId){e.stop();if(!UI.mpModo){lugarAbrir(e.placeId,e.latLng);return}}
    if(lugarFechar()&&!UI.mpModo)return;
    if(UI.mpModo&&e.latLng)mapaClique(e.latLng.lat(),e.latLng.lng());else if(UI.mpSel)mpSelecionar(null)});
  if(UI.mpFoco){const t=T(UI.mpFoco);UI.mpFoco=null;if(t&&t.lat!=null)google.maps.event.addListenerOnce(MAPA,'idle',()=>G_focar(t))}
}
let gEu=[];
function G_eu(u,centrar){gSet(gEu,null);const d=document.createElement('div');d.className='eu-dot';d.title='Você está aqui';
  gEu=[new google.maps.Circle({map:MAPA,center:gLL(u.lat,u.lng),radius:u.acc||0,strokeColor:'#1a73e8',strokeWeight:1,strokeOpacity:.5,fillColor:'#1a73e8',fillOpacity:.12,clickable:false}),
    new gLib.marker.AdvancedMarkerElement({map:MAPA,position:gLL(u.lat,u.lng),content:d,title:'Você está aqui',gmpClickable:false,zIndex:5})];
  if(centrar){MAPA.panTo(gLL(u.lat,u.lng));if((MAPA.getZoom()||0)<17)MAPA.setZoom(17)}}
function svFechar(){const sv=MAPA?.getStreetView?.();if(sv&&sv.getVisible()){sv.setVisible(false);return true}return false}
function G_focar(t){if(!MAPA)return;UI.mpSel=t.id;if(t.poly)gEnquadrar(t.poly.map(p=>gLL(p[0],p[1])),19);else{MAPA.setCenter(gLL(t.lat,t.lng));if(MAPA.getZoom()<17)MAPA.setZoom(17)}
  mpSelecionar(t.id)}

/* ---------- Lugares do Google (comércio, escolas, hospitais...) ----------
   Ligado: os ícones do Google ficam no mapa e o toque abre nome, nota e avaliações.
   Desligado: o mapa usa outro Map ID, com estilo sem lugares criado no Cloud Console
   (o Google não aceita esconder lugares por código quando há Map ID); o ID vem da
   variável GOOGLE_MAP_ID_SEM_LUGARES. Cada toque é uma consulta Place Details com
   avaliações (SKU Enterprise + Atmosphere); o resultado fica guardado na sessão. */
const GMAP_SEM_LUGARES=(()=>{const v=document.querySelector('meta[name="gmaps-mapid-sem-lugares"]')?.content||'';return /^[\w-]{6,}$/.test(v)?v:''})();
const LUGARES={};
function G_lugares(on){if(!on&&!GMAP_SEM_LUGARES){toast('Para esconder os lugares falta o estilo de mapa sem lugares no Google Cloud (Map ID).',true);return}
  UI.mpLugares=on;gInfo?.close();G_initMapa();document.querySelectorAll('[data-a="mp-lugares"]').forEach(b=>b.setAttribute('aria-pressed',on))}
const estrelas=n=>{const r=Math.max(0,Math.min(5,Math.round(n)));return '★'.repeat(r)+'☆'.repeat(5-r)};
function lugarHtml(p){const revs=(p.reviews||[]).slice(0,3),nota=p.rating!=null?`<div class="lug-nota"><b>${String(p.rating.toFixed?p.rating.toFixed(1):p.rating).replace('.',',')}</b> <span class="lug-est" aria-hidden="true">${estrelas(p.rating)}</span> <span class="muted">${p.userRatingCount!=null?Number(p.userRatingCount).toLocaleString('pt-BR')+' avaliações':''}</span></div>`:'<div class="muted">Sem avaliações no Google</div>';
  return `<div class="lug"><button type="button" class="lug-x" data-a="lug-fechar" aria-label="Fechar" title="Fechar">${ic('close',18)}</button><div class="lug-n">${esc(p.displayName||'Lugar')}</div>${p.formattedAddress?`<div class="lug-e muted">${esc(p.formattedAddress)}</div>`:''}${nota}
  ${revs.length?`<ul class="lug-revs">${revs.map(r=>{const a=r.authorAttribution||{},txt=String(r.text||'');return `<li><div class="lug-ra">${a.uri?`<a href="${esc(a.uri)}" target="_blank" rel="noopener">${esc(a.displayName||'Usuário do Google')}</a>`:esc(a.displayName||'Usuário do Google')} <span class="lug-est" aria-label="nota ${r.rating}">${estrelas(r.rating||0)}</span> <span class="muted">${esc(r.relativePublishTimeDescription||'')}</span></div>${txt?`<div class="lug-rt">${esc(txt.length>220?txt.slice(0,220).trim()+'…':txt)}</div>`:''}</li>`}).join('')}</ul>`:''}
  ${p.googleMapsURI?`<a class="lug-l" href="${esc(p.googleMapsURI)}" target="_blank" rel="noopener">Ver todas no Google Maps</a>`:''}<div class="lug-g muted">Avaliações do Google</div></div>`}
/* conteúdo como nó, com o X ligado direto (o InfoWindow pode não deixar o clique subir até o documento) */
function lugarConteudo(h){const d=document.createElement('div');d.innerHTML=h;d.querySelector('.lug-x')?.addEventListener('click',e=>{e.stopPropagation();lugarFechar()});gInfo.setContent(d)}
function lugarFechar(){if(gInfo&&gInfo.__lug){gInfo.close();gInfo.__lug=false;return true}return false}
async function lugarAbrir(id,ll){if(!gInfo||!MAPA)return;gInfo.__lug=true;lugarConteudo(`<div class="lug muted"><button type="button" class="lug-x" data-a="lug-fechar" aria-label="Fechar">${ic('close',18)}</button>Carregando avaliações…</div>`);gInfo.setPosition(ll);gInfo.open({map:MAPA});
  try{let p=LUGARES[id];if(!p){const pl=new gLib.places.Place({id});await pl.fetchFields({fields:['displayName','formattedAddress','rating','userRatingCount','reviews','googleMapsURI']});
      p=LUGARES[id]={displayName:pl.displayName,formattedAddress:pl.formattedAddress,rating:pl.rating,userRatingCount:pl.userRatingCount,googleMapsURI:pl.googleMapsURI,
        reviews:(pl.reviews||[]).map(r=>({rating:r.rating,text:r.text,relativePublishTimeDescription:r.relativePublishTimeDescription,authorAttribution:r.authorAttribution&&{displayName:r.authorAttribution.displayName,uri:r.authorAttribution.uri}}))}}
    lugarConteudo(lugarHtml(p))}
  catch(e){console.warn('Place Details',e);lugarConteudo(`<div class="lug muted"><button type="button" class="lug-x" aria-label="Fechar">${ic('close',18)}</button>Não foi possível carregar as avaliações deste lugar.</div>`)}}

/* ---------- Street View ---------- */
async function gStreetView(t,mapaAlvo){const sv=mapaAlvo.getStreetView();
  try{const {data}=await new google.maps.StreetViewService().getPanorama({location:gLL(t.lat,t.lng),radius:120,preference:google.maps.StreetViewPreference.NEAREST,sources:[google.maps.StreetViewSource.OUTDOOR]});
    const pano=data.location.latLng,head=google.maps.geometry.spherical.computeHeading(pano,new google.maps.LatLng(t.lat,t.lng));
    sv.setPano(data.location.pano);sv.setPov({heading:head,pitch:0});sv.setVisible(true);
    const d=google.maps.geometry.spherical.computeDistanceBetween(pano,new google.maps.LatLng(t.lat,t.lng));if(d>40)toast(`Imagem mais próxima a ${Math.round(d)} m do ponto do terreno.`)}
  catch(e){toast('Sem imagem do Street View a até 120 m deste terreno.',true)}}

/* ---------- rotas (Routes API; Directions como reserva) ---------- */
function gLimparRota(){gSet(gRota,null);gRota=[];const b=$('#mp-rota');if(b)b.remove()}
async function gRotaAte(t,p,modo='DRIVE'){gLimparRota();let km,min,path;
  try{const r=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':GKEY,'X-Goog-FieldMask':'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'},
      body:JSON.stringify({origin:{location:{latLng:{latitude:t.lat,longitude:t.lng}}},destination:{location:{latLng:{latitude:p.lat,longitude:p.lng}}},travelMode:modo,languageCode:'pt-BR',units:'METRIC',...(modo==='DRIVE'?{routingPreference:'TRAFFIC_UNAWARE'}:{})})});
    const j=await r.json();if(!r.ok||!j.routes?.length)throw new Error(j.error?.message||'sem rota');
    const ro=j.routes[0];km=ro.distanceMeters/1000;min=Math.round(parseInt(ro.duration)/60);path=google.maps.geometry.encoding.decodePath(ro.polyline.encodedPolyline)}
  catch(e){try{const res=await new google.maps.DirectionsService().route({origin:gLL(t.lat,t.lng),destination:gLL(p.lat,p.lng),travelMode:modo==='WALK'?'WALKING':modo==='TRANSIT'?'TRANSIT':'DRIVING'});
      const lg=res.routes[0].legs[0];km=lg.distance.value/1000;min=Math.round(lg.duration.value/60);path=res.routes[0].overview_path}
    catch(e2){toast(`Não foi possível calcular a rota pelo Google (${e.message}). Confira se a Routes API está liberada para a chave.`,true);return}}
  gRota.push(new google.maps.Polyline({map:MAPA,path,strokeColor:'#0094fe',strokeWeight:5,strokeOpacity:.9}));
  gEnquadrar(path.filter((_,i)=>i%Math.max(1,Math.floor(path.length/50))===0).concat([path.at(-1)]));
  const modos=[['DRIVE','Carro'],['WALK','A pé'],['TRANSIT','Transporte']];
  const b=document.createElement('div');b.id='mp-rota';b.className='mp-rota';
  b.innerHTML=`<div><b>${esc(t.nome)} → ${esc(p.nome)}</b><div>${num(km,1)} km · ${min} min ${modo==='DRIVE'?'de carro (sem trânsito)':modo==='WALK'?'a pé':'de transporte público'}</div></div>
    <div class="seg">${modos.map(([k,l])=>`<button data-a="mp-rota" data-id="${t.id}" data-p="${p.id}" data-m="${k}" aria-pressed="${k===modo}">${l}</button>`).join('')}</div>
    <a class="btn sm text" href="${rotaUrl(t,p)}" target="_blank" rel="noopener">Abrir no Google Maps</a><button class="btn sm text" data-a="mp-rota-limpar">Fechar</button>`;
  $('.mapa-area')?.appendChild(b)}

/* ---------- entorno (Places API New) ---------- */
const ENTORNO_TIPOS={subway_station:'transporte',train_station:'transporte',bus_station:'transporte',transit_station:'transporte',light_rail_station:'transporte',bus_stop:'transporte',school:'escola',university:'escola',hospital:'saude',supermarket:'comercio',shopping_mall:'comercio',park:'lazer'};
async function gEntornoDe(t){gSet(gEntorno,null);gEntorno=[];
  try{const {Place,SearchNearbyRankPreference}=gLib.places;
    const {places}=await Place.searchNearby({fields:['id','displayName','location','primaryType','types','formattedAddress'],locationRestriction:{center:gLL(t.lat,t.lng),radius:2000},
      includedPrimaryTypes:Object.keys(ENTORNO_TIPOS),maxResultCount:20,rankPreference:SearchNearbyRankPreference.DISTANCE,language:'pt-BR',region:'br'});
    UI.entorno={tid:t.id,itens:(places||[]).map(p=>({gid:p.id,nome:p.displayName,cat:ENTORNO_TIPOS[p.primaryType]||(p.types||[]).map(x=>ENTORNO_TIPOS[x]).find(Boolean)||'outro',tipo:p.primaryType,lat:p.location.lat(),lng:p.location.lng(),end:p.formattedAddress,d:distKm(t.lat,t.lng,p.location.lat(),p.location.lng())}))};
    const {AdvancedMarkerElement}=gLib.marker;
    UI.entorno.itens.forEach(p=>{const d=document.createElement('div');d.className='ent g';d.textContent=(CAT_POI[p.cat]||'?')[0];
      gEntorno.push(new AdvancedMarkerElement({map:MAPA,position:gLL(p.lat,p.lng),content:d,title:`${p.nome} · ${fKm(p.d)}`}))});
    gEnquadrar([gLL(t.lat,t.lng),...UI.entorno.itens.map(p=>gLL(p.lat,p.lng))],16);
    const l=$('#mp-lista');if(l)l.innerHTML=mpLista();if(!UI.entorno.itens.length)toast('Nada encontrado num raio de 2 km.')}
  catch(e){toast(`Busca de lugares indisponível (${e.message||e}). Confira se a Places API (New) está liberada para a chave.`,true)}}
function entornoHtml(){const e=UI.entorno;if(!e||!GG)return '';const t=T(e.tid);if(!t)return '';
  return `<section class="sec entorno"><div class="sec-h"><h2>Perto de ${esc(t.nome)}</h2><button class="btn sm text" data-a="mp-entorno-fechar">Fechar</button></div><div class="sec-b">
  ${e.itens.length?`<ul class="poil">${e.itens.map((p,i)=>`<li><span><span class="t1">${esc(p.nome)}</span><span class="t2">${CAT_POI[p.cat]||'Outro'} · em linha reta</span></span><b class="num">${fKm(p.d)}</b>
    ${(S.pontos||[]).some(x=>x.gid===p.gid)?'<span class="faint" style="font-size:12px">salvo</span>':`<button class="linkbtn ed" data-a="mp-entorno-salvar" data-i="${i}">Salvar</button>`}</li>`).join('')}</ul>`:'<div class="muted">Nada encontrado num raio de 2 km.</div>'}
  <div class="hint" style="margin-top:8px">Fonte: Google Places. “Salvar” guarda o lugar nos pontos de interesse da empresa.</div></div></section>`}

/* ---------- pontos de interesse do terreno: Places (busca por raio) + Routes (distância a pé) ---------- */
const normNome=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
/* matriz de rotas do terreno até vários destinos: Routes computeRouteMatrix; reserva Distance Matrix. Devolve [{m,min}|null] */
async function gMatriz(lat,lng,dest,modo){const out=dest.map(()=>null);const ll=(a,b)=>({waypoint:{location:{latLng:{latitude:a,longitude:b}}}});
  try{const r=await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':GKEY,'X-Goog-FieldMask':'originIndex,destinationIndex,distanceMeters,duration,condition'},
      body:JSON.stringify({origins:[ll(lat,lng)],destinations:dest.map(p=>ll(p.lat,p.lng)),travelMode:modo,languageCode:'pt-BR',regionCode:'BR'})});
    if(!r.ok)throw new Error('Routes '+r.status);const els=await r.json();if(!Array.isArray(els))throw new Error('resposta inesperada');
    els.forEach(e=>{const k=e.destinationIndex||0;if(k<out.length&&e.condition==='ROUTE_EXISTS'&&e.distanceMeters!=null)out[k]={m:e.distanceMeters,min:Math.max(1,Math.round(parseInt(e.duration||'0')/60))}});
    if(!out.some(Boolean))throw new Error('sem rotas')}
  catch(e1){const svc=new google.maps.DistanceMatrixService();
    for(let i=0;i<dest.length;i+=25){const ch=dest.slice(i,i+25);
      const res=await svc.getDistanceMatrix({origins:[gLL(lat,lng)],destinations:ch.map(p=>gLL(p.lat,p.lng)),travelMode:modo==='WALK'?'WALKING':'DRIVING'});
      (res?.rows?.[0]?.elements||[]).forEach((e,j)=>{if(e&&e.status==='OK')out[i+j]={m:e.distance.value,min:Math.max(1,Math.round(e.duration.value/60))}})}
    if(!out.some(Boolean))throw new Error('sem rotas')}
  return out}
async function gEntornoTerreno(t){if(!GG||!gLib.places||t.lat==null||ENT_BUSCA[t.id])return;
  ENT_BUSCA[t.id]=true;const lat=t.lat,lng=t.lng;entRefresh(t);
  try{const {Place,SearchNearbyRankPreference}=gLib.places;
    const res=await Promise.all(ENT_CAT.map(([k,,,tipos])=>Place.searchNearby({fields:['id','displayName','location'],locationRestriction:{center:gLL(lat,lng),radius:RAIO_PE},
      includedTypes:tipos,maxResultCount:20,rankPreference:SearchNearbyRankPreference.DISTANCE,language:'pt-BR',region:'br'})
      .then(r=>(r.places||[]).map(p=>({gid:p.id,nome:p.displayName,cat:k,lat:p.location.lat(),lng:p.location.lng()})))));
    /* um lugar entra uma vez (na primeira categoria); mesmo nome na mesma categoria = mesma estação/hospital, fica o mais perto */
    const ids=new Set(),nomes=new Set();let itens=[];
    res.flat().forEach(p=>{const n=p.cat+'|'+normNome(p.nome);if(ids.has(p.gid)||nomes.has(n))return;ids.add(p.gid);nomes.add(n);p.reta=Math.round(distKm(lat,lng,p.lat,p.lng)*1000);itens.push(p)});
    let semPe=false;
    if(itens.length){try{(await gMatriz(lat,lng,itens,'WALK')).forEach((x,i)=>{if(x){itens[i].pe=x.m;itens[i].min=x.min}})}catch(e1){semPe=true;itens.forEach(p=>{p.pe=p.reta;p.min=null})}}
    itens=itens.filter(p=>p.pe!=null&&p.pe<=RAIO_PE);
    t.entorno={lat,lng,em:HOJE,fonte:'google',semPe,itens};
    log(t,`Pontos de interesse buscados no Google: ${itens.length} a até ${fKm(RAIO_PE/1000)} a pé`);save();
    if(semPe)toast('A rota a pé não respondeu; os pontos foram filtrados pela distância em linha reta. Confira se a Routes API está liberada para a chave.',true)}
  catch(e){toast(`Não foi possível buscar os pontos de interesse (${e.message||e}). Confira se a Places API (New) está liberada para a chave.`,true)}
  finally{delete ENT_BUSCA[t.id];entRefresh(t)}}
/* distâncias pela rota até os pontos cadastrados pela empresa: a pé (perto) e de carro (todos) */
const idsPontos=()=>(S.pontos||[]).map(p=>p.id).sort().join(',');
const DIST_BUSCA={};
async function gDistEmpresa(t){if(!GG||t.lat==null||DIST_BUSCA[t.id])return;const pts=(S.pontos||[]).slice(),lat=t.lat,lng=t.lng;
  DIST_BUSCA[t.id]=true;const m={};let semRota=false;
  try{if(pts.length){const perto=pts.filter(p=>distKm(lat,lng,p.lat,p.lng)*1000<=RAIO_PE);
      const [pe,car]=await Promise.all([perto.length?gMatriz(lat,lng,perto,'WALK').catch(()=>null):Promise.resolve([]),gMatriz(lat,lng,pts,'DRIVE').catch(()=>null)]);
      if(!pe&&!car)semRota=true;
      pts.forEach(p=>m[p.id]={});(pe||[]).forEach((x,i)=>{if(x){m[perto[i].id].pe=x.m;m[perto[i].id].pm=x.min}});(car||[]).forEach((x,i)=>{if(x){m[pts[i].id].cm=x.m;m[pts[i].id].cmin=x.min}})}
    t.dist={lat,lng,ids:pts.map(p=>p.id).sort().join(','),semRota,m};save()}
  catch(e){}finally{delete DIST_BUSCA[t.id];entRefresh(t)}}
/* busca automática: terreno localizado sem busca para a coordenada atual (cadastro novo, endereço ou ponto mudou) */
function gEntornoAuto(){if(!GG||!gLib.places||UI.route!=='terreno'||UI.role==='Leitura')return;const t=T(UI.id);if(!t||t.lat==null)return;
  const e=t.entorno;
  if(!(e&&e.fonte!=='exemplo'&&e.lat===t.lat&&e.lng===t.lng)){const k=t.id+'|'+t.lat+'|'+t.lng;if(!ENT_TENT.has(k)){ENT_TENT.add(k);gEntornoTerreno(t)}}
  const d=t.dist;if(!(d&&d.lat===t.lat&&d.lng===t.lng&&d.ids===idsPontos())){const k='d|'+t.id+'|'+t.lat+'|'+t.lng+'|'+idsPontos();if(!ENT_TENT.has(k)){ENT_TENT.add(k);gDistEmpresa(t)}}}

/* ---------- geocodificação (endereço → coordenada) ---------- */
async function gGeocodificar(t){const end=[t.logradouro&&(t.logradouro+(t.numero?', '+t.numero:'')),t.bairro,'São Paulo - SP',t.cep].filter(Boolean).join(', ');
  try{const {results}=await new google.maps.Geocoder().geocode({address:end,region:'br'});if(!results?.length)throw new Error('não encontrado');
    const r=results[0],loc=r.geometry.location,bairroG=r.address_components.find(c=>c.types.some(x=>x.startsWith('sublocality')))?.long_name||'';
    UI.geo={tid:t.id,lat:loc.lat(),lng:loc.lng(),end:r.formatted_address,busca:end,exato:r.geometry.location_type==='ROOFTOP'&&!r.partial_match,
      bairroDif:!!(t.bairro&&bairroG&&bairroG.toLowerCase()!==t.bairro.toLowerCase())};UI.modal='geo';renderModal()}
  catch(e){toast(`O Google não encontrou o endereço "${end}".`,true);render()}}
function geoModalHtml(fechar){const g=UI.geo,t=T(g.tid);
  return `<div class="dh"><div><h2>Confirmar a localização?</h2><div class="muted" style="margin-top:4px">${esc(t.nome)}</div></div>${fechar}</div>
  <dl class="kvl"><div class="kv"><dt>Buscado</dt><dd>${esc(g.busca)}</dd></div><div class="kv"><dt>O Google encontrou</dt><dd>${esc(g.end)}</dd></div></dl>
  ${g.bairroDif||!g.exato?`<div class="banner warn">${ic('warn')}<div>${g.bairroDif?'O bairro encontrado é diferente do cadastrado. ':''}${!g.exato?'O Google não achou o número exato; o ponto é aproximado. ':''}Confira antes de usar ou marque no mapa.</div></div>`:''}
  <div class="df"><button class="btn text" data-a="mp-marcar" data-id="${t.id}">Marcar no mapa</button><button class="btn primary" data-a="g-geo-ok">Usar esta localização</button></div>`}
/* ---------- relevo (Elevation API) ---------- */
async function gRelevo(t){let pts=[];
  if(t.poly&&t.poly.length>=3){const pg=new google.maps.Polygon({paths:t.poly.map(p=>gLL(p[0],p[1]))});const la=t.poly.map(p=>p[0]),lo=t.poly.map(p=>p[1]);
    const [a,b,c,d]=[Math.min(...la),Math.max(...la),Math.min(...lo),Math.max(...lo)],n=12;
    for(let i=0;i<=n;i++)for(let j=0;j<=n;j++){const q=new google.maps.LatLng(a+(b-a)*i/n,c+(d-c)*j/n);if(google.maps.geometry.poly.containsLocation(q,pg))pts.push({i,j,q})}}
  if(pts.length<4){const r=0.00025;pts=[];for(let i=0;i<=6;i++)for(let j=0;j<=6;j++)pts.push({i,j,q:new google.maps.LatLng(t.lat-r+2*r*i/6,t.lng-r+2*r*j/6)})}
  try{const {results}=await new google.maps.ElevationService().getElevationForLocations({locations:pts.map(p=>p.q)});
    const el=results.map((r,k)=>({...pts[k],z:r.elevation,res:r.resolution}));const zs=el.map(e=>e.z),min=Math.min(...zs),max=Math.max(...zs);
    t.relevo={em:HOJE,min,max,desnivel:max-min,res:Math.max(...el.map(e=>e.res||0)),grade:el.map(e=>[e.i,e.j,+e.z.toFixed(1)]),n:el.length,poligonal:!!t.poly};
    log(t,`Relevo estimado pelo Google: desnível ${num(max-min,1)} m`);save();render();toast(`Desnível estimado: ${num(max-min,1)} m.`)}
  catch(e){toast(`Elevação indisponível (${e.message||e}). Confira se a Elevation API está liberada para a chave.`,true)}}
function relevoHtml(t){const r=t.relevo;if(!GG&&!r)return '';
  if(!r)return t.lat!=null?`<div class="relevo-vazio"><span class="muted">Relevo ainda não estimado.</span><button class="btn sm ed" data-a="g-relevo" data-id="${t.id}">Estimar relevo pelo Google</button></div>`:'';
  const ni=Math.max(...r.grade.map(g=>g[0]))+1,nj=Math.max(...r.grade.map(g=>g[1]))+1,cel=Math.max(8,Math.floor(220/Math.max(ni,nj)));
  // rampa sequencial de um matiz: mais claro = mais baixo
  const cor=z=>{const f=r.max>r.min?(z-r.min)/(r.max-r.min):0;return `hsl(212 70% ${88-f*58}%)`};
  return `<div class="relevo"><svg viewBox="0 0 ${nj*cel} ${ni*cel}" width="${nj*cel}" height="${ni*cel}" role="img" aria-label="Grade de elevação do terreno">${r.grade.map(([i,j,z])=>`<rect x="${j*cel}" y="${(ni-1-i)*cel}" width="${cel-1}" height="${cel-1}" fill="${cor(z)}" data-tip="${num(z,1)} m"/>`).join('')}</svg>
    <div class="relevo-n"><div><span class="k">Desnível estimado</span><b>${num(r.desnivel,1)} m</b></div><div><span class="k">Cota mínima / máxima</span>${num(r.min,1)} m / ${num(r.max,1)} m</div>
    <div class="hint">Google Elevation, ${r.n} pontos ${r.poligonal?'dentro da poligonal':'ao redor do ponto'}; resolução de até ${num(r.res,0)} m. Serve para triagem; não substitui o levantamento planialtimétrico.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${t.desnivel!==+r.desnivel.toFixed(1)?`<button class="btn sm ed" data-a="g-relevo-usar" data-id="${t.id}">Usar como desnível estimado</button>`:''}${GG?`<button class="btn sm text ed" data-a="g-relevo" data-id="${t.id}">Recalcular</button>`:''}</div></div></div>`}

/* ---------- mini mapa da ficha ---------- */
function G_initMini(){const el=$('#mini-mapa'),t=T(UI.id);if(!el||!t||t.lat==null)return;el.innerHTML='';
  MINI=new google.maps.Map(el,{mapId:'DEMO_MAP_ID',center:gLL(t.lat,t.lng),zoom:18,mapTypeId:'hybrid',mapTypeControl:false,streetViewControl:true,fullscreenControl:true,clickableIcons:false,gestureHandling:'cooperative',disableDoubleClickZoom:true,tilt:0});
  const mini0=MINI;miniGestos(el,d=>mini0.setZoom(mini0.getZoom()+d));MINI.addListener('dblclick',e=>{if(e.latLng)miniAbrirMapa(t,e.latLng.lat(),e.latLng.lng(),mini0.getZoom())});
  const k=sitMapa(t);new gLib.marker.AdvancedMarkerElement({map:MINI,position:gLL(t.lat,t.lng),content:gPinEl(k)});
  if(t.poly){new google.maps.Polygon({map:MINI,paths:t.poly.map(p=>gLL(p[0],p[1])),strokeColor:'#0094fe',strokeWeight:2,fillColor:'#0094fe',fillOpacity:.2,clickable:false});
    const b=new google.maps.LatLngBounds();t.poly.forEach(p=>b.extend(gLL(p[0],p[1])));MINI.fitBounds(b,24)}}

/* ---------- autocompletar de endereço (Places API New) ---------- */
/* converte o lugar escolhido nos campos da ficha */
function gDadosEndereco(place){const comp=(tipo,curto)=>{const c=place.addressComponents?.find(c=>c.types.includes(tipo));return c?(curto?c.shortText:c.longText):''};
  return {cep:comp('postal_code'),logradouro:comp('route'),numero:comp('street_number'),complemento:comp('subpremise'),
    bairro:comp('sublocality_level_1')||comp('sublocality')||comp('neighborhood'),cidade:comp('administrative_area_level_2')||comp('locality'),uf:comp('administrative_area_level_1',true),
    lat:place.location?.lat(),lng:place.location?.lng(),texto:place.formattedAddress||''}}
/* preenche o formulário: só sobrescreve o que o Google trouxe; o resto fica como estava */
function gPreencherCampos(f,d){if(!f||!d)return;const set=(n,v)=>{const i=f.querySelector(`[name="${n}"]`);if(i&&v!=null&&v!==''){i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));i.classList.remove('gpreenchido');void i.offsetWidth;i.classList.add('gpreenchido')}};
  set('cep',d.cep);set('logradouro',d.logradouro);set('numero',d.numero);if(d.complemento)set('complemento',d.complemento);set('bairro',d.bairro);
  if(d.cidade)set('municipio',d.cidade+(d.uf?' · '+d.uf:''));
  if(d.lat!=null){set('lat',String(d.lat.toFixed(6)).replace('.',','));set('lng',String(d.lng.toFixed(6)).replace('.',','));set('precisao','aproximada');f.querySelector('[name="precisao"]')?.classList.remove('gpreenchido')}
  const av=f.querySelector('.gbusca .hint');if(av)av.textContent=`Preenchido a partir de: ${d.texto}`;
  if(!d.numero){const n=f.querySelector('[name="numero"]');if(n){n.value='';n.readOnly=false;n.classList.add('auto-ed');n.placeholder='Preencha';n.focus();toast('O Google não trouxe o número. Preencha.')}}}
window.BKM_TESTE=Object.assign(window.BKM_TESTE||{},{preencherEndereco:(sel,d)=>gPreencherCampos(document.querySelector(sel),d)});
/* dentro do campo, só a lupa (do tamanho do texto) e "Pesquisar": sem o ícone e o botão de limpar do Google */
function gCampoBusca(pac){pac.placeholder='Pesquisar';pac.setAttribute('aria-label','Pesquisar endereço no Google');pac.requestedLanguage='pt-BR';pac.noInputIcon=true;pac.noClearButton=true;
  pac.setAttribute('no-input-icon','');pac.setAttribute('no-clear-button','')}
function gBuscasEndereco(){if(!GG)return;document.querySelectorAll('.gauto[data-gauto]:not([data-ok])').forEach(slot=>{slot.dataset.ok='1';
  try{const {PlaceAutocompleteElement}=gLib.places;const pac=new PlaceAutocompleteElement({includedRegionCodes:['br'],locationBias:{center:gLL(-23.55,-46.63),radius:50000}});gCampoBusca(pac);slot.appendChild(pac);
    const aplicar=async place=>{await place.fetchFields({fields:['addressComponents','location','formattedAddress']});gPreencherCampos(slot.closest('form'),gDadosEndereco(place))};
    pac.addEventListener('gmp-select',e=>{const pp=e.placePrediction;if(pp)aplicar(pp.toPlace())});
    pac.addEventListener('gmp-placeselect',e=>{if(e.place)aplicar(e.place)})}
  catch(e){slot.innerHTML='<span class="hint">Busca do Google indisponível.</span>'}})}
carregarGoogle();
