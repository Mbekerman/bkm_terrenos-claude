/* ===================== Setores censitários do IBGE (Censo 2022) =====================
   Camadas por setor no mapa (renda familiar estimada e densidade demográfica; uma de cada
   vez) e o quadro "Renda e
   população do entorno" na ficha. Os valores do IBGE vêm como estão (V06004 etc.) no arquivo
   gerado por tools/setores/gerar.py; a estimativa é calculada aqui pela metodologia de
   tools/setores/metodologia_renda.json (o build injeta em RENDA_MET), a mesma da visão
   app.setores_renda no banco:
     renda familiar estimada atual = V06004 × fator familiar × (PNAD atual ÷ PNAD base)
   Faixas fixas (decisão de produto): o limite de cima entra na faixa, depois de arredondar
   para reais. Setor sem renda divulgada fica sem cor, nunca zero. */
const RENDA_MET=__METODOLOGIA_RENDA__;
RENDA_MET.fatorPnad=RENDA_MET.pnadValorAtual/RENDA_MET.pnadValorBase;
/* densidade bruta: pessoas (V0001) ÷ área do setor; faixas de tools/setores/metodologia_densidade.json
   (a primeira, até 0, é "sem moradores"); o limite de cima entra na faixa, sem arredondar */
const DENS_MET=__METODOLOGIA_DENSIDADE__;
const dsFaixa=v=>{if(v==null)return null;for(let i=0;i<DENS_MET.faixas.length;i++){const a=DENS_MET.faixas[i].ate;if(a==null||v<=a)return i}return null};
const SET_ARQ={'3550308':'dados/setores-3550308-2022.json'};
const SET={d:null,promessa:null,erro:null};
const rdFaixa=v=>{if(v==null)return null;const r=Math.round(v);for(let i=0;i<RENDA_MET.faixas.length;i++){const a=RENDA_MET.faixas[i].ate;if(a==null||r<=a)return i}return null};
const rdNum=(v,d)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const rdHex2rgba=(h,a)=>`rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${a})`;
/* camadas por setor: cada uma diz a cor de um setor (null = sem dado) */
const CAMADAS_SETOR={
  renda:{nome:'Renda familiar estimada',curto:'Renda',met:RENDA_MET,cor:i=>{const f=SET.d.faixa[i];return f==null?null:RENDA_MET.faixas[f].cor}},
  dens:{nome:'Densidade demográfica',curto:'Densidade',met:DENS_MET,cor:i=>{const f=SET.d.dfaixa[i];return f==null?null:DENS_MET.faixas[f].cor}}};

function setUrl(){return (location.pathname.startsWith('/prototipo')?'/prototipo/':'')+SET_ARQ['3550308']}
function setCarregar(){if(SET.d)return Promise.resolve(SET.d);if(SET.promessa)return SET.promessa;
  SET.promessa=fetch(setUrl()).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(j=>{SET.d=setPreparar(j);return SET.d})
    .catch(e=>{console.warn('setores',e);SET.erro=e;SET.promessa=null;throw e});
  return SET.promessa}
/* geometria em inteiros de 1e-5 grau, em diferenças; índice em grade de 0,002 grau (~220 m) */
function setPreparar(j){const n=j.n,Q=1e5,G=0.002,bb=new Float64Array(n*4),rings=new Array(n),idx=new Map();
  for(let i=0;i<n;i++){let x0=180,y0=90,x1=-180,y1=-90;
    rings[i]=j.g[i].map(r=>{const a=new Float64Array(r.length);let x=0,y=0;for(let k=0;k<r.length;k+=2){x+=r[k];y+=r[k+1];a[k]=x/Q;a[k+1]=y/Q;
      if(a[k]<x0)x0=a[k];if(a[k]>x1)x1=a[k];if(a[k+1]<y0)y0=a[k+1];if(a[k+1]>y1)y1=a[k+1]}return a});
    bb.set([x0,y0,x1,y1],i*4);
    for(let gx=Math.floor(x0/G);gx<=Math.floor(x1/G);gx++)for(let gy=Math.floor(y0/G);gy<=Math.floor(y1/G);gy++){const k=gx+':'+gy;let l=idx.get(k);if(!l)idx.set(k,l=[]);l.push(i)}}
  const ff=RENDA_MET.fatorFamiliar,fp=RENDA_MET.fatorPnad;
  const r22=j.v4.map(v=>v==null?null:Math.round(v*ff*100)/100),rAt=j.v4.map(v=>v==null?null:Math.round(v*ff*fp*100)/100);
  const dens=j.pop.map((p,i)=>j.area[i]>0?p/(j.area[i]/1e6):null);
  return {...j,rings,bb,idx,G,r22,rAt,faixa:rAt.map(rdFaixa),dens,dfaixa:dens.map(dsFaixa)}}
