// ---------------------------------------------------------------------
// Novo terreno começa pela poligonal, sempre. Passo 1: a área do terreno,
// desenhada no mapa ou importada de KMZ/KML (é a única entrada: a inscrição
// e a busca na prefeitura vêm depois, no passo 2 ou na ficha). Com ela o sistema procura os
// terrenos que ocupam parte da área (critério de app.sobreposicao: a faixa de
// até 5 m na divisa, imprecisão do desenho, não conta, a não ser que cubra
// metade de um dos dois). Se achar, mostra se é a mesma área ou só parte dela
// e oferece: nova oferta no existente, recadastrar o existente com a área nova
// (ampliando ou juntando) ou cadastrar mesmo assim. Se não, abre o passo 2 com
// o município e as frentes (ruas de cada lado da poligonal) pela localização;
// com mais de uma rua, o usuário escolhe o endereço principal e as outras
// entram como confrontações de frente.
// No banco: app.terrenos_sobrepostos, t_sobre (sobreposicoes_aceitas),
// ofertas.poligono_geojson e confrontacoes.
// ---------------------------------------------------------------------
const NV_FONTE={mapa:'Poligonal desenhada no mapa',kmz:'Poligonal importada de KMZ/KML'};
const NV_FOLGA=5;  // metros de imprecisão aceitos na divisa
const caixaPoly=p=>[Math.min(...p.map(x=>x[0])),Math.min(...p.map(x=>x[1])),Math.max(...p.map(x=>x[0])),Math.max(...p.map(x=>x[1]))];
// graus -> metros locais (x para leste, y para norte) e de volta
const nvProj=lat0=>{const kx=111320*Math.cos(lat0*Math.PI/180),ky=110574;return {xy:p=>[p[1]*kx,p[0]*ky],ll:q=>[q[1]/ky,q[0]/kx]}};
const distBorda=(q,P)=>Math.min(...P.map((a,i)=>distSeg(q,a,P[(i+1)%P.length])));
// Parte em comum de duas poligonais, por amostragem em grade 80 × 80 no retângulo comum:
// área, largura (diâmetro do maior círculo que cabe nela) e quanto cobre de cada uma.
function sobre2(a,b){const ca=caixaPoly(a),cb=caixaPoly(b),bb=[Math.max(ca[0],cb[0]),Math.max(ca[1],cb[1]),Math.min(ca[2],cb[2]),Math.min(ca[3],cb[3])];
  const aa=areaPoly(a),ab=areaPoly(b),nada={area:0,larg:0,pctA:0,pctB:0,conta:false};if(bb[0]>=bb[2]||bb[1]>=bb[3])return nada;
  const pj=nvProj((bb[0]+bb[2])/2),A=a.map(pj.xy),B=b.map(pj.xy),N=80,dla=(bb[2]-bb[0])/N,dlo=(bb[3]-bb[1])/N;let n=0,r=0;
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){const la=bb[0]+(i+.5)*dla,lo=bb[1]+(j+.5)*dlo;if(!dentroPoly(la,lo,a)||!dentroPoly(la,lo,b))continue;n++;
    const q=pj.xy([la,lo]);r=Math.max(r,Math.min(distBorda(q,A),distBorda(q,B)))}
  if(!n)return nada;const c0=pj.xy([bb[0],bb[1]]),c1=pj.xy([bb[2],bb[3]]),area=Math.abs((c1[0]-c0[0])*(c1[1]-c0[1]))*n/(N*N),larg=2*r;
  return {area,larg,pctA:100*area/aa,pctB:100*area/ab,conta:area>=1&&(larg>NV_FOLGA||area>=aa/2||area>=ab/2)}}
function sobreposicoes(poly,ignorar){const r=[];
  for(const t of S.terrenos){if(t.id===ignorar||!t.poly||t.poly.length<3)continue;const s=sobre2(poly,t.poly);if(!s.conta)continue;
    r.push({t,motivo:s.pctA>=90&&s.pctB>=90?'mesma_area':'parcial',area:s.area,larg:s.larg,pctNova:s.pctA,pctExist:s.pctB})}
  return r.sort((x,y)=>y.area-x.area)}
