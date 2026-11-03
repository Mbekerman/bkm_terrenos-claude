/* ---------- mercado: empreendimentos do monitor de mercado no mapa (camada de exemplo) ----------
   Decisão do Moisés (25/out/2026): camada de exemplo no protótipo agora; a ligação com o banco do monitor
   (Supabase, tabelas im_*) vem depois. Os empreendimentos daqui são fictícios, gerados unidade por unidade
   como o monitor grava (torre, número, andar, dormitórios, vagas, área, situação, preço vigente e primeiro
   preço visto). Os grupos são calculados na leitura, nunca gravados, pela regra combinada em 25/out:
   dormitórios + vagas; área (junta área igual, separa em salto > 3% ou largura > 8%); preço por m² do mais
   barato ao mais caro, separando quando o salto passa de 2% por andar entre as duas unidades, 2% no mesmo
   andar e 6% sem andar, entre torres diferentes (andar de outra torre não se compara) ou com o andar do empreendimento
   inconsistente; vendida sem preço entra no grupo da
   unidade com preço mais próxima em andar (mesma torre antes); grupo com menos de 3 unidades junta ao vizinho. */
const MK_CFG={saltoArea:3,larguraArea:8,porAndar:2,mesmoAndar:2,semAndar:6,minimo:3};  // im_config.agr_* (configurável pelo administrador)
const MK_SIT={lancamento:['Lançamento','#0094fe'],em_obras:['Em obras','#c67355'],pronto:['Pronto','#7d8a3e']};
const MK={box:null,abertoEm:0,emps:null};
/* os 3 últimos meses fechados de monitoramento (para o VSO de exemplo) */
const MK_MESES=(()=>{const [y,m]=HOJE.split('-').map(Number);return [3,2,1].map(k=>{const d=new Date(y,m-1-k,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})})();

/* ---------- dados de exemplo (nomes e números fictícios) ---------- */
function mkRand(seed){let a=seed>>>0;return ()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296}}
/* cada empreendimento: torres, andares, plantas por posição no andar e a tabela de preço por m² (base, rampa por andar,
   degraus por faixa de andares ou preço com teto até um andar); vendidas: parte vendida antes do monitor (sem preço) */
