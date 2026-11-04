// Lotes da prefeitura no cadastro (São Paulo, 4/nov/2026): ao cadastrar o terreno, pergunta se quer inserir os lotes;
// Sim abre o mapa de lotes das quadras que a poligonal ocupa (F e N. em cada lote, SQL ao parar o mouse), clique marca
// e desmarca, os SQLs marcados entram soltos e aparecem na lista do lote. Respostas gravadas do GeoSampa real
// (quadra 002.058, R. Cel. Francisco Amaro × R. Correia de Andrade) em testes/geosampa/lg_*.json; GRAVAR=1 regrava
// pelo curl (o servidor só responde com Origin do GeoSampa). Saídas em saida/t_lotesgeo/.
const path=require('path'),fs=require('fs'),{execFileSync}=require('child_process'),{chromium}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',OUT=TMP+'t_lotesgeo/',FIX=path.join(__dirname,'geosampa')+'/',L=path.join(__dirname,'..','libs','l')+'/';
fs.mkdirSync(OUT,{recursive:true});
const GRAVAR=!!process.env.GRAVAR,BASE='https://geo.test/geoserver/geoportal/',REAL='https://geoserver.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/';
const html=fs.readFileSync(TMP+'bkm-terrenos.html','utf8').replace('<title>',`<meta name="geosampa-url" content="${BASE}"><title>`);
const chave=u=>{const q=new URL(u).searchParams,tipo=(q.get('typeNames')||'').replace('geoportal:',''),c=q.get('CQL_FILTER')||'';
  return tipo==='lote_cidadao'?(/INTERSECTS/.test(c)?'lg_toca.json':'lg_quadras.json'):tipo==='v_logradouro_segmento'?'lg_vias.json':null};
