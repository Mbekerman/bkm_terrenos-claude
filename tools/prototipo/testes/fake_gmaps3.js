// Google simulado para a página Mapa: guarda as opções de cada mapa criado (Map ID, clickableIcons),
// os ouvintes de clique, o conteúdo do InfoWindow e as consultas Place Details (tlugares.js)
(function(){
  const P=new Proxy(function(){},{get(t,k){if(k===Symbol.toPrimitive)return()=>0;if(k==='then')return undefined;if(k==='prototype')return{};return P},apply(){return P},construct(){return P}});
  const comPadrao=o=>new Proxy(o,{get(t,k){return k in t?t[k]:P}});
  window.__mapas=[];window.__info={html:'',aberto:false};window.__fetch=[];
  function Map(el,opts){const ls={};const m={opts,ls,addListener:(ev,f)=>{(ls[ev]=ls[ev]||[]).push(f);return P},getCenter:()=>({lat:()=>-23.58,lng:()=>-46.58}),getZoom:()=>15,
    getStreetView:()=>comPadrao({getVisible:()=>false,addListener:()=>P}),setMapTypeId:t=>{m.tipo=t},getDiv:()=>el};window.__mapas.push(m);return comPadrao(m)}
  function InfoWindow(){return comPadrao({setContent:h=>{window.__info.html=typeof h==='string'?h:h.innerHTML;window.__info.node=h},setPosition:()=>{},open:()=>{window.__info.aberto=true},close:()=>{window.__info.aberto=false}})}
  class Place{constructor({id}){this.id=id}async fetchFields({fields}){window.__fetch.push({id:this.id,fields});Object.assign(this,window.__lugar||{});return {place:this}}}
  const m=google.maps;m.Map=Map;m.InfoWindow=InfoWindow;
  m.importLibrary=async n=>n==='places'?{Place,PlaceAutocompleteElement:P}:n==='maps'?{Map,InfoWindow}:P;
  ['LatLng','LatLngBounds','Polygon','Marker','event','ControlPosition','MapTypeId','Size','Point','Data','MVCArray','OverlayView'].forEach(k=>{if(!(k in m))m[k]=P});
  setTimeout(()=>m.__ib__&&m.__ib__(),0);
})();