const MK_SPEC=[
  {id:'mk1',nome:'Vista Prudente Residencial',inc:'Incorporadora Exemplo D',bairro:'Vila Prudente',lat:-23.58320,lng:-46.57680,sit:'lancamento',lanc:'2026-07-01',ent:'2029-06-30',
    torres:['A','B'],andares:20,vend:.24,antes:0,lancPreco:true,
    plantas:[{pos:[1,2,3,4],dorm:2,vagas:0,area:36.2,m2:8600,rampa:.8},{pos:[5,6],dorm:2,vagas:0,area:40.6,m2:8450,rampa:.8},{pos:[7,8],dorm:2,vagas:1,area:52.4,m2:11200,rampa:1}],
    torreB:{pos:[1,2,3,4],teto:10,m2Teto:7400,salto:.17}},
  {id:'mk2',nome:'Parque das Mangueiras',inc:'Construtora Exemplo E',bairro:'Tatuapé',lat:-23.54550,lng:-46.56900,sit:'em_obras',lanc:'2025-03-01',ent:'2027-09-30',
    torres:['U'],andares:24,vend:.71,antes:.85,vagaNula:.12,
    plantas:[{pos:[1,2,3,4],dorm:1,vagas:0,area:26.1,m2:12500,degrau:4,passo:3.6},{pos:[5,6],dorm:2,vagas:1,area:55.3,m2:12000,rampa:1}]},
  {id:'mk3',nome:'Jardim Cupecê Life',inc:'Incorporadora Exemplo F',bairro:'Cidade Ademar',lat:-23.66400,lng:-46.64700,sit:'em_obras',lanc:'2025-08-01',ent:'2027-12-31',
    torres:['A','B','C'],andares:12,vend:.6,antes:.7,
    plantas:[{pos:[1,2,3,4,5,6],dorm:2,vagas:0,area:34.1,m2:6900,rampa:0,porTorre:{B:7800,C:8400},rampaTorre:{C:.9}},{pos:[7,8],dorm:2,vagas:0,area:35.6,m2:6900,rampa:0,porTorre:{B:7800,C:8400},rampaTorre:{C:.9}}]},
  {id:'mk4',nome:'Aricanduva Prime',inc:'Construtora Exemplo G',bairro:'Vila Aricanduva',lat:-23.56400,lng:-46.51000,sit:'pronto',lanc:'2022-05-01',ent:'2025-11-30',
    torres:['T'],andares:16,vend:.88,antes:.95,
    plantas:[{pos:[1,2],dorm:3,vagas:2,area:78.4,m2:10800,rampa:1.2},{pos:[3,4],dorm:2,vagas:1,area:58.9,m2:10200,rampa:1.2}]},
  {id:'mk5',nome:'Estação Penha Studios',inc:'Incorporadora Exemplo D',bairro:'Penha',lat:-23.53150,lng:-46.54600,sit:'lancamento',lanc:'2026-05-01',ent:'2029-03-31',
    torres:['A'],andares:18,vend:.35,antes:.4,semAndar:.3,
    plantas:[{pos:[1,2,3,4,5],dorm:1,vagas:0,area:24.3,m2:11900,rampa:.7,tipo:'studio'},{pos:[6,7],dorm:1,vagas:0,area:27.1,m2:11600,rampa:.7,tipo:'studio'}]},
  {id:'mk6',nome:'Vila Ema Garden',inc:'Construtora Exemplo E',bairro:'Vila Ema',lat:-23.59050,lng:-46.56100,sit:'em_obras',lanc:'2025-10-01',ent:'2028-04-30',
    torres:['A'],andares:14,vend:.5,antes:.6,garden:{area:61.8,m2:9900},
    plantas:[{pos:[1,2,3,4,5,6],dorm:2,vagas:0,area:38.4,m2:9100,rampa:.9}]}];
function mkGerar(s){const R=mkRand(s.id.charCodeAt(2)*7919),us=[];
  s.torres.forEach(tr=>{for(let an=1;an<=s.andares;an++){const nPos=Math.max(...s.plantas.flatMap(p=>p.pos));
    for(let pos=1;pos<=nPos;pos++){const p=s.plantas.find(x=>x.pos.includes(pos));if(!p)continue;
      let dorm=p.dorm,vagas=p.vagas,area=p.area,m2=(p.porTorre?.[tr]??p.m2)*Math.pow(1+(p.rampaTorre?.[tr]??p.rampa??0)/100,an-1);
      if(p.degrau)m2=p.m2*Math.pow(1+p.passo/100,Math.floor((an-1)/p.degrau));
      if(s.torreB&&tr==='B'&&s.torreB.pos.includes(pos))m2=an<=s.torreB.teto?s.torreB.m2Teto:s.torreB.m2Teto*(1+s.torreB.salto)*Math.pow(1.008,an-s.torreB.teto-1);
      let tipo=p.tipo||'apartamento';if(s.garden&&an===1&&pos<=2){area=s.garden.area;m2=s.garden.m2;tipo='garden'}
      if(s.vagaNula&&R()<s.vagaNula)vagas=null;
      const preco=Math.round(area*m2/100)*100,num=`${an}${String(pos).padStart(2,'0')}`;
      const semAndar=s.semAndar&&R()<s.semAndar;
      us.push({id:`${s.id}-${tr}${num}`,torre:s.torres.length>1?tr:'',numero:semAndar?`${tr}-${String(us.length+1).padStart(3,'0')}`:num,andar:semAndar?null:an,tipo,dorm,vagas,area,base:preco})}}});
  /* vendas: as mais baratas vendem antes; parte delas antes do monitor começar (sem preço nenhum) */
  const ord=[...us].sort((a,b)=>a.base-b.base);
  ord.forEach((u,i)=>{const rank=i/ord.length,vendida=R()<s.vend*(1.45-.9*rank);
    if(vendida){const antes=R()<(s.antes??0);u.sit='vendida';u.preco=null;u.p1=antes?null:u.base;u.vendaMes=antes?null:MK_MESES[Math.floor(R()*3)]}
    else{u.sit=R()<.02?'reservada':'disponivel';u.preco=u.base;u.p1=u.base}
    u.lanc=!!s.lancPreco&&u.p1!=null;delete u.base});
  return us}
