// GeoSampa pelo SQL: cadastrar com SQL busca sozinho, completa campos vazios, mostra o que toca o lote,
// registra a análise e guarda PDF e DXF nos documentos. Respostas gravadas do servidor real (lote
// 009.027.0009-1, Av. Paulista 1500) em testes/geosampa/; GRAVAR=1 regrava pelo Caddy local
// (PORT=8099, ver Caddyfile). Saídas em saida/t_geo/.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',OUT=TMP+'t_geo/',FIX=path.join(__dirname,'geosampa')+'/',L=path.join(__dirname,'..','libs','l')+'/';
fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(FIX,{recursive:true});
const GRAVAR=!!process.env.GRAVAR,BASE='https://geo.test/geoserver/geoportal/';
const html=fs.readFileSync(TMP+'bkm-terrenos.html','utf8').replace('<title>',`<meta name="geosampa-url" content="${BASE}"><title>`);
const chave=u=>{const q=new URL(u).searchParams,tipo=(q.get('typeNames')||q.get('layers')||'').replace(/geoportal:/g,'').split(',')[0];
  const modo=q.get('request')==='GetMap'?'pdf':q.get('bbox')?'bbox':/INTERSECTS|DWITHIN/.test(q.get('CQL_FILTER')||'')?'toca':'sql_'+(q.get('CQL_FILTER')||'').replace(/\D/g,'');
  return `${tipo}_${modo}`+(modo==='pdf'?'.pdf':'.json')};
(async()=>{const b=await chromium.launch(),errs=[],pedidos=[];
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.25,acceptDownloads:true});
await ctx.route('**/*',async r=>{const u=r.request().url();
  if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(u.startsWith(BASE)){const k=chave(u);pedidos.push(k);
    if(GRAVAR){const rr=await fetch(u.replace(BASE,'http://localhost:8099/geosampa/geoserver/geoportal/'));let buf=Buffer.from(await rr.arrayBuffer());
      // só a camada de zoneamento precisa da geometria (área da zona no lote); as outras ficam leves
      if(k.endsWith('_toca.json')&&!k.startsWith('perimetro_zona')){const j=JSON.parse(buf);j.features.forEach(f=>f.geometry=null);buf=Buffer.from(JSON.stringify(j))}
      fs.writeFileSync(FIX+k,buf)}
    if(!fs.existsSync(FIX+k))return r.fulfill({contentType:'application/json',body:'{"type":"FeatureCollection","features":[]}'});
    return r.fulfill({path:FIX+k,contentType:k.endsWith('.pdf')?'application/pdf':'application/json'})}
  return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(600);
const toast=()=>p.$eval('#toast',x=>x.textContent);
const KEY='bkm-terrenos-prototipo-v9',ter=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.nome==='Paulista 1500'),KEY);
const abrir=async()=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(150);
  await p.waitForTimeout(150);
  await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Paulista 1500')).click());await p.waitForTimeout(300);
  await p.evaluate(()=>{if(!document.getElementById('geo-0'))document.querySelector('.fi-abas [data-t=terreno]').click()});await p.waitForTimeout(300)};
const mudar=async fn=>{await p.evaluate(([k,f])=>{const s=JSON.parse(localStorage.getItem(k));const t=s.terrenos.find(x=>x.nome==='Paulista 1500');(new Function('t',f))(t);localStorage.setItem(k,JSON.stringify(s))},[KEY,fn]);await p.reload();await p.waitForTimeout(500);await abrir()};
// 1. novo terreno com SQL: busca sozinho
const kmlQuadra=(lat,lng,m=20)=>{const dy=m/2/111320,dx=m/2/(111320*Math.cos(lat*Math.PI/180)),c=[[lng-dx,lat-dy],[lng+dx,lat-dy],[lng+dx,lat+dy],[lng-dx,lat+dy],[lng-dx,lat-dy]].map(p=>p.join(',')).join(' ');
  return `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Lote</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${c}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`};
