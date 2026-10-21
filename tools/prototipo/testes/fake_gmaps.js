const TMP=require('path').join(__dirname,'..','saida')+'/';
(function(){
  const P=new Proxy(function(){},{get(t,k){if(k===Symbol.toPrimitive)return()=>0;if(k==='then')return undefined;if(k==='prototype')return{};return P},apply(){return P},construct(){return P}});
  class PAC extends HTMLElement{connectedCallback(){if(this.shadowRoot)return;const r=this.attachShadow({mode:'open'});
    r.innerHTML=`<style>:host{display:block}input{width:100%;box-sizing:border-box;height:42px;border:0;padding:0 12px;font:inherit;background:transparent;color:inherit;outline:0}input::placeholder{color:inherit;opacity:.6}span{position:absolute;left:12px;top:12px;color:#444746}div{position:relative}</style><div>${this.noInputIcon?'':'<span>⌕</span>'}<input part="input" placeholder="${this.placeholder||''}"></div>`}}
  customElements.define('gmp-place-autocomplete',PAC);
  const m=google.maps;m.importLibrary=async n=>n==='places'?{PlaceAutocompleteElement:PAC}:P;
  ['Map','LatLng','LatLngBounds','Polygon','Marker','event','ControlPosition','MapTypeId','Size','Point','InfoWindow','Data','MVCArray'].forEach(k=>{if(!(k in m))m[k]=P});
  setTimeout(()=>m.__ib__&&m.__ib__(),0);
})();
