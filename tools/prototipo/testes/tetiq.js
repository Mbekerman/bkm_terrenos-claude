// Matrículas e SQLs em etiquetas arrastadas para as partes (4/nov/2026): no Novo terreno em São Paulo, o mapa de lotes
// abre logo depois da poligonal e a poligonal vira a soma dos lotes marcados; na aba Terreno, matrículas (amarelas) e
// SQLs (roxos) entram por Incluir, vão para as partes arrastando (e de uma parte para outra), saem pelo x, cada SQL
// refaz a poligonal, a seta recolhe a linha de partes e, com uma parte só, "Enviar tudo". Usa as respostas gravadas
// do GeoSampa do tlotesgeo.js (quadra 002.058). Saídas em saida/t_etiq/.
const path=require('path'),fs=require('fs'),{execFileSync}=require('child_process'),{chromium}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',OUT=TMP+'t_etiq/',FIX=path.join(__dirname,'geosampa')+'/',L=path.join(__dirname,'..','libs','l')+'/';
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
  if(u.includes('nominatim'))return r.fulfill({contentType:'application/json',body:JSON.stringify({address:{city:'São Paulo','ISO3166-2-lvl4':'BR-SP',road:'Rua Coronel Francisco Amaro',suburb:'Brás'}})});
  return r.abort()});

const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(600);
const KEY='bkm-terrenos-prototipo-v9',ter=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.nome==='Francisco Amaro'),KEY);
const shot=async n=>{await p.waitForTimeout(150);await p.screenshot({path:OUT+n+'.png'})};
const ok=(c,m)=>console.log((c?'ok   ':'FALHA ')+m);
const toast=()=>p.$eval('#toast',x=>x.textContent);
// 1. Novo terreno pela poligonal: o mapa de lotes abre antes do passo 2
await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=nv-kmz]')]);await fc.setFiles({name:'t.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(kml)});
await p.waitForSelector('#lg-svg',{timeout:30000});await p.waitForTimeout(300);await shot('1_novo_mapa');
ok(!(await p.$('#f-novo')),'mapa de lotes antes do passo 2');
const nSel=await p.$$eval('#lg-svg .lg-l.sel',x=>x.length);console.log('lotes marcados:',nSel,'| botão:',await p.$eval('[data-a=lg-incluir]',x=>x.textContent));
await p.click('[data-a=lg-incluir]');await p.waitForSelector('#f-novo',{timeout:30000});await p.waitForTimeout(300);
console.log('passo 2:',await p.$eval('.nv-sqls',x=>x.innerText.replace(/\s+/g,' ')));await shot('2_passo2');
await p.waitForFunction(()=>!document.querySelector('#btn-novo')?.disabled,null,{timeout:30000});
await p.fill('#f-novo [name=nome]','Francisco Amaro');
await p.evaluate(()=>{const m=document.querySelector('#f-novo [name=municipio]');if(m&&!m.value)m.value='São Paulo · SP';document.querySelector('#f-novo').requestSubmit()});await p.waitForTimeout(500);
let t=await ter();ok(t.insc.length===nSel&&t.insc.every(i=>!i.parte&&i.polyLote),`${t.insc.length} SQLs no terreno, sem parte, com o lote`);ok(t.polyLotes&&t.polyDesenho,'poligonal pela soma dos lotes, desenhada guardada');
console.log('log:',t.hist[0].txt);
// 2. ficha: aba Terreno; a consulta completa do GeoSampa roda sozinha
await p.evaluate(c=>{location.hash='#/terrenos/'+c},t.codigo);await p.waitForTimeout(500);
await p.waitForFunction(()=>/consultado nos|não respondeu. Use/.test(document.querySelector('#toast').textContent),null,{timeout:600000});console.log('consulta:',await toast());
t=await ter();ok(t.insc.some(i=>(i.geo||[]).length),'GeoSampa preencheu os SQLs ('+t.insc.filter(i=>(i.geo||[]).length).length+' consultados)');
const abrir=async()=>{await p.evaluate(()=>document.querySelector('.fi-abas [data-t=terreno]')?.click());await p.waitForTimeout(250);await p.evaluate(()=>{document.querySelectorAll('section.qd-fechado .qd-tg').forEach(x=>x.click())});await p.waitForTimeout(150)};
await abrir();
const foco=async()=>{await p.evaluate(()=>{document.getElementById('sec-lotes').scrollIntoView({block:'start'});scrollBy(0,-72)});await p.waitForTimeout(100)};
// 3. matrículas pelo formulário
for(const [n,a] of [['123.456','480'],['123.457','300']]){await p.fill('#em-n',n);await p.fill('#em-a',a);await p.evaluate(()=>document.querySelector('form[data-form=etq-mat]').requestSubmit());await p.waitForTimeout(200)}
t=await ter();ok(t.mats.length===2&&t.mats.every(m=>!m.parte),'duas matrículas, sem parte');ok(t.mats[0].area===480,'área registrada gravada');
await p.fill('#em-n','123456');await p.evaluate(()=>document.querySelector('form[data-form=etq-mat]').requestSubmit());await p.waitForTimeout(150);ok(/já está no terreno/.test(await toast()),'matrícula repetida recusada');
await foco();await shot('3_etiquetas');
// 4. uma parte só: Enviar tudo
ok(!!(await p.$('[data-a=etq-tudo]')),'botão Enviar tudo com uma parte');
// 5. segunda parte e arrastar
await p.click('#sec-partes-cad [data-a=pt2-mais]');await p.waitForTimeout(250);await abrir();
ok(!(await p.$('[data-a=etq-tudo]')),'com duas partes, sem Enviar tudo');
const arrasta=async(sel,alvo)=>{const a=await p.$(sel),b=await p.$(alvo);await a.scrollIntoViewIfNeeded();const r=await a.boundingBox();
  await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+20,r.y+r.height/2+10,{steps:3});
  const q=await b.boundingBox();await p.mouse.move(q.x+q.width/2,q.y+Math.min(q.height-10,60),{steps:8});await p.waitForTimeout(80);
  const marc=await p.evaluate(()=>({aceita:document.querySelectorAll('.etq-aceita').length,sobre:document.querySelectorAll('.etq-sobre').length}));await p.mouse.up();await p.waitForTimeout(250);return marc};