// União de duas poligonais (Greiner-Hormann; a segunda é deslocada 1 mm para não cair em divisa comum exata).
// Devolve o contorno externo; no banco, ST_Union.
function uniaoPoly(a,b){const pj=nvProj(centro(a)[0]),A=a.map(pj.xy),B=b.map(pj.xy).map(([x,y])=>[x+.0007,y+.0011]);
  const no=(p,inter)=>({x:p[0],y:p[1],inter,entry:false,viz:null,vis:false,alfa:0});
  const LA=A.map(p=>[no(p,false)]),LB=B.map(p=>[no(p,false)]);let tem=false;
  A.forEach((p,i)=>{const p2=A[(i+1)%A.length];B.forEach((q,j)=>{const q2=B[(j+1)%B.length],d=(p2[0]-p[0])*(q2[1]-q[1])-(p2[1]-p[1])*(q2[0]-q[0]);if(!d)return;
    const t=((q[0]-p[0])*(q2[1]-q[1])-(q[1]-p[1])*(q2[0]-q[0]))/d,u=((q[0]-p[0])*(p2[1]-p[1])-(q[1]-p[1])*(p2[0]-p[0]))/d;if(t<=0||t>=1||u<=0||u>=1)return;
    const x=[p[0]+t*(p2[0]-p[0]),p[1]+t*(p2[1]-p[1])],ia=no(x,true),ib=no(x,true);ia.alfa=t;ib.alfa=u;ia.viz=ib;ib.viz=ia;LA[i].push(ia);LB[j].push(ib);tem=true})});
  const dentro=(p,P)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const [xi,yi]=P[i],[xj,yj]=P[j];if((yi>p[1])!==(yj>p[1])&&p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)c=!c}return c};
  if(!tem)return dentro(A[0],B)?b:dentro(B[0],A)?a:null;
  const lista=L=>L.flatMap(e=>[e[0],...e.slice(1).sort((m,n)=>m.alfa-n.alfa)]);const SA=lista(LA),SB=lista(LB);
  [[SA,B],[SB,A]].forEach(([L,P])=>{let st=dentro([L[0].x,L[0].y],P);L.forEach((n,i)=>{n.L=L;n.i=i;if(n.inter){n.entry=st;st=!st}})});  // união: segue para fora do outro
  const aneis=[];for(const s of SA){if(!s.inter||s.vis)continue;const anel=[];let c=s,g=0;
    do{c.vis=c.viz.vis=true;const passo=c.entry?1:-1;do{anel.push([c.x,c.y]);c=c.L[(c.i+passo+c.L.length)%c.L.length]}while(!c.inter&&++g<1e5);c=c.viz}while(c!==s&&c.viz!==s&&++g<1e5);
    aneis.push(anel)}
  const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0))/2;
  const maior=aneis.sort((x,y)=>area(y)-area(x))[0];return maior&&maior.length>=3?maior.map(q=>pj.ll(q).map(v=>+v.toFixed(7))):null}

/* ---------- começo: as três formas de dar a área ---------- */
function nvDesenhar(p0){const est={mpModo:'desenhar',mpAlvo:null,nvDesenho:true,desEditando:false,desenho:p0?[p0]:[],desHist:[],vSel:null,vMenu:false};
  /* já na página Mapa (clique direito ou dois cliques): começa ali mesmo, sem redesenhar a página nem mexer no zoom e na posição (pedido do Moisés, 4/nov/2026) */
  if(naMapa()&&MAPA&&$('#mapa')&&!UI.edMini&&!UI.modal){Object.assign(UI,est);mpRefresh()}
  else go('mapa',{...est,mpView:p0?{c:{lat:p0[0],lng:p0[1]},z:18}:UI.mpView});
  if(!TOQUE())toast(p0?'Primeiro ponto marcado. Clique nos outros cantos; Enter ou dois cliques salvam, Esc cancela.':'Procure o endereço na barra do mapa e clique em cada canto do terreno. Enter ou dois cliques salvam; Esc cancela.')}
function nvPoligonal(poly,fonte,extra={}){const p=poly.map(x=>[+(+x[0]).toFixed(7),+(+x[1]).toFixed(7)]);
  UI.nv={poly:p,ponto:centro(p),area:areaPoly(p),fonte,...extra,local:null,frentes:null,buscandoLocal:true};UI.nv.sobre=sobreposicoes(p);
  UI.modal=UI.nv.sobre.length?'novo-sobre':'novo';renderModal();nvLocalizar()}