const importarKml=async kml=>{const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=nv-kmz]')]);await fc.setFiles({name:'l.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(kml)});await p.waitForSelector('#f-novo',{timeout:10000});await p.waitForTimeout(300)};
// passo 1: a poligonal (só desenho ou KMZ/KML; a inscrição não abre cadastro); passo 2 com o SQL
await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
console.log('passo 1: opções',JSON.stringify(await p.$$eval('.nv-op b',x=>x.map(b=>b.textContent))),'| campo de inscrição?',await p.$$eval('#modal [name=sql]',x=>x.length));
await importarKml(kmlQuadra(-23.56196,-46.65530,22));
await p.fill('#n-mun','São Paulo · SP');await p.evaluate(()=>document.querySelector('#f-novo details').open=true);await p.fill('#n-sql','00902700091');
console.log('passo 2:',await p.$eval('#modal .banner',x=>x.innerText.replace(/\s+/g,' ')),'| SQL:',await p.$eval('#n-sql',x=>x.value),'|',await p.$eval('#n-sql-l',x=>x.textContent));
await p.fill('#f-novo [name=nome]','Paulista 1500');await p.fill('#f-novo [name=logradouro]','Av. Paulista');await p.fill('#f-novo [name=numero]','1500');
await p.evaluate(()=>{document.querySelector('#f-novo [name=tipoEmp][value=mercado]')?.click();document.querySelector('#f-novo').requestSubmit()});
await p.waitForFunction(()=>/Planta e desenho/.test(document.querySelector('#toast').textContent),null,{timeout:15000});
const st=await ter().then(t=>{const i=t.insc[0];return {sqlFmt:i.sql,area:i.area,cib:i.cib,zf:i.zf,aCad:t.aCad,aConst:t.aConst,poly:t.poly&&t.poly.length,lat:t.lat,
  analise:t.analises.find(a=>a.status==='vigente'),docs:t.docs.map(d=>d.tipo+':v'+d.versoes+':'+d.nome),consultas:i.geo.length,erros:i.geo[0].erros,zonas:i.geo[0].zonas,hist:t.hist.map(h=>h.txt)}});