function mkEmps(){if(!MK.emps)MK.emps=MK_SPEC.map(s=>({...s,unidades:mkGerar(s)}));return MK.emps}
const mkEmp=id=>mkEmps().find(e=>e.id===id);

/* ---------- cálculo (o mesmo que o banco fará na leitura) ---------- */
/* andar inconsistente no empreendimento: mais de 10% sem andar, andar acima de 45, negativo sem marca ou numeração mista */
function mkInconsistente(us){if(!us.length)return true;const dig=u=>{const d=String(u.numero).replace(/\D/g,'');return d?+d:null};
  return us.filter(u=>u.andar==null).length>.1*us.length||us.some(u=>u.andar>45)
    ||us.some(u=>u.andar<0&&!/(PI|S\d|SS|SUB|-|^C\d)/i.test(u.numero))
    ||(us.some(u=>dig(u)>=1000&&u.andar===Math.floor(dig(u)/100))&&us.some(u=>dig(u)>=100&&dig(u)<=999&&u.andar===Math.floor(dig(u)/10)))}
const mkMed=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
function mkGrupos(us,cfg=MK_CFG){const inc=mkInconsistente(us);
  /* área: categorias por dormitórios + vagas, clusters por salto e largura */
  const ar=[...new Map(us.map(u=>[`${u.dorm}|${u.vagas}|${u.area}`,u])).values()].sort((a,b)=>a.dorm-b.dorm||a.vagas-b.vagas||a.area-b.area);
  let cl=0,ck=null,ca=0,c0=0;const cm=new Map();
  ar.forEach(a=>{const k=a.dorm+'|'+a.vagas;if(k!==ck||a.area>ca*(1+cfg.saltoArea/100)||a.area>c0*(1+cfg.larguraArea/100)){cl++;c0=a.area}ck=k;ca=a.area;cm.set(`${k}|${a.area}`,cl)});
  /* preço por m²: o primeiro preço visto (fixo), senão o vigente */
  const L=us.map(u=>{const p=u.p1??u.preco;return {u,cat:cm.get(`${u.dorm}|${u.vagas}|${u.area}`),m2:p>=1000?p/u.area:null,g:0}});
  L.sort((a,b)=>a.cat-b.cat||(a.m2==null)-(b.m2==null)||(a.m2??0)-(b.m2??0)||(a.u.andar??999)-(b.u.andar??999));
  let g=0;
  L.forEach((x,i)=>{if(x.m2==null)return;const p=L[i-1];
    if(!p||p.cat!==x.cat||p.m2==null)g++;
    else{const lim=inc||x.u.andar==null||p.u.andar==null||x.u.torre!==p.u.torre?cfg.semAndar:x.u.andar===p.u.andar?cfg.mesmoAndar:cfg.porAndar*Math.abs(x.u.andar-p.u.andar);
      if(x.m2>p.m2*(1+lim/100))g++}
    x.g=g});
  /* vendida sem preço: grupo da unidade com preço mais próxima em andar, mesma torre antes */
  L.forEach((x,i)=>{if(x.m2!=null)return;let best=null,bd=Infinity;
    L.forEach(y=>{if(y.m2==null||y.cat!==x.cat)return;const d=(y.u.torre===x.u.torre?0:1000)+(x.u.andar==null||y.u.andar==null?500:Math.abs(x.u.andar-y.u.andar));if(d<bd){bd=d;best=y}});
    if(best)x.g=best.g;else{const p=L[i-1];x.g=p&&p.cat===x.cat&&p.m2==null?p.g:++g}});
  /* grupo pequeno junta ao vizinho de preço mais próximo na mesma categoria */
  for(;;){const st=new Map();L.forEach(x=>{const s=st.get(x.g)||{g:x.g,cat:x.cat,n:0,m:[]};s.n++;if(x.m2!=null)s.m.push(x.m2);st.set(x.g,s)});
    const gs=[...st.values()];gs.forEach(s=>s.med=mkMed(s.m));
    const pq=gs.filter(s=>s.n<cfg.minimo&&gs.some(o=>o.cat===s.cat&&o.g!==s.g)).sort((a,b)=>a.n-b.n||a.g-b.g)[0];if(!pq)break;
    const alvo=gs.filter(o=>o.cat===pq.cat&&o.g!==pq.g).sort((a,b)=>Math.abs((a.med??0)-(pq.med??0))-Math.abs((b.med??0)-(pq.med??0))||a.g-b.g)[0];
    L.forEach(x=>{if(x.g===pq.g)x.g=alvo.g})}
  return {inc,L}}
