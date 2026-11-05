/* ---------- mercado: empreendimentos do monitor de mercado no mapa e na ficha ----------
   Decisão do Moisés (4/nov/2026): o mapa mostra os empreendimentos do monitor (Órulo, tabelas im_* do Supabase),
   com um filtro próprio, e a ficha do terreno mostra, na aba Entorno, o R$/m² médio e o VSO médio a 1, 2 e 3 km.
   Os dados vêm de um retrato do monitor (docs/dados/mercado.json, gerado por tools/mercado/exportar.sql): um item por
   empreendimento, já somado, com as unidades à venda ("dorm,área,preço" separadas por ";") para os filtros.
   - R$/m² médio = soma dos preços das unidades à venda ÷ soma das áreas delas (disponíveis e reservadas com preço e área).
   - VSO = vendas ÷ (vendas + estoque), no período das vendas medidas pelo monitor (as de antes do monitor ficam fora).
   - Filtro do mapa: lançamento, entrega, incorporadora e programa social (do Órulo, por empreendimento; o monitor não sabe
     quais unidades são HIS ou HMP, decisão do Moisés de usar este campo) valem para o empreendimento; dormitórios, área,
     preço e R$/m² valem para as unidades à venda, e todos na mesma unidade: basta uma unidade dentro de todos para o
     empreendimento aparecer.
   A versão anterior (25/out) era uma camada de exemplo unidade por unidade, com grupos e categorias de produto; saiu. */
/* cores das etiquetas (tons claros com o prédio no tom escuro da mesma cor; pedido do Moisés, 4/nov/2026, trocando o neon), fora da paleta dos pinos */
const MK_SIT={breve_lancamento:['Breve lançamento','#ffdf99','#7a5900'],lancamento:['Lançamento','#c4eed0','#0f5223'],em_obras:['Em obras','#ffdcc1','#8a4a00'],pronto:['Pronto','#f0dbff','#6b2c91'],usado:['Usado','#ffd8e8','#8f1d52'],nao_informado:['Sem situação','#e3e3e3','#444746']};
const mkSitK=e=>MK_SIT[e?.sit]?e.sit:'nao_informado',mkOff=()=>UI.mkOff||(UI.mkOff=[]);
/* faixas do R$/m² médio das unidades à venda (soma dos preços ÷ soma das áreas), cada uma com a sua cor; a situação vai no
   desenho dentro do quadrado (pedido do Moisés, 5/nov/2026). O limite de baixo entra na faixa. */
const MK_FX=[[7000,'Abaixo de 7 mil','#5e4fa2'],[8000,'7 a 8 mil','#3288bd'],[9000,'8 a 9 mil','#66c2a5'],[10000,'9 a 10 mil','#abdda4'],[11000,'10 a 11 mil','#e6f598'],
  [13000,'11 a 13 mil','#fee08b'],[15000,'13 a 15 mil','#fdae61'],[18000,'15 a 18 mil','#f46d43'],[25000,'18 a 25 mil','#d53e4f'],[Infinity,'Acima de 25 mil','#9e0142']];
const MK_FX_SEM=['Sem preço','#bdc1c6'];
const mkFxK=e=>{const v=e?.preco!=null&&e.area>0?e.preco/e.area:null;if(v==null)return 'fx';return 'f'+MK_FX.findIndex(f=>v<f[0])};
const mkFxInfo=k=>k==='fx'?MK_FX_SEM:MK_FX[+k.slice(1)].slice(1);
/* o desenho de cada situação: lançamento estrela, em obras guindaste, pronto prédio (breve lançamento e usado, se vierem,
   seguem o lançamento e o pronto) */
const MK_GLIFO={lancamento:'M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z',
  em_obras:'M7 21V3M4 21h7M7 4h13M7 4l4 4M17 4v5M15 9h4v3h-4zM7 9h3M7 14h3',
  pronto:'M4 21V5l8-3v19M12 9l8 3v9M2 21h20M7 8h2M7 12h2M7 16h2M15 14h2M15 18h2'};
MK_GLIFO.breve_lancamento=MK_GLIFO.lancamento;MK_GLIFO.usado=MK_GLIFO.pronto;MK_GLIFO.nao_informado='M8 8a4 4 0 1 1 5 3.9c-.6.2-1 .7-1 1.3V15M12 19h.01';
const mkGlifo=e=>MK_GLIFO[mkSitK(e)];
/* cor do desenho: escura sobre as cores claras, branca sobre as escuras */
const mkTinta=c=>{const n=parseInt(c.slice(1),16),l=(.299*(n>>16)+.587*(n>>8&255)+.114*(n&255))/255;return l>.6?'#1f1f1f':'#fff'};
const mkVisivel=(e,off=mkOff())=>!off.includes(mkSitK(e))&&!off.includes(mkFxK(e));
const MK_RAIOS=[1,2,3];
const MK={box:null,abertoEm:0,d:null,erro:null,promessa:null};
const mkArq=()=>(location.pathname.startsWith('/prototipo')?'/prototipo/':'')+'dados/mercado.json';

/* ---------- dados ---------- */
function mkCarregar(){if(MK.promessa)return MK.promessa;
  MK.promessa=fetch(mkArq()).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(j=>{const c=j.campos;
    const emps=j.emps.map(a=>{const o={};c.forEach((k,i)=>o[k]=a[i]);return {id:o.id,nome:o.nome,inc:o.incorporadora,bairro:o.bairro,mun:o.municipio,lat:+o.lat,lng:+o.lng,sit:o.situacao,
      lanc:o.lancamento,ent:o.entrega,prog:o.programa_social,unidades:o.unidades,estoque:o.estoque,preco:o.preco==null?null:+o.preco,area:o.area==null?null:+o.area,vendas:o.vendas,_u:o.estoque_un,u:null,_g:o.grupos||[],g:null}});
    MK.d={emps,janela:j.janela,cg:j.campos_grupo,cfg:j.agrupamento,gerado:j.gerado_em,incs:[...new Set(emps.map(e=>e.inc))].sort((a,b)=>a.localeCompare(b,'pt-BR'))};
    mkAtualizarTela();return MK.d}).catch(e=>{MK.erro=e.message;mkAtualizarTela();return null});  // sem nova tentativa: fora do servidor (arquivo, artifact) não há dados
  return MK.promessa}
const mkEmps=()=>MK.d?.emps||[];
const mkEmp=id=>mkEmps().find(e=>e.id===id);
/* unidades à venda: [dormitórios, área, preço], nulo onde o Órulo não traz */
function mkUn(e){if(!e.u){const n=s=>s===''?null:+s;e.u=e._u?e._u.split(';').map(s=>{const [d,a,p]=s.split(',');return [n(d),n(a),n(p)]}):[];e._u=null}return e.u}
const mkM2=(preco,area)=>preco!=null&&area>0?preco/area:null;
const mkVso=(v,est)=>v+est>0?v/(v+est):null;
const mkPct=v=>v==null?'—':num(v*100,1)+'%';
const mkData=d=>{if(!d)return '—';const [y,m,dd]=d.split('-');return `${dd}/${m}/${y}`};
const mkPeriodo=()=>{const j=MK.d?.janela;return j&&j.de?`${mkData(j.de)} a ${mkData(j.ate)}`:''};
const mkDias=()=>{const j=MK.d?.janela;return j&&j.de?Math.round((new Date(j.ate)-new Date(j.de))/864e5):null};

/* ---------- filtro do mapa (na sessão; não mexe no filtro de terrenos) ---------- */
if(!UI.mf)try{UI.mf=JSON.parse(localStorage.getItem(MP_MFKEY)||'null')||{}}catch(e){UI.mf={}}
const MF_UN=[['dorm','Dormitórios','',0],['area','Área privativa','m²',1],['preco','Preço','R$',2],['m2','Preço por m²','R$/m²',3]];
const MF_DT=[['lanc','Data de lançamento'],['ent','Data de entrega']];
let MF_ABERTO=false;
function mfAtivos(){const f=UI.mf,n=[];
  MF_DT.forEach(([k])=>{if(f[k]&&(f[k].min||f[k].max))n.push(k)});MF_UN.forEach(([k])=>{if(f[k]&&(f[k].min!=null||f[k].max!=null))n.push(k)});
  if(f.inc?.length)n.push('inc');if(f.prog?.length)n.push('prog');return n}
const mfDentro=(v,w)=>v!=null&&(w.min==null||v>=w.min)&&(w.max==null||v<=w.max);
function mfPassa(e,sem){const f=UI.mf;
  for(const [k] of MF_DT){if(k===sem)continue;const w=f[k];if(!w||!(w.min||w.max))continue;const v=e[k];
    if(!v){if(w.semInfo)continue;return false}if(w.min&&v<w.min||w.max&&v>w.max)return false}
  if(sem!=='inc'&&f.inc?.length&&!f.inc.includes(e.inc))return false;
  if(sem!=='prog'&&f.prog?.length&&!f.prog.includes(e.prog))return false;
  const us=MF_UN.filter(([k])=>k!==sem&&f[k]&&(f[k].min!=null||f[k].max!=null));if(!us.length)return true;
  /* basta uma unidade à venda dentro de todos os filtros de unidade, a mesma */
  return mkUn(e).some(u=>us.every(([k,,,i])=>mfDentro(i===3?mkM2(u[2],u[1]):u[i],f[k])))}
