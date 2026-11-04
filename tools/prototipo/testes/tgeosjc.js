// Inscrição por cidade e GeoSanja (São José dos Campos): escolher a cidade troca rótulo e máscara,
// a duplicidade compara cidade + inscrição, cadastrar com a inscrição busca sozinho, completa a
// poligonal, registra a análise e guarda planta (PDF) e desenho (DXF). Respostas gravadas do servidor
// real (lote 41.0024.0011.0000, Vila Adyanna) em testes/geosanja/; GRAVAR=1 regrava pelo Caddy local
// (PORT=8099, ver Caddyfile). Saídas em saida/t_geosjc/.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',OUT=TMP+'t_geosjc/',FIX=path.join(__dirname,'geosanja')+'/',L=path.join(__dirname,'..','libs','l')+'/';
fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(FIX,{recursive:true});
const GRAVAR=!!process.env.GRAVAR,BASE='https://sjc.test/v1/';
const html=fs.readFileSync(TMP+'bkm-terrenos.html','utf8').replace('<title>',`<meta name="geosanja-url" content="${BASE}"><title>`);
const chave=r=>{const u=new URL(r.url()),q=u.searchParams,p=u.pathname.split('/').pop();
  if(p==='localizar')return 'localizar_'+JSON.parse(r.postData()).parametros[0].value.replace(/\D/g,'')+'.json';
  if(p==='autenticar')return 'autenticar.json';
  const fmt=q.get('REQUEST')==='GetMap'?(q.get('FORMAT')==='image/jpeg'?'.jpg':'.png'):'.json';
  return q.get('LAYERS').replace('geoSJC:','')+'_'+q.get('REQUEST')+fmt};
(async()=>{const b=await chromium.launch(),errs=[],pedidos=[];
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.25,acceptDownloads:true});
await ctx.route('**/*',async r=>{const u=r.request().url();
  if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(u.startsWith(BASE)){const k=chave(r.request());pedidos.push(k);
    if(GRAVAR){const rr=await fetch(u.replace(BASE,'http://localhost:8099/geosanja/v1/'),{method:r.request().method(),headers:r.request().headers(),body:r.request().postData()});
      const buf=Buffer.from(await rr.arrayBuffer());
      // o token de verdade vai só para o navegador; no repositório fica um de mentira
      if(rr.ok)fs.writeFileSync(FIX+k,k==='autenticar.json'?JSON.stringify({token:'token-de-teste',autenticado:false}):buf);
      if(k==='autenticar.json')return r.fulfill({body:buf,contentType:'application/json'})}
    if(!fs.existsSync(FIX+k))return r.fulfill({contentType:'application/json',body:k.startsWith('localizar')?'[]':'{"type":"FeatureCollection","features":[]}'});
    return r.fulfill({path:FIX+k,contentType:k.endsWith('.jpg')?'image/jpeg':k.endsWith('.png')?'image/png':'application/json'})}
  return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(600);
const toast=()=>p.$eval('#toast',x=>x.textContent);
const KEY='bkm-terrenos-prototipo-v9',ter=n=>p.evaluate(([k,n])=>JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.nome===n),[KEY,n]);
const kmlQuadra=(lat,lng,m=20)=>{const dy=m/2/111320,dx=m/2/(111320*Math.cos(lat*Math.PI/180)),c=[[lng-dx,lat-dy],[lng+dx,lat-dy],[lng+dx,lat+dy],[lng-dx,lat+dy],[lng-dx,lat-dy]].map(p=>p.join(',')).join(' ');
  return `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Lote</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${c}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`};
const importarKml=async kml=>{const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=nv-kmz]')]);await fc.setFiles({name:'l.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(kml)});await p.waitForSelector('#f-novo',{timeout:10000});await p.waitForTimeout(300)};
// 1. passo 1 só pela poligonal; no passo 2 a inscrição segue o município (SP → SQL, SJC → inscrição imobiliária)
await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
const campo=(pre='n')=>p.evaluate(pre=>({rot:document.querySelector('#'+pre+'-sql-l').textContent,ph:document.querySelector('#'+pre+'-sql').placeholder,v:document.querySelector('#'+pre+'-sql').value}),pre);
console.log('passo 1: opções',JSON.stringify(await p.$$eval('.nv-op b',x=>x.map(b=>b.textContent))),'| campo de inscrição?',await p.$$eval('#modal [name=sql]',x=>x.length));
await importarKml(kmlQuadra(-23.204989,-45.9));await p.evaluate(()=>document.querySelector('#f-novo details').open=true);
await p.fill('#n-mun','São Paulo · SP');await p.fill('#n-sql','0890000000000');console.log('SP:',JSON.stringify(await campo()));
await p.fill('#n-sql','');await p.fill('#n-mun','São José dos Campos · SP');await p.fill('#n-sql','41002400110000');console.log('SJC:',JSON.stringify(await campo()));
await p.screenshot({path:OUT+'1_novo_sjc.png'});
await p.fill('#n-mun','São José dos Campos · SP');await p.fill('#f-novo [name=nome]','Lote SJC');await p.fill('#f-novo [name=bairro]','Vila Adyanna');
await p.evaluate(()=>document.querySelector('#f-novo').requestSubmit());
await p.waitForFunction(()=>/Planta e desenho/.test(document.querySelector('#toast').textContent),null,{timeout:20000}).catch(async e=>{console.log('toast:',await toast(),'erros:',errs,'pedidos:',pedidos);throw e});
const st=await ter('Lote SJC').then(t=>{const i=t.insc[0],g=i.geo[0];return {mun:i.mun,sql:i.sql,municipio:t.municipio,poly:t.poly&&t.poly.length,lat:t.lat,area:i.area,areaPol:g.areaPol,zonas:g.zonas,erros:g.erros,
  analise:(t.analises.find(a=>a.status==='vigente')||{}).fonte,docs:t.docs.map(d=>d.tipo+':v'+d.versoes+':'+d.nome),hist:t.hist.map(h=>h.txt)}});