/* janela do empreendimento: estoque = disponível + reservada, preço do estoque = vigente; VGV lançado pelo preço
   de lançamento quando existe, senão o primeiro preço visto; vendida antes do monitor entra pelo R$/m² mediano do grupo × área */
function mkResumo(e){const {inc,L}=mkGrupos(e.unidades),est=x=>x.u.sit!=='vendida';L.forEach(x=>x.e=e);
  const gm=new Map();L.forEach(x=>{const p=x.u.p1??x.u.preco;if(p>=1000){const a=gm.get(x.g)||[];a.push(p/x.u.area);gm.set(x.g,a)}});
  const med=new Map([...gm].map(([g,a])=>[g,mkMed(a)]));
  let vgvL=0,imput=0,semP=0;L.forEach(x=>{const p=x.u.p1??(med.get(x.g)!=null?med.get(x.g)*x.u.area:null);if(p==null)semP++;else vgvL+=p;if(x.u.p1==null)imput++});
  const E=L.filter(x=>est(x)&&x.u.preco>=1000),soma=(a,f)=>a.reduce((s,x)=>s+f(x),0);
  const grupos=[...new Set(L.map(x=>x.g))].map(g=>{const xs=L.filter(x=>x.g===g),es=xs.filter(x=>est(x)&&x.u.preco>=1000),p1=xs.filter(x=>x.u.p1>=1000),ars=xs.map(x=>x.u.area);
    return {dorm:xs[0].u.dorm,vagas:xs[0].u.vagas,aMin:Math.min(...ars),aMax:Math.max(...ars),lancadas:xs.length,estoque:xs.filter(est).length,
      preco:es.length?soma(es,x=>x.u.preco)/es.length:null,m2:es.length?soma(es,x=>x.u.preco)/soma(es,x=>x.u.area):null,
      m2p1:p1.length?soma(p1,x=>x.u.p1)/soma(p1,x=>x.u.area):null,vso:mkVso(xs)}})
    .sort((a,b)=>a.dorm-b.dorm||a.vagas-b.vagas||a.aMin-b.aMin||(a.m2??a.m2p1??0)-(b.m2??b.m2p1??0));
  return {inc,unidades:L.length,estoque:L.filter(est).length,vgvL:semP===L.length?null:vgvL,vgvLEst:imput>0||!L.every(x=>x.u.lanc),semP,
    vgvE:E.length?soma(E,x=>x.u.preco):null,m2:E.length?soma(E,x=>x.u.preco)/soma(E,x=>x.u.area):null,vso:mkVso(L),grupos}}

