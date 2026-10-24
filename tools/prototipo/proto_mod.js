
/* =====================================================================
   Módulos novos: tabela ordenável, mapa, dashboard, visão geral da ficha
   e quadro de tarefas. Injetado dentro do mesmo escopo do protótipo.
   ===================================================================== */
UI.sorts=UI.sorts||{};
UI.mp=UI.mp||{q:'',cor:'',zona:'',f:'',e:'',ocultas:[]};
UI.dash=UI.dash||{f:{},sel:['situacao','zona','valor','mes']};
UI.tk=UI.tk||{vista:'quadro',q:'',resp:'',ter:'',prio:'',atras:false,canc:false};

/* ---------- situação do terreno (cor do pin, gráficos) ---------- */
// rótulo, cor, glifo no pin, cor do glifo. Etapas ativas em rampa de azul (ordem = avanço);
// Stand By, Comprado, Perdido e Descartado com cores próprias e glifo, para não depender só da cor.
const SIT={sem_negociacao:['Sem negociação','#8a8d91','·','#fff'],triagem:['Em Triagem','#8fc8f7','1','#1d2e5c'],
  estudos:['Estudos Preliminares','#4aa3f0','2','#fff'],negociacao:['Negociação','#0b74d6','3','#fff'],
  contrato:['Contrato','#1d2e5c','4','#fff'],stand_by:['Stand By','#c98a2e','‖','#fff'],comprado:['Comprado','#6f9a3a','✓','#fff'],
  perdido:['Perdido','#9a3b30','×','#fff'],descartado:['Descartado','#6b6560','–','#fff']};
/* nomes das etapas seguem a configuração da empresa */
const sitNome=k=>STAGES.find(s=>s[0]===k)?.[1]||SIT[k][0];
const sitMapa=t=>!t.neg?'sem_negociacao':t.neg.status==='ativo'?t.neg.etapa:t.neg.status;
const sitChip=k=>`<span class="sitchip"><span class="sw" style="background:${SIT[k][1]}"></span>${esc(sitNome(k))}</span>`;
const ativosBanco=()=>S.terrenos.filter(t=>t.situacao!=='arquivado');
/* mapa em três níveis, como o kanban: fases › etapas de uma fase (UI.mp.f) › subetapas de uma etapa (UI.mp.e).
   Cada nível tem a sua legenda (rótulo, cor, glifo, cor do glifo) e classifica o terreno; fora do nível = não aparece. */
const COR_FASE=['#0b74d6','#863d8f','#c67355','#00838f','#c2477a','#7d8a3e','#1d2e5c','#5f6368'];
const RAMPA=['#8fc8f7','#4aa3f0','#0b74d6','#0a4fa0','#1d2e5c'];
const rampa=(i,n)=>{const j=n<=1?2:Math.round(i*(RAMPA.length-1)/(n-1));return [RAMPA[j],j===0?'#1d2e5c':'#fff']};
function mpItens(){const m=UI.mp,sit=k=>({k,nome:SIT[k][0],cor:SIT[k][1],g:SIT[k][2],fg:SIT[k][3]});
  if(!m.f)return [sit('sem_negociacao'),...fasesL().filter(f=>f.ativo).map((f,i)=>({k:f.k,nome:f.nome,cor:COR_FASE[i%COR_FASE.length],g:String(i+1),fg:'#fff',desce:etapasF(f.k).length>0})),sit('perdido'),sit('descartado')];
  const L=m.e?(etapaF(m.f,m.e)?.subs||[]):etapasF(m.f);
  return [...L.map((x,i)=>{const [cor,fg]=rampa(i,L.length);return {k:x.k,nome:x.nome,cor,g:String(i+1),fg,desce:!m.e&&x.subs?.length>0}}),sit('stand_by')]}
function mpClasse(t){const m=UI.mp;
  if(!m.f){const a=faseAtual(t);if(!a)return 'sem_negociacao';if(!a.aberta&&['perdido','descartado'].includes(a.p?.status))return a.p.status;return a.k}
  const p=procDaFase(t,m.f);if(!p||(m.e&&p.etapa!==m.e))return null;return p.status==='stand_by'?'stand_by':m.e?p.sub:p.etapa}
const mpInfo=k=>{const x=mpItens().find(i=>i.k===k);return x?[x.nome,x.cor,x.g,x.fg]:['Sem subetapa','#8a8d91','·','#fff']};