/* ---------- município e frentes pela localização ---------- */
async function localDoPonto(lat,lng){
  if(GG){const {results}=await new google.maps.Geocoder().geocode({location:{lat,lng}});if(!results?.length)throw new Error('sem resultado');
    const comp=(tipo,c='long_name')=>(results.find(x=>x.address_components.some(a=>a.types.includes(tipo)))?.address_components.find(a=>a.types.includes(tipo))||{})[c]||'';
    const rua=results.find(x=>x.types.includes('street_address')||x.types.includes('premise')||x.types.includes('route'))?.address_components||[],rc=t=>rua.find(a=>a.types.includes(t))?.long_name||'';
    return {cidade:comp('administrative_area_level_2')||comp('locality'),uf:comp('administrative_area_level_1','short_name'),logradouro:rc('route'),numero:rc('street_number'),
      bairro:comp('sublocality_level_1')||comp('sublocality')||comp('neighborhood'),cep:digits(comp('postal_code'))}}
  const u=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pt-BR&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`;
  const r=await fetch(u);if(!r.ok)throw new Error('OpenStreetMap respondeu '+r.status);const a=(await r.json()).address||{};
  return {cidade:a.city||a.town||a.municipality||a.village||'',uf:(a['ISO3166-2-lvl4']||'').replace(/^BR-/,''),logradouro:a.road||'',numero:a.house_number||'',
    bairro:a.suburb||a.neighbourhood||a.quarter||a.city_district||'',cep:digits(a.postcode||'')}}
// Um ponto 10 m para fora do meio de cada lado com 6 m ou mais (os 8 maiores; 4 sem o Google, que pede uma consulta por segundo).
function nvLados(poly){const pj=nvProj(centro(poly)[0]),P=poly.map(pj.xy),sinal=Math.sign(P.reduce((s,p,i)=>{const q=P[(i+1)%P.length];return s+p[0]*q[1]-q[0]*p[1]},0))||1;
  return P.map((p,i)=>{const q=P[(i+1)%P.length],dx=q[0]-p[0],dy=q[1]-p[1],L=Math.hypot(dx,dy);return {i,L,fora:pj.ll([(p[0]+q[0])/2+sinal*dy/L*10,(p[1]+q[1])/2-sinal*dx/L*10])}})
    .filter(l=>l.L>=6).sort((x,y)=>y.L-x.L).slice(0,GG?8:4)}
const normRua=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
async function nvFrentes(poly){const ruas=new Map();
  for(const l of nvLados(poly)){if(!GG&&ruas.size)await new Promise(ok=>setTimeout(ok,1100));let r=null;try{r=await localDoPonto(l.fora[0],l.fora[1])}catch(e){continue}
    if(!r?.logradouro)continue;const k=normRua(r.logradouro),x=ruas.get(k)||{logradouro:r.logradouro,numero:'',m:0,lados:[]};x.m+=l.L;x.lados.push(l.i);if(!x.numero&&r.numero)x.numero=r.numero;ruas.set(k,x)}
  return [...ruas.values()].sort((a,b)=>b.m-a.m)}
async function nvLocalizar(){const nv=UI.nv;if(!nv)return;let l=null,fr=[];
  try{l=await localDoPonto(nv.ponto[0],nv.ponto[1])}catch(e){console.warn('local',e)}
  if(UI.nv!==nv)return;nv.local=l;
  try{fr=await nvFrentes(nv.poly)}catch(e){console.warn('frentes',e)}
  if(UI.nv!==nv)return;if(!fr.length&&l?.logradouro)fr=[{logradouro:l.logradouro,numero:l.numero,m:null,lados:[]}];nv.frentes=fr;nv.buscandoLocal=false;
  if(nvTalvezLotes())return;if(UI.modal==='novo'&&$('#f-novo'))renderModal()}
/* ---------- telas ---------- */
function nvPasso1Html(fechar){const kmz=UI.nvKmz;
  return `<div class="dh"><div><h2>Novo terreno</h2><div class="muted" style="margin-top:4px">Passo 1 de 2 · Poligonal do terreno</div></div>${fechar}</div>
  <div class="nv-ops">
    <button type="button" class="nv-op" data-a="nv-desenhar"><span class="nv-ic">${bi('mapa',24)}</span><span><b>Desenhar no mapa</b><span class="muted">Ache o endereço na barra do mapa e marque os cantos do terreno.</span></span></button>
    <button type="button" class="nv-op" data-a="nv-kmz"><span class="nv-ic">${ic('upload',24)}</span><span><b>Importar KMZ ou KML</b><span class="muted">Arquivo do Google Earth com o polígono do terreno.</span></span></button>
    ${kmz?`<div class="nv-kmz"><span class="lbl-f">O arquivo tem ${kmz.length} polígonos. Qual é o terreno?</span>${kmz.map((it,i)=>`<button type="button" class="btn sm" data-a="nv-kmz-i" data-i="${i}">${esc(it.nome)} · ${m2(Math.round(areaPoly(it.pts)))}</button>`).join('')}</div>`:''}
  </div>
  `}
const nvSit=t=>t.situacao==='arquivado'?'<span class="chip">Arquivado</span>':sitChip(sitMapa(t));
// o que fazer com cada terreno achado, conforme a área nova está dentro dele, o contém ou só cruza
function nvAcoes(x){const t=x.t;
  if(x.motivo==='mesma_area')return [['nv-oferta','Nova oferta neste terreno','primary']];
  if(x.pctNova>=95)return [['nv-oferta-p','Nova oferta de parte do terreno','primary']];
  if(x.pctExist>=95)return [['nv-recad','Recadastrar com a área nova','primary']];
  return [['nv-juntar','Recadastrar juntando as áreas','primary'],['nv-recad','Recadastrar só com a área nova','']]}
function nvSobreHtml(fechar){const nv=UI.nv,s=nv.sobre,ro=UI.role==='Leitura',igual=s.some(x=>x.motivo==='mesma_area');
  const porque=x=>x.motivo==='mesma_area'?`Mesma área (${num(x.pctNova,0)}% da área nova coincide com ${num(x.pctExist,0)}% da dele).`
    :x.pctNova>=95?`A área nova fica dentro dele: é ${num(x.pctExist,0)}% do terreno cadastrado.`
    :x.pctExist>=95?`O terreno cadastrado (${m2(Math.round(areaPoly(x.t.poly)))}) fica dentro da área nova: ela é maior e o inclui.`
    :`Parte em comum de ${m2(Math.round(x.area))}: ${num(x.pctNova,0)}% da área nova e ${num(x.pctExist,0)}% da dele.`;
  return `<div class="dh"><div><h2>${igual?'Este terreno já existe no sistema':'Parte desta área já está cadastrada'}</h2><div class="muted" style="margin-top:4px">Área nova: ${m2(Math.round(nv.area))}. ${s.length===1?'Encontramos um terreno no mesmo lugar.':`Encontramos ${s.length} terrenos no mesmo lugar.`} Divisas encostadas (até ${NV_FOLGA} m) não contam.</div></div>${fechar}</div>
  <div class="nv-sob">${s.map(x=>`<div class="nv-s"><div class="nv-s-t"><div class="t1"><b class="num">${x.t.codigo}</b> · ${esc(x.t.nome)} ${nvSit(x.t)}</div><div class="t2">${porque(x)}</div></div>
    <div class="nv-s-a"><button class="btn sm text" data-a="abrir" data-id="${x.t.id}">Abrir ficha</button>${ro?'':nvAcoes(x).map(([a,l,c])=>`<button class="btn sm ${c}" data-a="${a}" data-id="${x.t.id}">${l}</button>`).join('')}</div></div>`).join('')}</div>
  <div class="hint" style="margin-top:var(--e3)">${igual?'<b>Nova oferta</b> registra a oferta no terreno, sem mudar o cadastro. ':''}<b>Recadastrar</b> troca a poligonal do terreno pela área nova (ou pela soma das duas) e registra a oferta nele, guardando o pedaço oferecido. A poligonal anterior fica no histórico.</div>
  <div class="df"><button class="btn text" data-a="nv-voltar">Voltar</button>${ro?'':`<button class="btn" data-a="nv-mesmo">É outro terreno, cadastrar mesmo assim</button>`}</div>`}
// nome de referência: o logradouro sem o tipo (Rua, Avenida...) e sem o número (decisão do Moisés, 4/nov/2026)
const NV_TIPO_LOG=/^(rua|r\.|avenida|av\.?|alameda|al\.?|travessa|trav\.?|tv\.?|estrada|estr\.?|est\.|pra[çc]a|p[çc]a\.?|rodovia|rod\.?|largo|lgo\.?|viela|via|viaduto|ladeira|passagem|beco|vila|parque|pq\.?|servid[ãa]o|acesso|caminho|marginal)\s+/i;
const nomeRef=log=>(log||'').trim().replace(NV_TIPO_LOG,'').replace(/,.*$/,'').trim();
// passo 2: só o nome de referência. Município, endereço e frentes vêm da poligonal; o resto entra ao longo da jornada
function nvDadosHtml(fechar){const nv=UI.nv,l=nv.local,mun=l?.cidade?l.cidade+(l.uf?' · '+l.uf:''):'',f0=nv.frentes?.[0],busca=nv.buscandoLocal;
  const v=x=>x?`value="${esc(x)}"`:'',nome=nv.nome??(f0?nomeRef(f0.logradouro):'');
  const onde=[f0&&[f0.logradouro,f0.numero].filter(Boolean).join(', '),l?.bairro,mun].filter(Boolean).join(' · ');
  return `<div class="dh"><div><h2>Novo terreno</h2><div class="muted" style="margin-top:4px">Passo 2 de 2 · O resto da ficha é preenchido ao longo da jornada.</div></div>${fechar}</div>
  <form data-form="novo" id="f-novo"><div class="fields">
  <div class="field full"><div class="banner blue">${ic('check')}<div style="flex:1"><div class="bt">${nv.porLotes?`Poligonal pela soma dos ${nv.sqls.length} lote${nv.sqls.length>1?'s':''} da prefeitura`:NV_FONTE[nv.fonte]} · ${m2(Math.round(nv.area))}</div>
    <div>${busca?'Buscando o endereço pela poligonal...':onde?esc(onde):'Endereço não encontrado pela localização.'}</div>
    ${nv.ignorados?`<div>Confirmado como outro terreno apesar de sobrepor ${nv.ignorados.map(x=>x.t.codigo).join(', ')}.</div>`:''}</div><button type="button" class="btn sm text" data-a="nv-voltar">Trocar</button></div></div>
  ${nv.lgFeito||nvSP()?`<div class="field full"><div class="nv-sqls"><span class="etq-sw s"></span><div style="flex:1">${nv.sqls?.length?`<b>${nv.sqls.length} SQL${nv.sqls.length>1?'s':''} da prefeitura</b><div class="nv-sqls-l">${nv.sqls.map(x=>`<span class="etq s"><span class="etq-n num">${esc(x.sql)}</span></span>`).join('')}</div>${nv.porLotes?'<div class="faint">A desenhada fica guardada.</div>':''}`:'<b>Nenhum SQL</b><div class="faint">Marque os lotes da prefeitura que o terreno ocupa.</div>'}</div><button type="button" class="btn sm text" data-a="nv-lotes">${ic('layers',16)}${nv.sqls?.length?'Trocar SQLs':'Escolher SQLs'}</button></div></div>`:''}
  <div class="field full"><label for="n-nome">Nome de referência *</label><input id="n-nome" name="nome" required placeholder="${busca?'Buscando a rua...':'Ex.: Cupecê'}" ${v(nome)}></div>
  ${!busca&&!mun?`<div class="field full"><label for="n-mun">Município *</label><input id="n-mun" name="municipio" required placeholder="Cidade · UF"><span class="hint">Não deu para saber pela localização.</span></div>`:`<input type="hidden" name="municipio" ${v(mun)}>`}
  <input type="hidden" name="logradouro" ${v(f0?.logradouro)}><input type="hidden" name="numero" ${v(f0?.numero)}><input type="hidden" name="bairro" ${v(l?.bairro)}><input type="hidden" name="frente" value="0">
  </div></form><div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-novo" id="btn-novo" ${busca?'disabled':''}>${busca?'Buscando o endereço...':'Cadastrar terreno'}</button></div>`}
// depois de cadastrar: a ficha em gaveta no mapa e, com SQLs, a consulta completa no GeoSampa de cada um (zonas, parâmetros, camadas, planta e desenho)
function nvDepois(t){nvGaveta(t);const ins=t.insc.filter(i=>!(i.geo||[]).length);if(ins.length)lgConsultar(t,ins)}
function nvGaveta(t){UI.posCad=null;go('mapa',{mpSel:t.id,mpFoco:t.id});UI.fichaSheet=t.id;fichaSheet()}
/* ---------- partes do terreno novo ----------
   Nasce com a parte "Vendedor 1"; os SQLs marcados no mapa de lotes entram sem parte, e as matrículas e as partes
   são montadas na aba Terreno (etiquetas arrastadas para as partes, proto_lotes.js). */
function nvPlGravar(t,d){const P=partesDe(t);P.length=0;
  d.partes.forEach(p=>{const pa={id:uid(),ativa:true,neg:null,propostas:[],nome:p.nome,essencial:true,area:null};['pessoa','tel','email','doc','obs'].forEach(k=>{if(p[k])pa[k]=p[k]});P.push(pa)});
  lotesNorm(t);if(d.partes.length>1||d.partes[0].nome!=='Vendedor 1')log(t,`${d.partes.length} parte${d.partes.length>1?'s':''}: ${d.partes.map(p=>p.nome).join(', ')}`)}
// depois de desenhar a tela do passo 2: checagem de duplicidade
function nvPosRender(){const f=$('#f-novo');if(!f||!UI.nv)return;f.nome.addEventListener('input',()=>{if(UI.nv)UI.nv.nome=f.nome.value})}
// passo 2 gravado: o terreno novo com a poligonal, o município e as frentes
function nvGravar(alvo,F){const nv=UI.nv;alvo.poly=nv.poly;alvo.lat=+nv.ponto[0].toFixed(7);alvo.lng=+nv.ponto[1].toFixed(7);alvo.precisao='aproximada';alvo.municipio=F.municipio.trim();
  if(nv.local?.cep)alvo.cep=nv.local.cep;if(nv.ignorados)alvo.sobreAceitas=nv.ignorados.map(x=>x.t.id);
  const fr=nv.frentes||[],pri=Number(F.frente||0);fr.forEach((x,i)=>{if(i!==pri||normRua(x.logradouro)!==normRua(F.logradouro))alvo.confr.push({tipo:'frente',m:x.m?+x.m.toFixed(2):null,conf:x.logradouro+(x.numero?', '+x.numero:''),fonte:'Localização da poligonal'})});
  /* SQLs do mapa de lotes: entram sem parte, com o lote da prefeitura; a poligonal é a soma deles e a desenhada fica guardada */
  (nv.sqls||[]).forEach(x=>{const i={id:uid(),mun:'sp',sql:x.sql,area:x.area??null,valores:[],parte:null,origem:'mapa_prefeitura',endPref:x.end||'',polyLote:x.poly};if(x.cib)i.cib=x.cib;alvo.insc.push(i)});
  if(nv.porLotes){alvo.polyDesenho=nv.polyDesenho;alvo.polyLotes=true}
  if(fr.length>1&&alvo.posicao==='nao_informado')alvo.posicao=fr.length===2?'esquina':'duas_frentes';
  alvo.hist[0].txt=`Terreno cadastrado: ${NV_FONTE[nv.fonte].toLowerCase()} (${m2(Math.round(nv.area))})`+(nv.ignorados?`, confirmado como outro terreno apesar de sobrepor ${nv.ignorados.map(x=>x.t.codigo).join(', ')}`:'')+(nv.sqls?.length?`; ${nv.sqls.length} SQL${nv.sqls.length>1?'s':''} pelo mapa de lotes da prefeitura${nv.porLotes?', poligonal pela soma dos lotes':''}: ${nv.sqls.map(x=>x.sql).join(', ')}`:'')}

/* ---------- decisões ---------- */
function nvTrocarPoly(t,poly,como){const ant=t.poly?areaPoly(t.poly):null;(t.polyAnt=t.polyAnt||[]).push({em:agora(),user:me(),poly:t.poly});t.poly=poly;const c=centro(poly);t.lat=+c[0].toFixed(7);t.lng=+c[1].toFixed(7);t.precisao='aproximada';
  log(t,`Recadastro ${como}: poligonal de ${m2(Math.round(ant))} para ${m2(Math.round(areaPoly(poly)))}`)}
// abre o terreno com o formulário de oferta; pedaco = poligonal do que está sendo oferecido (nulo = o terreno todo)
function nvAbrirOferta(t,pedaco,msg){UI.nv=null;BLA={geral:true,comercial:true};blId=t.id;go('terreno',{id:t.id,tab:'comercial',from:'terrenos'});rolarBloco('comercial');UI.ofPoly=pedaco;UI.modal='oferta';renderModal();if(msg)toast(msg)}
function nvDecidir(A,id){const t=T(id),nv=UI.nv;if(!t||!nv)return;
  if(A==='nv-oferta')return nvAbrirOferta(t,null);
  if(A==='nv-oferta-p')return nvAbrirOferta(t,nv.poly);
  const u=A==='nv-juntar'?uniaoPoly(t.poly,nv.poly):nv.poly;if(!u){toast('Não deu para juntar as duas áreas. Recadastre só com a área nova e ajuste no mapa.',true);return}
  nvTrocarPoly(t,u,A==='nv-juntar'?'juntando a área nova':'com a área nova');save();
  nvAbrirOferta(t,A==='nv-juntar'?nv.poly:null,'Terreno recadastrado. Registre a oferta e revise o cadastro.')}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="nv-"]');if(!a)return;const A=a.dataset.a;
  if(A==='nv-desenhar'){UI.modal=null;renderModal();nvDesenhar()}
  if(A==='nv-kmz'){UI.kmzNovo=true;$('#kmz-in').value='';$('#kmz-in').click()}
  if(A==='nv-kmz-i'){const it=UI.nvKmz[Number(a.dataset.i)];UI.nvKmz=null;nvPoligonal(it.pts,'kmz',{nome:it.nome})}
  if(A==='nv-voltar'){UI.nv=null;UI.nvPool=null;UI.modal='novo';renderModal()}
  if(A==='nv-mesmo'){UI.nv.ignorados=UI.nv.sobre;UI.modal='novo';if(!nvTalvezLotes())renderModal()}
  if(A==='nv-lotes')nvLotesAbrir();
  if(['nv-oferta','nv-oferta-p','nv-recad','nv-juntar'].includes(A))nvDecidir(A,a.dataset.id)});