/* ---------- marca no mapa: círculo na cor da situação ---------- */
const mkPct=v=>v==null?'—':num(v*100,1)+'%';
const mkMarcaHtml=e=>`<span class="mk-b" style="background:${(MK_SIT[e?.sit]||MK_SIT.em_obras)[1]}"></span>`;
const mkTitulo=e=>`${e.nome} · ${MK_SIT[e.sit][0]}`;
let MERC=null,gMerc=[];
function desenhaMerc(){if(!MAPA)return;if(GG){gSet(gMerc,null);gMerc=[];const {AdvancedMarkerElement}=gLib.marker;
    mkEmps().forEach(e=>{const d=document.createElement('div');d.className='mk g';d.innerHTML=mkMarcaHtml(e);
      const m=new AdvancedMarkerElement({map:UI.mpMerc===false?null:MAPA,position:gLL(e.lat,e.lng),content:d,title:mkTitulo(e),gmpClickable:!UI.mpModo});
      m.addListener?.('click',()=>{if(!UI.mpModo)mkAbrir(e.id)});gMerc.push(m)});
    if(!MAPA._mk){MAPA._mk=1;MAPA.addListener('click',mkFecharDoMapa)}return}
  if(!MERC||MERC._mapa!==MAPA){MERC?.remove();MERC=L.layerGroup();MERC._mapa=MAPA}MERC.clearLayers();
  mkEmps().forEach(e=>L.marker([e.lat,e.lng],{icon:L.divIcon({className:'mk',html:mkMarcaHtml(e),iconSize:[18,18],iconAnchor:[9,9]}),title:mkTitulo(e),interactive:!UI.mpModo,keyboard:true})
    .on('click',()=>{if(!UI.mpModo)mkAbrir(e.id)}).addTo(MERC));
  if(UI.mpMerc!==false)MERC.addTo(MAPA);else MERC.remove();
  if(!MAPA._mk){MAPA._mk=1;MAPA.on('click',mkFecharDoMapa)}}
function mostrarMerc(on){if(GG)return gSet(gMerc,on?MAPA:null);if(MAPA&&MERC){on?MERC.addTo(MAPA):MERC.remove()}}

/* ---------- janela ao tocar no pino ---------- */
function mkBoxHtml(e){const r=mkResumo(e),pct=r.unidades?Math.round(100*r.estoque/r.unidades):0;
  const kv=(k,v,f)=>`<div class="mk-kv"><span class="muted">${k}</span><span class="num">${v}</span>${f?`<span class="faint">${f}</span>`:''}</div>`;
  const vg=v=>v==null?'—':v>=1e6?mi(v):brl(v);
  const linhas=r.grupos.map(g=>`<tr><td><span class="cc-tn">${ccDorm(g.dorm)}</span><div class="faint">${g.vagas?g.vagas+(g.vagas>1?' vagas':' vaga'):'sem vaga'} · ${g.aMin===g.aMax?num(g.aMin,2):num(g.aMin,2)+' a '+num(g.aMax,2)} m²</div></td>
    <td class="num">${g.preco!=null?brl(g.preco):'<span class="faint">Esgotado</span>'}</td><td class="num">${g.m2!=null?brl(g.m2):g.m2p1!=null?`<span class="faint" title="Primeiro preço visto das vendidas">${brl(g.m2p1)}*</span>`:'—'}</td>
    <td class="num">${num(g.lancadas)}</td><td class="num">${num(g.estoque)}</td><td class="num">${mkPct(g.vso)}</td></tr>`).join('');
  return `<div class="cc-box mk-box" role="dialog" aria-label="${esc(e.nome)}">
  <div class="cc-hd"><div class="cc-ti"><div class="cc-n">${esc(e.nome)}</div><div class="muted">${esc([e.inc,MK_SIT[e.sit][0],e.bairro].join(' · '))}</div></div><button type="button" class="iconbtn" data-a="mk-x" aria-label="Fechar" title="Fechar (Esc)">${ic('close',20)}</button></div>
  <div class="cc-k mk-k"><div class="cc-big">${r.m2!=null?ccM2(Math.round(r.m2)):'Sem estoque à venda'}</div><div class="faint">${r.m2!=null?'preço médio do estoque por m² (soma dos preços ÷ soma das áreas)':'todas as unidades vendidas'}</div></div>
  <div class="mk-grid">${kv('Lançamento',ccMes(e.lanc))}${kv('Entrega',ccMes(e.ent))}${kv('Unidades',num(r.unidades))}${kv('Em estoque',num(r.estoque),pct+'%')}
    ${kv(r.vgvLEst?'VGV lançado (estimado)':'VGV lançado',vg(r.vgvL))}${kv('VGV em estoque',vg(r.vgvE))}${kv('VSO médio (3 meses)',mkPct(r.vso))}</div>
  <div class="cc-tw"><table class="cc-t mk-t"><thead><tr><th>Grupo</th><th class="num">Preço médio</th><th class="num">Por m²</th><th class="num">Lançadas</th><th class="num">Estoque</th><th class="num" title="VSO médio dos últimos 3 meses">VSO</th></tr></thead><tbody>${linhas}</tbody></table></div>
  <div class="cc-meta faint mk-nota">Dados de exemplo · VSO médio dos últimos 3 meses${r.inc?` · andares inconsistentes: grupos pelo salto de ${num(MK_CFG.semAndar)}%`:''}${r.grupos.some(g=>g.preco==null&&g.m2p1!=null)?' · * grupo esgotado, pelo primeiro preço visto':''}</div></div>`}