console.log('estado:',JSON.stringify(st));
await p.evaluate(()=>{if(!document.getElementById('geo-0'))document.querySelector('.fi-abas [data-t=terreno]').click()});await p.waitForTimeout(300);
console.log('quadro:',await p.$eval('#geo-0',x=>x.innerText.replace(/\s+/g,' ')));
await p.evaluate(()=>document.getElementById('geo-0').scrollIntoView({block:'start'}));await p.evaluate(()=>scrollBy(0,-80));await p.waitForTimeout(200);
await p.screenshot({path:OUT+'1_quadro_claro.png'});
// 2. baixar o DXF e o PDF
for(const k of ['dxf','pdf']){const [d]=await Promise.all([p.waitForEvent('download'),p.click(`[data-a=geo-baixar][data-k=${k}]`)]);await d.saveAs(OUT+'lote.'+k);console.log('baixou',k,d.suggestedFilename(),fs.statSync(OUT+'lote.'+k).size,'bytes')}
// 3. buscar de novo: nova consulta guardada, documentos com versão 2, área já preenchida não muda
await mudar('t.insc[0].area=600');
console.log('depois de recarregar, baixar sem arquivo:');await p.click('[data-a=geo-baixar][data-k=dxf]');await p.waitForTimeout(200);console.log('  ',await toast());
await p.click('#geo-0 [data-a=geo-buscar]');
await p.waitForFunction(k=>/Planta e desenho/.test(document.querySelector('#toast').textContent)&&JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.nome==='Paulista 1500').docs.some(d=>d.versoes===2&&d.tipo==='lote_dxf'),KEY,{timeout:15000});
console.log('de novo:',JSON.stringify(await ter().then(t=>({area:t.insc[0].area,consultas:t.insc[0].geo.length,docs:t.docs.map(d=>d.tipo+':v'+d.versoes),analises:t.analises.length}))));
// 4. escuro e celular
await p.evaluate(()=>{document.documentElement.dataset.tema='escuro'});await p.waitForTimeout(150);
await p.evaluate(()=>document.getElementById('geo-0').scrollIntoView({block:'start'}));await p.evaluate(()=>scrollBy(0,-80));await p.screenshot({path:OUT+'2_quadro_escuro.png'});
await p.evaluate(()=>{document.documentElement.dataset.tema='claro'});
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(400);
await p.evaluate(()=>document.getElementById('geo-0').scrollIntoView({block:'start'}));await p.evaluate(()=>scrollBy(0,-70));await p.waitForTimeout(200);
console.log('celular: rolagem horizontal?',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'quadro vaza?',await p.$eval('#geo-0',x=>x.scrollWidth>x.clientWidth+1));
await p.screenshot({path:OUT+'3_celular.png'});await p.setViewportSize({width:1440,height:900});
// 5. Leitura não tem o botão; SQL inexistente avisa
await p.evaluate(()=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector(`[data-a=role][data-v=${'Leitura'}]`).click()});await p.waitForTimeout(200);
console.log('leitura tem botão?',await p.$$eval('[data-a=geo-buscar]',x=>x.length));
await p.evaluate(()=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector(`[data-a=role][data-v=${'Diretor'}]`).click()});await p.waitForTimeout(200);
await mudar("t.insc.push({sql:'111.222.3333-4',area:null,valores:[]})");
console.log('botões:',await p.$$eval('[data-a=geo-buscar]',x=>x.map(b=>b.dataset.i+':'+b.textContent)));
await p.click('[data-a=geo-buscar][data-i="1"]');await p.waitForFunction(()=>document.querySelector('#toast').textContent,null,{timeout:5000}).catch(()=>{});console.log('SQL inexistente:',await toast());
// 6. usar a poligonal dos lotes: troca a desenhada pela soma dos lotes, mostrando antes a diferença; inscrição sem lote fica de fora
console.log('lotes: botão?',await p.$$eval('#sec-insc [data-a=lotes-poly]',x=>x.map(b=>b.textContent)));
const antes=await ter();await p.click('#sec-insc [data-a=lotes-poly]');await p.waitForSelector('#modal .lotes-kv',{timeout:10000});
console.log('lotes: modal',await p.$eval('#modal',x=>x.innerText.replace(/\s+/g,' ').slice(0,600)));
await p.screenshot({path:OUT+'4_lotes.png'});
await p.click('[data-a=lotes-usar]');await p.waitForTimeout(300);
const depois=await ter();const ar=pp=>{const lat0=pp.reduce((s,q)=>s+q[0],0)/pp.length*Math.PI/180,R=6371008;let a=0;pp.forEach((q,i)=>{const r=pp[(i+1)%pp.length];a+=(r[1]-q[1])*Math.PI/180*Math.cos(lat0)*R*((r[0]+q[0])/2)*Math.PI/180*R});return Math.abs(a)};
console.log('lotes: poligonal',Math.round(ar(antes.poly)),'→',Math.round(ar(depois.poly)),'m² | guardadas',(depois.polyAnt||[]).length,'|',depois.hist.find(h=>/lotes/.test(h.txt))?.txt,'| centro',depois.poly.reduce((s,q)=>[s[0]+q[0]/depois.poly.length,s[1]+q[1]/depois.poly.length],[0,0]).map(v=>v.toFixed(6)).join(','),'|',await toast());
await p.evaluate(()=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector(`[data-a=role][data-v=${'Leitura'}]`).click()});await p.waitForTimeout(200);
console.log('lotes: leitura tem botão?',await p.$$eval('[data-a=lotes-poly]',x=>x.length));
console.log('pedidos:',[...new Set(pedidos)].length,'arquivos distintos');console.log('ERROS',errs);await b.close()})();