const mfLista=()=>mkEmps().filter(e=>mfPassa(e));
function mfBotao(){const n=mfAtivos().length;
  return `<button type="button" class="mp-renda-b mf-btn" data-a="mf-abrir" aria-expanded="${MF_ABERTO}" aria-pressed="${n>0}" title="Filtrar os empreendimentos da concorrência">${ic('filtro',18)}<span class="mf-l">Concorrência</span>${n?`<span class="mf-n">${n}</span>`:''}</button>`}
/* barra do mapa: um botão só, os três pontinhos, com os filtros da concorrência e dos terrenos e o tipo de mapa
   (pedido do Moisés, 5/nov/2026, no lugar do botão Concorrência) */
function mpMaisBotao(){const n=mfAtivos().length;
  return `<div class="mp-maisw"><button type="button" class="mp-renda-b mp-mais" data-a="mp-mais" aria-haspopup="menu" aria-expanded="false" aria-pressed="${n>0}" aria-label="Filtros, camadas e tipo de mapa">${ic('mais',22)}${n?`<span class="mf-n">${n}</span>`:''}</button></div>`}
function mpMaisMenu(abrir){if(!abrir&&typeof MM_SOBRE!=='undefined'&&MM_SOBRE)MM_NAO=true;const w=$('.mapa-area .mp-maisw');if(!w)return;w.querySelector('.mp-cam-m')?.remove();w.querySelector('[data-a="mp-mais"]').setAttribute('aria-expanded',!!abrir);if(!abrir)return;
  const nc=mfAtivos().length,nt=typeof fxAtivos==='function'?fxAtivos('mapa').length:0,b=mpBaseAtual(),
    n=k=>k?`<span class="mf-n">${k}</span>`:'',tp=(v,l)=>`<button type="button" role="menuitemradio" aria-checked="${b===v}" data-a="mp-tipo" data-v="${v}"><span class="mm-ck">${ic('check',18)}</span>${l}</button>`,
    /* renda e densidade por setor saíram da legenda e vieram para cá (pedido do Moisés, 5/nov/2026); uma de cada vez */
    k=rdCamada(),cm=(a,v,l)=>`<button type="button" role="menuitemcheckbox" aria-checked="${k===v}" data-a="${a}"><span class="mm-ck">${ic('check',18)}</span>${l}</button>`;
  w.insertAdjacentHTML('beforeend',`<div class="mp-cam-m mp-mais-m" role="menu" aria-label="Filtros, camadas e tipo de mapa">
    <button type="button" role="menuitem" data-a="mf-abrir">${ic('filtro',18)}<span class="mm-l">Filtro da concorrência</span>${n(nc)}</button>
    <button type="button" role="menuitem" data-a="fx-abrir">${ic('filtro',18)}<span class="mm-l">Filtro dos terrenos</span>${n(nt)}</button>
    <button type="button" role="menuitem" data-a="rg-abrir">${ic('regua',18)}<span class="mm-l">Régua</span></button>
    <div class="mm-t" role="presentation">Camadas</div>${cm('mp-renda','renda','Mapa de Renda')}${cm('mp-dens','dens','Mapa Demográfico')}
    <div class="mm-t" role="presentation">Tipo de mapa</div>${tp('mapa','Mapa')}${tp('satelite','Satélite')}</div>`)}
window.addEventListener('click',e=>{const a=e.target.closest?.('[data-a="mp-mais"],[data-a="mp-tipo"],.mp-mais-m [data-a]');if(!a)return;
  if(a.dataset.a==='mp-mais'){mpMaisMenu(!$('.mp-mais-m'));return}
  if(a.dataset.a==='mp-tipo')mpTipoEscolher(a.dataset.v);
  setTimeout(()=>mpMaisMenu(false),0)},true); /* captura na janela: os filtros param a propagação no document */
document.addEventListener('pointerdown',e=>{if($('.mp-mais-m')&&!e.target.closest('.mp-maisw'))mpMaisMenu(false)},true);
/* o menu abre com o mouse parado sobre os três pontinhos por 0,75 s e fecha 1 s depois que o mouse sai (sem o foco do teclado dentro);
   fechado com o mouse em cima, só volta a abrir sozinho depois que o mouse sai (pedido do Moisés, 5/nov/2026) */
let MM_T=null,MM_SOBRE=false,MM_NAO=false;
function mmAgendar(){clearTimeout(MM_T);MM_T=null;if(TOQUE())return;const w=$('.mapa-area .mp-maisw');if(!w)return;const ab=!!$('.mp-mais-m');
  if(!ab&&MM_SOBRE&&!MM_NAO){MM_T=setTimeout(()=>{if(MM_SOBRE&&!MM_NAO&&!$('.mp-mais-m'))mpMaisMenu(true)},750);return}
  if(ab&&!MM_SOBRE)MM_T=setTimeout(()=>{const w=$('.mapa-area .mp-maisw');if($('.mp-mais-m')&&!MM_SOBRE&&!w?.querySelector(':focus-visible'))mpMaisMenu(false)},1000)}
document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const s=!!e.target.closest?.('.mapa-area .mp-maisw');if(s===MM_SOBRE)return;MM_SOBRE=s;if(!s)MM_NAO=false;mmAgendar()},true);
document.addEventListener('pointerout',e=>{if(e.pointerType==='mouse'&&!e.relatedTarget&&MM_SOBRE){MM_SOBRE=false;MM_NAO=false;mmAgendar()}},true);
document.addEventListener('focusout',e=>{if(e.target.closest?.('.mp-maisw'))setTimeout(mmAgendar,0)},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.mp-mais-m')){mpMaisMenu(false);e.preventDefault();e.stopImmediatePropagation()}},true);
function mfDrawer(){let el=$('#mf-dr'),sc=$('#mf-scrim');
  if(!MF_ABERTO||!naMapa()){el?.remove();sc?.remove();return}
  const top=el?.querySelector('.fx-b')?.scrollTop||0;
  if(!el){sc=document.createElement('div');sc.id='mf-scrim';sc.className='fx-scrim';sc.dataset.a='mf-fechar';document.body.appendChild(sc);
    el=document.createElement('aside');el.id='mf-dr';el.className='fx-dr mf-dr';el.setAttribute('role','dialog');el.setAttribute('aria-label','Filtro da concorrência');document.body.appendChild(el)}
  const f=UI.mf,base=mkEmps();
  const cont=(k,teste)=>base.filter(e=>mfPassa(e,k)&&teste(e)).length;
  const datas=MF_DT.map(([k,l])=>{const w=f[k]||{},sem=cont(k,e=>!e[k]);
    return `<div class="fx-c"><div class="fx-l">${l}</div><div class="fx-r"><input class="fx-in" type="date" data-mf="${k}" data-p="min" value="${w.min||''}" aria-label="${l}: de"><span>até</span><input class="fx-in" type="date" data-mf="${k}" data-p="max" value="${w.max||''}" aria-label="${l}: até"></div>
      ${(w.min||w.max)&&sem?`<button class="fx-op fx-mk fx-sem" data-a="mf-sem" data-k="${k}" aria-pressed="${!!w.semInfo}">${w.semInfo?ic('check',16):''}Incluir sem informação <span class="q">${sem}</span></button>`:''}</div>`}).join('');
  const faixas=MF_UN.map(([k,l,un])=>{const w=f[k]||{},v=x=>x==null?'':num(x,k==='area'?2:0);
    return `<div class="fx-c"><div class="fx-l">${l}${un?' ('+un+')':''}</div><div class="fx-r"><input class="fx-in" inputmode="decimal" data-mf="${k}" data-p="min" placeholder="Mínimo" value="${v(w.min)}" aria-label="${l} mínimo"><span>até</span><input class="fx-in" inputmode="decimal" data-mf="${k}" data-p="max" placeholder="Máximo" value="${v(w.max)}" aria-label="${l} máximo"></div>${k==='preco'?'<div class="fx-hint">Aceita "270 mil" ou "1,2 mi".</div>':''}</div>`}).join('');
  const op=(k,v,l)=>{const on=(f[k]||[]).includes(v),n=cont(k,e=>e[k]===v);return `<button class="fx-op" data-a="mf-op" data-k="${k}" data-v="${esc(v)}" aria-pressed="${on}" ${!on&&!n?'data-zero="1"':''}>${on?ic('check',16):''}${esc(l)} <span class="q">${num(n)}</span></button>`};
  const q=(UI.mfBusca||'').toLowerCase(),incs=(MK.d?.incs||[]).filter(i=>(f.inc||[]).includes(i)||!q||i.toLowerCase().includes(q));
  const incOps=incs.slice(0,q?200:40).map(i=>op('inc',i,i)).join('');
  el.innerHTML=`<div class="fx-h"><h2>Filtro da concorrência</h2>${mfAtivos().length?'<button class="linkbtn" data-a="mf-limpar">Limpar tudo</button>':''}<button class="iconbtn" data-a="mf-fechar" aria-label="Fechar filtro" title="Fechar (Esc)">${ic('close',22)}</button></div>
    <div class="fx-b"><div class="fx-sb">
      <div class="fx-hint">Dormitórios, área, preço e preço por m² olham as unidades à venda: o empreendimento aparece se pelo menos uma unidade estiver dentro de todos eles ao mesmo tempo.</div>
      ${faixas}${datas}
      <div class="fx-c"><div class="fx-l">Programa social</div><div class="fx-ops">${op('prog','sim','Sim')}${op('prog','nao','Não')}</div><div class="fx-hint">Como o Órulo marca o empreendimento; não separa HIS de HMP.</div></div>
      <div class="fx-c"><div class="fx-l">Incorporadora</div><input class="fx-in" type="search" data-mf-busca="1" placeholder="Buscar incorporadora…" value="${esc(UI.mfBusca||'')}" aria-label="Buscar incorporadora">
        <div class="fx-ops">${incOps||'<span class="fx-hint">Nada encontrado.</span>'}</div>${!q&&incs.length>40?`<div class="fx-hint">Mais ${incs.length-40} na busca.</div>`:''}</div>
    </div></div><div class="fx-f" id="mf-f">${mfRodape()}</div>`;
  el.querySelector('.fx-b').scrollTop=top}
function mfRodape(){const n=mfAtivos().length,t=mfLista().length;
  return `<span class="fx-tot">${n?n+' filtro'+(n>1?'s':''):'Sem filtros'}</span><button class="btn primary sm" data-a="mf-fechar">Ver ${num(t)} empreendimento${t===1?'':'s'}</button>`}
function mfAplicar(soResultado){try{localStorage.setItem(MP_MFKEY,JSON.stringify(UI.mf||{}))}catch(e){}desenhaMerc();if(MK.box&&!mfPassa(mkEmp(MK.box)||{}))mkFechar();
  const lg=$('#mp-leg');if(lg)lg.innerHTML=mpLegenda();const b=$('.mapa-area .mp-maisw');if(b)b.outerHTML=mpMaisBotao();
  if(soResultado){const r=$('#mf-f');if(r)r.innerHTML=mfRodape()}else mfDrawer()}
function mfDigitado(el,soResultado){const k=el.dataset.mf,p=el.dataset.p,w={...(UI.mf[k]||{})};
  w[p]=el.type==='date'?(el.value||null):fxLerNum(el.value);UI.mf[k]=w;
  if(w.min==null&&w.max==null||el.type==='date'&&!w.min&&!w.max)delete UI.mf[k];mfAplicar(soResultado)}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="mf-"]');if(!a)return;const k=a.dataset.k,v=a.dataset.v;
  switch(a.dataset.a){
    case 'mf-abrir':MF_ABERTO=!MF_ABERTO;if(MF_ABERTO){mkFechar();if(typeof FX_ABERTO!=='undefined'&&FX_ABERTO){FX_ABERTO=false;fxDrawer()}if(UI.fichaSheet){UI.fichaSheet=null;fichaSheet()}}mfDrawer();a.setAttribute('aria-expanded',MF_ABERTO);break;
    case 'mf-fechar':MF_ABERTO=false;mfDrawer();$('.mapa-area .mf-btn')?.setAttribute('aria-expanded','false');break;
    case 'mf-op':{const c=UI.mf[k]||[];UI.mf[k]=c.includes(v)?c.filter(x=>x!==v):[...c,v];if(!UI.mf[k].length)delete UI.mf[k];mfAplicar();break}
    case 'mf-sem':UI.mf[k]={...UI.mf[k],semInfo:!UI.mf[k]?.semInfo};mfAplicar();break;
    case 'mf-limpar':UI.mf={};UI.mfBusca='';mfAplicar();toast('Filtro da concorrência limpo.');break;
    default:return}
  e.preventDefault();e.stopImmediatePropagation()},true);