// poligonal: lotes 0053, 0003, 0004 e 0050 da quadra 002.058 (fecho convexo)
const POLY=[[-23.5423558,-46.6201857],[-23.5428772,-46.6198354],[-23.5429747,-46.6197695],[-23.5428841,-46.6191334],[-23.5427333,-46.61888],[-23.5426704,-46.6187743],[-23.5426294,-46.6187054],[-23.542259,-46.6189603],[-23.542035,-46.6191229],[-23.5418755,-46.6192482],[-23.542073,-46.6197326],[-23.5421462,-46.6198498],[-23.5422236,-46.6199738],[-23.5422479,-46.6200128],[-23.5423256,-46.6201373]];
const kml=`<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>T</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${POLY.concat([POLY[0]]).map(([la,ln])=>ln+','+la).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
const RF=FIX+'lg_resto.json',RESTO=fs.existsSync(RF)&&!GRAVAR?JSON.parse(fs.readFileSync(RF)):{};let GRAVOU=false;
(async()=>{const b=await chromium.launch(),errs=[],pedidos=[];
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:Number(process.env.DSF||1)});
await ctx.route('**/*',async r=>{const u=r.request().url();
  if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(u.startsWith(BASE)){const k=chave(u),q=new URL(u).searchParams,c=q.get('CQL_FILTER')||'';pedidos.push(k||q.get('typeNames')||q.get('layers'));
    // o lote pelo SQL (consulta completa de cada SQL incluído) sai da própria quadra gravada
    if(k==='lg_quadras.json'&&/cd_lote=/.test(c)){const lt=(c.match(/cd_lote='(\d+)'/)||[])[1],qd=JSON.parse(fs.readFileSync(FIX+k));
      return r.fulfill({contentType:'application/json',body:JSON.stringify({type:'FeatureCollection',features:qd.features.filter(f=>f.properties.cd_lote===lt)})})}
    if(k){if(GRAVAR)fs.writeFileSync(FIX+k,execFileSync('curl',['-s','-m','60','-H','Origin: https://novogeosampa.prefeitura.sp.gov.br',u.replace(BASE,REAL)]));
      if(!fs.existsSync(FIX+k))return r.fulfill({contentType:'application/json',body:'{"type":"FeatureCollection","features":[]}'});
      return r.fulfill({path:FIX+k,contentType:'application/json'})}
    // demais camadas (consulta do lote e da poligonal): um arquivo só, pela camada e pelo filtro; PDF não é gravado
    if(q.get('request')==='GetMap')return r.fulfill({status:404,body:''});
    const h=require('crypto').createHash('md5').update(u.replace(BASE,'')).digest('hex').slice(0,12),tipo=(q.get('typeNames')||'').replace('geoportal:','');
    if(GRAVAR){let j;try{j=JSON.parse(execFileSync('curl',['-s','-m','60','-H','Origin: https://novogeosampa.prefeitura.sp.gov.br',u.replace(BASE,REAL)]))}catch(e){j={type:'FeatureCollection',features:[]}}
      if(!/^perimetro_zona|cartorio/.test(tipo)&&Array.isArray(j.features))j.features.forEach(f=>f.geometry=null);RESTO[h]=j;GRAVOU=true;fs.writeFileSync(RF,JSON.stringify(RESTO))}
    return r.fulfill({contentType:'application/json',body:JSON.stringify(RESTO[h]||{type:'FeatureCollection',features:[]})})}
  return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(600);
const KEY='bkm-terrenos-prototipo-v9',ter=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.nome==='Francisco Amaro'),KEY);
const shot=async n=>{await p.waitForTimeout(150);await p.screenshot({path:OUT+n+'.png'})};
// 1. Novo terreno pela poligonal, em São Paulo, sem SQL
await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=nv-kmz]')]);await fc.setFiles({name:'t.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(kml)});
await p.waitForSelector('#f-novo',{timeout:10000});await p.waitForTimeout(300);
if(await p.$('#n-mun'))await p.fill('#n-mun','São Paulo · SP');await p.fill('#f-novo [name=nome]','Francisco Amaro');
console.log('campos visíveis no cadastro:',await p.$$eval('#f-novo input:not([type=hidden]),#f-novo select,#f-novo textarea',x=>x.filter(e=>e.offsetParent).map(e=>e.name)));
await p.evaluate(()=>{const m=document.querySelector('#f-novo [name=municipio]');if(m&&!m.value)m.value='São Paulo · SP';document.querySelector('#f-novo').requestSubmit()});
// 2. cadastrado, o mapa das quadras abre direto
await p.waitForSelector('#lg-svg',{timeout:10000});await p.waitForTimeout(300);await shot('1_cadastrado');
const info=()=>p.evaluate(()=>({lotes:document.querySelectorAll('#lg-svg [data-lg]').length,marcados:document.querySelectorAll('#lg-svg .lg-l.sel').length,travados:document.querySelectorAll('#lg-svg .lg-l.x').length,
  rotulos:[...document.querySelectorAll('.lg-rots text')].filter(x=>x.style.display!=='none').length,vias:[...document.querySelectorAll('.lg-vias text')].map(x=>x.textContent),
  titulo:document.querySelector('#modal .dh .faint').textContent,botao:document.querySelector('[data-a=lg-incluir]').textContent,lista:[...document.querySelectorAll('.lg-lista .num')].map(x=>x.textContent)}));
console.log('mapa:',JSON.stringify(await info()));console.log('pedidos:',JSON.stringify(pedidos));await shot('2_mapa');
// 3. mouse sobre um lote: SQL na dica; clique desmarca e marca
const centro=async sql=>p.evaluate(s=>{const i=[...document.querySelectorAll('#lg-svg [data-lg]')].find(x=>{const k=+x.dataset.lg;return x.__k=k,true});return null},sql);
const pos=await p.evaluate(()=>{const ps=[...document.querySelectorAll('#lg-svg .lg-l')];const r=x=>x.getBoundingClientRect();
  const big=ps.filter(x=>x.classList.contains('sel')).sort((a,b)=>r(b).width*r(b).height-r(a).width*r(a).height)[0],fora=ps.filter(x=>!x.classList.contains('sel')&&!x.classList.contains('x')).sort((a,b)=>r(b).width*r(b).height-r(a).width*r(a).height)[0];
  const c=x=>{const q=r(x);for(let i=1;i<10;i++)for(let j=1;j<10;j++){const X=q.left+q.width*i/10,Y=q.top+q.height*j/10;if(document.elementFromPoint(X,Y)===x)return [X,Y]}return null};return {big:c(big),fora:fora&&c(fora)}});
await p.mouse.move(pos.big[0],pos.big[1]);await p.waitForTimeout(150);console.log('dica:',await p.$eval('#lg-tip',x=>x.hidden?'(escondida)':x.innerText.replace(/\s+/g,' ')));await shot('3_dica');
if(pos.fora){await p.mouse.click(pos.fora[0],pos.fora[1]);await p.waitForTimeout(200);console.log('marcou um de fora:',JSON.stringify((await info()).botao))}
await p.mouse.click(pos.big[0],pos.big[1]);await p.waitForTimeout(200);console.log('desmarcou:',(await info()).botao);
await p.mouse.click(pos.big[0],pos.big[1]);await p.waitForTimeout(200);console.log('marcou de novo:',(await info()).botao);
// arrastar não marca; roda aproxima e mostra mais rótulos
const r0=(await info()).rotulos;await p.mouse.move(pos.big[0],pos.big[1]);for(let i=0;i<3;i++){await p.mouse.wheel(0,-200);await p.waitForTimeout(60)}
console.log('rótulos visíveis antes/depois do zoom:',r0,(await info()).rotulos);
const m0=(await info()).marcados;await p.mouse.move(pos.big[0],pos.big[1]);await p.mouse.down();await p.mouse.move(pos.big[0]+120,pos.big[1]+40,{steps:6});await p.mouse.up();await p.waitForTimeout(150);
console.log('arrastar não muda a marcação:',m0===(await info()).marcados);
await p.click('[data-a=lg-zoom][data-z="0"]');await p.waitForTimeout(150);
// condomínio ou via não se marca
const x=await p.$('#lg-svg .lg-l.x');if(x){await x.click({force:true});await p.waitForTimeout(150);console.log('travado:',await p.$eval('#toast',x=>x.textContent))}
// 4. incluir
const antes=await info();await p.click('[data-a=lg-incluir]');await p.waitForTimeout(300);
console.log('gaveta aberta:',!!(await p.$('#ficha-sheet')),'| lotes com SQL:',(await ter()).lotes.map(l=>l.titulo+':'+l.ins.length).join());await shot('4a_gaveta');
await p.evaluate(c=>{location.hash='#/terrenos/'+c},(await ter()).codigo);await p.waitForTimeout(500);
await p.waitForFunction(()=>/consultado nos|não respondeu. Use/.test(document.querySelector('#toast').textContent),null,{timeout:600000});console.log('consulta:',await p.$eval('#toast',x=>x.textContent));
for(const [aba,n] of [['parametros','4c_parametros'],['terreno','4d_terreno']]){await p.evaluate(a=>document.querySelector(`.fi-abas [data-t=${a}]`)?.click(),aba);await p.waitForTimeout(300);
  await p.evaluate(()=>{document.querySelectorAll('section.qd-fechado .qd-tg').forEach(x=>x.click())});await p.waitForTimeout(200);await p.evaluate(()=>scrollTo(0,0));await shot(n)}
console.log('parâmetros:',await p.evaluate(()=>document.querySelector('.fi-abas [data-t=parametros]')?'aba ok':'sem aba'));
const t1=await ter();console.log('consultados:',t1.insc.filter(i=>(i.geo||[]).length).length,'| sem consulta:',t1.insc.filter(i=>!(i.geo||[]).length).map(i=>i.sql).join(),'| zonas:',JSON.stringify((t1.analises||[]).find(a=>a.status==='vigente')?.zonas?.map(z=>z.sigla+':'+z.ins)),'| poligonal consultada:',!!t1.geoArea,'| docs:',t1.docs.map(d=>d.tipo+':v'+d.versoes).join());
console.log('incluídos:',t1.insc.length,'de',antes.lista.length,'| soltos:',t1.insc.filter(i=>i.solto).length,'| origem:',[...new Set(t1.insc.map(i=>i.origem))].join(),'| lotes:',(t1.lotes||[]).length,'| log:',t1.hist[0].txt);
await p.evaluate(()=>{document.querySelector('.fi-abas [data-t=terreno]')?.click()});await p.waitForTimeout(300);
await p.evaluate(()=>{document.querySelectorAll('section.qd-fechado .qd-tg').forEach(x=>x.click())});await p.waitForTimeout(150);
await p.click('#sec-lotes [data-a=lt-sql-tira]');await p.waitForTimeout(250);
console.log('soltos na seção:',await p.$eval('#lg-soltos',x=>x.innerText.replace(/\s+/g,' ')));
await p.click('#sec-lotes [data-a=lt-novo]');await p.waitForTimeout(300);
const sel=await p.$('#sec-lotes [data-ch=lt-solto]');console.log('lista no lote:',await sel.evaluate(s=>[...s.options].map(o=>o.textContent)));
await p.evaluate(()=>document.getElementById('sec-lotes').scrollIntoView({block:'start'}));await p.evaluate(()=>scrollBy(0,-80));await shot('4_soltos');
await p.evaluate(()=>document.querySelector('#sec-lotes .lt-add').scrollIntoView({block:'center'}));await shot('4b_lista_no_lote');
const v=await sel.evaluate(s=>s.options[1].value);await sel.selectOption(v);await p.waitForTimeout(100);
console.log('campo do SQL novo escondido?',await p.$eval('#sec-lotes .lt-add',f=>[...f.querySelectorAll('.field')].filter(x=>x.hidden).length));
await p.evaluate(()=>document.querySelector('#sec-lotes .lt-add').requestSubmit());await p.waitForTimeout(300);
const t2=await ter();console.log('no lote:',t2.lotes.map(l=>l.titulo+':'+l.ins.length).join(),'| soltos:',t2.insc.filter(i=>i.solto).length,'|',await p.$eval('#toast',x=>x.textContent));
await p.evaluate(()=>document.getElementById('sec-lotes').scrollIntoView({block:'start'}));await p.evaluate(()=>scrollBy(0,-80));await shot('5_no_lote');
// tirar do lote: volta a ficar solto
await p.click('#sec-lotes [data-a=lt-sql-tira]');await p.waitForTimeout(250);const t3=await ter();console.log('tirado do lote, solto de novo:',t3.insc.filter(i=>i.solto).length===t2.insc.filter(i=>i.solto).length+1,'|',await p.$eval('#toast',x=>x.textContent));
// 6. reabrir pelo botão: os já incluídos vêm marcados; desmarcar um solto e salvar o tira
await p.click('#sec-lotes [data-a=lg-abrir]');await p.waitForSelector('#lg-svg',{timeout:10000});await p.waitForTimeout(200);
console.log('reaberto:',JSON.stringify((await info()).botao),(await info()).marcados,'marcados');
await p.evaluate(()=>{document.documentElement.dataset.tema='escuro'});await shot('6_escuro');await p.evaluate(()=>{document.documentElement.dataset.tema='claro'});
await p.click('[data-a=close]');await p.waitForTimeout(150);
// 6b. incluir e ajustar a poligonal: comparação com a soma dos lotes marcados, substitui e guarda a desenhada
await p.click('#sec-lotes [data-a=lg-abrir]');await p.waitForSelector('#lg-svg',{timeout:10000});await p.waitForTimeout(200);
await p.click('[data-a=lg-ajustar]');await p.waitForTimeout(800);console.log('modal:',await p.$eval('#modal',x=>x.innerText.slice(0,400)),errs);await p.screenshot({path:OUT+'dbg.png'});await p.waitForSelector('[data-a=lotes-usar]',{timeout:20000});await p.waitForTimeout(200);
console.log('ajustar:',await p.$eval('#modal .dialog',x=>x.innerText.replace(/\s+/g,' ')));await shot('6b_ajustar');
const a0=(await ter()).poly.length;await p.click('[data-a=lotes-usar]');await p.waitForTimeout(300);const tp=await ter();
console.log('poligonal trocada:',a0,'→',tp.poly.length,'pontos | guardadas:',(tp.polyAnt||[]).length,'|',tp.hist[tp.hist.length-1].txt);
// 7. celular
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);
await p.click('#sec-lotes [data-a=lg-abrir]');await p.waitForSelector('#lg-svg',{timeout:10000});await p.waitForTimeout(300);
console.log('celular: rolagem horizontal?',await p.evaluate(()=>document.querySelector('#modal .dialog').scrollWidth>document.querySelector('#modal .dialog').clientWidth+1));await shot('7_celular');
await p.evaluate(()=>document.querySelector('.lg-lado').scrollIntoView());await shot('8_celular_lista');
await p.click('[data-a=close]');await p.setViewportSize({width:1440,height:900});
// 8. Leitura não vê o botão; terreno fora de SP não pergunta
await p.evaluate(()=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector('[data-a=role][data-v=Leitura]').click()});await p.waitForTimeout(200);
console.log('leitura tem o botão?',await p.$$eval('[data-a=lg-abrir]',x=>x.length),'| lixeira dos soltos?',await p.$$eval('[data-a=lg-tira]',x=>x.length));
if(GRAVOU)fs.writeFileSync(RF,JSON.stringify(RESTO));console.log('erros:',errs.length?errs:'nenhum');await b.close()})();