console.log('estado:',JSON.stringify(st));
await p.evaluate(()=>{if(!document.getElementById('geo-0'))document.querySelector('.fi-abas [data-t=terreno]').click()});await p.waitForTimeout(300);
console.log('quadro:',await p.$eval('#geo-0',x=>x.innerText.replace(/\s+/g,' ')));
await p.evaluate(()=>document.getElementById('geo-0').scrollIntoView({block:'start'}));await p.evaluate(()=>scrollBy(0,-120));await p.waitForTimeout(200);
await p.screenshot({path:OUT+'2_quadro.png'});
for(const k of ['pdf','dxf']){const [d]=await Promise.all([p.waitForEvent('download'),p.click(`[data-a=geo-baixar][data-k=${k}]`)]);await d.saveAs(OUT+'lote.'+k);
  console.log('baixou',k,d.suggestedFilename(),fs.statSync(OUT+'lote.'+k).size,'bytes',fs.readFileSync(OUT+'lote.'+k).slice(0,8).toString())}
// 2. nova inscrição na ficha: sem seletor, a cidade é a do terreno (pela poligonal); outra inscrição de SJC entra
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));console.log('ficha: seletor?',await p.$$eval('[data-form=insc] .insc-cid',x=>x.length),'| cidade:',await p.$eval('[data-form=insc] [name=mun]:checked',x=>x.value),'|',await p.$eval('#i-sql-l',x=>x.textContent),'|',await p.$eval('#i-sql',x=>x.placeholder));
await p.fill('#i-sql','41002400120000');await p.evaluate(()=>document.querySelector('[data-form=insc]').requestSubmit());await p.waitForTimeout(400);
console.log('inscrições:',JSON.stringify((await ter('Lote SJC')).insc.map(i=>i.mun+':'+i.sql)));
// 3. passo 2 (área de outro lugar de SJC importada de KML): a inscrição acompanha o município digitado
const kml=`<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Outro lote</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-45.90,-23.20 -45.8997,-23.20 -45.8997,-23.2003 -45.90,-23.2003 -45.90,-23.20</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=nv-kmz]')]);await fc.setFiles({name:'l.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(kml)});await p.waitForSelector('#f-novo');await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelector('#f-novo details').open=true);
console.log('passo 2: seletor?',await p.$$eval('#f-novo .insc-cid',x=>x.length));
await p.fill('#n-mun','Taubaté · SP');await p.fill('#n-sql','abc-123/9');console.log('Taubaté:',JSON.stringify(await campo('n')));
await p.fill('#n-sql','');await p.fill('#n-mun','São José dos Campos · SP');await p.fill('#n-sql','41002400110000');await p.waitForTimeout(150);console.log('SJC:',JSON.stringify(await campo('n')),'| foco:',await p.evaluate(()=>document.activeElement.id));console.log('mesma inscrição:',await p.$eval('#dedupe',x=>x.innerText.replace(/\s*\n\s*/g,' / ').slice(0,160)));
await p.fill('#n-sql','41002400990000');await p.waitForTimeout(150);console.log('mesma quadra:',await p.$eval('#dedupe',x=>x.innerText.replace(/\s*\n\s*/g,' / ').slice(0,160)));
await p.focus('#n-mun');await p.fill('#n-mun','São Paulo · SP');await p.waitForTimeout(150);console.log('trocou para SP:',JSON.stringify(await campo('n')),'| foco:',await p.evaluate(()=>document.activeElement.id),'|',await p.$eval('#dedupe',x=>x.innerText.replace(/\s*\n\s*/g,' / ').slice(0,160)));
await p.fill('#n-mun','São José dos Campos · SP');await p.waitForTimeout(150);
// 4. celular e escuro
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(400);
console.log('celular (novo): rolagem horizontal?',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.screenshot({path:OUT+'3_novo_celular.png'});
await p.keyboard.press('Escape');await p.waitForTimeout(200);
await p.evaluate(()=>document.getElementById('geo-0').scrollIntoView({block:'start'}));await p.evaluate(()=>scrollBy(0,-70));await p.waitForTimeout(200);
console.log('celular (quadro): rolagem horizontal?',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'quadro vaza?',await p.$eval('#geo-0',x=>x.scrollWidth>x.clientWidth+1));
await p.screenshot({path:OUT+'4_quadro_celular.png'});
await p.setViewportSize({width:1440,height:900});await p.evaluate(()=>{document.documentElement.dataset.tema='escuro'});await p.waitForTimeout(150);
await p.evaluate(()=>document.getElementById('geo-0').scrollIntoView({block:'start'}));await p.evaluate(()=>scrollBy(0,-120));await p.screenshot({path:OUT+'5_quadro_escuro.png'});
console.log('pedidos:',[...new Set(pedidos)].join(' '));console.log('ERROS',errs);await b.close()})();