/* ---------- geografia ---------- */
const distKm=(a,b,c,d)=>{const r=x=>x*Math.PI/180,R=6371,dl=r(c-a),dg=r(d-b);const h=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const fKm=k=>k<1?`${Math.round(k*1000/10)*10} m`:`${num(k,1)} km`;
const areaPoly=pts=>{if(!pts||pts.length<3)return null;const lat0=pts.reduce((s,p)=>s+p[0],0)/pts.length*Math.PI/180,R=6371008;
  const xy=pts.map(([la,lo])=>[R*lo*Math.PI/180*Math.cos(lat0),R*la*Math.PI/180]);let a=0;for(let i=0;i<xy.length;i++){const [x1,y1]=xy[i],[x2,y2]=xy[(i+1)%xy.length];a+=x1*y2-x2*y1}return Math.abs(a)/2};
const centro=pts=>[pts.reduce((s,p)=>s+p[0],0)/pts.length,pts.reduce((s,p)=>s+p[1],0)/pts.length];
const proximos=t=>t.lat==null?[]:(S.pontos||[]).map(p=>({...p,d:distKm(t.lat,t.lng,p.lat,p.lng)})).filter(p=>p.d<=15).sort((a,b)=>a.d-b.d);
const rotaUrl=(t,p)=>`https://www.google.com/maps/dir/?api=1&origin=${t.lat},${t.lng}&destination=${p.lat},${p.lng}&travelmode=driving`;
const CAT_POI={transporte:'Transporte',escola:'Escola',saude:'Saúde',comercio:'Comércio',lazer:'Lazer',empresa:'Empresa',outro:'Outro'};
/* entorno do terreno: lugares do Google a até RAIO_PE metros a pé, por categoria (no banco: app.entorno_categorias) */
const RAIO_PE=1500;
const ENT_CAT=[['metro_trem','Estação de metrô ou trem','estações de metrô ou trem',['subway_station','train_station','light_rail_station']],
  ['shopping','Shopping center','shopping centers',['shopping_mall']],
  ['hospital','Hospital','hospitais',['hospital']]];
const ENT_BUSCA={},ENT_TENT=new Set();let ENT_TODOS=false;
const rotaPeUrl=(t,p)=>`https://www.google.com/maps/dir/?api=1&origin=${t.lat},${t.lng}&destination=${p.lat},${p.lng}${p.gid&&!String(p.gid).startsWith('ex')?'&destination_place_id='+encodeURIComponent(p.gid):''}&travelmode=walking`;
function entornoCard(t){if(t.lat==null)return '';
  const e=t.entorno,busc=ENT_BUSCA[t.id],mudou=e&&!(e.lat===t.lat&&e.lng===t.lng),raio=fKm(RAIO_PE/1000);
  let corpo;
  if(!e)corpo=busc?`<div class="muted">Buscando no Google lugares a até ${raio} a pé…</div>`
    :`<div class="muted">${GG?'Os pontos de interesse ainda não foram buscados.':'Os pontos são buscados no Google quando o terreno é localizado pela busca de endereço ou no mapa. O Google não carrega neste link de visualização.'}</div>${GG?`<button class="btn sm ed" style="margin-top:12px" data-a="ent-buscar" data-id="${t.id}">Buscar agora</button>`:''}`;
  else{const lim=ENT_TODOS?99:3;let sobra=0;
    corpo=`<ul class="poil ent-l">${ENT_CAT.map(([k,l,pl])=>{const its=e.itens.filter(x=>x.cat===k).sort((a,b)=>a.pe-b.pe);
      if(!its.length)return `<li class="ent-vazio"><span><span class="t2">Sem ${pl} a até ${raio} a pé</span></span></li>`;
      sobra+=Math.max(0,its.length-lim);
      return its.slice(0,lim).map(p=>`<li><span><span class="t1">${esc(p.nome)}</span><span class="t2">${l}${p.min!=null?` · ${p.min} min a pé`:''}</span></span><b class="num">${p.pe<1000?Math.round(p.pe/10)*10+' m':num(p.pe/1000,2)+' km'}</b><a href="${rotaPeUrl(t,p)}" target="_blank" rel="noopener">Rota</a></li>`).join('')}).join('')}</ul>
    ${sobra||ENT_TODOS?`<button class="linkbtn" data-a="ent-todos" style="margin-top:6px">${ENT_TODOS?'Mostrar menos':`Mostrar mais ${sobra}`}</button>`:''}
    <div class="hint ent-pe">${busc?'Atualizando no Google… · ':''}${e.fonte==='exemplo'?'Dados de exemplo':'Google'} · ${e.semPe?'distância em linha reta (a rota a pé não respondeu)':'distância pela rota a pé'} · buscado em ${fd(e.em)}${mudou?' · <b>a localização mudou depois da busca</b>':''}${GG&&!busc?` · <button class="linkbtn ed" data-a="ent-buscar" data-id="${t.id}">Buscar de novo</button>`:''}</div>`}
  corpo+=pontosEmpresa(t);
  return `<section class="sec" id="ent-card"><div class="sec-h"><h2>Pontos de interesse</h2><span class="faint" style="font-size:12px">a pé · até ${raio}</span></div><div class="sec-b">${corpo}</div></section>`}
/* pontos cadastrados pela empresa: todos aparecem; a pé se está a até RAIO_PE a pé, senão de carro; sem rota medida, linha reta */
let EMP_TODOS=false;
const kmTxt=m=>m<1000?Math.round(m/10)*10+' m':num(m/1000,m<10000?2:1)+' km';
function pontosEmpresa(t){const pts=S.pontos||[];const d=t.dist&&t.dist.lat===t.lat&&t.dist.lng===t.lng?t.dist.m:{};
  const its=pts.map(p=>{const x=d[p.id]||{},reta=distKm(t.lat,t.lng,p.lat,p.lng)*1000;
    if(x.pe!=null&&x.pe<=RAIO_PE)return {p,ord:x.pe,dist:kmTxt(x.pe),modo:`${x.pm} min a pé`,url:rotaPeUrl(t,p)};
    if(x.cm!=null)return {p,ord:x.cm,dist:kmTxt(x.cm),modo:`${x.cmin} min de carro`,url:rotaUrl(t,p)};
    return {p,ord:reta,dist:kmTxt(reta),modo:'em linha reta',url:reta<=RAIO_PE?rotaPeUrl(t,p):rotaUrl(t,p)}}).sort((a,b)=>a.ord-b.ord);
  const lim=EMP_TODOS?999:5;
  return `<div class="ent-emp"><div class="ent-emp-h"><span>Cadastrados pela empresa</span>${UI.role!=='Leitura'?`<button class="linkbtn ed" data-a="ent-add-ponto" data-id="${t.id}">${ic('add',16)}Adicionar ponto</button>`:''}</div>
    ${its.length?`<ul class="poil ent-l">${its.slice(0,lim).map(x=>`<li><span><span class="t1">${esc(x.p.nome)}</span><span class="t2">${CAT_POI[x.p.cat]||'Outro'} · ${x.modo}</span></span><b class="num">${x.dist}</b><a href="${x.url}" target="_blank" rel="noopener">Rota</a></li>`).join('')}</ul>
    ${its.length>5?`<button class="linkbtn" data-a="emp-todos" style="margin-top:6px">${EMP_TODOS?'Mostrar menos':`Mostrar mais ${its.length-5}`}</button>`:''}`
    :'<div class="muted" style="font-size:14px">Nenhum ponto cadastrado pela empresa.</div>'}
    ${DIST_BUSCA_ON(t)?'<div class="hint">Medindo as rotas no Google…</div>':''}</div>`}
const DIST_BUSCA_ON=t=>typeof DIST_BUSCA!=='undefined'&&DIST_BUSCA[t.id];
function entRefresh(t){if(UI.route!=='terreno'||UI.id!==t.id)return;const a=document.activeElement;
  if(a&&a.closest&&a.closest('.main')&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){const el=document.getElementById('ent-card');if(el)el.outerHTML=entornoCard(t)}else render()}

/* ---------- tabela ordenável (listas) ---------- */
// cols: {k, l, v(row)=>html, s(row)=>valor para ordenar, cls}
function tabela(id,rows,cols,o={}){
  const st=UI.sorts[id]||o.padrao||{};let r=rows.slice();const c=cols.find(x=>x.k===st.k);
  if(c&&c.s)r.sort((a,b)=>{const x=c.s(a),y=c.s(b);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;
    const d=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'pt-BR',{numeric:true});return st.dir==='desc'?-d:d});
  if(!r.length)return `<div class="empty">${o.vazio||'Nada para mostrar.'}</div>`;
  return `<div class="dt-wrap"><table class="dt ${o.cls||''}"><thead><tr>${cols.map(x=>`<th class="col-${x.k} ${x.cls||''}" scope="col"${x.s?` aria-sort="${st.k===x.k?(st.dir==='desc'?'descending':'ascending'):'none'}"`:''}>${x.s?`<button type="button" class="dt-sort" data-a="sort" data-t="${id}" data-k="${x.k}">${x.l}<span class="dt-ar" aria-hidden="true">${st.k===x.k?(st.dir==='desc'?'↓':'↑'):'↕'}</span></button>`:x.l}</th>`).join('')}</tr></thead>
  <tbody>${r.map(row=>`<tr ${o.attr?o.attr(row):''}>${cols.map(x=>`<td class="col-${x.k} ${x.cls||''}">${x.v(row)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function ordenar(id,k){const st=UI.sorts[id];UI.sorts[id]=st&&st.k===k?(st.dir==='asc'?{k,dir:'desc'}:{}):{k,dir:'asc'}}

/* ---------- lista de terrenos em tabela ---------- */
const COLS_TERRENOS=[
  {k:'codigo',l:'Código',cls:'hm num faint',v:t=>t.codigo,s:t=>t.codigo},
  {k:'nome',l:'Terreno',cls:'esq',v:t=>`<div class="t1">${esc(t.nome)}</div><div class="t2">${esc([t.bairro,t.zona&&OPT.zona[t.zona]].filter(Boolean).join(' · '))}</div>`,s:t=>t.nome},
  {k:'area',l:'Área',cls:'hm num',v:t=>{const a=areaAdotada(t);return a!=null?m2(a):'<span class="faint">—</span>'},s:t=>areaAdotada(t)},
  {k:'valor',l:'Valor pedido',cls:'num',v:t=>{const o=ofertaRef(t),a=areaAdotada(t);return o?.valor?`${mi(o.valor)}${a?`<div class="t2">${brl(o.valor/a)}/m²</div>`:''}`:'<span class="faint">—</span>'},s:t=>ofertaRef(t)?.valor??null},
  {k:'temp',l:'Temperatura',cls:'hm',v:t=>tempMini(t.neg?.temp),s:t=>t.neg?.temp??null},
  {k:'etapa',l:'Fase e etapa',v:t=>`<span class="c-etapa">${chipFase(t)}</span>`,s:t=>(fIdx(faseAtual(t)?.k)+1)*100+Object.keys(SIT).indexOf(sitMapa(t))},
  {k:'tarefa',l:'Próxima tarefa',cls:'hm',v:t=>{const pt=proxTarefa(t),at=atrasadas(t).length;return pt?`<div class="t2" style="color:var(--texto)">${esc(pt.titulo)}</div><div class="t2" style="${pt.prazo<HOJE?'color:var(--terracota);font-weight:600':''}">${fd(pt.prazo)}${at>1?` · ${at} atrasadas`:''}</div>`:'<span class="faint">—</span>'},s:t=>proxTarefa(t)?.prazo??null}];
const attrAbrir=from=>t=>`data-a="abrir" data-id="${t.id}" data-from="${from}" tabindex="0"`;

/* ===================== MAPA ===================== */
let MAPA=null,MINI=null,PINS=null,POIS=null,CONC=null,DES=null,BASE=null,MINI_DES=null;
/* a edição da poligonal acontece na página Mapa ou no mini-mapa da ficha (UI.edMini): estas dizem em qual */
const edMapa=()=>UI.edMini?MINI:MAPA,edArea=()=>UI.edMini?$('.mini-wrap'):$('.mapa-area');
// Satélite já vem com rótulos (ruas e lugares); sem Relevo nem opção sem rótulos (decisões do Moisés, 23/out/2026)
const CAMADAS_L={mapa:'Mapa',satelite:'Satélite'},CAMADAS_G={mapa:'Mapa',satelite:'Satélite'};
// motor do mapa: Google quando a chave carrega; Leaflet (Esri/OSM) como reserva
let GG=false;
function setBase(k){return GG?G_setBase(k):L_setBase(k)}
function desenhaPins(){return GG?G_desenhaPins():L_desenhaPins()}
function desenhaPois(){desenhaConc();return GG?G_desenhaPois():L_desenhaPois()}
function desenhaConc(){return GG?G_desenhaConc():L_desenhaConc()}
function mostrarConc(on){if(GG)return G_mostrarConc(on);if(MAPA&&CONC){on?CONC.addTo(MAPA):MAPA.removeLayer(CONC)}}
const concTip=c=>`${esc(c.nome)}${c.empresa?' · '+esc(c.empresa):''}`;
/* ---------- menu do clique direito no mapa (no toque, segurar no vazio): novo terreno, ponto de interesse ou concorrência ali ---------- */
function ctxAbrir(x,y,lat,lng){ctxFechar();if(UI.mpModo||UI.role==='Leitura')return;const area=$('.mapa-area');if(!area)return;UI.ctxLL={lat,lng};
  const m=document.createElement('div');m.className='mp-ctx';m.setAttribute('role','menu');
  m.innerHTML=`<button role="menuitem" data-a="ctx-terreno">${ic('add',18)}Novo terreno aqui</button><button role="menuitem" data-a="ctx-poi">${ic('add',18)}Novo ponto de interesse</button><button role="menuitem" data-a="ctx-conc">${ic('add',18)}Nova concorrência</button>`;
  area.appendChild(m);const W=area.clientWidth,H=area.clientHeight,w=m.offsetWidth,h=m.offsetHeight;
  m.style.left=Math.max(8,Math.min(W-w-8,x))+'px';m.style.top=Math.max(8,Math.min(H-h-8,y))+'px';m.querySelector('button')?.focus({preventScroll:true})}
function ctxFechar(){$('.mapa-area .mp-ctx')?.remove()}
function ctxAcao(a){const ll=UI.ctxLL;ctxFechar();if(!ll)return;
  if(a==='ctx-terreno'){nvDesenhar([ll.lat,ll.lng]);return}if(a==='ctx-poi')UI.novoPoi=ll,UI.modal='poi';else UI.novoConc=ll,UI.modal='conc';renderModal()}
/* liga o menu no contêiner do mapa: clique direito (mouse) e toque longo no vazio (celular) */
function ctxGestos(el,ponto){if(!el||el.dataset.ctx)return;el.dataset.ctx='1';const xy=e=>{const r=el.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};
  let tm=null,x0=0,y0=0;const limpa=()=>{clearTimeout(tm);tm=null};
  /* no Android o toque longo também dispara contextmenu, com o dedo na tela: ali vale só o temporizador abaixo */
  el.addEventListener('contextmenu',e=>{e.preventDefault();if((UI.ctxTipo||'mouse')!=='mouse'||e.target.closest('.v-alvo'))return;const [x,y]=xy(e),ll=ponto(x,y);if(ll)ctxAbrir(x,y,ll.lat,ll.lng)});
  el.addEventListener('pointerdown',e=>{UI.ctxTipo=e.pointerType;if(e.pointerType==='mouse'||!e.isPrimary||UI.mpModo)return;limpa();x0=e.clientX;y0=e.clientY;const ev=e;
    tm=setTimeout(()=>{tm=null;if(Date.now()-(UI.polyLongoEm||0)<1200)return; /* segurou sobre a poligonal: é edição */
      UI.ctxToqueEm=Date.now();const [x,y]=xy(ev),ll=ponto(x,y);if(ll)aoSoltar(()=>ctxAbrir(x,y,ll.lat,ll.lng))},650)},true);
  el.addEventListener('pointermove',e=>{if(tm&&Math.hypot(e.clientX-x0,e.clientY-y0)>8)limpa()},true);
  ['pointerup','pointercancel'].forEach(t=>el.addEventListener(t,limpa,true))}
document.addEventListener('pointerdown',e=>{if($('.mp-ctx')&&!e.target.closest('.mp-ctx'))ctxFechar()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.mp-ctx')){ctxFechar();e.preventDefault()}});
function desenhaRascunho(){return GG?G_desenhaRascunho():L_desenhaRascunho()}
function initMapa(){const r=GG?G_initMapa():L_initMapa();mpCtrlObs();return r}
/* tema escuro: a visão Mapa fica escura (Google pelo colorScheme, que só vale ao criar o mapa; Leaflet pelo cinza-escuro da Esri). O satélite não muda */
const temaEscuro=()=>document.documentElement.dataset.tema==='escuro';
function temaMapa(){if(!MAPA||!$('#mapa'))return;if(GG){if(MAPA.__escuro!==temaEscuro())G_initMapa()}else if((UI.mpBase||'satelite')==='mapa')L_setBase('mapa')}
/* botões do canto do mapa: minha localização e tela cheia (o controle de câmera do Google saiu; decisão do Moisés, 23/out/2026).
   Sobem acima do cartão do terreno e do aviso de desenho quando eles ocupam o pé do mapa. */
function mpCtrlHtml(){const on=document.body.classList.contains('mp-cheia');
  return `${GG?`<button type="button" class="mp-cb sv-x" data-a="sv-fechar" title="Fechar o Street View (Esc)" aria-label="Fechar o Street View">${ic('close',22)}</button>`:''}<div id="mp-ctrl" class="mp-ctrl"><button type="button" class="mp-cb" data-a="mp-eu" title="Minha localização" aria-label="Centralizar na minha localização">${ic('eu',22)}</button>
    <button type="button" class="mp-cb" data-a="mp-cheia" aria-pressed="${on}" title="${on?'Sair da tela cheia':'Tela cheia'}" aria-label="${on?'Sair da tela cheia':'Tela cheia'}">${ic(on?'telaSair':'tela',22)}</button></div>`}
function mpCtrlPos(){const a=$('.mapa-area'),c=$('#mp-ctrl');if(!a||!c)return;const ar=a.getBoundingClientRect();let topo=ar.bottom;
  ['#mp-cartao','#mp-modo','.mapa-area .gm-svpc'].forEach(s=>{const e=$(s);if(!e||!e.offsetHeight)return;const r=e.getBoundingClientRect();if(r.bottom>ar.bottom-80&&r.right>ar.right-80)topo=Math.min(topo,r.top)});
  c.style.bottom=topo<ar.bottom?Math.round(ar.bottom-topo+12)+'px':''}
function mpCtrlObs(){const a=$('.mapa-area');if(!a||a.__ro||!window.ResizeObserver)return mpCtrlPos();a.__ro=new ResizeObserver(mpCtrlPos);[a,$('#mp-cartao'),$('#mp-modo')].forEach(e=>e&&a.__ro.observe(e));mpCtrlPos()}
/* tela cheia: o mapa cobre a página (classe no body, que também serve ao iPhone, sem tela cheia de elemento) e, onde der, o navegador esconde as próprias barras */
let mpCheiaApi=false;
function mpTelaCheia(on){const b=document.body;if(on===undefined)on=!b.classList.contains('mp-cheia');
  b.classList.toggle('mp-cheia',on);
  if(on){const r=document.documentElement;try{const p=r.requestFullscreen?.({navigationUI:'hide'});mpCheiaApi=!!p;p?.catch?.(()=>{mpCheiaApi=false})}catch(e){mpCheiaApi=false}}
  else if(document.fullscreenElement&&mpCheiaApi){mpCheiaApi=false;document.exitFullscreen?.().catch?.(()=>{})}
  const k=$('[data-a="mp-cheia"]');if(k){k.setAttribute('aria-pressed',on);k.title=k.ariaLabel=on?'Sair da tela cheia':'Tela cheia';k.innerHTML=ic(on?'telaSair':'tela',22)}
  if(!GG)setTimeout(()=>MAPA?.invalidateSize?.(),60);setTimeout(mpCtrlPos,80)}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&mpCheiaApi){mpCheiaApi=false;if(document.body.classList.contains('mp-cheia'))mpTelaCheia(false)}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('mp-cheia')&&!e.defaultPrevented&&!$('.mapa-area.sv-on')&&!document.fullscreenElement&&!UI.modal&&!UI.fichaSheet&&!UI.mpModo&&!$('.mp-ctx')&&!$('.v-menu')){mpTelaCheia(false);e.preventDefault()}});
/* minha localização: ponto azul com o círculo da precisão; centra o mapa */
function mpEu(){if(!navigator.geolocation){toast('Este navegador não informa a localização.',true);return}
  const b=$('[data-a="mp-eu"]');b?.classList.add('busca');
  navigator.geolocation.getCurrentPosition(p=>{$('[data-a="mp-eu"]')?.classList.remove('busca');UI.mpEu={lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy};desenhaEu(true)},
    e=>{$('[data-a="mp-eu"]')?.classList.remove('busca');toast(e.code===1?'A localização está bloqueada. Libere o acesso à localização para este site no navegador.':'Não foi possível obter sua localização agora.',true)},
    {enableHighAccuracy:true,timeout:15000,maximumAge:30000})}
function desenhaEu(centrar){const u=UI.mpEu;if(!MAPA||!u)return;return GG?G_eu(u,centrar):L_eu(u,centrar)}
let EU=null;
function L_eu(u,centrar){EU?.remove();EU=L.layerGroup([L.circle([u.lat,u.lng],{radius:u.acc||0,color:'#1a73e8',weight:1,fillOpacity:.12,interactive:false}),
  L.circleMarker([u.lat,u.lng],{radius:7,color:'#fff',weight:2,fillColor:'#1a73e8',fillOpacity:1,interactive:false})]).addTo(MAPA);
  if(centrar)MAPA.setView([u.lat,u.lng],Math.max(MAPA.getZoom()||0,17))}
function focar(t){return GG?G_focar(t):L_focar(t)}
function initMini(){return GG?G_initMini():L_initMini()}
function fecharPopup(){if(GG)G_fecharPopup();else MAPA?.closePopup?.()}
function mostrarPois(on){if(GG)return G_mostrarPois(on);if(MAPA&&POIS){on?POIS.addTo(MAPA):MAPA.removeLayer(POIS)}}
function camada(k,el){
  const esri='https://server.arcgisonline.com/ArcGIS/rest/services/';
  const mk=(u,o)=>L.tileLayer(u,Object.assign({maxZoom:19,crossOrigin:true},o));
  const cinza=temaEscuro()?'Dark_Gray':'Light_Gray';
  const ls=k==='mapa'?[mk(esri+`Canvas/World_${cinza}_Base/MapServer/tile/{z}/{y}/{x}`,{maxNativeZoom:16,attribution:'Mapa © Esri, HERE, Garmin, © OpenStreetMap'}),mk(esri+`Canvas/World_${cinza}_Reference/MapServer/tile/{z}/{y}/{x}`,{maxNativeZoom:16})]
    :k==='ruas'?[mk('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'})]
    :[mk(esri+'World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Imagens © Esri'}),mk(esri+'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'),mk(esri+'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}')];
  let ok=false;ls.forEach(l=>{l.on('tileload',()=>{ok=true;el.classList.remove('sem-fundo')});l.on('tileerror',()=>{if(!ok)el.classList.add('sem-fundo')})});
  return L.layerGroup(ls);
}
function pinIcon(k,sel){const [,c,g,fg]=Array.isArray(k)?k:SIT[k];return L.divIcon({className:'pin'+(sel?' sel':''),html:`<span class="pin-b" style="background:${c}"><b style="color:${fg}">${g}</b></span>`,iconSize:[30,40],iconAnchor:[15,38],popupAnchor:[0,-34],tooltipAnchor:[0,-34]})}
const poiIcon=()=>L.divIcon({className:'poi',html:'<span class="poi-b"></span>',iconSize:[14,14],iconAnchor:[7,7],tooltipAnchor:[0,-8]});
function mpVisiveis(){const m=UI.mp,q=m.q.trim().toLowerCase();
  return fxLista('mapa').filter(t=>{const k=mpClasse(t);return k!=null&&!m.ocultas.includes(k)}).filter(t=>!q||bateBusca(t,q))}
/* lista lateral do mapa: só o número do pino (etapa), o nome e a área; a lupa abre a ficha.
   Clicar no pino ou na poligonal seleciona o terreno aqui (não há balão no mapa). */
function mpItem(t,cartao){const [nm,c,g,fg]=mpInfo(mpClasse(t)),sel=UI.mpSel===t.id,ad=areaAdotada(t)||(t.poly?areaPoly(t.poly):null);
  const acoes=sel&&t.lat!=null?`<div class="mp-it-a">${UI.role!=='Leitura'?`<button class="linkbtn" data-a="mp-desenhar" data-id="${t.id}">${t.poly?'Editar':'Desenhar'} poligonal</button>`:''}${GG?`<button class="linkbtn" data-a="mp-sv" data-id="${t.id}">Street View</button>`:''}</div>`:'';
  return `<div class="mp-it${sel?' sel':''}${cartao?' cartao':''}" data-a="mp-foco" data-id="${t.id}" tabindex="0" role="listitem" aria-current="${sel}">
    <span class="pin-mini" style="background:${c};color:${fg}" title="${esc(nm)}">${g}</span>
    <div class="mp-it-t"><div class="t1">${esc(t.nome)}</div><div class="t2">${ad?m2(ad):'Área não informada'} · ${esc(nm)}${t.lat==null?' · <span style="color:var(--terracota)">sem localização</span>':''}</div></div>
    <button class="iconbtn mp-lupa" data-a="fs-abrir" data-id="${t.id}" title="Ver ficha" aria-label="Ver ficha de ${esc(t.nome)}">${bi('busca',22)}</button>${cartao?`<button class="iconbtn mp-lupa mp-fx" data-a="mp-desel" title="Fechar" aria-label="Fechar">${ic('close',22)}</button>`:''}${acoes}</div>`}
/* ao descer ou subir de nível, o mapa enquadra os terrenos que ficaram */
function mpEnquadrar(){if(!MAPA)return;const pts=mpVisiveis().filter(t=>t.lat!=null).map(t=>[t.lat,t.lng]);if(!pts.length)return;
  if(GG)gEnquadrar(pts.map(([a,b])=>gLL(a,b)),15);else MAPA.fitBounds(pts,{padding:[48,48],maxZoom:15,animate:false})}
function mpLista(){const v=mpVisiveis(),sem=v.filter(t=>t.lat==null),ord=mpItens().map(i=>i.k);
  const rows=v.slice().sort((a,b)=>ord.indexOf(mpClasse(a))-ord.indexOf(mpClasse(b))||a.nome.localeCompare(b.nome,'pt'));
  return `${entornoHtml()}<div class="mp-resumo"><span><b>${v.length}</b> terrenos</span><span><b>${num(v.reduce((s,t)=>s+(areaAdotada(t)||0),0))}</b> m²</span></div>
  ${rows.length?`<div class="mp-lst" role="list">${rows.map(t=>mpItem(t)).join('')}</div>`:'<div class="empty">Nenhum terreno com esses filtros.</div>'}
  ${sem.length?`<div class="hint" style="margin-top:8px">${sem.length} sem localização. Clique na linha para marcar no mapa.</div>`:''}`;
}
/* seleciona o terreno a partir do mapa: acende o pino, destaca a linha (rolando só a lista) e, no celular, mostra o cartão sobre o mapa */
function mpMarcarPinos(){const on=(id,el)=>el?.classList.toggle('sel',UI.mpSel===id);  /* sem redesenhar: o segundo clique de um duplo clique precisa cair no mesmo pino */
  if(GG)gPinsSel();else PINS?.eachLayer(l=>{if(l._terreno){on(l._terreno,l.getElement());l.setZIndexOffset(UI.mpSel===l._terreno?1000:0)}})}
/* ficha do terreno num painel sobre o mapa (a lupa da lista): a Visão geral, só para ler, sem o mapa; "Abrir ficha completa" sai do mapa */
function fichaSheet(){let el=$('#ficha-sheet');const t=UI.fichaSheet&&UI.route==='mapa'?T(UI.fichaSheet):null;
  if(!t){UI.fichaSheet=null;el?.remove();return}
  if(!el){el=document.createElement('aside');el.id='ficha-sheet';el.className='ficha-sheet';el.setAttribute('role','dialog');el.setAttribute('aria-label','Ficha do terreno');document.body.appendChild(el)}
  const end=[t.logradouro&&t.logradouro+(t.numero?', '+t.numero:''),t.bairro,t.zona&&'Zona '+OPT.zona[t.zona]].filter(Boolean).join(' · ');
  el.innerHTML=`<div class="fs-h"><div class="fs-ht"><div class="fs-e"><span class="num">${t.codigo}</span>${sitChip(sitMapa(t))}</div><h2>${esc(t.nome)}</h2>${end?`<div class="fs-s">${esc(end)}</div>`:''}</div>
    <button class="iconbtn" data-a="fs-fechar" aria-label="Fechar" title="Fechar (Esc)">${ic('close',22)}</button></div>
    <div class="fs-b bl-c fs-ro">${abaGeral(t)}</div>
    <div class="fs-f"><button class="btn primary" data-a="abrir" data-id="${t.id}" data-tab="geral" data-from="mapa">Abrir ficha completa</button></div>`;
  el.querySelector('.g-loc')?.remove();el.querySelector('.fs-b').scrollTop=0}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&UI.fichaSheet&&!UI.modal&&!$('.mp-ctx')&&!$('.v-menu')){UI.fichaSheet=null;fichaSheet();e.preventDefault()}});
function mpSelecionar(id){UI.mpSel=id;mpMarcarPinos();if(UI.fichaSheet&&id&&id!==UI.fichaSheet){UI.fichaSheet=id;fichaSheet()}const l=$('#mp-lista');if(l)l.innerHTML=mpLista();mpCartao();
  const lado=$('.mapa-lado'),it=lado?.querySelector(`.mp-it[data-id="${id}"]`);
  if(it&&getComputedStyle(lado).overflowY==='auto'){const a=lado.getBoundingClientRect(),r=it.getBoundingClientRect();
    if(r.top<a.top||r.bottom>a.bottom)lado.scrollBy({top:r.top-a.top-a.height/2+r.height/2,behavior:'smooth'})}}
function mpCartao(){const c=$('#mp-cartao');if(!c)return;const t=UI.mpSel&&T(UI.mpSel);c.innerHTML=t&&!UI.mpModo&&mpVisiveis().includes(t)?mpItem(t,true):''}
function mpLegenda(){const base=fxLista('mapa'),m=UI.mp,cl=new Map(base.map(t=>[t.id,mpClasse(t)])),volta=m.e?faseN(m.f):'Fases';
  const topo=m.f?`<div class="lg-h"><button type="button" class="iconbtn lg-v" data-a="mp-nivel" data-v="${m.e?esc(m.f):''}" title="Voltar para ${esc(volta)}" aria-label="Voltar para ${esc(volta)}">${ic('back',18)}</button><span><span class="faint">${m.e?esc(faseN(m.f))+' › ':'Fases › '}</span>${esc(m.e?etapaF(m.f,m.e)?.nome||m.e:faseN(m.f))}</span></div>`:'';
  return topo+mpItens().map(x=>{const n=base.filter(t=>cl.get(t.id)===x.k).length,on=!m.ocultas.includes(x.k);
    return `<div class="lg-r"><button type="button" class="lg-i" data-a="mp-sit" data-v="${x.k}" aria-pressed="${on}"><span class="pin-mini" style="background:${x.cor};color:${x.fg}">${x.g}</span>${esc(x.nome)}<span class="n">${n}</span></button>${x.desce?`<button type="button" class="iconbtn lg-d" data-a="mp-desce" data-v="${x.k}" title="Ver ${m.f?'subetapas':'etapas'} de ${esc(x.nome)}" aria-label="Ver ${m.f?'subetapas':'etapas'} de ${esc(x.nome)}">${ic('chev',16)}</button>`:''}</div>`}).join('')
    +`<hr class="lg-sep"><button type="button" class="lg-i" data-a="mp-poi" aria-pressed="${UI.mpPoi!==false}"><span class="lg-poi"><span class="poi-b"></span></span>Pontos de interesse<span class="n">${(S.pontos||[]).length}</span></button>`
    +`<button type="button" class="lg-i" data-a="mp-conc" aria-pressed="${UI.mpConc!==false}"><span class="lg-poi"><span class="conc-b"></span></span>Concorrência<span class="n">${(S.concorrentes||[]).length}</span></button>`;
}
function pgMapa(){
  const opt=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${esc(l)}</option>`).join('');
  return `<div class="mapa-pg">
  <aside class="mapa-lado" aria-label="Terrenos no mapa">
    <div class="page-h compacto"><div><h1><span class="marca"></span>Mapa</h1></div></div>
    <label class="search sm" for="mp-q">${bi('busca',24)}<input id="mp-q" type="search" placeholder="Buscar por nome, bairro, SQL..." value="${esc(UI.mp.q)}" autocomplete="off"></label>
    ${fxBarra('mapa')}
    ${UI.mp.q||UI.mp.ocultas.length?'<button class="linkbtn" data-a="mp-limpar" style="align-self:flex-start">Limpar busca e legenda</button>':''}
    <div id="mp-lista">${mpLista()}</div>
  </aside>
  <section class="mapa-area" aria-label="Mapa dos terrenos">
    <div id="mapa" class="mapa"></div>
    <div class="mp-barra">
      ${mpBuscaHtml()}
      <div class="seg" role="group" aria-label="Fundo do mapa">${Object.entries(GG?CAMADAS_G:CAMADAS_L).map(([k,l])=>`<button type="button" data-a="mp-base" data-v="${k}" aria-pressed="${(UI.mpBase||'satelite')===k}">${l}</button>`).join('')}</div>
    </div>
    <div id="mp-modo" class="mp-modo" aria-live="polite">${modoBanner()}</div>
    <div id="mp-cartao" class="mp-cartao" aria-live="polite"></div>
    ${mpCtrlHtml()}
    <details class="mp-legenda" ${UI.mpLeg??innerWidth>899?'open':''}><summary>Legenda</summary><div id="mp-leg" class="mp-leg-l">${mpLegenda()}</div></details>
    <div class="mp-aviso">O fundo do mapa (ruas e satélite) não carrega neste link de visualização, que bloqueia imagens externas. Os pins, poligonais e distâncias funcionam. No app publicado, ou abrindo o arquivo do protótipo no navegador, o fundo aparece.</div>
  </section></div>`;
}
function modoBanner(){const m=UI.mpModo;if(!m)return '';
  const t=UI.mpAlvo?T(UI.mpAlvo):null;
  if(m==='poi')return `<span>Clique no mapa para marcar o ponto de interesse.</span><button class="btn sm text" data-a="mp-sair">Cancelar</button>`;
  if(m==='marcar')return `<span>Clique no mapa para localizar <b>${esc(t?.nome)}</b>.</span><button class="btn sm text" data-a="mp-sair">Cancelar</button>`;
  if(m==='desenhar'||m==='editar'){const n=(UI.desenho||[]).length,a=areaPoly(UI.desenho),tq=TOQUE(),seg=tq?'toque e segure':'clique com o botão direito';
    if(m==='editar'&&!tq)return ''; /* desktop: sem janelinha; Desfazer e Cancelar ficam no menu do ponto (clique direito), Ctrl+Z e Esc */
    if(m==='editar'&&tq)return `<span>Arraste os pontos; segure um ponto para excluir ou adicionar outro. Toque fora para concluir. <span class="mp-q">${n} pontos${a?` · ${m2(a)}`:''}</span></span><button class="btn sm text" data-a="mp-desfazer" ${(UI.desHist||[]).length?'':'disabled'}>Desfazer</button><button class="btn sm text" data-a="mp-sair">Cancelar</button><button class="btn sm primary" data-a="mp-concluir">Concluir</button>`;
    const dica=m==='editar'?`arraste os pontos; ${seg} num ponto para excluí-lo ou adicionar outro depois dele. ${tq?'Toque':'Clique'} fora da poligonal para concluir.`
      :`${tq?'toque':'clique'} no mapa para marcar os vértices.${n?` Arraste um ponto para ajustá-lo; ${seg} nele para mais opções.`:''}`;
    return `<span>${m==='editar'?'Editando':'Desenhando'} a poligonal ${t?`de <b>${esc(t.nome)}</b>`:'do <b>terreno novo</b>'}: ${dica} <span class="mp-q">${n} ponto${n===1?'':'s'}${a?` · ${m2(a)}`:''}</span></span><button class="btn sm text" data-a="mp-desfazer" ${(UI.desHist||[]).length?'':'disabled'}>Desfazer</button><button class="btn sm text" data-a="mp-sair">Cancelar</button><button class="btn sm primary" data-a="mp-concluir" ${n>=3?'':'disabled'}>Concluir</button>`}
  return '';
}
function L_setBase(k){if(!MAPA)return;UI.mpBase=k;if(BASE)MAPA.removeLayer(BASE);BASE=camada(k,MAPA.getContainer().closest('.mapa-area')||MAPA.getContainer()).addTo(MAPA);BASE.eachLayer(l=>l.bringToBack());
  document.querySelectorAll('[data-a="mp-base"]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===k))}
function L_desenhaPins(){if(!MAPA||!PINS)return;PINS.clearLayers();
  mpVisiveis().filter(t=>t.lat!=null).forEach(t=>{const k=mpInfo(mpClasse(t));
    if(t.poly&&!(UI.mpModo&&UI.mpAlvo===t.id)){const pg=L.polygon(t.poly,{color:k[1],weight:2,fillOpacity:.18,interactive:!UI.mpModo})
      .on('click',()=>{if(Date.now()-(UI.polyLongoEm||0)<700)return;clearTimeout(pg._tc);pg._tc=setTimeout(()=>{if(!UI.mpModo)mpSelecionar(t.id)},260)})
      .on('dblclick',e=>{L.DomEvent.stop(e);clearTimeout(pg._tc);editarPoligonal(t.id)});
      pg.on('add',()=>polyGestos(pg.getElement(),t.id));pg.addTo(PINS)}
    const mk=L.marker([t.lat,t.lng],{icon:pinIcon(k,UI.mpSel===t.id),title:t.nome,riseOnHover:true,keyboard:!UI.mpModo,interactive:!UI.mpModo}).bindTooltip(esc(t.nome),{direction:'top'});
    mk.on('click',()=>{if(Date.now()-(UI.polyLongoEm||0)<900)return;mpSelecionar(t.id)});
    /* o pino fica sobre a poligonal: segurar nele (ou dois cliques) também entra em edição */
    if(t.poly&&t.poly.length>=3){mk.on('add',()=>polyGestos(mk.getElement(),t.id));mk.on('dblclick',e=>{L.DomEvent.stop(e);editarPoligonal(t.id)})}
    mk.addTo(PINS);mk._terreno=t.id})}
const concIcon=()=>L.divIcon({className:'conc',html:'<span class="conc-b"></span>',iconSize:[16,16],iconAnchor:[8,8],tooltipAnchor:[0,-10]});
function L_desenhaConc(){if(!MAPA||!CONC)return;CONC.clearLayers();(S.concorrentes||[]).forEach(c=>L.marker([c.lat,c.lng],{icon:concIcon(),title:c.nome,interactive:!UI.mpModo}).bindTooltip(concTip(c),{direction:'top'}).addTo(CONC))}
function L_desenhaPois(){if(!MAPA||!POIS)return;POIS.clearLayers();(S.pontos||[]).forEach(p=>L.marker([p.lat,p.lng],{icon:poiIcon(),title:p.nome,interactive:!UI.mpModo}).bindTooltip(`${esc(p.nome)} · ${CAT_POI[p.cat]||''}`,{direction:'top'}).addTo(POIS))}
function L_desenhaRascunho(){const D=UI.edMini?MINI_DES:DES;if(!D)return;D.clearLayers();const p=UI.desenho||[];if(!p.length)return;
  (p.length>=3?L.polygon(p,{color:'#0094fe',weight:2,dashArray:UI.mpModo==='editar'?null:'6 4',fillOpacity:UI.mpModo==='editar'?.2:.12,interactive:false}):L.polyline(p,{color:'#0094fe',weight:2,dashArray:'6 4',interactive:false})).addTo(D);
  const poli=D.getLayers()[0];
  p.forEach((q,i)=>{const sel=UI.vSel===i;
    const mk=L.marker(q,{draggable:true,keyboard:false,zIndexOffset:sel?1000:0,icon:L.divIcon({className:'v-alvo',iconSize:[44,44],iconAnchor:[22,22],html:`<span class="v-dot${sel?' sel':''}"></span>`})});
    mk.on('add',()=>vGestos(mk.getElement(),i));
    mk.on('drag',e=>{const ll=e.target.getLatLng(),pp=p.map(x=>x.slice());pp[i]=[ll.lat,ll.lng];poli&&poli.setLatLngs(pp)});
    mk.on('dragstart',()=>{UI.vMenu=false;edArea()?.querySelector('.v-menu')?.remove()});
    mk.on('dragend',e=>{const ll=e.target.getLatLng();vArrastado(i,ll.lat,ll.lng)});
    mk.addTo(D)})}
function mpRefresh(){if(UI.edMini){miniEdRefresh();return}desenhaPois();const l=$('#mp-lista');if(l)l.innerHTML=mpLista();const g=$('#mp-leg');if(g)g.innerHTML=mpLegenda();const m=$('#mp-modo');if(m)m.innerHTML=modoBanner();
  if(MAPA){$('#mapa')?.classList.toggle('modo',!!UI.mpModo);desenhaPins();desenhaRascunho();vMenuDesenha()}mpCartao()}
function L_initMapa(){const el=$('#mapa');if(!el)return;
  if(!window.L){el.innerHTML='<div class="mapa-erro">Não foi possível carregar a biblioteca de mapas. Verifique a conexão e recarregue a página.</div>';return}
  MAPA=L.map(el,{zoomControl:true,doubleClickZoom:false});
  L.control.scale({imperial:false,position:'bottomright'}).addTo(MAPA);
  setBase(UI.mpBase||'satelite');PINS=L.layerGroup().addTo(MAPA);POIS=L.layerGroup();CONC=L.layerGroup();DES=L.layerGroup().addTo(MAPA);if(UI.mpPoi!==false)POIS.addTo(MAPA);if(UI.mpConc!==false)CONC.addTo(MAPA);
  ctxGestos(el,(x,y)=>{const ll=MAPA.containerPointToLatLng([x,y]);return {lat:ll.lat,lng:ll.lng}});MAPA.on('movestart zoomstart',ctxFechar);
  desenhaPins();desenhaPois();desenhaRascunho();el.classList.toggle('modo',!!UI.mpModo);desenhaEu(false);
  const vista=UI.mpView,enquadrar=()=>{if(vista)return MAPA.setView(vista.c,vista.z);const pts=ativosBanco().filter(t=>t.lat!=null).map(t=>[t.lat,t.lng]);pts.length?MAPA.fitBounds(pts,{padding:[48,48],maxZoom:15}):MAPA.setView([-23.55,-46.63],11)};
  enquadrar();
  // o contêiner só tem o tamanho final depois do layout: recalcula e reenquadra
  const mapaAtual=MAPA;requestAnimationFrame(()=>setTimeout(()=>{if(MAPA!==mapaAtual)return;MAPA.invalidateSize();enquadrar();if(UI.mpFocoPend){const t=T(UI.mpFocoPend);UI.mpFocoPend=null;if(t&&t.lat!=null)focar(t)}},60));
  MAPA.on('moveend',()=>{UI.mpView={c:MAPA.getCenter(),z:MAPA.getZoom()};vMenuDesenha()});MAPA.on('movestart zoomstart',()=>$('.mapa-area .v-menu')?.remove());
  MAPA.on('preclick',e=>mapaClique(e.latlng.lat,e.latlng.lng));
  MAPA.on('click',e=>{if(!UI.mpModo&&UI.mpSel&&!e.originalEvent?.target?.closest?.('.leaflet-interactive'))mpSelecionar(null)}); /* clique no vazio tira a seleção */
  if(UI.mpFoco){UI.mpFocoPend=UI.mpFoco;UI.mpFoco=null}
}
function L_focar(t){if(!MAPA)return;UI.mpSel=t.id;if(t.poly)MAPA.fitBounds(t.poly,{maxZoom:18,padding:[40,40]});else MAPA.setView([t.lat,t.lng],Math.max(MAPA.getZoom(),16));
  mpSelecionar(t.id)}
function mapaClique(lat,lng){const m=UI.mpModo;if(!m)return;
  if(m==='poi'){UI.mpModo=null;UI.novoPoi={lat,lng};UI.modal='poi';mpRefresh();renderModal();return}
  if(m==='marcar'){const t=T(UI.mpAlvo);UI.mpModo=null;Object.assign(t,{lat,lng,precisao:'aproximada'});log(t,'Localização marcada no mapa');save();mpRefresh();toast(`${t.nome}: localização marcada.`);return}
  if(m==='editar'){if(Date.now()-(UI.vToqueEm||0)<300||Date.now()-(UI.polyLongoEm||0)<700)return;
    if(UI.vMenu){vFecharMenu();return}
    if(!dentroPoly(lat,lng,UI.desenho||[]))concluirDesenho();return}
  if(m==='desenhar'){if(Date.now()-(UI.vToqueEm||0)<300)return; /* o toque foi num ponto, não no mapa */
    const p=UI.desenho=UI.desenho||[];
    if(UI.vMenu){vFecharMenu();return}
    desGuardar();
    if(p.length<3)p.push([lat,lng]);
    else{ /* inclui o ponto no lado da poligonal que menos aumenta o contorno (no desenho em sequência, equivale a seguir em frente) */
      const d=(a,b)=>Math.hypot(a[0]-b[0],(a[1]-b[1])*Math.cos(a[0]*Math.PI/180)),q=[lat,lng];let melhor=p.length,custo=Infinity;
      p.forEach((a,i)=>{const b=p[(i+1)%p.length],c=d(a,q)+d(q,b)-d(a,b);if(c<custo){custo=c;melhor=i+1}});p.splice(melhor,0,q)}
    desAtualizar()}
}
/* ---------- edição da poligonal ----------
   Entrar: celular, tocar e segurar sobre a poligonal; desktop, dois cliques sobre ela (ou "Editar poligonal" no balão).
   Editando: todos os pontos aparecem e podem ser arrastados. Tocar e segurar (celular), clique direito ou dois cliques (desktop) num ponto
   abre Excluir ponto / Adicionar ponto depois. Toque ou clique fora da poligonal conclui.
   No desktop a edição não tem a barra de aviso: o menu do ponto traz também Desfazer e Cancelar edição (Ctrl+Z e Esc). */
const TOQUE=()=>matchMedia('(pointer: coarse)').matches;
function desGuardar(){(UI.desHist=UI.desHist||[]).push((UI.desenho||[]).map(x=>x.slice()));if(UI.desHist.length>60)UI.desHist.shift()}
function desAtualizar(){desenhaRascunho();const b=$(UI.edMini?'#mini-modo':'#mp-modo');if(b)b.innerHTML=modoBanner();vMenuDesenha()}
function dentroPoly(lat,lng,p){let d=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const [yi,xi]=p[i],[yj,xj]=p[j];if((yi>lat)!==(yj>lat)&&lng<(xj-xi)*(lat-yi)/(yj-yi)+xi)d=!d}return d}
function editarPoligonal(id,mini){const t=T(id);if(!t||!t.poly||t.poly.length<3||UI.role==='Leitura')return;
  Object.assign(UI,{edMini:!!mini,mpModo:'editar',mpAlvo:id,desEditando:true,desenho:t.poly.map(q=>q.slice()),desHist:[],vSel:null,vMenu:false,vMover:false,desOrig:JSON.stringify(t.poly),polyLongoEm:Date.now()});
  if(mini)miniEdRefresh();else{fecharPopup();mpRefresh();enquadrarEdicao(t.poly)}if(!TOQUE())toast('Editando a poligonal. Clique direito num ponto para mais opções; clique fora para salvar.')}
/* enquadra a poligonal deixando livre a faixa do aviso (embaixo, no celular) */
function enquadrarEdicao(poly){if(!MAPA||!poly)return;const cel=matchMedia('(max-width: 899px)').matches,pad={top:cel?70:60,bottom:cel?150:40,left:40,right:40};
  if(GG){const b=new google.maps.LatLngBounds();poly.forEach(q=>b.extend(gLL(q[0],q[1])));MAPA.fitBounds(b,pad);google.maps.event.addListenerOnce(MAPA,'idle',()=>{if(MAPA.getZoom()>19)MAPA.setZoom(19)})}
  else MAPA.fitBounds(poly,{maxZoom:19,paddingTopLeft:[pad.left,pad.top],paddingBottomRight:[pad.right,pad.bottom]})}
function vSelecionar(i){UI.vSel=i;UI.vMenu=true;UI.vToqueEm=Date.now();desAtualizar()}
function vFecharMenu(){UI.vMenu=false;UI.vSel=null;desAtualizar()}
function vMenuDesenha(){const area=edArea();if(!area)return;area.querySelector('.v-menu')?.remove();
  if(!UI.vMenu||UI.vSel==null||!['desenhar','editar'].includes(UI.mpModo))return;const q=(UI.desenho||[])[UI.vSel];if(!q)return;
  const px=pontoNaTela(q[0],q[1]);if(!px)return;const m=document.createElement('div');m.className='v-menu';m.setAttribute('role','menu');
  const p=UI.desenho,a=areaPoly(p),ed=UI.mpModo==='editar'&&!TOQUE();
  m.innerHTML=`<div class="v-t">Ponto ${UI.vSel+1} de ${p.length}${a?` · ${m2(a)}`:''}</div><button role="menuitem" data-a="v-depois">Adicionar ponto depois</button><button role="menuitem" data-a="v-excluir" class="crit">Excluir ponto</button>`
    +(ed?`<hr><button role="menuitem" data-a="v-desfazer" ${(UI.desHist||[]).length?'':'disabled'}>Desfazer<kbd>${/Mac/.test(navigator.platform)?"⌘Z":"Ctrl+Z"}</kbd></button><button role="menuitem" data-a="v-cancelar">Cancelar edição<kbd>Esc</kbd></button>`:'');
  area.appendChild(m);const W=area.clientWidth,H=area.clientHeight,w=m.offsetWidth,h=m.offsetHeight,ar=area.getBoundingClientRect();
  /* parte visível da área do mapa (a barra superior da página pode cobrir o topo) */
  const topo=Math.max(8,(document.querySelector('.top')?.getBoundingClientRect().bottom||0)-ar.top+8),base=Math.min(H,innerHeight-ar.top)-8;
  let x=px.x-w/2,y=px.y-h-24;if(y<topo)y=px.y+24;m.style.left=Math.max(8,Math.min(W-w-8,x))+'px';m.style.top=Math.max(topo,Math.min(base-h,y))+'px';
  m.querySelector('button')?.focus({preventScroll:true})}
function pontoNaTela(lat,lng){const M=edMapa();if(!M)return null;if(GG)return typeof gPontoNaTela==='function'?gPontoNaTela(lat,lng):null;const p=M.latLngToContainerPoint([lat,lng]);return {x:p.x,y:p.y}}
function desDesfazer(){const h=UI.desHist||[];if(!h.length)return false;UI.desenho=h.pop();UI.vSel=null;UI.vMenu=false;UI.vMover=false;mpRefresh();return true}
function desCancelar(){Object.assign(UI,{mpModo:null,nvDesenho:false,desenho:null,desHist:null,vSel:null,vMenu:false,vMover:false});mpRefresh();toast('Edição cancelada, poligonal sem mudanças.')}
function vAcao(a){const i=UI.vSel,p=UI.desenho||[];
  if(a==='v-desfazer'){if(!desDesfazer())vFecharMenu();return}
  if(a==='v-cancelar'){desCancelar();return}
  if(i==null)return;
  if(a==='v-excluir'){if(UI.mpModo==='editar'&&p.length<=3){toast('A poligonal precisa de pelo menos 3 pontos.',true);vFecharMenu();return}
    desGuardar();p.splice(i,1);UI.vSel=null;UI.vMenu=false;desAtualizar();toast(`Ponto ${i+1} excluído.`);return}
  if(a==='v-depois'){if(p.length<2){vFecharMenu();return}desGuardar();const b=p[(i+1)%p.length];
    if(i===p.length-1&&p.length<3){vFecharMenu();return}
    p.splice(i+1,0,[(p[i][0]+b[0])/2,(p[i][1]+b[1])/2]);UI.vMenu=false;UI.vSel=i+1;desAtualizar();toast(`Ponto ${i+2} adicionado. Arraste-o para o lugar.`);
    setTimeout(()=>{if(UI.vSel===i+1&&!UI.vMenu){UI.vSel=null;desenhaRascunho()}},2500)}}
/* o toque longo é reconhecido com o dedo ainda na tela (vibra), mas a tela só muda quando o dedo sai:
   redesenhar o mapa com o dedo apoiado deixaria o arraste do mapa preso */
function aoSoltar(fn){if(navigator.vibrate)try{navigator.vibrate(15)}catch(e){}let feito=false;const ok=()=>{if(feito)return;feito=true;['pointerup','pointercancel','touchend','touchcancel'].forEach(t=>document.removeEventListener(t,ok,true));setTimeout(()=>{UI.polyLongoEm=Date.now();UI.vToqueEm=Date.now();fn()},0)};
  ['pointerup','pointercancel','touchend','touchcancel'].forEach(t=>document.addEventListener(t,ok,true))}
/* gestos num ponto: arrastar move; segurar (toque), clique direito ou dois cliques (mouse) abre o menu.
   O clique direito só vale com mouse: no Android o toque longo também dispara contextmenu, com o dedo ainda na tela. */
function vGestos(el,i){if(!el||el.dataset.vg)return;el.dataset.vg='1';el.classList.add('v-ponto');
  let tm=null,x0=0,y0=0,tipo='';const limpa=()=>{clearTimeout(tm);tm=null};
  el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();if((e.pointerType||tipo)==='mouse'){UI.vToqueEm=Date.now();vSelecionar(i)}});
  el.addEventListener('pointerdown',e=>{UI.vToqueEm=Date.now();x0=e.clientX;y0=e.clientY;tipo=e.pointerType;if(e.button===2)return;
    if(e.pointerType==='touch'||e.pointerType==='pen'||TOQUE()){limpa();tm=setTimeout(()=>{tm=null;aoSoltar(()=>vSelecionar(i))},500)}});
  el.addEventListener('pointermove',e=>{if(tm&&Math.hypot(e.clientX-x0,e.clientY-y0)>8)limpa()});
  el.addEventListener('pointerup',()=>{UI.vToqueEm=Date.now();limpa()});['pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,limpa));
  el.addEventListener('click',e=>{e.stopPropagation();UI.vToqueEm=Date.now()});
  el.addEventListener('dblclick',e=>{e.stopPropagation();e.preventDefault();UI.vToqueEm=Date.now();vSelecionar(i)})}
/* segurar sobre a poligonal (toque) entra em edição */
function polyGestos(el,id){if(!el||el.dataset.pg)return;el.dataset.pg='1';let tm=null,x0=0,y0=0;const limpa=()=>{clearTimeout(tm);tm=null};
  el.addEventListener('contextmenu',e=>e.preventDefault());
  el.addEventListener('pointerdown',e=>{if(UI.mpModo)return;x0=e.clientX;y0=e.clientY;if(e.pointerType==='mouse')return;limpa();tm=setTimeout(()=>{tm=null;UI.polyLongoEm=Date.now();aoSoltar(()=>editarPoligonal(id))},550)});
  el.addEventListener('pointermove',e=>{if(tm&&Math.hypot(e.clientX-x0,e.clientY-y0)>8)limpa()});
  ['pointerup','pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,limpa))}
function vArrastado(i,lat,lng){desGuardar();UI.desenho[i]=[lat,lng];UI.vSel=null;UI.vMenu=false;UI.vToqueEm=Date.now();desAtualizar()}
document.addEventListener('click',e=>{const a=e.target.closest('.v-menu [data-a]');if(a){e.stopPropagation();UI.vToqueEm=Date.now();vAcao(a.dataset.a)}},true);
document.addEventListener('keydown',e=>{if(!['desenhar','editar'].includes(UI.mpModo)||e.target.matches('input,textarea,select'))return;
  if(e.key==='Escape'){if(UI.vMenu)vFecharMenu();else if(UI.mpModo==='editar')desCancelar();e.preventDefault()}
  else if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){desDesfazer();e.preventDefault()}
  else if((e.key==='Delete'||e.key==='Backspace')&&UI.vSel!=null){vAcao('v-excluir');e.preventDefault()}});
function concluirDesenho(){const t=T(UI.mpAlvo),p=UI.desenho||[];if(p.length<3)return;
  /* terreno novo: a poligonal desenhada é o passo 1 do cadastro */
  if(UI.nvDesenho){Object.assign(UI,{mpModo:null,nvDesenho:false,desenho:null,desHist:null,vSel:null,vMenu:false,vMover:false});mpRefresh();nvPoligonal(p,'mapa');return}
  if(UI.mpModo==='editar'&&JSON.stringify(p.map(x=>[+x[0].toFixed(7),+x[1].toFixed(7)]))===JSON.stringify((JSON.parse(UI.desOrig||'[]')).map(x=>[+(+x[0]).toFixed(7),+(+x[1]).toFixed(7)]))){
    Object.assign(UI,{mpModo:null,desenho:null,desHist:null,vSel:null,vMenu:false});mpRefresh();toast('Edição encerrada, sem mudanças.');return}
  t.poly=p.map(x=>[+x[0].toFixed(7),+x[1].toFixed(7)]);if(t.lat==null){const c=centro(p);t.lat=c[0];t.lng=c[1];t.precisao='aproximada'}
  const a=areaPoly(t.poly);log(t,`${UI.desEditando?'Poligonal editada':'Poligonal desenhada'} no mapa: ${m2(a)}`);UI.mpModo=null;UI.desenho=null;UI.desHist=null;UI.vSel=null;UI.vMenu=false;UI.vMover=false;save();mpRefresh();toast(`Poligonal salva: ${m2(a)}.`)}

/* KMZ / KML */
async function lerKmz(file){let txt;
  if(/\.kmz$/i.test(file.name)){if(!window.JSZip)throw new Error('Não foi possível abrir KMZ: biblioteca de compactação indisponível.');
    const z=await JSZip.loadAsync(file);const f=Object.values(z.files).find(f=>/\.kml$/i.test(f.name));if(!f)throw new Error('O KMZ não tem um arquivo KML dentro.');txt=await f.async('text')}
  else txt=await file.text();
  const x=new DOMParser().parseFromString(txt,'application/xml');if(x.getElementsByTagName('parsererror').length)throw new Error('O arquivo não é um KML válido.');
  const crd=s=>String(s||'').trim().split(/\s+/).map(p=>{const [lng,lat]=p.split(',').map(Number);return [lat,lng]}).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
  const out=[...x.getElementsByTagName('Placemark')].map((p,i)=>{const nome=(p.getElementsByTagName('name')[0]?.textContent||'').trim()||`Item ${i+1}`;
    const pol=p.getElementsByTagName('Polygon')[0];
    if(pol){const ob=pol.getElementsByTagName('outerBoundaryIs')[0]||pol;let pts=crd(ob.getElementsByTagName('coordinates')[0]?.textContent);
      if(pts.length>3&&pts[0][0]===pts.at(-1)[0]&&pts[0][1]===pts.at(-1)[1])pts=pts.slice(0,-1);if(pts.length>=3)return {nome,tipo:'poligono',pts}}
    const pt=p.getElementsByTagName('Point')[0];if(pt){const c=crd(pt.getElementsByTagName('coordinates')[0]?.textContent);if(c.length)return {nome,tipo:'ponto',pts:c}}
    return null}).filter(Boolean);
  if(!out.length)throw new Error('Nenhum ponto ou polígono encontrado no arquivo.');return out}

/* ===================== DASHBOARD ===================== */
const DIMS={
  situacao:{l:'Terrenos por situação',v:t=>sitMapa(t),ord:Object.keys(SIT),lab:k=>sitNome(k),cor:k=>SIT[k][1]},
  zona:{l:'Terrenos por região',v:t=>t.zona||'nao_informado',ord:[...Object.keys(OPT.zona),'nao_informado'],lab:k=>k==='nao_informado'?'Não informada':OPT.zona[k]},
  corretor:{l:'Terrenos por corretor principal',v:t=>t.corretores.find(x=>x.principal)?.cid||'sem',lab:k=>k==='sem'?'Sem corretor':(corretor(k)?.nome||k)},
  origem:{l:'Terrenos por origem',v:t=>t.origem||'nao',lab:k=>OPT.origem[k]||'Não informada'},
  temperatura:{l:'Negociações ativas por temperatura',v:t=>t.neg?.status==='ativo'?String(t.neg.temp||0):null,ord:['5','4','3','2','1','0'],lab:k=>k==='0'?'Não avaliada':`${k} · ${TEMP[k]}`},
  valor:{l:'Valor pedido por etapa (negociações ativas)',dim:'situacao',v:t=>t.neg?.status==='ativo'?t.neg.etapa:null,ord:STAGES.map(s=>s[0]),lab:k=>SN(k),cor:k=>SIT[k][1],med:t=>ofertaRef(t)?.valor||0,fmt:v=>mi(v)},
  mes:{l:'Terrenos cadastrados por mês',linha:true,v:t=>(t.dataIdent||'').slice(0,7)}};
const DIM_DE=k=>DIMS[k].dim||k;
function dashBase(excl){const f=UI.dash.f;return ativosBanco().filter(t=>Object.entries(f).every(([d,vs])=>d===excl||!vs.length||vs.includes(DIMS[d].v(t))))}
function dashSerie(k){const d=DIMS[k],dd=DIM_DE(k),rows=dashBase(dd),m=new Map();
  rows.forEach(t=>{const v=d.v(t);if(v==null)return;m.set(v,(m.get(v)||0)+(d.med?d.med(t):1))});
  let ks=[...m.keys()];ks=d.ord?d.ord.filter(x=>m.has(x)):ks.sort((a,b)=>m.get(b)-m.get(a));return ks.map(x=>[x,m.get(x)])}
function grafBarras(k,grande){const d=DIMS[k],dd=DIM_DE(k),s=dashSerie(k),max=Math.max(1,...s.map(x=>x[1])),sel=UI.dash.f[dd]||[];
  if(!s.length)return '<div class="empty">Sem dados com estes filtros.</div>';
  const fmt=d.fmt||(v=>num(v));
  return `<div class="hb ${grande?'g':''}">${s.map(([x,v])=>{const on=sel.includes(x);return `<button type="button" class="hb-r ${on?'on':''} ${sel.length&&!on?'dim':''}" data-a="dash-f" data-d="${dd}" data-v="${esc(x)}" data-tip="${esc(d.lab(x))}: ${esc(fmt(v))}${d.med?'':v===1?' terreno':' terrenos'}" aria-pressed="${on}">
    <span class="hb-l">${esc(d.lab(x))}</span><span class="hb-t"><span class="hb-b" style="width:${Math.max(2,v/max*100)}%;background:${d.cor?d.cor(x):'var(--azul-bkm)'}"></span></span><span class="hb-v num">${fmt(v)}</span></button>`}).join('')}</div>`}
function grafLinha(k,grande){const d=DIMS[k],rows=dashBase('mes'),sel=UI.dash.f.mes||[];
  const meses=[];const b=pd(HOJE);for(let i=11;i>=0;i--){const x=new Date(b.getFullYear(),b.getMonth()-i,1);meses.push(`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`)}
  const v=meses.map(m=>rows.filter(t=>d.v(t)===m).length),max=Math.max(2,...v),W=640,H=grande?320:220,pl=36,pr=16,pt=20,pb=36,iw=W-pl-pr,ih=H-pt-pb;
  const X=i=>pl+i*iw/(meses.length-1),Y=y=>pt+ih-y/max*ih;const passo=Math.max(1,Math.ceil(max/4));const ticks=[];for(let y=0;y<=max;y+=passo)ticks.push(y);
  const lab=m=>{const [a,mm]=m.split('-');return `${MES[+mm-1]}/${a.slice(2)}`};const imax=v.indexOf(Math.max(...v));
  const linha=v.map((y,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  return `<svg class="gl" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.l)}">
  ${ticks.map(y=>`<line x1="${pl}" x2="${W-pr}" y1="${Y(y)}" y2="${Y(y)}" class="gl-grid"/><text x="${pl-8}" y="${Y(y)+4}" class="gl-ax" text-anchor="end">${y}</text>`).join('')}
  <path d="${linha}L${X(v.length-1)},${Y(0)}L${X(0)},${Y(0)}Z" class="gl-area"/><path d="${linha}" class="gl-line"/>
  ${meses.map((m,i)=>`${i%2===(meses.length-1)%2?`<text x="${X(i)}" y="${H-12}" class="gl-ax" text-anchor="middle">${lab(m)}</text>`:''}
    <circle cx="${X(i)}" cy="${Y(v[i])}" r="${sel.includes(m)?6:4}" class="gl-pt ${sel.includes(m)?'on':''}"/>${(i===imax||i===v.length-1)&&v[i]?`<text x="${X(i)}" y="${Y(v[i])-10}" class="gl-val" text-anchor="middle">${v[i]}</text>`:''}
    <rect x="${X(i)-iw/(meses.length-1)/2}" y="${pt}" width="${iw/(meses.length-1)}" height="${ih}" class="gl-hit" data-a="dash-f" data-d="mes" data-v="${m}" data-tip="${lab(m)}: ${v[i]} ${v[i]===1?'terreno cadastrado':'terrenos cadastrados'}"/>`).join('')}</svg>`}
const grafico=(k,g)=>DIMS[k].linha?grafLinha(k,g):grafBarras(k,g);
function tabelaGrafico(k){const d=DIMS[k];let s;
  if(d.linha){const rows=dashBase('mes'),m=new Map();rows.forEach(t=>{const v=d.v(t);m.set(v,(m.get(v)||0)+1)});s=[...m.entries()].sort((a,b)=>b[0].localeCompare(a[0]))}else s=dashSerie(k);
  return `<div class="dt-wrap"><table class="dt compacta"><thead><tr><th class="esq">${d.linha?'Mês':'Categoria'}</th><th>${d.med?'Valor pedido':'Terrenos'}</th></tr></thead><tbody>${s.map(([x,v])=>`<tr><td class="esq">${esc(d.linha?x:d.lab(x))}</td><td class="num">${d.fmt?d.fmt(v):v}</td></tr>`).join('')}</tbody></table></div>`}
function pgDash(){const f=UI.dash.f,rows=dashBase(null),ativos=rows.filter(t=>t.neg?.status==='ativo');
  const chips=Object.entries(f).flatMap(([d,vs])=>vs.map(v=>`<button class="fchip on" data-a="dash-f" data-d="${d}" data-v="${esc(v)}" aria-label="Remover filtro ${esc(DIMS[d].lab?DIMS[d].lab(v):v)}">${esc(d==='mes'?v.split('-').reverse().join('/'):DIMS[d].lab(v))}${ic('close',14)}</button>`));
  return `<div id="dash" class="dash">
  <div class="page-h"><div><h1><span class="marca"></span>Dashboard</h1><div class="sub">Clique numa barra ou num mês para filtrar todos os gráficos e a lista.</div></div>
    <button class="btn" data-a="dash-full">${ic(document.fullscreenElement||document.body.classList.contains('dash-fixo')?'telaSair':'tela',18)}${document.fullscreenElement||document.body.classList.contains('dash-fixo')?'Sair da tela cheia':'Tela cheia'}</button></div>
  <div class="dash-g">
  <aside class="dash-lado">
    <div class="kpis kpis-v">
      <div class="kpi"><span class="v">${rows.length}</span><span class="l">Terrenos no filtro</span></div>
      <div class="kpi"><span class="v">${ativos.length}</span><span class="l">Negociações ativas</span></div>
      <div class="kpi"><span class="v sm">${mi(ativos.reduce((s,t)=>s+(ofertaRef(t)?.valor||0),0))}</span><span class="l">Valor pedido em negociação</span></div>
      <div class="kpi"><span class="v sm">${num(rows.reduce((s,t)=>s+(areaAdotada(t)||0),0))} m²</span><span class="l">Área adotada somada</span></div></div>
    ${chips.length?`<section class="sec dash-filtro"><div class="sec-b"><div class="lbl-up">Filtrando por</div><div class="fchips">${chips.join('')}</div><button class="linkbtn" data-a="dash-limpar">Limpar filtros</button></div></section>`:''}
    <section class="sec"><div class="sec-h"><h2>Gráficos</h2><span class="faint" style="font-size:13px">${UI.dash.sel.length} de ${Object.keys(DIMS).length}</span></div><div class="sec-b dash-sel">
      ${Object.entries(DIMS).map(([k,d])=>`<label class="chk"><input type="checkbox" data-ch="dash-sel" value="${k}" ${UI.dash.sel.includes(k)?'checked':''}>${d.l}</label>`).join('')}</div></section>
  </aside>
  <div class="dash-main">
    ${UI.dash.sel.length?`<div class="dash-graf">${UI.dash.sel.map(k=>`<section class="card graf ${DIMS[k].linha?'larga':''}"><div class="card-h"><h2>${DIMS[k].l}</h2><button class="iconbtn" data-a="dash-exp" data-k="${k}" aria-label="Ampliar ${DIMS[k].l}" title="Ampliar">${ic('tela',18)}</button></div><div class="card-b">${grafico(k)}</div></section>`).join('')}</div>`
      :'<div class="card"><div class="empty">Escolha ao menos um gráfico na lista ao lado.</div></div>'}
  </div>
  <section class="sec dash-tab"><div class="sec-h"><h2>Terrenos no filtro</h2><span class="faint" style="font-size:13px">${rows.length}</span></div><div class="sec-b">${tabela('dash',rows,COLS_TERRENOS,{attr:attrAbrir('dashboard'),padrao:{k:'temp',dir:'desc'}})}</div></section>
  </div></div>`}
function telaCheia(){const el=$('#dash');if(!el)return;
  if(document.fullscreenElement){document.exitFullscreen?.();return}
  if(document.body.classList.contains('dash-fixo')){document.body.classList.remove('dash-fixo');render();return}
  const fallback=()=>{document.body.classList.add('dash-fixo');render()};
  try{const p=el.requestFullscreen?.();if(p&&p.catch)p.catch(fallback);else if(!p)fallback()}catch(e){fallback()}}
document.addEventListener('fullscreenchange',()=>{const b=document.querySelector('[data-a="dash-full"]');if(!b)return;const on=!!document.fullscreenElement;b.innerHTML=`${ic(on?'telaSair':'tela',18)}${on?'Sair da tela cheia':'Tela cheia'}`});

/* tooltip dos gráficos */
const TIP=document.createElement('div');TIP.className='tip';TIP.setAttribute('role','tooltip');document.body.appendChild(TIP);
document.addEventListener('mouseover',e=>{const el=e.target.closest?.('[data-tip]');if(!el){TIP.classList.remove('on');return}TIP.textContent=el.dataset.tip;TIP.classList.add('on')});
document.addEventListener('mousemove',e=>{if(!TIP.classList.contains('on'))return;const w=TIP.offsetWidth;TIP.style.left=Math.min(innerWidth-w-8,e.clientX+14)+'px';TIP.style.top=(e.clientY+16)+'px'});
document.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-tip]');if(!el)return;const r=el.getBoundingClientRect();TIP.textContent=el.dataset.tip;TIP.classList.add('on');TIP.style.left=Math.min(innerWidth-TIP.offsetWidth-8,r.left)+'px';TIP.style.top=(r.bottom+6)+'px'});
document.addEventListener('focusout',()=>TIP.classList.remove('on'));

/* ===================== FICHA: VISÃO GERAL ===================== */
function abaGeral(t){const n=t.neg,o=ofertaRef(t),ad=areaAdotada(t),v=n?.viab,lp=lastProp(t),pr=typeof proxReuniao==='function'?proxReuniao(t):null,pt=proxTarefa(t),px=proximos(t);
  const lin=(k,val)=>`<div class="kv"><dt>${k}</dt><dd>${val==null||val===''?'<span class="ni">Não informado</span>':val}</dd></div>`;
  /* Edição direta no resumo: grava nos mesmos campos das seções abaixo, pelo mesmo caminho (no banco, app.salvar_terreno só com as chaves enviadas) */
  const CAMPO={};Object.entries(SECOES).forEach(([sid,s])=>s.campos.forEach(c=>{CAMPO[c[0]]=[sid,c]}));
  const lapis=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>`;
  const pe=`<div class="kv-f"><button type="button" class="btn text sm" data-a="cancel-edit">Cancelar</button><button class="btn primary sm">Salvar</button></div>`;
  const linE=(rot,val,chave,campos)=>{const id='g-'+chave;
    if(UI.edit===id){const sid=CAMPO[campos[0]][0];
      const corpo=chave==='end'?camposEndereco(t,false)+['lat','lng'].map(k=>`<input type="hidden" name="${k}" value="${t[k]==null?'':String(t[k]).replace('.',',')}">`).join('')+`<input type="hidden" name="precisao" value="${esc(t.precisao||'nao_informada')}">`
        :`<div class="kv-campos">${campos.map(k=>campoInp(t,CAMPO[k][1])).join('')}</div>`;
      return `<div class="kv editando" id="sec-${id}"><dt>${rot}</dt><dd><form data-form="sec" data-s="${sid}" class="kv-form">${corpo}${pe}</form></dd></div>`}
    return `<div class="kv"><dt>${rot}</dt><dd>${val==null||val===''?'<span class="ni">Não informado</span>':val}</dd><button class="kv-ed" data-a="edit" data-s="${id}" aria-label="Editar ${rot.toLowerCase()}" title="Editar">${lapis}</button></div>`};
  const areaHid=ks=>ks.map(k=>`<input type="hidden" name="${k}" value="${t[k]==null?'':String(t[k]).replace('.',',')}">`).join('');
  const numInp=(k,l)=>`<div class="field"><label for="g-${k}">${l}</label><input id="g-${k}" name="${k}" inputmode="decimal" value="${t[k]==null?'':String(t[k]).replace('.',',')}" placeholder="${k==='testada'?'metros':'m²'}"></div>`;
  const linArea=(rot,val,chave)=>{const id='g-'+chave;
    if(UI.edit===id){const corpo=chave==='testada'?numInp('testada','Testada principal (m)')+areaHid(['aDoc','aCad','aLev','aEst'])+`<input type="hidden" name="fonteArea" value="${esc(t.fonteArea||'')}">`
      :`<div class="field"><label for="g-fonteArea">Área adotada</label><select id="g-fonteArea" name="fonteArea"><option value="">Nenhuma</option>${Object.entries(OPT.fonteArea).map(([k,l])=>`<option value="${k}" ${t.fonteArea===k?'selected':''}>${l}</option>`).join('')}</select></div>${numInp('aDoc','Documental (m²)')}${numInp('aCad','Cadastral (m²)')}${numInp('aLev','Levantamento (m²)')}${numInp('aEst','Estimativa (m²)')}${areaHid(['testada'])}`;
      return `<div class="kv editando" id="sec-${id}"><dt>${rot}</dt><dd><form data-form="areas" class="kv-form"><div class="kv-campos">${corpo}</div>${pe}</form></dd></div>`}
    return `<div class="kv"><dt>${rot}</dt><dd>${val==null||val===''?'<span class="ni">Não informado</span>':val}</dd><button class="kv-ed" data-a="edit" data-s="${id}" aria-label="Editar ${rot.toLowerCase()}" title="Editar">${lapis}</button></div>`};
  const linLink=(rot,val,acao)=>`<div class="kv"><dt>${rot}</dt><dd>${val==null||val===''?'<span class="ni">Não informado</span>':val}</dd>${acao}</div>`;
  const a=analiseVig(t);
  const info=`<section class="sec"><div class="sec-h"><h2>Informações do terreno</h2></div><div class="sec-b"><dl class="kvl">
    ${linE('Endereço',esc([t.logradouro&&(t.logradouro+(t.numero?', '+t.numero:'')),t.bairro].filter(Boolean).join(' · ')),'end',['cep','logradouro','numero','complemento','bairro','municipio'])}
    ${linE('Município e região',esc([t.municipio||'São Paulo · SP',t.zona&&'Zona '+OPT.zona[t.zona]].filter(Boolean).join(' · ')),'reg',['zona'])}
    ${linE('Eixo comercial',esc(eixo(t.eixo)||''),'eixo',['eixo'])}
    ${linLink('Zoneamento',a?esc(zonasTxt(t))+(caMax(t)!=null?` · CA máx. ${num(caMax(t),2)}`:''):'',`<button class="kv-ed kv-ir" data-a="tab" data-t="urbanismo" title="Registrar nova análise em Urbanismo" aria-label="Registrar nova análise em Urbanismo">${ic('fwd',16)}</button>`)}
    ${linArea('Área adotada',ad!=null?`${m2(ad)} <span class="faint">(${esc(OPT.fonteArea[t.fonteArea]||'')})</span>`:'','area')}
    ${t.poly?lin('Área da poligonal',m2(areaPoly(t.poly))):''}
    ${linArea('Testada principal',t.testada!=null?num(t.testada,2)+' m':'','testada')}
    ${linE('Topografia e posição',[t.topografia!=='nao_informado'&&OPT.topografia[t.topografia],t.posicao!=='nao_informado'&&OPT.posicao[t.posicao]].filter(Boolean).join(' · '),'topo',['topografia','posicao'])}
    ${linE('Ocupação',t.ocupacao!=='nao_informado'?OPT.ocupacao[t.ocupacao]:'','ocup',['ocupacao'])}
    ${linE('Responsável',esc(t.resp),'resp',['resp'])}
    ${linE('Origem',esc(OPT.origem[t.origem]||''),'orig',['origem'])}</dl></div></section>`;
  const neg=n?`<section class="sec"><div class="sec-h"><h2>Negociação</h2><button class="btn text sm" data-a="tab" data-t="negociacao">Ver propostas e reuniões</button></div><div class="sec-b"><dl class="kvl">
    ${lin('Situação',sitChip(sitMapa(t))+(n.status==='ativo'&&n.sub?` <span class="chip sub">${esc(subN(n.sub))} · ${diasSub(n)} d</span>`:'')+(n.pedido?' <span class="chip blue">Aguardando aprovação</span>':''))}
    ${['perdido','descartado'].includes(n.status)?lin('Motivo',esc(motivoN(n.status,n.motivo))+(n.detalhe?` · ${esc(n.detalhe)}`:'')):''}
    ${n.status==='ativo'?`<div class="kv"><dt>Temperatura</dt><dd>${tempPicker(t)}</dd></div>`:lin('Temperatura',n.temp?`${tempMini(n.temp)} ${TEMP[n.temp]}`:'')}
    ${lin('Última proposta',lp?`${mi(lp.valor)} · ${lp.origem==='bkm'?'BKM':'Vendedor'} · ${OPT.statusProp[lp.status]}`:'')}
    ${lin('Próxima reunião',pr?`${fd(pr.data)} · ${esc(pr.hora||'')}`:'')}
    ${pt?linLink('Próxima tarefa',`${esc(pt.titulo)} · <span style="${pt.prazo<HOJE?'color:var(--terracota);font-weight:600':''}">${fd(pt.prazo)}</span>`,`<button class="kv-ed" data-a="tk-abrir" data-id="${t.id}" data-tk="${pt.id}" aria-label="Editar a tarefa ${esc(pt.titulo)}" title="Editar tarefa">${lapis}</button>`):lin('Próxima tarefa','')}</dl></div></section>`:'';
  const loc=`<section class="sec g-loc"><div class="sec-h"><h2>${bi('localizacao',32)}Localização</h2></div><div class="sec-b">
    ${t.lat!=null?`<div class="mini-wrap"><div id="mini-mapa" class="mini-mapa"></div></div><div class="mini-pe"><span></span><span>${GG?`<button class="btn sm" data-a="g-sv-mini" data-id="${t.id}">Street View</button>`:''}<button class="btn sm mini-ir" data-a="mp-ir" data-id="${t.id}">Ver no mapa</button></span></div>
      <div class="mp-aviso mini">O fundo do mapa não carrega neste link de visualização.</div>`
    :`<div class="empty" style="padding:var(--e6) 0">Sem localização.<br><span style="display:inline-flex;gap:8px;margin-top:12px;flex-wrap:wrap;justify-content:center">${GG&&(t.logradouro||t.bairro)?`<button class="btn sm primary ed" data-a="g-geo" data-id="${t.id}">Localizar pelo endereço</button>`:''}<button class="btn sm ed" data-a="mp-marcar" data-id="${t.id}">Marcar no mapa</button></span></div>`}</div></section>`;
  const poi=entornoCard(t);
  const pct=(x,b)=>b?num(x/b*100,1)+'%':'—';
  const viab=`<section class="sec"><div class="sec-h"><h2>Resumo da viabilidade</h2>${v?`<span class="faint" style="font-size:12px">${esc(v.nome)}</span>`:''}</div><div class="sec-b">${v?`<div class="dt-wrap"><table class="dt compacta"><thead><tr><th class="esq">Item</th><th>Valor</th><th>% do VGV</th></tr></thead><tbody>
    <tr><td class="esq">VGV</td><td class="num">${mi(v.vgv)}</td><td class="num">100%</td></tr>
    <tr><td class="esq">Preço máximo do terreno</td><td class="num">${mi(v.pmax)}</td><td class="num">${pct(v.pmax,v.vgv)}</td></tr>
    <tr><td class="esq">Valor pedido</td><td class="num">${o?.valor?mi(o.valor):'—'}</td><td class="num">${o?.valor?pct(o.valor,v.vgv):'—'}</td></tr>
    ${lp?`<tr><td class="esq">Última proposta (${lp.origem==='bkm'?'BKM':'vendedor'})</td><td class="num">${mi(lp.valor)}</td><td class="num">${pct(lp.valor,v.vgv)}</td></tr>`:''}
    <tr class="forte"><td class="esq">Margem do estudo</td><td class="num">${num(v.margem,1)}%</td><td></td></tr></tbody></table></div>
    ${o?.valor&&o.valor>v.pmax?`<div class="banner warn" style="margin-top:12px">${ic('warn')}<div>Valor pedido ${mi(o.valor-v.pmax)} acima do preço máximo.</div></div>`:''}`
    :`<div class="muted">Sem estudo vinculado.${negAtiva(t)?` <button class="linkbtn ed" data-a="viab">Vincular estudo</button>`:''}</div>`}</div></section>`;
  const rel=relevoHtml(t)?`<section class="sec"><div class="sec-h"><h2>Relevo</h2>${t.relevo?`<span class="faint" style="font-size:12px">estimado em ${fd(t.relevo.em)}</span>`:''}</div><div class="sec-b">${relevoHtml(t)}</div></section>`:'';
  return `<div class="geral"><div class="geral-c">${info}${condicoes(t)}${neg}</div><div class="geral-c">${loc}${rel}${poi}${viab}</div></div>`}
function L_initMini(){const el=$('#mini-mapa'),t=T(UI.id);if(!el||!t||t.lat==null)return;if(!window.L){el.innerHTML='<div class="mapa-erro">Mapa indisponível.</div>';return}
  MINI=L.map(el,{zoomControl:true,attributionControl:true,scrollWheelZoom:false,doubleClickZoom:false,dragging:!L.Browser.mobile});
  const mini0=MINI;miniGestos(el,d=>mini0.setZoom(mini0.getZoom()+d));
  /* dois cliques: sobre a poligonal (ou o pino) editam a poligonal ali mesmo; no resto do mapa abrem a página Mapa */
  MINI.on('dblclick',e=>miniDuplo(t,e.latlng.lat,e.latlng.lng,false));
  MINI.on('click',e=>{if(UI.edMini)mapaClique(e.latlng.lat,e.latlng.lng)});
  miniToqueDuplo(el,t,(x,y)=>{const ll=mini0.containerPointToLatLng([x,y]);return [ll.lat,ll.lng]});
  camada('satelite',el.closest('.sec')).addTo(MINI);const k=sitMapa(t);
  const enq=()=>t.poly?MINI.fitBounds(t.poly,{padding:[24,24],maxZoom:18}):MINI.setView([t.lat,t.lng],17);
  if(t.poly)MINI.__poly=L.polygon(t.poly,{color:'#0094fe',weight:2,fillOpacity:.2}).on('dblclick',e=>{L.DomEvent.stop(e);miniDuplo(t,e.latlng.lat,e.latlng.lng,true)}).addTo(MINI);enq();
  MINI_DES=L.layerGroup().addTo(MINI);
  const mini=MINI;requestAnimationFrame(()=>setTimeout(()=>{if(MINI!==mini)return;MINI.invalidateSize();enq();if(UI.edMini)desenhaRascunho()},60));
  const pin=L.marker([t.lat,t.lng],{icon:pinIcon(k)}).addTo(MINI);if(t.poly)pin.on('dblclick',e=>{L.DomEvent.stop(e);miniDuplo(t,t.lat,t.lng,true)});
  if(UI.edMini&&UI.mpModo==='editar'&&UI.mpAlvo===t.id)miniEdDesenha()}

/* dois cliques (ou dois toques) no mini-mapa. Sobre a poligonal: entra em edição ali mesmo, com os pontos e o menu do ponto
   da página Mapa (Leitura não edita: abre o Mapa). No resto do mapa: abre a página Mapa. Editando, não faz nada (o clique fora conclui). */
function miniDuplo(t,lat,lng,naPoly,toque){if(!toque&&Date.now()-(UI.miniToqueEm||0)<600)return; /* os dois toques já foram tratados por miniToqueDuplo */
  if(UI.edMini&&UI.mpModo==='editar')return;
  if(naPoly&&UI.role!=='Leitura'&&t.poly&&t.poly.length>=3){editarPoligonal(t.id,true);return}
  miniAbrirMapa(t,lat,lng,MINI?.getZoom?.())}
/* no celular o navegador nem sempre transforma dois toques em duplo clique: contamos os toques aqui */
function miniToqueDuplo(el,t,ll){let ult=null,x0=0,y0=0,mov=false;
  el.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;x0=e.clientX;y0=e.clientY;mov=false},true);
  el.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&Math.hypot(e.clientX-x0,e.clientY-y0)>10)mov=true},true);
  el.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'||mov||e.target.closest('.v-alvo,.gm-control-active,.leaflet-control,button'))return;
    const agora=Date.now();if(ult&&agora-ult.em<350&&Math.hypot(e.clientX-ult.x,e.clientY-ult.y)<30){ult=null;
      if(UI.edMini&&UI.mpModo==='editar')return;const r=el.getBoundingClientRect(),q=ll(e.clientX-r.left,e.clientY-r.top);if(!q)return;
      const naPoly=!!(t.poly&&t.poly.length>=3&&dentroPoly(q[0],q[1],t.poly));UI.miniToqueEm=Date.now();setTimeout(()=>miniDuplo(t,q[0],q[1],naPoly,true),0);return}
    ult={em:agora,x:e.clientX,y:e.clientY}},true)}
/* edição no mini-mapa: some a poligonal fixa, aparecem os pontos; no celular, a barra de aviso fica logo abaixo do mapa */
function miniEdDesenha(){const el=$('#mini-mapa');if(!el||!MINI)return;el.classList.add('modo');
  if(GG){MINI.__poly?.setMap(null);MINI.setOptions({gestureHandling:'greedy'})}else{MINI.__poly&&MINI.removeLayer(MINI.__poly);MINI.dragging?.enable()}
  let b=$('#mini-modo');if(!b){b=document.createElement('div');b.id='mini-modo';b.className='mp-modo mini-modo';b.setAttribute('aria-live','polite');el.after(b)}b.innerHTML=modoBanner();
  desenhaRascunho();vMenuDesenha()}
function miniEdRefresh(){if(UI.mpModo==='editar'&&UI.edMini)return miniEdDesenha();
  /* saiu da edição (salvou, cancelou ou nada mudou): a ficha redesenha com a poligonal nova */
  UI.edMini=false;render()}
/* mini-mapa da Visão geral: a roda sozinha rola a página; Shift + roda dá zoom.
   Com Shift o navegador costuma mandar a rolagem como horizontal (deltaX), por isso vale qualquer eixo.
   A escuta é na captura do contêiner, antes do mapa: sem Shift o evento não chega ao mapa e a página rola. */
function miniGestos(el,zoom){let acc=0,ult=0;
  el.addEventListener('wheel',e=>{if(!e.shiftKey){e.stopPropagation();return}e.preventDefault();e.stopPropagation();
    const d=(Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX)*(e.deltaMode===1?40:1);if(Date.now()-ult>400)acc=0;acc+=d;
    if(Math.abs(acc)>=60&&Date.now()-ult>180){zoom(acc<0?1:-1);acc=0;ult=Date.now()}},{capture:true,passive:false})}
/* dois cliques no mini-mapa: abre a página Mapa centrada no ponto clicado, no mesmo zoom, com o terreno selecionado */
function miniAbrirMapa(t,lat,lng,z){go('mapa',{mpView:{c:{lat,lng},z:Math.max(z||17,15)},mpSel:t.id,mpFoco:null})}

/* ===================== TAREFAS (quadro) ===================== */
const COLS_TK=['pendente','em_andamento','aguardando_terceiro','concluida','cancelada'];
function todasTarefas(){return ativosBanco().flatMap(t=>t.tarefas.map(k=>({k,t})))}
function tkFiltradas(){const f=UI.tk,q=f.q.trim().toLowerCase();
  return todasTarefas().filter(({k,t})=>(!f.resp||k.resp===f.resp)&&(!f.ter||t.id===f.ter)&&(!f.prio||k.prio===f.prio)&&(!f.atras||(k.prazo<HOJE&&!['concluida','cancelada'].includes(k.status)))&&(!q||(k.titulo+' '+(k.desc||'')+' '+t.nome+' '+t.codigo).toLowerCase().includes(q)))}
const ordemTk=(a,b)=>(a.k.pos??9e15)-(b.k.pos??9e15)||a.k.prazo.localeCompare(b.k.prazo);
function cardTk({k,t}){const at=k.prazo<HOJE&&!['concluida','cancelada'].includes(k.status);
  return `<article class="tk ${k.status}" draggable="${UI.role!=='Leitura'}" data-tk="${k.id}" data-a="tk-abrir" data-id="${t.id}" tabindex="0" aria-label="${esc(k.titulo)}">
  <div class="tk-t">${esc(k.titulo)}</div>${k.desc?`<div class="tk-d">${esc(k.desc)}</div>`:''}
  <div class="tk-ter"><span class="num">${t.codigo}</span> · ${esc(t.nome)}</div>
  <div class="tk-p"><span class="tk-prazo ${at?'atras':''}">${ic('clock',14)}${fd(k.prazo)}</span>${k.prio==='alta'?'<span class="chip warn">Alta</span>':k.prio==='baixa'?'<span class="chip">Baixa</span>':''}<span style="margin-left:auto">${av(k.resp,'sm')}</span></div></article>`}
function pgTarefas(){const f=UI.tk,l=tkFiltradas();const cols=COLS_TK.filter(c=>c!=='cancelada'||f.canc);
  const opt=(o,v)=>Object.entries(o).map(([k,x])=>`<option value="${k}" ${v===k?'selected':''}>${esc(x)}</option>`).join('');
  const filtros=`<div class="tk-filtros"><label class="search sm" for="tk-q">${bi('busca',24)}<input id="tk-q" type="search" placeholder="Buscar tarefa ou terreno" value="${esc(f.q)}" autocomplete="off"></label>
    <div class="field"><label for="tk-resp">Responsável</label><select id="tk-resp" data-ch="tk-f" data-k="resp"><option value="">Todos</option>${opt(Object.fromEntries(USERS.map(u=>[u,u])),f.resp)}</select></div>
    <div class="field"><label for="tk-ter">Terreno</label><select id="tk-ter" data-ch="tk-f" data-k="ter"><option value="">Todos</option>${opt(Object.fromEntries(ativosBanco().map(t=>[t.id,t.codigo+' · '+t.nome])),f.ter)}</select></div>
    <div class="field"><label for="tk-prio">Prioridade</label><select id="tk-prio" data-ch="tk-f" data-k="prio"><option value="">Todas</option>${opt(OPT.prioTar,f.prio)}</select></div>
    <label class="chk"><input type="checkbox" data-ch="tk-f" data-k="atras" ${f.atras?'checked':''}>Só atrasadas</label>
    <label class="chk"><input type="checkbox" data-ch="tk-f" data-k="canc" ${f.canc?'checked':''}>Mostrar canceladas</label></div>`;
  const quadro=`<div class="board tk-board">${cols.map(c=>{const ks=l.filter(x=>x.k.status===c).sort(ordemTk);
    return `<section class="col tk-col" data-tkcol="${c}" aria-label="${OPT.statusTar[c]}"><div class="col-h"><span>${OPT.statusTar[c]}</span><span class="n">${ks.length}</span></div>
    <div class="tk-lista">${ks.map(cardTk).join('')||'<div class="col-empty">Nenhuma</div>'}</div>
    ${UI.role!=='Leitura'&&c!=='cancelada'?`<button class="tk-add" data-a="tk-nova" data-v="${c}">${ic('add',16)}Adicionar tarefa</button>`:''}</section>`}).join('')}</div>`;
  const colsT=[{k:'titulo',l:'Tarefa',cls:'esq',v:({k})=>`<div class="t1">${esc(k.titulo)}</div>${k.desc?`<div class="t2">${esc(k.desc)}</div>`:''}`,s:({k})=>k.titulo},
    {k:'ter',l:'Terreno',cls:'esq hm',v:({t})=>`<div class="t2" style="color:var(--texto)">${t.codigo}</div><div class="t2">${esc(t.nome)}</div>`,s:({t})=>t.codigo},
    {k:'resp',l:'Responsável',cls:'hm',v:({k})=>esc(k.resp),s:({k})=>k.resp},
    {k:'prazo',l:'Prazo',cls:'num',v:({k})=>`<span style="${k.prazo<HOJE&&!['concluida','cancelada'].includes(k.status)?'color:var(--terracota);font-weight:600':''}">${fd(k.prazo)}</span>`,s:({k})=>k.prazo},
    {k:'prio',l:'Prioridade',cls:'hm',v:({k})=>OPT.prioTar[k.prio]||'—',s:({k})=>['alta','media','baixa'].indexOf(k.prio)},
    {k:'status',l:'Status',v:({k})=>`<span class="chip tkst ${k.status}">${OPT.statusTar[k.status]}</span>`,s:({k})=>COLS_TK.indexOf(k.status)}];
  const atras=todasTarefas().filter(({k})=>k.prazo<HOJE&&!['concluida','cancelada'].includes(k.status)).length;
  return `<div class="page-h"><div><h1><span class="marca"></span>Tarefas</h1><div class="sub">${l.filter(x=>!['concluida','cancelada'].includes(x.k.status)).length} abertas · ${atras} atrasadas. Arraste os cartões para mudar o status.</div></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="seg" role="group" aria-label="Visualização">${[['quadro','Quadro'],['tabela','Tabela']].map(([k,x])=>`<button data-a="tk-vista" data-v="${k}" aria-pressed="${f.vista===k}">${x}</button>`).join('')}</div>
    <button class="btn primary ed" data-a="tk-nova" data-v="pendente">${ic('add',18)}Nova tarefa</button></div></div>
  ${filtros}${f.vista==='tabela'?`<section class="sec"><div class="sec-b">${tabela('tarefas',l,colsT,{attr:({k,t})=>`data-a="tk-abrir" data-tk="${k.id}" data-id="${t.id}" tabindex="0"`,padrao:{k:'prazo',dir:'asc'},vazio:'Nenhuma tarefa com esses filtros.'})}</div></section>`:quadro}`}
function moverTk(tid,kid,col,antesDe){const t=T(tid),k=t.tarefas.find(x=>x.id===kid);if(!k)return;
  const irmas=todasTarefas().filter(x=>x.k.status===col&&x.k.id!==kid).sort(ordemTk);
  const i=antesDe?irmas.findIndex(x=>x.k.id===antesDe):-1;const pos=x=>x?.k.pos??(Date.parse(x?.k.prazo||HOJE)/1000);
  if(i<0)k.pos=(irmas.length?pos(irmas.at(-1)):0)+1000;else k.pos=i===0?pos(irmas[0])-1000:(pos(irmas[i-1])+pos(irmas[i]))/2;
  if(k.status!==col){const de=k.status;k.status=col;if(col==='concluida')k.feita=HOJE;log(t,`Tarefa "${k.titulo}": ${OPT.statusTar[de]} → ${OPT.statusTar[col]}`);toast(`${k.titulo}: ${OPT.statusTar[col]}.`)}
  save();render()}
let tkArr=null;
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('.tk[draggable="true"]');if(!c)return;tkArr={kid:c.dataset.tk,tid:c.dataset.id};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.dataset.tk);c.classList.add('arrastando');document.body.classList.add('dnd-tk')});
document.addEventListener('dragend',()=>{tkArr=null;document.body.classList.remove('dnd-tk');document.querySelectorAll('.tk.arrastando,.tk-col.sobre,.tk-marca').forEach(x=>x.classList.contains('tk-marca')?x.remove():x.classList.remove('arrastando','sobre'))});
const tkAntes=(col,y)=>[...col.querySelectorAll('.tk:not(.arrastando)')].find(c=>{const r=c.getBoundingClientRect();return y<r.top+r.height/2});
document.addEventListener('dragover',e=>{if(!tkArr)return;const col=e.target.closest?.('.tk-col');if(!col){document.querySelectorAll('.tk-col.sobre').forEach(x=>x.classList.remove('sobre'));document.querySelector('.tk-marca')?.remove();return}e.preventDefault();e.dataTransfer.dropEffect='move';
  document.querySelectorAll('.tk-col.sobre').forEach(x=>x!==col&&x.classList.remove('sobre'));col.classList.add('sobre');
  let m=document.querySelector('.tk-marca');if(!m){m=document.createElement('div');m.className='tk-marca'}const a=tkAntes(col,e.clientY),lista=col.querySelector('.tk-lista');if(a)lista.insertBefore(m,a);else lista.appendChild(m)});
document.addEventListener('drop',e=>{const col=e.target.closest?.('.tk-col');if(!col||!tkArr)return;e.preventDefault();const a=tkAntes(col,e.clientY),x=tkArr;tkArr=null;document.body.classList.remove('dnd-tk');document.querySelectorAll('.tk-col.sobre').forEach(x=>x.classList.remove('sobre'));document.querySelector('.tk-marca')?.remove();moverTk(x.tid,x.kid,col.dataset.tkcol,a?.dataset.tk)});