document.addEventListener('input',e=>{const el=e.target;if(!el.closest||!el.closest('#mf-dr'))return;e.stopImmediatePropagation();
  if(el.dataset.mfBusca){UI.mfBusca=el.value;const pos=el.selectionStart;mfDrawer();const n=$('#mf-dr [data-mf-busca]');if(n){n.focus();n.setSelectionRange(pos,pos)}return}
  if(el.dataset.mf&&el.type!=='date'){clearTimeout(el._t);el._t=setTimeout(()=>mfDigitado(el,true),250)}},true);
document.addEventListener('change',e=>{const el=e.target;if(!el.closest||!el.closest('#mf-dr')||!el.dataset.mf)return;e.stopImmediatePropagation();mfDigitado(el,false)},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&MF_ABERTO&&!UI.modal){MF_ABERTO=false;mfDrawer();e.preventDefault();e.stopImmediatePropagation()}},true);

/* ---------- marca no mapa: quadrado com um prédio, na cor da situação (pedido do Moisés, 4/nov/2026: a bolinha se perdia
   no meio dos pinos dos terrenos) ---------- */
/* cor = faixa do R$/m²; o desenho = situação; com e.sit só (legenda da situação) fica cinza neutro */
const mkCor=e=>{const f=e?.preco===undefined?'#e8eaed':mkFxInfo(mkFxK(e))[1];return [null,f,mkTinta(f)]};
/* destacado (o empreendimento aberto): fundo escuro, prédio branco e anel azul */
const mkMarcaHtml=(e,dest)=>{const [,f,g]=mkCor(e),d=mkGlifo(e);return `<span class="mk-b${dest?' mk-dest-b':''}" style="background:${dest?'#202124':f};border-color:${dest?'#fff':'rgba(0,0,0,.45)'}">${d?`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="${dest?'#fff':g}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`:''}</span>`};
const mkFxMarca=k=>`<span class="mk-b" style="background:${mkFxInfo(k)[1]};border-color:rgba(0,0,0,.45)"></span>`;
/* no Leaflet os ~2 mil empreendimentos ficam em canvas: o mesmo quadrado desenhado à mão (o clique segue o raio do círculo) */
let MK_SQ=null;
function mkQuadrado(){if(MK_SQ)return MK_SQ;const icos={};
  L.Canvas.include({_mkSq(l){if(!this._drawing||l._empty())return;const p=l._point,c=this._ctx,r=11,o=l.options;
    c.beginPath();if(c.roundRect)c.roundRect(p.x-r,p.y-r,2*r,2*r,6);else c.rect(p.x-r,p.y-r,2*r,2*r);
    c.lineWidth=4;c.strokeStyle='rgba(0,0,0,.25)';c.stroke();c.fillStyle=o.fillColor;c.fill();c.lineWidth=1.5;c.strokeStyle='rgba(0,0,0,.45)';c.stroke();
    c.save();c.translate(p.x-6.5,p.y-6.5);c.scale(13/24,13/24);c.lineWidth=2.6;c.lineCap=c.lineJoin='round';c.strokeStyle=o.color;c.stroke(icos[o.glifo]||(icos[o.glifo]=new Path2D(o.glifo)));c.restore()}});
  return MK_SQ=L.CircleMarker.extend({_updatePath(){this._renderer._mkSq(this)}})}
const mkTitulo=e=>`${e.nome} · ${(MK_SIT[e.sit]||MK_SIT.nao_informado)[0]} · ${mkFxK(e)==='fx'?'sem preço':'R$/m² '+mkFxInfo(mkFxK(e))[0].toLowerCase()}`;
let MERC=null,gMerc=[],MK_CHAVE=null;
/* os pinos só são refeitos quando os dados, o filtro ou o modo do mapa mudam; no Leaflet, círculos em canvas (são ~2 mil) */
function desenhaMerc(){if(!MAPA)return;if(!MK.d){mkCarregar();return}
  const chave=JSON.stringify([UI.mf,!!UI.mpModo,GG,mkOff()]),igual=chave===MK_CHAVE&&(GG?gMerc._mapa===MAPA:MERC&&MERC._mapa===MAPA);
  if(!igual){MK_CHAVE=chave;const off=mkOff(),lista=mfLista().filter(e=>mkVisivel(e,off));const ar=$('.mapa-area');if(ar)ar.dataset.merc=lista.length;
    if(GG){gSet(gMerc,null);gMerc=[];gMerc._mapa=MAPA;const {AdvancedMarkerElement}=gLib.marker;
      lista.forEach(e=>{const d=document.createElement('div');d.className='mk g';d.innerHTML=mkMarcaHtml(e);
        const m=new AdvancedMarkerElement({map:null,position:gLL(e.lat,e.lng),content:d,title:mkTitulo(e),gmpClickable:!UI.mpModo});
        m.addListener?.('click',()=>{if(!UI.mpModo)mkAbrir(e.id)});gMerc.push(m)})}
    else{MERC?.remove();MERC=L.featureGroup();MERC._mapa=MAPA;const rd=MAPA._mkCanvas||(MAPA._mkCanvas=L.canvas({padding:.5}));
      const Q=mkQuadrado();lista.forEach(e=>new Q([e.lat,e.lng],{renderer:rd,radius:12,weight:2,color:mkCor(e)[2],fillColor:mkCor(e)[1],glifo:mkGlifo(e),fillOpacity:1,interactive:!UI.mpModo,bubblingMouseEvents:false})
        .bindTooltip(mkTitulo(e),{direction:'top',offset:[0,-6]}).on('click',ev=>{L.DomEvent.stop(ev);if(!UI.mpModo)mkAbrir(e.id)}).addTo(MERC))}}
  else{const ar=$('.mapa-area');if(ar&&!ar.dataset.merc)ar.dataset.merc=gMerc.length||MERC?.getLayers().length||0}
  mostrarMerc(UI.mpMerc!==false);
  if(!MAPA._mk){MAPA._mk=1;GG?MAPA.addListener('click',mkFecharDoMapa):MAPA.on('click',mkFecharDoMapa);
    if(GG){MAPA.addListener('dragstart',mkFecharMov);MAPA.addListener('zoom_changed',mkFecharMov)}else MAPA.on('dragstart zoomstart',mkFecharMov)}}
function mostrarMerc(on){mkDestaque();if(GG){gMerc.forEach(m=>{if((m.map||null)!==(on?MAPA:null))m.map=on?MAPA:null});return}if(MAPA&&MERC){on?MERC.addTo(MAPA):MERC.remove()}}
/* empreendimento aberto fica destacado (pedido do Moisés, 4/nov/2026): continua aceso depois de fechar o card e só apaga ao abrir outro
   ou sair do Mapa; vai num marcador próprio por cima dos outros (MK.dest) */
let MK_DM=null;
function mkDestaque(){try{if(MK_DM){GG?(MK_DM.map=null):MK_DM.remove()}}catch(x){}MK_DM=null;
  const e=MK.dest&&mkEmp(MK.dest);if(!e||!MAPA||!naMapa()||UI.mpMerc===false||!mkVisivel(e))return;
  if(GG){const d=document.createElement('div');d.className='mk g mk-dest';d.innerHTML=mkMarcaHtml(e,true);
    MK_DM=new gLib.marker.AdvancedMarkerElement({map:MAPA,position:gLL(e.lat,e.lng),content:d,title:mkTitulo(e),zIndex:3000,gmpClickable:!UI.mpModo});MK_DM.addListener?.('click',()=>{if(!UI.mpModo)mkAbrir(e.id)});return}
  MK_DM=L.marker([e.lat,e.lng],{icon:L.divIcon({className:'mk mk-dest',html:mkMarcaHtml(e,true),iconSize:[30,30],iconAnchor:[15,15]}),zIndexOffset:3000,interactive:!UI.mpModo,title:mkTitulo(e)})
    .on('click',ev=>{L.DomEvent.stop(ev);if(!UI.mpModo)mkAbrir(e.id)}).addTo(MAPA)}
window.__mkAbrir=id=>mkAbrir(id);  // roteiros de teste
function mkAtualizarTela(){if(naMapa()){desenhaMerc();const lg=$('#mp-leg');if(lg)lg.innerHTML=mpLegenda();mfDrawer()}
  const sec=$('.mk-sec'),t=UI.route==='terreno'?T(UI.id):null;if(sec&&t){const d=document.createElement('div');d.innerHTML=mkSecaoHtml(t);sec.replaceWith(d.firstElementChild)}}

/* ---------- janela ao tocar no pino ---------- */
/* resumo do empreendimento: os grupos de unidades parecidas (tools/mercado/agrupar.py, regra do Moisés de 4/nov) */
function mkGrupos(e){if(!e.g){const c=MK.d.cg;e.g=e._g.map(a=>{const o={};c.forEach((k,i)=>o[k]=a[i]);
    o.m2=mkM2(o.preco_estoque,o.area_estoque);o.m2p1=mkM2(o.preco_primeiro,o.area_primeiro);o.vso=mkVso(o.vendas,o.estoque);return o});e._g=null}return e.g}
const mkDormN=d=>d==null?'Dorms não informados':d===0?'Studio':d+(d>1?' dorms':' dorm');
const mkVagaN=v=>v==null?'vaga não informada':v===0?'sem vaga':v+(v>1?' vagas':' vaga');
const mkAreaN=g=>(g.area_min===g.area_max?num(g.area_min,2):num(g.area_min,2)+' a '+num(g.area_max,2))+' m²';
/* grupo pequeno que não juntou com nenhum (menos de min_unidades_grupo unidades) é ponto fora da curva: sai do resumo (decisão do Moisés, 4/nov/2026) */
function mkResumoHtml(e){const min=MK.d.cfg?.min_unidades_grupo??3,todos=mkGrupos(e),gs=todos.filter(g=>g.unidades>=min),fora=todos.filter(g=>g.unidades<min).reduce((s,g)=>s+g.unidades,0);
  const nota=fora?`<div class="faint mk-fora">${num(fora)} ${fora>1?'unidades fora do padrão':'unidade fora do padrão'} (sem tipologia com ${min} ou mais parecidas) não ${fora>1?'entram':'entra'} no resumo.</div>`:'';
  if(!gs.length)return nota;
  const linhas=gs.map(g=>`<tr><td><span class="cc-tn">${mkDormN(g.dorm)}${g.pequeno?' <span class="faint" title="Grupo com menos de '+(MK.d.cfg?.min_unidades_grupo??3)+' unidades juntado ao vizinho">· pequeno</span>':''}</span><div class="faint">${mkVagaN(g.vagas)} · ${mkAreaN(g)}</div></td>
    <td class="num">${num(g.unidades)}</td><td class="num">${num(g.estoque)}</td>
    <td class="num">${g.m2!=null?brl(g.m2):g.m2p1!=null?`<span class="faint" title="Sem unidade à venda com preço: pelo primeiro preço visto">${brl(g.m2p1)}*</span>`:'—'}</td><td class="num">${mkPct(g.vso)}</td></tr>`).join('');
  return `<div class="cc-tw"><table class="cc-t mk-t"><thead><tr><th>Tipologia</th><th class="num">Total</th><th class="num">Estoque</th><th class="num">R$/m²</th><th class="num" title="Vendas ÷ (vendas + estoque)">VSO</th></tr></thead><tbody>${linhas}</tbody></table></div>${nota}`}
function mkBoxHtml(e){const m2=mkM2(e.preco,e.area),vso=mkVso(e.vendas,e.estoque),pct=e.unidades?Math.round(100*e.estoque/e.unidades):0,dias=mkDias();
  const kv=(k,v,f)=>`<div class="mk-kv"><span class="muted">${k}</span><span class="num">${v}</span>${f?`<span class="faint">${f}</span>`:''}</div>`;
  return `<div class="cc-box mk-box" role="dialog" aria-label="${esc(e.nome)}">
  <div class="cc-hd"><div class="cc-ti"><div class="cc-n">${esc(e.nome)}</div><div class="muted">${esc([e.inc,(MK_SIT[e.sit]||MK_SIT.nao_informado)[0],e.bairro].filter(Boolean).join(' · '))}</div></div>${mkFixarBtn()}<button type="button" class="iconbtn" data-a="mk-x" aria-label="Fechar" title="Fechar (Esc)">${ic('close',20)}</button></div>
  <div class="cc-k mk-k"><div class="cc-big">${m2!=null?ccM2(Math.round(m2)):'Sem estoque com preço'}</div><div class="faint">${m2!=null?'preço médio por m² das unidades à venda':e.estoque?'as unidades à venda estão sem preço na tabela':'nenhuma unidade à venda'}</div><div class="mk-prog">Enquadramento social: <b>${e.prog==='sim'?'Sim':e.prog==='nao'?'Não':'Não informado'}</b></div></div>
  <div class="mk-grid">${kv('Lançamento',mkData(e.lanc))}${kv('Entrega',mkData(e.ent))}${kv('Unidades',num(e.unidades))}${kv('Estoque',num(e.estoque),pct+'%')}
    ${kv('Vendas',num(e.vendas),mkPeriodo())}${kv('VSO',mkPct(vso),dias?`em ${dias} dias`:'')}</div>
  ${mkResumoHtml(e)}
  <div class="mk-tab"><button type="button" class="btn text" data-a="mk-tabela" data-id="${esc(e.id)}">${ic('doc',18)}Ver tabela completa</button></div>
  <div class="cc-meta faint mk-nota">Monitor de mercado (Órulo), retrato de ${mkData(MK.d.gerado)} · Tipologias agrupadas pelo resumo do empreendimento · R$/m² das unidades à venda (* pelo primeiro preço visto, sem unidade à venda) · VSO = vendas ÷ (vendas + à venda)${mkPeriodo()?', '+mkPeriodo():''}</div></div>`}
function mkBox(){const area=$('.mapa-area');let el=$('#mk-box');const e=MK.box&&naMapa()?mkEmp(MK.box):null;
  if(!e||!area){el?.remove();if(!e)MK.box=null;return}
  if(!el||el.parentNode!==area){el?.remove();el=document.createElement('div');el.id='mk-box';area.appendChild(el)}
  el.innerHTML=mkBoxHtml(e);mkSaida(el)}
/* o card fecha sozinho 1 s depois que o mouse sai dele (só depois de ter entrado) e quando o mapa se move (pedido do Moisés, 5/nov/2026; nunca no toque nem com a tabela completa aberta);
   o olhinho ao lado do X o fixa aberto, guardado no navegador (pedido do Moisés, 5/nov/2026) */
const MK_FKEY='bkm-terrenos-concorrencia-fixa';let MK_T=null;
const mkFixa=()=>{try{return localStorage.getItem(MK_FKEY)==='1'}catch(e){return false}};
function mkFixarBtn(){const f=mkFixa();return `<button type="button" class="iconbtn mk-fixar" data-a="mk-fixar" aria-pressed="${f}" title="${f?'Soltar (volta a fechar sozinho)':'Fixar aberto'}" aria-label="${f?'Soltar o card':'Fixar o card aberto'}">${ic('olho',18)}</button>`}
function mkSaida(el){if(el.__mkH)return;el.__mkH=true;
  el.addEventListener('pointerenter',e=>{if(e.pointerType!=='mouse')return;clearTimeout(MK_T);MK.dentro=true});
  el.addEventListener('pointerleave',e=>{if(e.pointerType!=='mouse'||!MK.dentro||mkFixa()||TOQUE())return;clearTimeout(MK_T);
    MK_T=setTimeout(()=>{if(UI.modal||el.matches(':hover')||el.querySelector(':focus-visible')||mkFixa())return;mkFechar()},1000)})}
window.addEventListener('click',e=>{const b=e.target.closest?.('[data-a="mk-fixar"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
  const f=!mkFixa();try{localStorage.setItem(MK_FKEY,f?'1':'0')}catch(x){}clearTimeout(MK_T);b.outerHTML=mkFixarBtn();$('#mk-box [data-a="mk-fixar"]')?.focus()},true);
function mkAbrir(id){clearTimeout(MK_T);MK.dentro=false;MK.box=id;MK.dest=id;mkDestaque();MK.abertoEm=Date.now();ccFechar();if(UI.mpSel)mpSelecionar(null);if(UI.fichaSheet){UI.fichaSheet=null;fichaSheet()}mkBox()}
function mkFechar(){clearTimeout(MK_T);if(!MK.box)return false;MK.box=null;mkBox();return true}
const mkFecharDoMapa=()=>{if(!mkFixa()&&Date.now()-MK.abertoEm>350)mkFechar()};
const mkFecharMov=()=>{if(MK.box&&!mkFixa()&&Date.now()-MK.abertoEm>350)mkFechar()};

/* ---------- ganchos ---------- */
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="mk-x"],[data-a="mp-merc"],[data-a="mk-arv"],[data-a="mk-sit"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();
  const leg=()=>{const lg=$('#mp-leg');if(lg)lg.innerHTML=mpLegenda()};
  if(a.dataset.a==='mk-arv'){UI.mkArv=!UI.mkArv;leg();$('#mp-leg [data-a="mk-arv"]')?.focus();return}
  if(a.dataset.a==='mk-sit'){const o=mkOff(),v=a.dataset.v;UI.mkOff=o.includes(v)?o.filter(x=>x!==v):[...o,v];
    if(MK.box&&!mkVisivel(mkEmp(MK.box)))mkFechar();desenhaMerc();leg();$(`#mp-leg [data-a="mk-sit"][data-v="${v}"]`)?.focus();return}
  if(a.dataset.a==='mk-x')mkFechar();
  else{UI.mpMerc=UI.mpMerc===false;mostrarMerc(UI.mpMerc);if(!UI.mpMerc)mkFechar();leg()}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!UI.modal&&MK.box){mkFechar();e.preventDefault();e.stopImmediatePropagation()}},true);