function mkBox(){const area=$('.mapa-area');let el=$('#mk-box');const e=MK.box&&UI.route==='mapa'?mkEmp(MK.box):null;
  if(!e||!area){el?.remove();if(!e)MK.box=null;return}
  if(!el||el.parentNode!==area){el?.remove();el=document.createElement('div');el.id='mk-box';area.appendChild(el)}
  el.innerHTML=mkBoxHtml(e)}
function mkAbrir(id){MK.box=id;MK.abertoEm=Date.now();ccFechar();if(UI.mpSel)mpSelecionar(null);if(UI.fichaSheet){UI.fichaSheet=null;fichaSheet()}mkBox()}
function mkFechar(){if(!MK.box)return false;MK.box=null;mkBox();return true}
const mkFecharDoMapa=()=>{if(Date.now()-MK.abertoEm>350)mkFechar()};

/* ---------- ganchos ---------- */
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="mk-x"],[data-a="mp-merc"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();
  if(a.dataset.a==='mk-x')mkFechar();
  else{UI.mpMerc=UI.mpMerc===false;mostrarMerc(UI.mpMerc);a.setAttribute('aria-pressed',UI.mpMerc);if(!UI.mpMerc)mkFechar()}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!UI.modal&&MK.box){mkFechar();e.preventDefault();e.stopImmediatePropagation()}},true);
const _lDesenhaConcMk=L_desenhaConc;L_desenhaConc=function(){const r=_lDesenhaConcMk.apply(this,arguments);desenhaMerc();return r};
const _gDesenhaConcMk=G_desenhaConc;G_desenhaConc=function(){const r=_gDesenhaConcMk.apply(this,arguments);desenhaMerc();return r};
const _mpLegendaMk=mpLegenda;mpLegenda=function(){const h=_mpLegendaMk.apply(this,arguments),item=`<button type="button" class="lg-i" data-a="mp-merc" aria-pressed="${UI.mpMerc!==false}"><span class="lg-poi">${mkMarcaHtml({sit:'lancamento'})}</span>Mercado (exemplo)<span class="n">${mkEmps().length}</span></button>`;
  const i=h.indexOf('data-a="mp-conc"');if(i<0)return h+item;const fim=h.indexOf('</button>',i)+9;return h.slice(0,fim)+item+h.slice(fim)};
const _ccAbrirMk=ccAbrir;ccAbrir=function(){mkFechar();return _ccAbrirMk.apply(this,arguments)};
const _mpSelecionarMk=mpSelecionar;mpSelecionar=function(id){if(id)mkFechar();return _mpSelecionarMk.apply(this,arguments)};
const _fichaSheetMk=fichaSheet;fichaSheet=function(){if(UI.fichaSheet)mkFechar();return _fichaSheetMk.apply(this,arguments)};
const _posRenderMk=posRender;posRender=function(){_posRenderMk.apply(this,arguments);if(UI.route!=='mapa')MK.box=null;mkBox()};