const P=t.partes.filter(x=>x.ativa).map(x=>x.id);t=await ter();const P2=t.partes.filter(x=>x.ativa).map(x=>x.id);
const m0=t.mats[0].id,s0=t.insc[0].id,s1=t.insc[1]?.id;
let mk=await arrasta(`.etq-pool [data-etq="m:${m0}"]`,`.etq-pt[data-p="${P2[1]}"]`);console.log('marcas durante o arrasto:',JSON.stringify(mk));
t=await ter();ok(t.mats.find(m=>m.id===m0).parte===P2[1],'matrícula arrastada para a parte 2');
await arrasta(`.etq-pool [data-etq="s:${s0}"]`,`.etq-pt[data-p="${P2[0]}"]`);t=await ter();ok(t.insc.find(i=>i.id===s0).parte===P2[0],'SQL arrastado para a parte 1');
if(s1){await arrasta(`.etq-pool [data-etq="s:${s1}"]`,`.etq-pt[data-p="${P2[1]}"]`)}
await arrasta(`.etq-pt [data-etq="m:${m0}"]`,`.etq-pt[data-p="${P2[0]}"]`);t=await ter();ok(t.mats.find(m=>m.id===m0).parte===P2[0],'matrícula arrastada da parte 2 para a parte 1');
ok(await p.$eval(`.etq-pt[data-p="${P2[0]}"]`,b=>{const k=[...b.querySelectorAll('.etq[data-etq]')].map(e=>e.dataset.etq[0]);return k.join('')==='ms'&&b.querySelector('.etq-pt-g.m').getBoundingClientRect().bottom<=b.querySelector('.etq-pt-g.s').getBoundingClientRect().top}),'na parte, a matrícula vem antes do SQL (que entrou primeiro), cada grupo na sua linha');
await arrasta(`.etq-pt [data-etq="m:${m0}"]`,'.etq-pool[data-tipo=m]');t=await ter();ok(!t.mats.find(m=>m.id===m0).parte,'arrastada de volta para o quadro de cima');
await arrasta(`.etq-pool [data-etq="m:${m0}"]`,'.etq-pool[data-tipo=s]');t=await ter();ok(!t.mats.find(m=>m.id===m0).parte,'matrícula não entra no quadro de SQLs');
await arrasta(`.etq-pool [data-etq="m:${m0}"]`,`.etq-pt[data-p="${P2[0]}"]`);
console.log('log:',t.hist.slice(-2).map(h=>h.txt).join(' | '));
await foco();await shot('4_partes');
// 6. seta recolhe a linha inteira
await p.click(`.etq-pt[data-p="${P2[0]}"] .etq-pt-h`);await p.waitForTimeout(150);
ok((await p.$$eval('.etq-pt.fechado',x=>x.length))===2,'a seta recolheu as duas partes da linha');await foco();await shot('5_linha_fechada');
await p.click(`.etq-pt[data-p="${P2[1]}"] .etq-pt-h`);await p.waitForTimeout(150);ok((await p.$$eval('.etq-pt.fechado',x=>x.length))===0,'e abriu de novo');
// 7. janela da etiqueta (SQL com os dados do GeoSampa e o IPTU)
await p.click(`[data-etq="s:${s0}"] .etq-n`);await p.waitForTimeout(250);console.log('janela:',(await p.$eval('#modal .dialog',x=>x.innerText.replace(/\s+/g,' '))).slice(0,220));await shot('6_janela_sql');
await p.click('#modal [data-a=close]');await p.waitForTimeout(150);
// 8. SQL excluído e incluído refazem a poligonal
const a0=JSON.stringify(t.poly),n0=t.insc.length,ex=t.insc[t.insc.length-1];
await p.click(`[data-etq="s:${ex.id}"] .etq-x`);await p.waitForTimeout(600);t=await ter();
ok(t.insc.length===n0-1&&JSON.stringify(t.poly)!==a0,'SQL excluído: sai e a poligonal muda');console.log('aviso:',await toast());
await p.fill('#es-sql',ex.sql.replace(/\D/g,''));await p.evaluate(()=>document.querySelector('form[data-form=etq-sql]').requestSubmit());
await p.waitForFunction(n=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')).terrenos.find(x=>x.nome==='Francisco Amaro').insc.some(i=>(i.geo||[]).length&&i.sql.replace(/\D/g,'')===n),ex.sql.replace(/\D/g,''),{timeout:120000});
await p.waitForTimeout(1500);t=await ter();ok(t.insc.length===n0,'SQL digitado incluído e consultado no GeoSampa');ok(JSON.stringify(t.poly)===a0,'poligonal volta à de antes com o SQL de volta');
console.log('últimos logs:',t.hist.slice(-3).map(h=>h.txt).join(' | '));
// 9. excluir a parte 2: as etiquetas dela voltam; Enviar tudo
await p.click(`#pt2-${P2[1]} [data-a=pt2-excluir]`);await p.waitForTimeout(250);console.log('excluir parte:',await toast());await abrir();
await p.click('[data-a=etq-tudo]');await p.waitForTimeout(250);t=await ter();ok(t.mats.every(m=>m.parte===P2[0])&&t.insc.every(i=>i.parte===P2[0]),'Enviar tudo levou tudo para a parte única');
await foco();await shot('7_uma_parte');
// 10. escuro, celular, Leitura
await p.click('#sec-partes-cad [data-a=pt2-mais]');await p.waitForTimeout(200);await p.click('#sec-partes-cad [data-a=pt2-mais]');await p.waitForTimeout(200);await abrir();
await p.evaluate(()=>{document.documentElement.dataset.tema='escuro'});await foco();await shot('8_escuro');await p.evaluate(()=>{document.documentElement.dataset.tema='claro'});
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);await abrir();await foco();await shot('9_celular');
console.log('celular: rolagem horizontal?',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'| colunas de partes:',await p.$eval('.etq-partes',x=>getComputedStyle(x).gridTemplateColumns.split(' ').length));
await p.evaluate(()=>document.querySelector('.etq-partes').scrollIntoView({block:'start'}));await p.waitForTimeout(100);await shot('9b_celular_partes');
await p.setViewportSize({width:1440,height:900});
await p.evaluate(()=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector('[data-a=role][data-v=Leitura]').click()});await p.waitForTimeout(200);await abrir();
ok(!(await p.$('form[data-form=etq-mat]'))&&!(await p.$('.etq-x')),'Leitura não inclui nem exclui');
// 11. toque (celular): segurar a etiqueta e arrastar até a parte; deslizar sem segurar rola a página
{const est=await p.evaluate(k=>localStorage.getItem(k),KEY);const c2=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:Number(process.env.DSF||1)});
  await c2.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const q=await c2.newPage();q.on('pageerror',e=>errs.push(e.message));await q.goto('file:///x/a.html');await q.evaluate(([k,v])=>localStorage.setItem(k,v),[KEY,est]);
  const cod=JSON.parse(est).terrenos.find(x=>x.nome==='Francisco Amaro').codigo;await q.reload();await q.waitForTimeout(500);await q.evaluate(c=>{location.hash='#/terrenos/'+c},cod);await q.waitForTimeout(700);
  await q.evaluate(()=>{document.querySelector('.fi-abas [data-t=terreno]')?.click()});await q.waitForTimeout(250);await q.evaluate(()=>{document.querySelectorAll('section.qd-fechado .qd-tg').forEach(x=>x.click())});await q.waitForTimeout(200);
  console.log('toque: tela',await q.evaluate(()=>location.hash+' '+document.body.dataset.rota+' '+document.querySelectorAll('.etq').length));
  const ter2=()=>q.evaluate(k=>JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.nome==='Francisco Amaro'),KEY);let t2=await ter2();
  const P3=t2.partes.filter(x=>x.ativa).map(x=>x.id),mm=t2.mats[0];
  const cdp=await c2.newCDPSession(q),tq=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
  await q.evaluate(id=>document.querySelector(`[data-etq="m:${id}"]`).scrollIntoView({block:'center'}),mm.id);await q.waitForTimeout(150);
  const r=await (await q.$(`[data-etq="m:${mm.id}"]`)).boundingBox(),alvo=await q.$(`.etq-pt[data-p="${P3[2]}"]`);
  const y0=await q.evaluate(()=>scrollY);await tq('touchStart',r.x+20,r.y+r.height/2);for(let i=1;i<=6;i++){await tq('touchMove',r.x+20,r.y+r.height/2-i*25);await q.waitForTimeout(16)}await tq('touchEnd');await q.waitForTimeout(300);
  t2=await ter2();ok(t2.mats[0].parte===mm.parte,'deslizar sem segurar não arrasta ('+(await q.evaluate(()=>scrollY))+' de '+y0+' rolado)');
  await q.evaluate(id=>document.querySelector(`[data-etq="m:${id}"]`).scrollIntoView({block:'center'}),mm.id);await q.waitForTimeout(150);
  const r2=await (await q.$(`[data-etq="m:${mm.id}"]`)).boundingBox();await tq('touchStart',r2.x+20,r2.y+r2.height/2);await q.waitForTimeout(450);
  let qb=await alvo.boundingBox();const passos=14;for(let i=1;i<=passos;i++){qb=await alvo.boundingBox();await tq('touchMove',r2.x+20+(qb.x+qb.width/2-r2.x-20)*i/passos,r2.y+r2.height/2+(qb.y+30-r2.y-r2.height/2)*i/passos);await q.waitForTimeout(30)}
  await q.screenshot({path:OUT+'10_toque_arrastando.png'});qb=await alvo.boundingBox();await tq('touchMove',qb.x+qb.width/2,qb.y+30);await tq('touchEnd');await q.waitForTimeout(300);
  t2=await ter2();ok(t2.mats[0].parte===P3[2],'segurar e arrastar no toque leva a matrícula para a parte 3');await c2.close()}
if(GRAVOU)fs.writeFileSync(RF,JSON.stringify(RESTO));console.log('erros:',errs.length?errs:'nenhum');await b.close()})();