const _lDesenhaConcMk=L_desenhaConc;L_desenhaConc=function(){const r=_lDesenhaConcMk.apply(this,arguments);desenhaMerc();return r};
const _gDesenhaConcMk=G_desenhaConc;G_desenhaConc=function(){const r=_gDesenhaConcMk.apply(this,arguments);desenhaMerc();return r};
/* legenda: "Concorrência" liga e desliga a camada; a seta abre as faixas do R$/m² e as situações, cada linha liga e desliga a sua (pedidos do Moisés, 4 e 5/nov/2026) */
const _mpLegendaMk=mpLegenda;mpLegenda=function(){const h=_mpLegendaMk.apply(this,arguments),todos=MK.d?mfLista():null,off=mkOff(),ab=!!UI.mkArv;
  const cont={};(todos||[]).forEach(e=>{const k=mkSitK(e),f=mkFxK(e);cont[k]=(cont[k]||0)+1;cont[f]=(cont[f]||0)+1});const n=todos?todos.filter(e=>mkVisivel(e,off)).length:null;
  let item=`<div class="lg-row"><button type="button" class="lg-sb" data-a="mk-arv" aria-expanded="${ab}" aria-label="${ab?'Fechar':'Abrir'} as situações da concorrência"><span class="lg-s${ab?' ab':''}" aria-hidden="true">${ic('chev',14)}</span></button><button type="button" class="lg-i" data-a="mp-merc" aria-pressed="${UI.mpMerc!==false}"><span class="lg-poi">${mkMarcaHtml({sit:'pronto'})}</span>Concorrência<span class="n">${n==null?(MK.erro?'—':'…'):num(n)}</span></button></div>`;
  /* primeiro as faixas do R$/m² médio, depois a situação; cada linha liga e desliga a sua (pedido do Moisés, 5/nov/2026) */
  const linha=(k,marca,nome)=>`<button type="button" class="lg-i lg-a lg-msit" style="--p:2" data-a="mk-sit" data-v="${k}" aria-pressed="${!off.includes(k)}"${UI.mpMerc===false?' disabled':''}><span class="lg-poi">${marca}</span>${esc(nome)}<span class="n">${num(cont[k])}</span></button>`;
  if(ab&&todos)item+=`<div class="lg-sub">R$/m² médio à venda</div>`+[...MK_FX.map((f,i)=>'f'+i),'fx'].filter(k=>cont[k]).map(k=>linha(k,mkFxMarca(k),mkFxInfo(k)[0])).join('')
    +`<div class="lg-sub">Situação</div>`+Object.keys(MK_SIT).filter(k=>cont[k]).map(k=>linha(k,mkMarcaHtml({sit:k}),MK_SIT[k][0])).join('');
  const i=h.indexOf('data-a="mp-conc"');if(i<0)return h+item;const fim=h.indexOf('</button>',i)+9;return h.slice(0,fim)+item+h.slice(fim)};