/* ---------- categorias de produto (decisões do Moisés, 25/out/2026) ----------
   Studio (com os lofts) até 26 m² e acima; 1 a 4 dormitórios por faixa de área; 5 dormitórios ou mais. O limite de cima
   entra na faixa ("de 25 a 32" = acima de 25 até 32). Cobertura, garden, duplex e triplex ficam à parte (terraço e pé-direito
   distorcem o preço por m²). Unidade com vaga não preenchida sai do cálculo (vaga zero fica). Categoria só aparece com
   pelo menos MK_MIN_CAT unidades no raio. Configurável pelo administrador. */
const MK_CORTES={studio:[26],1:[25,32],2:[29,34,39,45,55],3:[55,70,90,110],4:[90,120,180,250]};
const MK_MIN_CAT=20,MK_RAIOS=[1,2,3];
const MK_ESPECIAIS=['cobertura','garden','duplex','triplex'];
function mkCategoria(u){if(MK_ESPECIAIS.includes(u.tipo))return {k:'esp',ord:900,nome:'Tipologias especiais',sub:'cobertura, garden, duplex, triplex'};
  const st=u.tipo==='studio'||u.tipo==='loft',d=st?'studio':u.dorm>=5?5:u.dorm;
  if(d===5)return {k:'d5',ord:500,nome:'5 dorms ou mais'};
  const cs=MK_CORTES[d]||[],i=cs.findIndex(c=>u.area<=c),base=st?'Studio':d+(d>1?' dorms':' dorm'),ord=(st?0:d*100)+(i<0?cs.length:i);
  const nome=i===0?`${base} até ${num(cs[0])} m²`:i<0?`${base} acima de ${num(cs.at(-1))} m²`:`${base} de ${num(cs[i-1])} a ${num(cs[i])} m²`;
  return {k:`${d}-${i}`,ord,nome}}
/* VSO médio dos 3 meses: soma das vendas ÷ soma das ofertas (estoque no início do mês + lançadas no mês) */
function mkVso(us){let v=0,o=0;MK_MESES.forEach(m=>{const ini=m+'-01';
  us.forEach(x=>{const lanc=x.e.lanc.slice(0,7);if(lanc>m)return;const vendidaAntes=x.u.sit==='vendida'&&(x.u.vendaMes==null||x.u.vendaMes<m);
    if(!vendidaAntes)o++;if(x.u.vendaMes===m)v++})});return o?v/o:null}
function mkPq(a,q){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),p=(s.length-1)*q,i=Math.floor(p);return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(p-i)}
function mkRedondeza(t,raio,vaga){const emps=mkEmps().map(e=>({e,d:distKm(t.lat,t.lng,e.lat,e.lng)})).filter(x=>x.d<=raio).sort((a,b)=>a.d-b.d);
  let semVaga=0;const us=[];emps.forEach(({e})=>e.unidades.forEach(u=>{if(u.vagas==null){semVaga++;return}
    if(vaga==='com'&&!(u.vagas>0)||vaga==='sem'&&u.vagas>0)return;us.push({u,e,c:mkCategoria(u)})}));
  const cats=new Map();us.forEach(x=>{const c=cats.get(x.c.k)||{...x.c,xs:[]};c.xs.push(x);cats.set(x.c.k,c)});
  const linhas=[...cats.values()].map(c=>{const est=c.xs.filter(x=>x.u.sit!=='vendida'&&x.u.preco>=1000),m2=est.map(x=>x.u.preco/x.u.area);
    return {...c,n:c.xs.length,emps:new Set(c.xs.map(x=>x.e.id)).size,estoque:c.xs.filter(x=>x.u.sit!=='vendida').length,
      med:mkPq(m2,.5),p25:mkPq(m2,.25),p75:mkPq(m2,.75),vso:mkVso(c.xs)}}).sort((a,b)=>a.ord-b.ord);
  return {emps,semVaga,linhas:linhas.filter(l=>l.n>=MK_MIN_CAT),ocultas:linhas.filter(l=>l.n<MK_MIN_CAT).length}}