// KMZ escolhido no passo 1
function nvKmzLido(its){const ps=its.filter(x=>x.tipo==='poligono');
  if(!ps.length){toast('O arquivo não tem polígono. Desenhe a área no mapa ou importe outro arquivo.',true);return}
  if(ps.length===1)return nvPoligonal(ps[0].pts,'kmz',{nome:ps[0].nome});UI.nvKmz=ps;UI.modal='novo';renderModal()}

/* ---------- busca de endereço no mapa ---------- */
// Google (Places) quando há chave; sem ela, OpenStreetMap (Nominatim). Centra o mapa no resultado.
let MP_BUSCA_T=null;
async function mpBuscar(q){q=(q||'').trim();if(q.length<3)return [];
  if(GG){const {Place}=gLib.places;const {places}=await Place.searchByText({textQuery:q,fields:['displayName','formattedAddress','location','viewport'],region:'br',maxResultCount:5,
      locationBias:MAPA?.getCenter?.()||gLL(-23.55,-46.63)});
    return (places||[]).map(p=>({nome:p.formattedAddress||p.displayName,lat:p.location.lat(),lng:p.location.lng()}))}
  const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=5&accept-language=pt-BR&q=${encodeURIComponent(q)}`);if(!r.ok)throw new Error('OpenStreetMap respondeu '+r.status);
  return (await r.json()).map(x=>({nome:x.display_name.replace(/, Brasil$/,''),lat:+x.lat,lng:+x.lon}))}
function mpBuscaHtml(){return `<form class="mp-busca" data-form="mp-busca" role="search"><span class="mp-busca-i">${ic('search',20)}</span><input id="mp-end" name="q" type="search" placeholder="Buscar endereço" aria-label="Buscar endereço no mapa" autocomplete="off"><div id="mp-res" class="mp-res" role="listbox" hidden></div></form>`}
function mpResMostrar(rs,msg){const box=$('#mp-res');if(!box)return;box.hidden=false;UI.mpRes=rs;
  box.innerHTML=rs.length?rs.map((x,i)=>`<button type="button" role="option" data-a="mp-res" data-i="${i}">${bi('mapa',18)}<span>${esc(x.nome)}</span></button>`).join(''):`<div class="hint">${msg||'Nada encontrado.'}</div>`}
async function mpBuscaRodar(q,ir){try{const rs=await mpBuscar(q);if(($('#mp-end')?.value||'').trim()!==q.trim())return;if(ir&&rs[0])return mpIrPara(rs[0]);mpResMostrar(rs)}catch(e){console.warn(e);mpResMostrar([],'Busca indisponível agora.')}}
function mpIrPara(x){const box=$('#mp-res');if(box)box.hidden=true;const q=$('#mp-end');if(q)q.value=x.nome;if(!MAPA)return;
  const z=rdLigada()?17:18;UI.mpAchado={lat:x.lat,lng:x.lng,nome:x.nome};
  if(GG){MAPA.setCenter(gLL(x.lat,x.lng));MAPA.setZoom(z)}else MAPA.setView([x.lat,x.lng],z);UI.mpView={c:{lat:x.lat,lng:x.lng},z};achadoPin()}
/* pino do endereço buscado: fica até a próxima busca ou até sair do mapa */
let ACHADO=null;
function achadoPin(){try{ACHADO&&(GG?ACHADO.map=null:MAPA?.removeLayer(ACHADO))}catch(e){}ACHADO=null;const x=UI.mpAchado;if(!x||!MAPA)return;
  if(GG){const d=document.createElement('div');d.className='achado g';d.innerHTML='<span class="achado-b"></span>';ACHADO=new gLib.marker.AdvancedMarkerElement({map:MAPA,position:gLL(x.lat,x.lng),content:d,title:x.nome,gmpClickable:false,zIndex:900})}
  else ACHADO=L.marker([x.lat,x.lng],{icon:L.divIcon({className:'achado',html:'<span class="achado-b"></span>',iconSize:[30,40],iconAnchor:[15,38]}),title:x.nome,interactive:false,zIndexOffset:900}).addTo(MAPA)}
document.addEventListener('input',e=>{if(e.target.id!=='mp-end')return;clearTimeout(MP_BUSCA_T);const q=e.target.value;if(q.trim().length<3){const b=$('#mp-res');if(b)b.hidden=true;return}
  MP_BUSCA_T=setTimeout(()=>mpBuscaRodar(q,false),GG?250:700)});
document.addEventListener('submit',e=>{if(e.target.dataset.form!=='mp-busca')return;e.preventDefault();e.stopImmediatePropagation();clearTimeout(MP_BUSCA_T);mpBuscaRodar(e.target.q.value,true)},true);
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="mp-res"]');if(a){mpIrPara(UI.mpRes[Number(a.dataset.i)]);return}
  if(!e.target.closest('.mp-busca')){const b=$('#mp-res');if(b)b.hidden=true}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target.id==='mp-end'){const b=$('#mp-res');if(b&&!b.hidden){b.hidden=true;e.stopPropagation()}}},true);

/* ---------- poligonal pelos lotes das inscrições ----------
   O cadastro começa sempre pelo desenho. Depois, em Inscrições, "Usar a poligonal
   dos lotes" troca a desenhada pela soma dos lotes de todas as inscrições com base
   na prefeitura (GeoSampa, GeoSanja), mostrando antes a diferença de área e os
   terrenos que a área nova passaria a ocupar. A desenhada fica guardada. */
const lotesInsc=t=>t.insc.map((ins,i)=>({ins,i,cid:insCid(ins)})).filter(x=>LOTE_ADAPT[x.cid]?.poligono);
let LOTES_BUSCANDO=false;
async function lotesPolyCalcular(t){if(LOTES_BUSCANDO)return;const L=lotesInsc(t);if(!L.length)return;
  if(L.some(x=>!(x.ins.geo||[])[0]?.poly&&!LOTE_ADAPT[x.cid].url())){toast('A busca na prefeitura funciona na versão publicada.',true);return}
  LOTES_BUSCANDO=true;render();const polys=[],falhas=[];
  try{for(const x of L){const c=CIDADES_INSC[x.cid];let p=(x.ins.geo||[])[0]?.poly||null;
      if(!p)try{p=await LOTE_ADAPT[x.cid].poligono(x.ins.sql)}catch(e){console.warn(e);falhas.push(`${c.rotulo} ${x.ins.sql}: ${typeof e==='string'?e:'a prefeitura não respondeu'}`);continue}
      if(p)polys.push(p);else falhas.push(`${c.rotulo} ${x.ins.sql}: não encontrado no ${c.base}`)}}
  finally{LOTES_BUSCANDO=false}
  const u=lotesUniao(polys);
  UI.lotes={tid:t.id,poly:u,n:polys.length,total:L.length,falhas,separados:polys.length>1&&!u,sobre:u?sobreposicoes(u,t.id):[]};UI.modal='lotes-poly';render();renderModal()}
// Lotes vizinhos dividem a divisa, caso em que a união pura não acha cruzamento.
// Cada lote cresce 1 cm para fora antes de juntar (erro de área ~ perímetro × 1 cm).
function engorda(poly,m){const pj=nvProj(centro(poly)[0]),P=poly.map(pj.xy),n=P.length,
    s=Math.sign(P.reduce((a,p,i)=>{const q=P[(i+1)%n];return a+p[0]*q[1]-q[0]*p[1]},0))||1,
    nor=(p,q)=>{const dx=q[0]-p[0],dy=q[1]-p[1],L=Math.hypot(dx,dy)||1;return [s*dy/L,-s*dx/L]};
  return P.map((p,i)=>{const a=nor(P[(i-1+n)%n],p),b=nor(p,P[(i+1)%n]),bx=a[0]+b[0],by=a[1]+b[1],k=(bx*bx+by*by)/2||1;
    return pj.ll([p[0]+m*bx/k,p[1]+m*by/k])})}
function lotesUniao(polys){if(!polys.length)return null;if(polys.length===1)return polys[0];
  /* junta em qualquer ordem: o lote que ainda não encosta no que já foi juntado espera a próxima volta */
  const resto=polys.map(p=>engorda(p,.01));let u=resto.shift(),mudou=true;
  while(resto.length&&mudou){mudou=false;for(let i=0;i<resto.length;i++){const j=uniaoPoly(u,resto[i]);if(j){u=j;resto.splice(i,1);i--;mudou=true}}}
  return resto.length?null:limpaPoly(u)}
// tira os pontos que sobram da junção: colados (< 5 cm) ou em linha reta com os vizinhos
function limpaPoly(poly){const pj=nvProj(centro(poly)[0]);let P=poly.map(pj.xy),mudou=true;
  while(mudou&&P.length>3){mudou=false;for(let i=0;i<P.length&&P.length>3;i++){const a=P[(i-1+P.length)%P.length],b=P[i],c=P[(i+1)%P.length];
    if(Math.hypot(b[0]-a[0],b[1]-a[1])<.05||Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/2<.02){P.splice(i,1);mudou=true;i--}}}
  return P.map(q=>pj.ll(q).map(v=>+v.toFixed(7)))}
// contorno das duas poligonais lado a lado, na mesma escala
function lotesSvg(a,b){const pts=[...a,...b],lat0=centro(pts)[0],k=Math.cos(lat0*Math.PI/180),xs=pts.map(p=>p[1]*k),ys=pts.map(p=>-p[0]),
    x0=Math.min(...xs),y0=Math.min(...ys),s=Math.max(Math.max(...xs)-x0,Math.max(...ys)-y0)||1,W=220,pad=8,f=(W-2*pad)/s,
    d=P=>P.map((p,i)=>(i?'L':'M')+(pad+(p[1]*k-x0)*f).toFixed(1)+' '+(pad+(-p[0]-y0)*f).toFixed(1)).join('')+'Z';
  return `<svg class="lotes-svg" viewBox="0 0 ${W} ${W}" role="img" aria-label="Poligonal desenhada e lotes da prefeitura"><path d="${d(b)}" class="lotes-novo"/><path d="${d(a)}" class="lotes-ant"/></svg>`}
function lotesPolyHtml(fechar){const L=UI.lotes,t=T(L.tid);if(!t)return '';const ant=t.poly?areaPoly(t.poly):null;
  const cab=`<div class="dh"><div><h2>Usar a poligonal dos lotes</h2><div class="muted" style="margin-top:4px">${L.mapa?'Substitui a poligonal desenhada pela soma dos lotes marcados no mapa da prefeitura.':'Substitui a poligonal desenhada pela soma dos lotes das inscrições, como estão na prefeitura.'}</div></div>${fechar}</div>`;
  const falhas=L.falhas.length?`<div class="banner warn">${ic('warn')}<div><div class="bt">${L.falhas.length===L.total?'Nenhum lote encontrado':`${L.falhas.length} de ${L.total} inscrições ficaram de fora`}</div>${L.falhas.map(esc).join('<br>')}</div></div>`:'';
  if(!L.poly)return cab+`<div class="fields"><div class="field full">${falhas}${L.separados?`<div class="banner warn">${ic('warn')}<div><div class="bt">Os lotes não se encostam</div>A poligonal do terreno precisa ser uma área só. Confira as inscrições ou continue com a desenhada.</div></div>`:''}</div></div><div class="df"><button class="btn text" data-a="close">Fechar</button></div>`;
  const nova=areaPoly(L.poly),dif=ant?nova-ant:null,com=ant?sobre2(t.poly,L.poly):null,ro=UI.role==='Leitura';
  return cab+`<div class="fields"><div class="field full lotes-cmp">${t.poly?lotesSvg(t.poly,L.poly):''}<div class="lotes-kv">
      <div><span>Desenhada</span><b>${ant?m2(Math.round(ant)):'—'}</b></div>
      <div><span>Lotes da prefeitura (${L.n} ${L.mapa?(L.n>1?'lotes marcados':'lote marcado'):L.n>1?'inscrições':'inscrição'})</span><b>${m2(Math.round(nova))}</b></div>
      ${dif!=null?`<div><span>Diferença</span><b>${dif>=0?'+':'−'}${m2(Math.abs(Math.round(dif)))} (${dif>=0?'+':'−'}${num(Math.abs(dif/ant*100),1)}%)</b></div>
      <div><span>Em comum com a desenhada</span><b>${num(com.pctA,0)}% dela · ${num(com.pctB,0)}% dos lotes</b></div>`:''}
      <div class="hint"><span class="lotes-leg lotes-leg-ant"></span>desenhada <span class="lotes-leg lotes-leg-novo"></span>lotes</div></div></div>
    ${falhas?`<div class="field full">${falhas}</div>`:''}
    ${L.sobre.length?`<div class="field full"><div class="banner warn">${ic('warn')}<div><div class="bt">A área dos lotes ocupa parte de outro terreno</div>${L.sobre.map(x=>`${esc(x.t.codigo)} · ${esc(x.t.nome)}: ${m2(Math.round(x.area))} em comum`).join('<br>')}<div style="margin-top:4px">Substituir assim registra que são terrenos diferentes.</div></div></div></div>`:''}
    <div class="field full hint">A poligonal desenhada fica guardada no histórico do terreno.</div></div>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button>${ro?'':`<button class="btn primary" data-a="lotes-usar">${L.sobre.length?'Substituir mesmo assim':'Substituir a poligonal'}</button>`}</div>`}
function lotesPolyUsar(){const L=UI.lotes,t=L&&T(L.tid);if(!t||!L.poly)return;
  nvTrocarPoly(t,L.poly,`pelos lotes da prefeitura (${L.n} ${L.mapa?(L.n>1?'lotes marcados no mapa':'lote marcado no mapa'):L.n>1?'inscrições':'inscrição'})`);
  if(L.sobre.length)t.sobreAceitas=[...new Set([...(t.sobreAceitas||[]),...L.sobre.map(x=>x.t.id)])];
  UI.modal=null;UI.lotes=null;save();renderModal();render();toast('Poligonal substituída pelos lotes da prefeitura. A desenhada ficou guardada.')}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="lotes-poly"],[data-a="lotes-usar"]');if(!a)return;
  if(a.dataset.a==='lotes-poly'){const t=T(UI.id);if(t)lotesPolyCalcular(t)}else lotesPolyUsar()});