const _ccAbrirMk=ccAbrir;ccAbrir=function(){mkFechar();return _ccAbrirMk.apply(this,arguments)};
const _mpSelecionarMk=mpSelecionar;mpSelecionar=function(id){if(id)mkFechar();return _mpSelecionarMk.apply(this,arguments)};
const _fichaSheetMk=fichaSheet;fichaSheet=function(){if(UI.fichaSheet){mkFechar();if(MF_ABERTO){MF_ABERTO=false;mfDrawer()}}return _fichaSheetMk.apply(this,arguments)};
/* os três pontinhos na barra do mapa (filtros e tipo de mapa) */
const _rdBarraBotaoMk=rdBarraBotao;rdBarraBotao=function(){return _rdBarraBotaoMk.apply(this,arguments)+mpMaisBotao()};
const _posRenderMk=posRender;posRender=function(){_posRenderMk.apply(this,arguments);if(!naMapa()){MK.box=null;MK.dest=null;MF_ABERTO=false}mkBox();mfDrawer()};

/* ---------- ficha do terreno, aba Entorno: R$/m² médio e VSO médio a 1, 2 e 3 km ---------- */
const MK_NAO_ENTREGUE=['lancamento','breve_lancamento','em_obras'];
function mkRaios(t){const ps=mkEmps().map(e=>({e,d:distKm(t.lat,t.lng,e.lat,e.lng)})).filter(x=>x.d<=MK_RAIOS.at(-1));
  return MK_RAIOS.flatMap(r=>[['sim','Com programa social'],['nao','Sem programa social']].map(([pg,l])=>{const xs=ps.filter(x=>x.d<=r&&x.e.prog===pg);let sp=0,sa=0,v=0,est=0;
    xs.forEach(({e})=>{if(e.preco!=null&&e.area>0){sp+=e.preco;sa+=e.area}v+=e.vendas;est+=e.estoque});
    return {r,pg,l,n:xs.length,est,v,m2:sa?sp/sa:null,vso:mkVso(v,est)}}))}