function mkSecaoHtml(t){if(t.lat==null)return '';const raio=UI.mkRaio||2,vaga=UI.mkVaga||'todas',r=mkRedondeza(t,raio,vaga);
  const seg=(a,o,v)=>`<div class="seg" role="group">${o.map(([k,l])=>`<button type="button" data-a="${a}" data-v="${k}" aria-pressed="${String(v)===String(k)}">${l}</button>`).join('')}</div>`;
  const corpo=!r.emps.length?`<div class="muted">Nenhum empreendimento do monitor a até ${raio} km.</div>`
    :!r.linhas.length?`<div class="muted">Nenhuma categoria com ${MK_MIN_CAT} unidades ou mais a até ${raio} km.</div>`
    :`<div class="tblwrap"><table class="mini-tbl mk-cat"><thead><tr><th>Produto</th><th class="r">Empreend.</th><th class="r">Unidades</th><th class="r">Estoque</th><th class="r">R$/m² mediano</th><th class="r">VSO médio</th></tr></thead><tbody>
      ${r.linhas.map(l=>`<tr><td class="mk-pr">${esc(l.nome)}${l.sub?`<div class="faint">${esc(l.sub)}</div>`:''}</td><td class="r" data-l="Empreend.">${l.emps}</td><td class="r" data-l="Unidades">${num(l.n)}</td><td class="r" data-l="Estoque">${num(l.estoque)}</td>
        <td class="r" data-l="R$/m² mediano">${l.med!=null?brl(l.med):'<span class="faint">Esgotado</span>'}${l.med!=null&&l.p25!==l.p75?`<div class="faint">${brl(l.p25)} a ${brl(l.p75)}</div>`:''}</td><td class="r" data-l="VSO médio">${mkPct(l.vso)}</td></tr>`).join('')}</tbody></table></div>`;
  const notas=[r.ocultas?`${r.ocultas} categoria${r.ocultas>1?'s':''} com menos de ${MK_MIN_CAT} unidades não aparece${r.ocultas>1?'m':''}`:'',r.semVaga?`${num(r.semVaga)} unidade${r.semVaga>1?'s':''} com vaga não preenchida fora do cálculo`:''].filter(Boolean);
  return `<section class="sec mk-sec" data-bloco-item="mercado"><div class="sec-h"><h2>Mercado na redondeza</h2><span class="faint">dados de exemplo</span></div><div class="sec-b">
    <div class="mk-ctl">${seg('mk-raio',MK_RAIOS.map(k=>[k,k+' km']),raio)}${seg('mk-vaga',[['todas','Todas'],['com','Com vaga'],['sem','Sem vaga']],vaga)}</div>
    ${corpo}
    ${r.emps.length?`<div class="hint mk-emps">Empreendimentos no raio: ${r.emps.map(x=>`${esc(x.e.nome)} (${num(x.d,1)} km)`).join(' · ')}</div>`:''}
    ${notas.length?`<div class="hint">${notas.join('; ')}.</div>`:''}</div></section>`}
/* na aba Entorno da ficha, depois da renda e da população */
const _abaEntornoMk=abaEntorno;abaEntorno=function(t){const h=_abaEntornoMk.apply(this,arguments),i=h.lastIndexOf('</div>');return h.slice(0,i)+mkSecaoHtml(t)+h.slice(i)};
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="mk-raio"],[data-a="mk-vaga"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();
  if(a.dataset.a==='mk-raio')UI.mkRaio=+a.dataset.v;else UI.mkVaga=a.dataset.v;const sec=a.closest('.mk-sec'),t=T(UI.id);
  if(sec&&t){const d=document.createElement('div');d.innerHTML=mkSecaoHtml(t);sec.replaceWith(d.firstElementChild);document.querySelector(`.mk-sec [data-a="${a.dataset.a}"][data-v="${a.dataset.v}"]`)?.focus()}else render()},true);