function setCandidatos(x0,y0,x1,y1){const d=SET.d,G=d.G,s=new Set();
  for(let gx=Math.floor(x0/G);gx<=Math.floor(x1/G);gx++)for(let gy=Math.floor(y0/G);gy<=Math.floor(y1/G);gy++){const l=d.idx.get(gx+':'+gy);if(l)for(const i of l)s.add(i)}
  return s}
function setDentro(i,x,y){const d=SET.d,b=i*4;if(x<d.bb[b]||x>d.bb[b+2]||y<d.bb[b+1]||y>d.bb[b+3])return false;let dentro=false;
  for(const a of d.rings[i]){const n=a.length;for(let k=0,m=n-2;k<n;m=k,k+=2){const yi=a[k+1],yj=a[m+1];if((yi>y)!==(yj>y)&&x<(a[m]-a[k])*(y-yi)/(yj-yi)+a[k])dentro=!dentro}}
  return dentro}
function setEm(lat,lng){if(!SET.d)return null;for(const i of setCandidatos(lng,lat,lng,lat))if(setDentro(i,lng,lat))return i;return null}

/* ---------- desenho em ladrilhos (mesmo código no Leaflet e no Google) ---------- */
function setDesenhaLadrilho(cv,x,y,z,camada){const T=256,dpr=Math.min(2,window.devicePixelRatio||1),ctx=cv.getContext('2d');cv.width=cv.height=T*dpr;cv.style.width=cv.style.height=T+'px';
  if(!SET.d)return;ctx.scale(dpr,dpr);const W=T*2**z,lon=px=>px/W*360-180,lat=py=>{const n=Math.PI-2*Math.PI*py/W;return 180/Math.PI*Math.atan(Math.sinh(n))};
  const x0=lon(x*T),x1=lon((x+1)*T),y1=lat(y*T),y0=lat((y+1)*T),c=CAMADAS_SETOR[camada],op=c.met.opacidade;
  const PX=g=>(g+180)/360*W-x*T,PY=g=>{const s=Math.sin(g*Math.PI/180);return (.5-Math.log((1+s)/(1-s))/(4*Math.PI))*W-y*T};
  const borda=z>=14,sem=temaEscuro()?'rgba(200,210,255,.45)':'rgba(60,64,67,.45)';
  for(const i of setCandidatos(x0,y0,x1,y1)){const b=i*4,d=SET.d;if(d.bb[b]>x1||d.bb[b+2]<x0||d.bb[b+1]>y1||d.bb[b+3]<y0)continue;
    ctx.beginPath();for(const a of d.rings[i]){for(let k=0;k<a.length;k+=2){const px=PX(a[k]),py=PY(a[k+1]);k?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath()}
    const cor=c.cor(i);
    if(cor){ctx.fillStyle=rdHex2rgba(cor,op);ctx.fill('evenodd');if(borda){ctx.lineWidth=.6;ctx.strokeStyle='rgba(255,255,255,.55)';ctx.stroke()}}
    else if(z>=13){ctx.setLineDash([3,3]);ctx.lineWidth=.8;ctx.strokeStyle=sem;ctx.stroke();ctx.setLineDash([])}}}
let RD_L=null,RD_G=null,RD_SEL=null;
function rdLigada(){return !!CAMADAS_SETOR[UI.mpSetor]}
function rdCamada(){return rdLigada()?UI.mpSetor:null}
function rdCamadaLigar(){if(!MAPA||!rdLigada())return;
  if(!SET.d){setCarregar().then(()=>{rdCamadaLigar();rdLegenda()}).catch(()=>toast('Não foi possível carregar os setores do IBGE.',true));return}
  if(GG){if(RD_G)return;RD_G={tileSize:new google.maps.Size(256,256),maxZoom:22,name:'setores',getTile(co,z,doc){const cv=doc.createElement('canvas');const n=2**z;setDesenhaLadrilho(cv,((co.x%n)+n)%n,co.y,z,rdCamada()||'renda');return cv},releaseTile(){}};
    MAPA.overlayMapTypes.insertAt(0,RD_G)}
  else{if(RD_L)return;const Lr=L.GridLayer.extend({createTile(co){const cv=document.createElement('canvas');setDesenhaLadrilho(cv,co.x,co.y,co.z,rdCamada()||'renda');return cv}});
    RD_L=new Lr({pane:'overlayPane',zIndex:2,updateWhenZooming:false,keepBuffer:2}).addTo(MAPA)}}
function rdCamadaDesligar(){if(RD_G&&MAPA?.overlayMapTypes){const i=MAPA.overlayMapTypes.getArray().indexOf(RD_G);if(i>=0)MAPA.overlayMapTypes.removeAt(i)}RD_G=null;
  if(RD_L){try{MAPA?.removeLayer(RD_L)}catch(e){}}RD_L=null;rdSelLimpa()}
/* o setor tocado fica contornado */
function rdSelLimpa(){if(RD_SEL){try{GG?RD_SEL.setMap(null):MAPA?.removeLayer(RD_SEL)}catch(e){}}RD_SEL=null}
function rdSelDesenha(i){rdSelLimpa();if(i==null||!MAPA)return;const rs=SET.d.rings[i].map(a=>{const p=[];for(let k=0;k<a.length;k+=2)p.push([a[k+1],a[k]]);return p});
  const cor=temaEscuro()?'#ffffff':'#1f1f1f';
  if(GG)RD_SEL=new google.maps.Polygon({map:MAPA,paths:rs.map(r=>r.map(p=>gLL(p[0],p[1]))),strokeColor:cor,strokeWeight:2.5,fillOpacity:0,clickable:false,zIndex:5});
  else RD_SEL=L.polygon(rs,{color:cor,weight:2.5,fill:false,interactive:false}).addTo(MAPA)}

/* ---------- quadro do setor tocado ---------- */
const RD={sel:null,abertoEm:0};
function rdAbrirEm(lat,lng){if(!rdLigada()||!SET.d||UI.mpModo)return false;const i=setEm(lat,lng);if(i==null){rdFechar();return false}
  RD.sel=i;RD.abertoEm=Date.now();if(typeof ccFechar==='function')ccFechar();rdSelDesenha(i);rdBox();return true}
function rdFechar(){if(RD.sel==null)return false;RD.sel=null;rdSelLimpa();rdBox();return true}
function dsBoxHtml(i){const d=SET.d,m=DENS_MET,cd=d.municipio+d.cd[i],f=d.dfaixa[i],a=d.area[i]/1e6;
  return `<div class="cc-box rd-box" role="dialog" aria-label="Setor censitário ${cd}">
  <div class="cc-hd"><div class="cc-ti"><div class="cc-n">Setor censitário</div><div class="muted">${esc(d.distritos[d.di[i]]||'')} · São Paulo</div></div><button type="button" class="iconbtn" data-a="rd-x" aria-label="Fechar" title="Fechar (Esc)">${ic('close',20)}</button></div>
  ${d.pop[i]>0?`<div class="cc-k rd-k" style="border-left-color:${m.faixas[f].cor}"><div class="faint">Densidade demográfica bruta</div><div class="cc-big">${num(Math.round(d.dens[i]))} hab/km²</div><div class="faint">Faixa ${esc(m.faixas[f].rotulo)} hab/km²</div></div>`
    :`<div class="cc-meta">Setor sem moradores no Censo ${m.censoAno}.</div>`}
  <dl class="rd-kv"><div><dt>Pessoas – Censo ${m.censoAno}</dt><dd>${num(d.pop[i])}</dd></div>
    <div><dt>Domicílios ocupados</dt><dd>${num(d.dom[i])}</dd></div>
    <div><dt>Área do setor</dt><dd>${a<0.1?m2(Math.round(d.area[i])):num(a,2)+' km²'}</dd></div>
    <div><dt>Código do setor</dt><dd class="rd-cd">${cd}</dd></div></dl>
  <div class="rd-nota">Pessoas ÷ área total do setor, com parques, vias e terrenos vazios. <button class="linkbtn" data-a="ds-met">Metodologia</button></div></div>`}
function rdBoxHtml(i){if(rdCamada()==='dens')return dsBoxHtml(i);const d=SET.d,m=RENDA_MET,cd=d.municipio+d.cd[i],sit=d.sit[i],v=d.v4[i],at=d.rAt[i],f=d.faixa[i];
  const motivo=sit===1?'O IBGE não divulgou a renda deste setor (sigilo, poucos domicílios).':sit===3?'Setor sem moradores no Censo 2022.':'O IBGE não divulgou a renda deste setor.';
  const dist=v!=null&&d.v6[i]!=null&&v>m.distorcidaRazao*d.v6[i];
  return `<div class="cc-box rd-box" role="dialog" aria-label="Setor censitário ${cd}">
  <div class="cc-hd"><div class="cc-ti"><div class="cc-n">Setor censitário</div><div class="muted">${esc(d.distritos[d.di[i]]||'')} · São Paulo</div></div><button type="button" class="iconbtn" data-a="rd-x" aria-label="Fechar" title="Fechar (Esc)">${ic('close',20)}</button></div>
  ${v!=null?`<div class="cc-k rd-k" style="border-left-color:${m.faixas[f].cor}"><div class="faint">Renda familiar mensal estimada (valores de ${m.pnadAnoAtual})</div><div class="cc-big">${brl(at)}</div><div class="faint">${esc(m.faixas[f].rotulo)}</div></div>
  <dl class="rd-kv"><div><dt>Renda do responsável – Censo ${m.censoAno}</dt><dd>${brl(v)}</dd></div>
    <div><dt>Fator familiar</dt><dd>${rdNum(m.fatorFamiliar,1)}×</dd></div>
    <div><dt>Atualização PNAD (${m.pnadAnoBase} → ${m.pnadAnoAtual})</dt><dd>${rdNum(m.fatorPnad,4)}×</dd></div>
    <div><dt>Código do setor</dt><dd class="rd-cd">${cd}</dd></div></dl>
  ${dist?`<div class="rd-av">Média puxada por poucas rendas altas: a mediana do responsável é ${brl(d.v6[i])}, menos de 1/${m.distorcidaRazao} da média.</div>`:''}
  <div class="rd-nota">Renda familiar estimada, não observação direta do IBGE por setor. <button class="linkbtn" data-a="rd-met">Metodologia</button></div>`
  :`<div class="cc-meta">${motivo}</div><dl class="rd-kv"><div><dt>Código do setor</dt><dd class="rd-cd">${cd}</dd></div><div><dt>Pessoas</dt><dd>${num(d.pop[i])}</dd></div></dl>`}</div>`}
function rdBox(){const area=$('.mapa-area');let el=$('#rd-box');if(RD.sel==null||!SET.d||!area||UI.route!=='mapa'){el?.remove();return}
  if(!el||el.parentNode!==area){el?.remove();el=document.createElement('div');el.id='rd-box';area.appendChild(el)}el.innerHTML=rdBoxHtml(RD.sel)}

/* ---------- legenda da renda sobre o mapa (recolhível; no celular começa fechada) ---------- */
function dsLegendaHtml(){const m=DENS_MET,fx=m.faixas.slice(1);
  const marcas={2:'5',3:'10',5:'20',7:'50',8:'100'};
  const escala=`<span class="rd-esc" aria-hidden="true"><span class="rd-esc-c">${fx.map(f=>`<i style="background:${f.cor}"></i>`).join('')}</span><span class="rd-esc-m">${Object.entries(marcas).map(([k,v])=>`<b style="left:${k/fx.length*100}%">${v}</b>`).join('')}</span><span class="rd-esc-u">mil hab/km² · toque para ver as faixas</span></span>`;
  return `<summary><span class="rd-leg-t">Densidade demográfica</span>${escala}</summary><div class="rd-leg-l">${m.faixas.map(f=>`<div class="rd-li"><span class="rd-q" style="background:${rdHex2rgba(f.cor,Math.max(m.opacidade,.85))}"></span>${esc(f.rotulo)}</div>`).join('')}
    <div class="rd-leg-p">Habitantes por km², bruta · Censo ${m.censoAno} · <button class="linkbtn" data-a="ds-met">Metodologia</button></div>
    ${SET.d?'':`<div class="rd-leg-p">${SET.erro?'Não foi possível carregar os setores.':'Carregando os setores do IBGE…'}</div>`}</div>`}
function rdLegendaHtml(){if(rdCamada()==='dens')return dsLegendaHtml();const m=RENDA_MET;
  // fechada, a legenda mostra a escala de cores em uma linha (com os limites em mil reais); aberta, a lista das faixas
  const marcas={2:'3',4:'5',7:'8',10:'13',13:'22',15:'30'};
  const escala=`<span class="rd-esc" aria-hidden="true"><span class="rd-esc-c">${m.faixas.map(f=>`<i style="background:${f.cor}"></i>`).join('')}</span><span class="rd-esc-m">${Object.entries(marcas).map(([k,v])=>`<b style="left:${k/m.faixas.length*100}%">${v}</b>`).join('')}</span><span class="rd-esc-u">mil R$ por mês · toque para ver as faixas</span></span>`;
  return `<summary><span class="rd-leg-t">Renda familiar estimada</span>${escala}</summary><div class="rd-leg-l">${m.faixas.map(f=>`<div class="rd-li"><span class="rd-q" style="background:${rdHex2rgba(f.cor,Math.max(m.opacidade,.85))}"></span>${esc(f.rotulo)}</div>`).join('')}
    <div class="rd-li"><span class="rd-q rd-sem"></span>Sem dado do IBGE</div>
    <div class="rd-leg-p">Mensal, valores de ${m.pnadAnoAtual} · Censo ${m.censoAno} · <button class="linkbtn" data-a="rd-met">Metodologia</button></div>
    ${SET.d?'':`<div class="rd-leg-p">${SET.erro?'Não foi possível carregar os setores.':'Carregando os setores do IBGE…'}</div>`}</div>`}
function rdLegenda(){const area=$('.mapa-area');let el=$('#rd-leg');if(!area||UI.route!=='mapa'||!rdLigada()){el?.remove();return}
  if(!el||el.parentNode!==area){el?.remove();el=document.createElement('details');el.id='rd-leg';el.className='rd-leg';el.open=UI.rdLegAberta??innerWidth>899;
    el.addEventListener('toggle',()=>{UI.rdLegAberta=el.open});area.appendChild(el)}
  el.innerHTML=rdLegendaHtml();
  // no celular a barra do mapa tem uma ou duas linhas (a busca pode ir para a própria linha): a legenda fica logo abaixo dela
  const b=$('.mapa-area .mp-barra');el.style.top=innerWidth<900&&b?(b.offsetTop+b.offsetHeight+8)+'px':''}
/* barra do mapa: um botão Camadas que abre a lista das camadas por setor (uma ligada de cada vez);
   ligado, o botão mostra o nome curto da camada */
const RD_IC={renda:'rd-ic',dens:'ds-ic'};
function rdBarraBotao(){const k=rdCamada();
  return `<div class="mp-cam"><button type="button" class="mp-renda-b" data-a="mp-camadas" aria-haspopup="menu" aria-expanded="false" aria-pressed="${!!k}" title="Camadas por setor censitário (IBGE)">${k?`<span class="${RD_IC[k]}"></span>`:ic('layers',18)}${k?CAMADAS_SETOR[k].curto:'Camadas'}<span class="cam-seta">${ic('chev',16)}</span></button></div>`}
function rdMenu(abrir){const w=$('.mapa-area .mp-cam');if(!w)return;w.querySelector('.mp-cam-m')?.remove();const b=w.querySelector('[data-a="mp-camadas"]');b.setAttribute('aria-expanded',!!abrir);if(!abrir)return;
  const k=rdCamada(),it=(v,ico,l)=>`<button type="button" role="menuitemradio" aria-checked="${k===v}" data-a="mp-camada" data-v="${v||''}"><span class="${ico}"></span>${l}</button>`;
  w.insertAdjacentHTML('beforeend',`<div class="mp-cam-m" role="menu" aria-label="Camadas">${it('renda','rd-ic','Renda familiar')}${it('dens','ds-ic','Densidade demográfica')}${it(null,'cam-off','Nenhuma')}</div>`)}
document.addEventListener('pointerdown',e=>{if($('.mp-cam-m')&&!e.target.closest('.mp-cam'))rdMenu(false)},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.mp-cam-m')){rdMenu(false);e.preventDefault();e.stopImmediatePropagation()}},true);
function rdLegItem(){const k=rdCamada();return `<button type="button" class="lg-i" data-a="mp-renda" aria-pressed="${k==='renda'}"><span class="lg-poi"><span class="rd-ic"></span></span>Renda familiar (setores)</button>`
  +`<button type="button" class="lg-i" data-a="mp-dens" aria-pressed="${k==='dens'}"><span class="lg-poi"><span class="ds-ic"></span></span>Densidade demográfica (setores)</button>`}
function rdLigar(k){const antes=rdCamada();k=CAMADAS_SETOR[k]?k:null;if(k===antes)return;UI.mpSetor=k;
  if(antes)rdCamadaDesligar();
  if(k){if(!antes&&(UI.mpBase||'satelite')==='satelite'){UI.rdBaseAntes='satelite';setBase('mapa')}rdCamadaLigar();if(RD.sel!=null&&SET.d){rdSelDesenha(RD.sel);rdBox()}}
  else{RD.sel=null;rdBox();if(UI.rdBaseAntes&&UI.mpBase==='mapa')setBase(UI.rdBaseAntes);UI.rdBaseAntes=null}
  rdLegenda();const b=$('.mapa-area .mp-cam');if(b)b.outerHTML=rdBarraBotao();
  document.querySelectorAll('[data-a="mp-renda"]').forEach(b=>b.setAttribute('aria-pressed',k==='renda'));document.querySelectorAll('[data-a="mp-dens"]').forEach(b=>b.setAttribute('aria-pressed',k==='dens'))}
/* chamado depois de criar o mapa (initMapa): a camada, a legenda e o quadro voltam como estavam */
function rdPosMapa(){if(typeof achadoPin==='function')achadoPin();RD_L=null;RD_G=null;RD_SEL=null;if(!rdLigada()){rdLegenda();return}rdCamadaLigar();rdLegenda();if(RD.sel!=null&&SET.d){rdSelDesenha(RD.sel);rdBox()}}

/* ---------- ficha: renda e população do entorno ---------- */
const RD_RAIOS=[[500,'500 m'],[1000,'1 km'],[2000,'2 km'],[3000,'3 km'],['poly','Poligonal']];
const RD_CACHE={};
/* estatística de uma área por amostragem (~30 mil pontos): cada setor entra pela fração da área dele
   que cai dentro (moradores espalhados por igual no setor). No banco: app.estatisticas_area, exata. */
function setEstat(t,raio){if(!SET.d||t.lat==null)return null;const poly=raio==='poly'?t.poly:null;if(raio==='poly'&&!(poly&&poly.length>=3))return null;
  const ch=[t.id,raio,t.lat,t.lng,poly?JSON.stringify(poly):''].join('|');if(RD_CACHE[ch])return RD_CACHE[ch];
  const lat0=t.lat*Math.PI/180,mx=111320*Math.cos(lat0),my=110574,d=SET.d;
  let x0,x1,y0,y1,dentro;
  if(poly){const xs=poly.map(p=>p[1]),ys=poly.map(p=>p[0]);x0=Math.min(...xs);x1=Math.max(...xs);y0=Math.min(...ys);y1=Math.max(...ys);dentro=(x,y)=>dentroPoly(y,x,poly)}
  else{const dx=raio/mx,dy=raio/my;x0=t.lng-dx;x1=t.lng+dx;y0=t.lat-dy;y1=t.lat+dy;dentro=(x,y)=>((x-t.lng)*mx)**2+((y-t.lat)*my)**2<=raio*raio}
  const area=poly?areaPoly(poly):Math.PI*raio*raio,passo=Math.sqrt(area/30000),sx=passo/mx,sy=passo/my,cont=new Map();let fora=0;
  for(let y=y0+sy/2;y<y1;y+=sy)for(let x=x0+sx/2;x<x1;x+=sx){if(!dentro(x,y))continue;let achou=null;for(const i of setCandidatos(x,y,x,y))if(setDentro(i,x,y)){achou=i;break}
    if(achou==null)fora++;else cont.set(achou,(cont.get(achou)||0)+1)}
  let pes=0,dom=0,resp=0,respR=0,soma=0,dist=0;const porF=new Array(RENDA_MET.faixas.length).fill(0);
  for(const [i,c] of cont){const fr=Math.min(1,c*passo*passo/Math.max(d.area[i],1));pes+=d.pop[i]*fr;dom+=d.dom[i]*fr;const w=(d.v1[i]||0)*fr;resp+=w;
    if(d.rAt[i]!=null){respR+=w;soma+=d.rAt[i]*w;porF[d.faixa[i]]+=w;if(d.v6[i]!=null&&d.v4[i]>RENDA_MET.distorcidaRazao*d.v6[i])dist++}}
  const r={area,setores:cont.size,pes,dom,dens:pes/(area/1e6),renda:respR?soma/respR:null,cob:resp?respR/resp*100:null,porF:porF.map(w=>respR?w/respR*100:0),dist,foraPct:fora/(fora+[...cont.values()].reduce((a,b)=>a+b,0))*100};
  return RD_CACHE[ch]=r}
function rdCardCorpo(t){if(t.lat==null)return '<div class="muted">Sem localização.</div>';
  if(!SET.d){if(SET.erro)return '<div class="muted">Não foi possível carregar os setores do IBGE.</div>';setCarregar().then(()=>rdCardAtualiza(t.id)).catch(()=>rdCardAtualiza(t.id));return '<div class="muted">Carregando os setores do IBGE…</div>'}
  if(setEm(t.lat,t.lng)==null&&!setCandidatos(t.lng-.01,t.lat-.01,t.lng+.01,t.lat+.01).size)return '<div class="muted">Por ora só há setores do município de São Paulo.</div>';
  const raio=UI.rdRaio||1000,r=setEstat(t,raio),m=RENDA_MET;
  if(!r)return '<div class="muted">O terreno não tem poligonal.</div>';
  const barras=r.porF.map((p,k)=>p>=.05?`<li><span class="rd-q" style="background:${m.faixas[k].cor}"></span><span class="rd-fr">${esc(m.faixas[k].rotulo)}</span><span class="rd-bar"><span style="width:${Math.max(1,p)}%;background:${m.faixas[k].cor}"></span></span><b class="num">${rdNum(p,p<10?1:0)}%</b></li>`:'').join('');
  return `<div class="rd-met">
      <div class="rd-m rd-m1"><div class="k">Renda familiar média estimada</div><div class="v">${r.renda!=null?brl(r.renda):'Sem dado'}</div><div class="s">mensal, valores de ${m.pnadAnoAtual}</div></div>
      <div class="rd-m"><div class="k">População</div><div class="v">${num(Math.round(r.pes))}</div><div class="s">${num(Math.round(r.dens))} hab/km²</div></div>
      <div class="rd-m"><div class="k">Domicílios ocupados</div><div class="v">${num(Math.round(r.dom))}</div><div class="s">${raio==='poly'?m2(Math.round(r.area)):num(r.area/1e6,2)+' km²'}</div></div></div>
    ${barras?`<div class="rd-dh">Domicílios pela faixa de renda média do setor</div><ul class="rd-dist">${barras}</ul>`:''}
    <div class="hint rd-pe">Censo ${m.censoAno} (IBGE) · ${num(r.setores)} setor${r.setores===1?'':'es'}${r.cob!=null&&r.cob<99.5?` · renda divulgada para ${rdNum(r.cob,0)}% dos domicílios`:''}${r.dist?` · ${r.dist} com média puxada por poucas rendas altas`:''}${r.foraPct>1?` · ${rdNum(r.foraPct,0)}% da área fora do município`:''}. Renda familiar estimada, não observação direta do IBGE. <button class="linkbtn" data-a="rd-met">Metodologia</button> · <button class="linkbtn" data-a="rd-ver" data-id="${t.id}">Ver no mapa</button></div>`}
function setoresCard(t){if(t.lat==null)return '';const raio=UI.rdRaio||1000;
  return `<section class="sec" id="rd-card"><div class="sec-h"><h2>Renda e população do entorno</h2></div>
    <div class="rd-raios seg" role="group" aria-label="Área">${RD_RAIOS.map(([k,l])=>`<button type="button" data-a="rd-raio" data-v="${k}" aria-pressed="${String(raio)===String(k)}" ${k==='poly'&&!t.poly?'disabled':''}>${l}</button>`).join('')}</div>
    <div class="sec-b" id="rd-corpo">${rdCardCorpo(t)}</div></section>`}
function rdCardAtualiza(id){const t=T(id),c=$('#rd-corpo');if(t&&c)c.innerHTML=rdCardCorpo(t)}

/* ---------- metodologia ---------- */
function dsModal(fechar){const m=DENS_MET,f=m.faixas;
  return `<div class="dh"><h2>Metodologia da densidade</h2>${fechar}</div><div class="rd-mt">
  <p>Densidade demográfica bruta de cada setor censitário: pessoas que moram no setor divididas pela área total dele, em habitantes por km².</p>
  <h3>Dado oficial (IBGE)</h3><p><b>${m.variavel}</b>: ${esc(m.variavelDescricao)}. Área: ${esc(m.areaOrigem)}.</p>
  <p class="rd-f">Densidade = ${m.variavel} ÷ área do setor (km²)</p>
  <h3>Limites</h3><ul><li>É densidade bruta: a área inclui parques, vias, represas, galpões e terrenos vazios. Um setor com um parque dentro parece pouco denso mesmo com muita gente morando na borda.</li><li>Setores muito pequenos de prédios ou de favela passam de 100 mil hab/km²; ficam todos na última faixa.</li><li>Sem moradores é zero de verdade (o IBGE contou ninguém), em cinza, separado da primeira faixa.</li><li>Faixas fixas, nunca quantis: o limite de cima entra na faixa (até ${num(f[1].ate)} inclui ${num(f[1].ate)}).</li></ul>
  <p class="faint">${esc(m.faixasOrigem)} Versão ${m.versao}.</p></div><div class="df"><button class="btn primary" data-a="close">Fechar</button></div>`}
function setoresModal(M,fechar){if(M==='ds-met')return dsModal(fechar);if(M!=='rd-met')return '';const m=RENDA_MET,c=m.fatorFamiliar*m.fatorPnad;
  return `<div class="dh"><h2>Metodologia da renda</h2>${fechar}</div><div class="rd-mt">
  <p>Os valores apresentados são estimativas de renda familiar mensal. A base espacial e a renda do responsável são provenientes do Censo Demográfico ${m.censoAno} do IBGE. A renda familiar foi estimada a partir da relação observada entre renda do responsável e renda domiciliar nos microdados do Censo. Os valores foram posteriormente atualizados pela evolução nominal da renda domiciliar per capita da PNAD Contínua para o Estado de São Paulo.</p>
  <h3>Dado oficial (IBGE)</h3><p><b>${m.variavelBase}</b>: ${esc(m.variavelBaseDescricao)}, Censo ${m.censoAno}. Não é renda familiar nem renda per capita. Geometria: malha oficial dos setores censitários de ${m.censoAno}.</p>
  <h3>Transformação nossa</h3><p>Fator familiar <b>${rdNum(m.fatorFamiliar,1)}×</b>. ${esc(m.fatorFamiliarOrigem)}. É o mesmo para todos os setores; não é estatística do IBGE por setor.</p>
  <h3>Atualização</h3><p>Fator PNAD <b>${rdNum(m.fatorPnad,6)}×</b> = R$ ${num(m.pnadValorAtual)} (${m.pnadAnoAtual}) ÷ R$ ${num(m.pnadValorBase)} (${m.pnadAnoBase}). ${esc(m.pnadFonte)}. ${m.pnadAnoAtual} é a média do ano, não o mês atual.</p>
  <p class="rd-f">Renda familiar estimada atual = ${m.variavelBase} × ${rdNum(m.fatorFamiliar,1)} × ${rdNum(m.fatorPnad,6)} = ${m.variavelBase} × ${rdNum(c,6)}</p>
  <h3>Limites</h3><ul><li>O fator é um só para a cidade inteira: em bairros onde mais gente da casa trabalha, a renda real fica acima da estimada; onde o responsável é quase a única renda, abaixo.</li><li>No raio, a distribuição é dos domicílios pela faixa da média do setor: o IBGE não publica a distribuição dentro do setor.</li><li>Setores em sigilo ou sem moradores ficam sem cor e fora da média, nunca como zero.</li><li>Faixas: o limite de cima entra na faixa (até R$ 2.000 inclui R$ 2.000), depois de arredondar para reais.</li></ul>
  <p class="faint">Metodologia versão ${m.versao}.</p></div><div class="df"><button class="btn primary" data-a="close">Fechar</button></div>`}

function setoresClick(A,a,t){
  switch(A){
    case 'mp-renda':rdLigar(rdCamada()==='renda'?null:'renda');return true;
    case 'mp-dens':rdLigar(rdCamada()==='dens'?null:'dens');return true;
    case 'mp-camadas':rdMenu(!$('.mp-cam-m'));return true;
    case 'mp-camada':rdMenu(false);rdLigar(a.dataset.v||null);return true;
    case 'ds-met':UI.modal='ds-met';renderModal();return true;
    case 'rd-x':rdFechar();return true;
    case 'rd-met':UI.modal='rd-met';renderModal();return true;
    case 'rd-raio':{const v=a.dataset.v;UI.rdRaio=v==='poly'?'poly':Number(v);document.querySelectorAll('[data-a="rd-raio"]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));if(t)rdCardAtualiza(t.id);return true}
    case 'rd-ver':{const x=T(a.dataset.id);UI.mpSetor=rdCamada()||'renda';if(x&&x.lat!=null){UI.mpView={c:{lat:x.lat,lng:x.lng},z:15}}go('mapa');return true}
  }
  return false}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&RD.sel!=null&&!UI.modal&&UI.route==='mapa'){rdFechar();e.preventDefault()}});
window.BKM_TESTE=Object.assign(window.BKM_TESTE||{},{setores:()=>!!SET.d,terreno:n=>{const t=S.terrenos.find(x=>x.nome===n);return {lat:t.lat,lng:t.lng,poly:t.poly}},abrirTerreno:n=>{const t=S.terrenos.find(x=>x.nome===n);go('terreno',{id:t.id,tab:'geral',from:'terrenos'})}});