function mkSecaoHtml(t){if(t.lat==null)return '';
  const cab=`<div class="sec-h"><h2>Concorrência no entorno</h2></div>`;
  if(!MK.d){mkCarregar();return `<section class="sec mk-sec" data-bloco-item="mercado">${cab}<div class="sec-b"><div class="muted">${MK.erro?'Dados da concorrência indisponíveis nesta visualização.':'Carregando os dados da concorrência…'}</div></div></section>`}
  const rs=mkRaios(t),dias=mkDias(),raio=UI.mkRaio||2;
  const corpo=!rs.some(x=>x.n)?`<div class="muted">Nenhum empreendimento do monitor a até ${MK_RAIOS.at(-1)} km.</div>`
    :`<div class="tblwrap"><table class="mini-tbl mk-cat"><thead><tr><th>Raio</th><th>Programa social</th><th class="r">Empreend.</th><th class="r">Estoque</th><th class="r">R$/m² médio</th><th class="r">VSO médio</th></tr></thead><tbody>
      ${rs.map((x,i)=>`<tr${i%2?' class="mk-r2"':''}><td class="mk-pr">${i%2?`<span class="mk-rep">Até ${x.r} km</span>`:`Até ${x.r} km`}</td><td class="mk-pg" data-l="Programa social">${x.pg==='sim'?'Com':'Sem'}</td><td class="r" data-l="Empreend.">${num(x.n)}</td><td class="r" data-l="Estoque">${num(x.est)}</td>
        <td class="r" data-l="R$/m² médio">${x.m2!=null?brl(x.m2):'—'}</td><td class="r" data-l="VSO médio">${mkPct(x.vso)}</td></tr>`).join('')}</tbody></table></div>`;
  const lista=mkEmps().filter(e=>MK_NAO_ENTREGUE.includes(e.sit)).map(e=>({e,d:distKm(t.lat,t.lng,e.lat,e.lng)})).filter(x=>x.d<=raio).sort((a,b)=>a.d-b.d);
  const seg=`<div class="seg" role="group" aria-label="Raio da lista">${MK_RAIOS.map(k=>`<button type="button" data-a="mk-raio" data-v="${k}" aria-pressed="${raio===k}">${k} km</button>`).join('')}</div>`;
  const itens=lista.map(({e,d})=>{const m2=mkM2(e.preco,e.area);
    return `<details class="mk-it" data-id="${esc(e.id)}"><summary><span class="mk-it-n"><b>${esc(e.nome)}</b><span class="faint">${esc([e.inc,(MK_SIT[e.sit]||MK_SIT.nao_informado)[0],num(d,1)+' km',e.prog==='sim'?'programa social':''].filter(Boolean).join(' · '))}</span></span>
      <span class="mk-it-k num">${m2!=null?brl(m2)+'/m²':'—'}<span class="faint">VSO ${mkPct(mkVso(e.vendas,e.estoque))}</span></span>${ic('chev',18)}</summary>${mkResumoHtml(e)||'<div class="muted">Sem unidades no monitor.</div>'}</details>`}).join('');
  return `<section class="sec mk-sec" data-bloco-item="mercado">${cab}<div class="sec-b">${corpo}
    <div class="hint">Monitor de mercado (Órulo), retrato de ${mkData(MK.d.gerado)}. Programa social: a marca do Órulo no empreendimento. R$/m² médio: soma dos preços das unidades à venda ÷ soma das áreas.
    VSO médio: vendas ÷ (vendas + estoque), de ${mkPeriodo()}${dias?` (${dias} dias)`:''}.</div>
    <div class="mk-lh"><h3>Não entregues no entorno <span class="faint">${num(lista.length)}</span></h3>${seg}</div>
    ${itens?`<div class="mk-lista">${itens}</div>`:`<div class="muted">Nenhum empreendimento em lançamento ou em obras a até ${raio} km.</div>`}
    <div class="hint">Cada um abre o resumo do empreendimento: as unidades agrupadas em tipologias parecidas (dormitórios, vagas, área e preço por m²), com o R$/m² das unidades à venda e o VSO de cada uma.</div></div></section>`}
document.addEventListener('click',e=>{const a=e.target.closest('.mk-sec [data-a="mk-raio"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();
  UI.mkRaio=+a.dataset.v;const sec=a.closest('.mk-sec'),t=T(UI.id);if(sec&&t){const d=document.createElement('div');d.innerHTML=mkSecaoHtml(t);sec.replaceWith(d.firstElementChild);$(`.mk-sec [data-a="mk-raio"][data-v="${a.dataset.v}"]`)?.focus()}},true);
/* na aba Entorno da ficha, depois da renda e da população */
const _abaEntornoMk=abaEntorno;abaEntorno=function(t){const h=_abaEntornoMk.apply(this,arguments),i=h.lastIndexOf('</div>');return h.slice(0,i)+mkSecaoHtml(t)+h.slice(i)};

/* ---------- tabela completa do empreendimento (popup; decisão do Moisés, 4/nov/2026) ----------
   "Ver tabela completa" no card abre um popup com o cabeçalho (incorporadora, CNPJ, endereço, torres, tipo, enquadramento
   social, link do Órulo) e todas as unidades ativas, cada uma com torre, andar, número, tipo, dormitórios (suítes),
   vagas, área, situação, preço atual, R$/m², primeiro preço visto e o período da venda medida pelo monitor.
   Os dados vêm ao vivo do banco do monitor pela função só de leitura public.im_tabela_empreendimento, chamada com a chave
   publicável (os dados do monitor já ficam abertos a quem tem o link, decisão do Moisés). */
const MK_API={url:'https://mghqcsycuurjezoiiyfp.supabase.co',chave:'sb_publishable_nGsggiCrChcI-Lfo0pTAnA_bRyllIKS'};
const MK_SIT_UN={disponivel:'À venda',reservada:'Reservada',vendida:'Vendida'};
const MK_TP_UN={apartamento:'Apto',garden:'Garden',cobertura:'Cobertura',duplex:'Duplex',studio:'Studio',loft:'Loft',casa:'Casa',sala:'Sala',loja:'Loja'};
const MKT={id:null,estado:null,d:null,erro:null,f:'todas'};
function mkTabelaAbrir(id){MKT.id=id;MKT.estado='carregando';MKT.d=null;MKT.erro=null;MKT.f='todas';UI.modal='mk-tabela';renderModal();
  const pedir=()=>fetch(MK_API.url+'/rest/v1/rpc/im_tabela_empreendimento',{method:'POST',headers:{apikey:MK_API.chave,'Content-Type':'application/json'},body:JSON.stringify({p_id:id})})
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});
  pedir().catch(()=>pedir())  // uma nova tentativa: o primeiro pedido de um empreendimento grande pode passar do tempo do banco
    .then(j=>{if(MKT.id!==id)return;if(!j||!j.empreendimento)throw new Error('não encontrado');MKT.d=j;MKT.estado='ok';if(UI.modal==='mk-tabela')renderModal()})
    .catch(e=>{if(MKT.id!==id)return;MKT.estado='erro';MKT.erro=e.message;if(UI.modal==='mk-tabela')renderModal()})}
const mkSimNao=v=>v==='sim'?'Sim':v==='nao'?'Não':'Não informado';
function mkTabelaHtml(){const fechar=`<button class="iconbtn" data-a="close" aria-label="Fechar">${ic('close')}</button>`,e0=mkEmp(MKT.id);
  const tit=esc(MKT.d?.empreendimento?.nome||e0?.nome||'Empreendimento');
  if(MKT.estado!=='ok')return `<div class="dh"><div><h2>${tit}</h2></div>${fechar}</div><div class="mkt-msg ${MKT.estado==='erro'?'':'muted'}">${MKT.estado==='erro'
    ?`Não foi possível trazer a tabela do monitor de mercado (${esc(MKT.erro||'erro')}). <button class="btn text" data-a="mk-tabela" data-id="${esc(MKT.id)}">Tentar de novo</button>`
    :'Trazendo a tabela do monitor de mercado…'}</div>`;
  const E=MKT.d.empreendimento,U=MKT.d.unidades||[],venda=u=>u.situacao==='disponivel'||u.situacao==='reservada';
  const cont={todas:U.length,venda:U.filter(venda).length,vendida:U.filter(u=>u.situacao==='vendida').length};
  const lista=MKT.f==='venda'?U.filter(venda):MKT.f==='vendida'?U.filter(u=>u.situacao==='vendida'):U;
  const tp=t=>t?(MK_TP_UN[t]||t.charAt(0).toUpperCase()+t.slice(1)):'—',ar=a=>a==null?'—':num(a,2)+' m²';
  const per=u=>{if(!u.vendida_de)return '';if(u.vendida_de===u.vendida_ate)return mkData(u.vendida_de);const a=mkData(u.vendida_de),b=mkData(u.vendida_ate);return `${a.slice(6)===b.slice(6)?a.slice(0,5):a} a ${b}`};
  const kv=(k,v)=>`<div class="mkt-kv"><span class="muted">${k}</span><span>${v}</span></div>`;
  const seg=(k,n)=>`<button type="button" class="mkt-f${MKT.f===k?' on':''}" data-a="mk-tabela-f" data-f="${k}" aria-pressed="${MKT.f===k}">${{todas:'Todas',venda:'À venda',vendida:'Vendidas'}[k]} <span class="num">${num(n)}</span></button>`;
  return `<div class="dh"><div><h2>${tit}</h2><div class="muted" style="margin-top:4px">${esc([(MK_SIT[E.situacao]||MK_SIT.nao_informado)[0],E.bairro].filter(Boolean).join(' · '))}</div></div>${fechar}</div>
  <div class="mkt-cab">${kv('Incorporadora',esc(E.incorporadora||'Não informada'))}${kv('CNPJ',E.cnpj?esc(E.cnpj):'Não informado')}${kv('Endereço',esc(E.endereco||'Não informado'))}
    ${kv('Torres',E.torres==null?'—':num(E.torres))}${kv('Tipo',esc([E.tipo,E.finalidade].filter(Boolean).join(', ')||'—'))}${kv('Enquadramento social',mkSimNao(E.programa_social))}
    ${kv('Lançamento',mkData(E.lancamento))}${kv('Entrega',mkData(E.entrega))}${kv('Unidades no Órulo',E.unidades==null?'—':num(E.unidades))}
    ${E.link?kv('Fonte',`<a href="${esc(E.link)}" target="_blank" rel="noopener">Ver no Órulo</a>`):''}</div>
  <div class="mkt-fs" role="group" aria-label="Situação">${seg('todas',cont.todas)}${seg('venda',cont.venda)}${seg('vendida',cont.vendida)}</div>
  ${lista.length?`<div class="mkt-w"><table class="mkt"><thead><tr><th>Torre</th><th class="n">Andar</th><th>Unidade</th><th>Tipo</th><th class="n">Dorm.</th><th class="n">Vagas</th><th class="n">Área</th><th>Situação</th><th class="n">Preço</th><th class="n">R$/m²</th><th class="n">Primeiro preço</th><th>Vendida</th></tr></thead><tbody>
  ${lista.map(u=>{const m2=mkM2(u.preco,u.area);return `<tr class="mkt-${u.situacao||'x'}">
    <td data-l="Torre">${esc(u.torre||'—')}</td><td class="n" data-l="Andar">${u.andar==null?'—':u.andar}</td><td data-l="Unidade"><b>${esc(u.numero||'—')}</b></td><td data-l="Tipo">${esc(tp(u.tipo))}</td>
    <td class="n" data-l="Dorm.">${u.dormitorios==null?'—':u.dormitorios}${u.suites?`<span class="faint"> (${u.suites} suíte${u.suites>1?'s':''})</span>`:''}</td><td class="n" data-l="Vagas">${u.vagas==null?'—':u.vagas}</td><td class="n" data-l="Área">${ar(u.area)}</td>
    <td data-l="Situação"><span class="mkt-s">${MK_SIT_UN[u.situacao]||'Não informada'}</span></td><td class="n" data-l="Preço">${u.preco==null?'—':brl(u.preco)}</td><td class="n" data-l="R$/m²">${m2==null?'—':brl(m2)}</td>
    <td class="n" data-l="Primeiro preço">${u.primeiro_preco==null?'—':`${brl(u.primeiro_preco)}<span class="faint mkt-sub">${u.primeiro_preco_em?'em '+mkData(u.primeiro_preco_em):''}</span>`}</td>
    <td data-l="Vendida">${u.vendida_de?(u.vendida_de===u.vendida_ate?mkData(u.vendida_de):`${mkData(u.vendida_de)}<span class="mkt-sub">a ${mkData(u.vendida_ate)}</span>`):'<span class="faint">—</span>'}</td></tr>`}).join('')}</tbody></table><div class="mkt-m">${lista.map(u=>{const m2=mkM2(u.preco,u.area),pv=per(u);return `<div class="mkt-r mkt-${u.situacao||'x'}"><div class="mkt-r1"><b>${esc([u.torre?'Torre '+u.torre:'',u.numero].filter(Boolean).join(' · ')||'—')}</b>${u.andar!=null?`<span class="muted"> · ${u.andar}º andar</span>`:''}<span class="mkt-s">${MK_SIT_UN[u.situacao]||'Não informada'}</span></div>
    <div class="muted">${[tp(u.tipo),u.dormitorios!=null?u.dormitorios+' dorm.'+(u.suites?` (${u.suites} suíte${u.suites>1?'s':''})`:''):'',u.vagas!=null?u.vagas+' vaga'+(u.vagas===1?'':'s'):'',ar(u.area)].filter(x=>x&&x!=='—').join(' · ')}</div>
    <div>${u.preco!=null?`<b>${brl(u.preco)}</b>${m2!=null?`<span class="muted"> · ${brl(m2)}/m²</span>`:''}`:'<span class="muted">Sem preço</span>'}${u.primeiro_preco!=null?`<span class="faint"> · primeiro ${brl(u.primeiro_preco)}${u.primeiro_preco_em?' em '+mkData(u.primeiro_preco_em):''}</span>`:''}</div>
    ${pv?`<div class="faint">Vendida ${pv.includes(' a ')?'entre '+pv.replace(' a ',' e '):'em '+pv}</div>`:''}</div>`}).join('')}</div></div>`:'<div class="mkt-msg muted">Nenhuma unidade nesta situação.</div>'}
  <div class="faint mkt-nota">Monitor de mercado (Órulo), ao vivo. Unidades ativas, residenciais. Preço e situação da última coleta; "Vendida" é o período em que o monitor viu a venda (as de antes do monitor ficam sem data). Enquadramento social é do empreendimento: o Órulo não diz quais unidades são HIS ou HMP.</div>`}
const _renderModalMkt=renderModal;renderModal=function(){if(UI.modal!=='mk-tabela')return _renderModalMkt.apply(this,arguments);
  const el=$('#modal'),rol=el.querySelector('.mkt-w')?.scrollTop||0;el.innerHTML=`<div class="scrim" data-a="scrim"><div class="dialog mkt-dlg" role="dialog" aria-modal="true">${mkTabelaHtml()}</div></div>`;if(rol){const w=el.querySelector('.mkt-w');if(w)w.scrollTop=rol}};
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="mk-tabela"],[data-a="mk-tabela-f"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();
  if(a.dataset.a==='mk-tabela')mkTabelaAbrir(a.dataset.id);else{MKT.f=a.dataset.f;renderModal();const w=$('#modal .mkt-w');if(w)w.scrollTop=0}},true);

/* ===================== clique fora fecha o que está aberto no mapa ===================== */
/* Um clique (não o arraste) fora fecha a legenda, a escala da renda/densidade, a busca, o menu dos três pontinhos, o quadro do lugar do Google
   e o card da concorrência (pedido do Moisés, 5/nov/2026). A legenda e o card fixados no olhinho ficam. Dentro do mapa, o quadro do lugar e o
   card já fecham pelo clique no mapa (que também tira a seleção), por isso aqui só os cliques fora dele. */
let FORA0=null;
document.addEventListener('pointerdown',e=>{FORA0={x:e.clientX,y:e.clientY,t:e.target}},true);
document.addEventListener('pointerup',e=>{const p=FORA0;FORA0=null;if(!p||Math.hypot(e.clientX-p.x,e.clientY-p.y)>6||!naMapa()||UI.modal)return;
  const a=p.t;if(!a?.closest||a.closest('.toast,#toast'))return;
  const d=$('.mapa-area .mp-legenda');if(d?.open&&!lgFixa()&&!a.closest('.mp-legenda'))d.open=false;
  const r=$('#rd-leg');if(r?.open&&!a.closest('#rd-leg'))r.open=false;
  if(UI.mpBusca&&!a.closest('.mapa-area .mp-busca'))mpBuscaAbrir(false);
  if(a.closest('#mapa'))return;
  if(typeof lugarFechar==='function'&&!a.closest('.gm-style-iw,.gm-style-iw-c'))lugarFechar();
  if(MK.box&&!mkFixa()&&!a.closest('#mk-box'))mkFechar()},true);

/* ===================== régua ===================== */
/* Régua (pedido do Moisés, 5/nov/2026): botão no canto, acima da minha localização (e no menu dos três pontinhos), que fica azul enquanto
   ligada e vale até ser desligada. Cada clique no mapa marca um ponto e a linha mede o caminho, trecho a trecho e no total; clicar no
   primeiro ponto (com 3 ou mais) fecha a forma e mede a área; o clique seguinte começa outra medida. Não segue a rua.
   Teclas: Backspace apaga o último ponto, Del ou Esc apagam o desenho (sem desenho, desligam); Ctrl+Z desfaz. Clique direito num
   ponto: Excluir ponto. */
UI.rg=null;let rgCam=[];
const rgDist=(a,b)=>distKm(a[0],a[1],b[0],b[1])*1000;
const rgM=v=>v>=1000?num(v/1000,2)+' km':num(Math.round(v))+' m',rgA=v=>v>=1e6?num(v/1e6,2)+' km²':m2(Math.round(v));
function rgTotal(){const p=UI.rg?.pts||[];let t=0;for(let i=1;i<p.length;i++)t+=rgDist(p[i-1],p[i]);if(UI.rg?.fechado&&p.length>2)t+=rgDist(p.at(-1),p[0]);return t}
function rgBotao(){document.querySelectorAll('.mp-cb[data-a="rg-abrir"]').forEach(b=>b.setAttribute('aria-pressed',String(UI.mpModo==='regua')))}
function rgAbrir(){if(UI.mpModo&&UI.mpModo!=='regua')return;if(UI.mpModo==='regua'){rgSair();return}
  lugarFechar?.();mkFechar();if(UI.mpSel)mpSelecionar(null);UI.mpModo='regua';UI.rg={pts:[],fechado:false};mpRefresh();rgBotao();
  toast(TOQUE()?'Toque no mapa para marcar os pontos.':'Clique no mapa para marcar os pontos e no primeiro ponto para medir a área. Backspace apaga o último ponto; Del ou Esc apagam o desenho e, sem desenho, desligam a régua.')}
function rgSair(){rgCtxFechar();UI.mpModo=null;UI.rg=null;rgDesenha();mpRefresh();rgBotao()}
function rgClique(lat,lng){const R=UI.rg;if(!R)return;
  if(Date.now()-(UI.rgCtxEm||0)<400)return;
  const a=UI.pdAnt,b=UI.pdUlt;if(!TOQUE()&&((UI.cliqueN||1)>=2||(a&&b&&b.t-a.t<400&&Math.hypot(b.x-a.x,b.y-a.y)<8)))return; /* o segundo clique de um duplo clique não marca outro ponto */
  if(R.fechado){R.pts=[];R.fechado=false}
  R.pts.push([lat,lng]);rgAtualizar()}
function rgFechar(){const R=UI.rg;if(!R||R.pts.length<3||R.fechado)return;R.fechado=true;rgAtualizar()}
function rgAtualizar(){rgDesenha();const m=$('#mp-modo');if(m)m.innerHTML=modoBanner();rgBotao()}
/* apaga um ponto; a forma fechada com menos de 3 volta a ser linha */
function rgExcluir(i){const R=UI.rg;if(!R||!R.pts[i])return;R.pts.splice(i,1);if(R.pts.length<3)R.fechado=false;rgAtualizar()}
function rgCtxFechar(){UI.rgCtx=false;$('.rg-ctx')?.remove()}
function rgCtx(i,x,y){rgCtxFechar();const area=$('.mapa-area');if(!area||!UI.rg)return;const ar=area.getBoundingClientRect();
  const m=document.createElement('div');m.className='mp-ctx rg-ctx';m.setAttribute('role','menu');
  m.innerHTML=`<div class="v-t">Ponto ${i+1} de ${UI.rg.pts.length}</div><button type="button" role="menuitem" class="crit" data-a="rg-excluir" data-i="${i}">Excluir ponto</button>`;
  area.appendChild(m);m.style.left=Math.max(8,Math.min(ar.width-m.offsetWidth-8,x-ar.left))+'px';m.style.top=Math.max(8,Math.min(ar.height-m.offsetHeight-8,y-ar.top))+'px';
  UI.rgCtx=true;m.querySelector('button').focus({preventScroll:true})}
function rgBanner(){const R=UI.rg||{pts:[]},n=R.pts.length,t=rgTotal(),ar=R.fechado?areaPoly(R.pts):null;
  return `<span class="mp-q mp-fina rg-b">${n<2?'Régua: clique no mapa para medir':`${R.fechado?'Perímetro':'Distância'} ${rgM(t)}${ar?` · área ${rgA(ar)}`:''}`}</span>`
    +`<button class="btn sm text" data-a="rg-desfazer" ${n?'':'disabled'}>Desfazer</button><button class="btn sm text" data-a="rg-limpar" ${n?'':'disabled'}>Limpar</button><button class="btn sm primary" data-a="mp-sair">Sair</button>`}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-a="rg-abrir"],[data-a="rg-desfazer"],[data-a="rg-limpar"],[data-a="rg-excluir"]');if(!b)return;
  const R=UI.rg;if(b.dataset.a==='rg-abrir')rgAbrir();else if(b.dataset.a==='rg-excluir'){rgCtxFechar();rgExcluir(+b.dataset.i)}
  else if(R){if(b.dataset.a==='rg-limpar'){R.pts=[];R.fechado=false}else if(R.fechado)R.fechado=false;else R.pts.pop();rgAtualizar()}});
/* o menu do ponto fecha no clique fora dele (o clique no mapa que o fecha não marca ponto: rgClique) */
/* (pela marca UI.rgCtx: o fechar do menu do clique direito, ctxFechar, também tira este da página) */
document.addEventListener('pointerdown',e=>{if(!UI.rgCtx||e.target.closest('.rg-ctx'))return;if(e.target.closest('#mapa'))UI.rgCtxEm=Date.now();rgCtxFechar()},true);
window.addEventListener('keydown',e=>{if(UI.mpModo!=='regua'||UI.modal||e.target.matches('input,textarea,select'))return;const R=UI.rg;
  if(e.key==='Escape'&&$('.rg-ctx'))rgCtxFechar();
  /* Esc faz o mesmo que o Del (pedido do Moisés, 5/nov/2026): com desenho, apaga; sem desenho, desliga a régua */
  else if(e.key==='Delete'||e.key==='Escape'){rgCtxFechar();if(R?.pts.length){R.pts=[];R.fechado=false;rgAtualizar()}else rgSair()}
  else if(e.key==='Backspace'){rgCtxFechar();if(R?.pts.length)rgExcluir(R.pts.length-1)}
  else return;
  e.preventDefault();e.stopImmediatePropagation()},true);
document.addEventListener('keydown',e=>{if(UI.mpModo!=='regua'||!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z'||e.target.matches('input,textarea,select'))return;const R=UI.rg;if(!R?.pts.length)return;if(R.fechado)R.fechado=false;else R.pts.pop();rgAtualizar();e.preventDefault()});
/* rótulo de cada trecho no meio dele, e do total no último ponto */
function rgRotulos(){const R=UI.rg;if(!R)return [];const p=R.pts,out=[],seg=(a,b)=>out.push({ll:[(a[0]+b[0])/2,(a[1]+b[1])/2],t:rgM(rgDist(a,b)),c:'rg-seg'});
  for(let i=1;i<p.length;i++)seg(p[i-1],p[i]);if(R.fechado&&p.length>2)seg(p.at(-1),p[0]);
  if(p.length>1&&!R.fechado&&p.length>2)out.push({ll:p.at(-1),t:rgM(rgTotal()),c:'rg-tot'});
  if(R.fechado){const ar=areaPoly(p);if(ar){const c=centroPoly?centroPoly(p):p[0];out.push({ll:c,t:rgA(ar),c:'rg-tot'})}}
  return out}
/* com a régua ligada o cursor do mapa é a seta, não a mãozinha (pedido do Moisés, 5/nov/2026): no Google pelo draggableCursor, no Leaflet pela classe */
function rgCursor(){const on=UI.mpModo==='regua';$('#mapa')?.classList.toggle('regua',on);if(GG&&MAPA?.setOptions)MAPA.setOptions({draggableCursor:on?'default':null})}
function rgDesenha(){if(!MAPA)return;rgCursor();if(GG){rgCam.forEach(x=>x.setMap?x.setMap(null):(x.map=null));rgCam=[]}else{rgCam.forEach(x=>MAPA.removeLayer(x));rgCam=[]}
  const R=UI.rg;if(!R||UI.mpModo!=='regua'||!R.pts.length)return;const p=R.pts,cor='#0b57d0';
  /* um ponto sem tamanho no lugar exato, com o desenho centrado nele (vale para o Google e o Leaflet) */
  const w=el=>{const d=document.createElement('div');d.className='rg-w';d.appendChild(el);return d};
  const ponto=(q,i)=>{const el=document.createElement('div');el.className='rg-pt'+(i===0&&p.length>2&&!R.fechado?' rg-ini':'');
    /* o clique num ponto não marca outro em cima dele; no primeiro (com 3 ou mais) fecha a forma; o direito abre Excluir ponto */
    el.addEventListener('click',ev=>{ev.stopPropagation();if(i===0&&p.length>2&&!R.fechado)rgFechar()});
    el.addEventListener('contextmenu',ev=>{ev.preventDefault();ev.stopPropagation();rgCtx(i,ev.clientX,ev.clientY)});return w(el)};
  const rot=o=>{const el=document.createElement('div');el.className='rg-rot '+o.c;el.textContent=o.t;return w(el)};
  if(GG){const ll=q=>gLL(q[0],q[1]);
    rgCam.push(R.fechado?new google.maps.Polygon({map:MAPA,paths:p.map(ll),strokeColor:cor,strokeWeight:2.5,fillColor:cor,fillOpacity:.12,clickable:false}):new google.maps.Polyline({map:MAPA,path:p.map(ll),strokeColor:cor,strokeWeight:2.5,clickable:false}));
    const {AdvancedMarkerElement}=gLib.marker;
    p.forEach((q,i)=>{const m=new AdvancedMarkerElement({map:MAPA,position:ll(q),content:ponto(q,i),zIndex:4001,gmpClickable:i===0});if(i===0)m.addListener?.('click',()=>{if(p.length>2&&!R.fechado)rgFechar()});rgCam.push(m)});
    rgRotulos().forEach(o=>rgCam.push(new AdvancedMarkerElement({map:MAPA,position:ll(o.ll),content:rot(o),zIndex:4000,gmpClickable:false})))}
  else{rgCam.push((R.fechado?L.polygon(p,{color:cor,weight:2.5,fillOpacity:.12,interactive:false}):L.polyline(p,{color:cor,weight:2.5,interactive:false})).addTo(MAPA));
    p.forEach((q,i)=>{const m=L.marker(q,{keyboard:false,interactive:true,icon:L.divIcon({className:'',iconSize:[0,0],html:''})}).addTo(MAPA);const el=m.getElement();el.appendChild(ponto(q,i));m.on('click',e=>{L.DomEvent.stop(e);if(i===0)rgFechar()});rgCam.push(m)});
    rgRotulos().forEach(o=>{const m=L.marker(o.ll,{keyboard:false,interactive:false,icon:L.divIcon({className:'',iconSize:[0,0],html:''})}).addTo(MAPA);m.getElement().appendChild(rot(o));rgCam.push(m)})}}
