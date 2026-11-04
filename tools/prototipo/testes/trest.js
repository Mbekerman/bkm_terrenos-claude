/* Restrições e entorno (aba Parâmetros urbanísticos, lote 2 da ficha em abas): consulta pela poligonal do terreno,
   PA da Quota Ambiental pelo Mapa 3, inundação sim/não em 5, 25 e 100 anos, distâncias (Comgás, árvores), histórico
   de uso digitado e as layers novas no DXF do lote. Respostas gravadas do GeoSampa real em testes/geosampa/
   (GRAVAR=1 regrava direto do servidor). Lote de teste: SQL 009.027.0009-1, Av. Paulista 1500. Saídas em saida/t_rest/. */
const path=require('path'),fs=require('fs'),{chromium,devices}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',OUT=TMP+'t_rest/',FIX=path.join(__dirname,'geosampa')+'/',L=path.join(__dirname,'..','libs','l')+'/',DADOS=path.join(__dirname,'..','..','..','docs','dados')+'/';
fs.mkdirSync(OUT,{recursive:true});
const GRAVAR=!!process.env.GRAVAR,BASE='https://geo.test/geoserver/geoportal/',REAL='https://geoserver.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/';
const html=fs.readFileSync(path.join(__dirname,'..','..','..','docs','prototipo.html'),'utf8').replace('<title>',`<meta name="geosampa-url" content="${BASE}"><title>`);
const chave=u=>{const q=new URL(u).searchParams,tipo=(q.get('typeNames')||q.get('layers')||'').replace(/geoportal:/g,'').split(',')[0],c=q.get('CQL_FILTER')||'';
  const modo=q.get('request')==='GetMap'?'pdf':q.get('bbox')?'bbox':/DWITHIN/.test(c)?'perto_'+(c.match(/,(\d+),meters/)||[])[1]:/INTERSECTS/.test(c)?'toca':'sql_'+c.replace(/\D/g,'');
  return `${tipo}_${modo}`+(modo==='pdf'?'.pdf':'.json')};
let falhas=0;const ok=(c,m)=>{if(!c){falhas++;console.log('FALHOU:',m)}};
const POLY=(()=>{const lat=-23.56196,lng=-46.65530,m=22,dy=m/2/111320,dx=m/2/(111320*Math.cos(lat*Math.PI/180));return [[lat-dy,lng-dx],[lat-dy,lng+dx],[lat+dy,lng+dx],[lat+dy,lng-dx]]})();
(async()=>{const b=await chromium.launch(),erros=[];
for(const [nome,opt] of [['desktop',{viewport:{width:1440,height:900},deviceScaleFactor:1}],['celular',{...devices['Pixel 7']}]]){
const ctx=await b.newContext({...opt,acceptDownloads:true});
await ctx.route('**/*',async r=>{const u=r.request().url();
  if(/\/dados\//.test(u)){const n=u.split('/dados/')[1];return fs.existsSync(DADOS+n)?r.fulfill({path:DADOS+n,contentType:'application/json'}):r.fulfill({status:404,body:''})}
  if(u.startsWith('http://bkm.test/'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(u.startsWith(BASE)){const k=chave(u);
    if(GRAVAR&&!fs.existsSync(FIX+k)){const rr=await fetch(u.replace(BASE,REAL),{headers:{Referer:'https://novogeosampa.prefeitura.sp.gov.br/'}});let buf=Buffer.from(await rr.arrayBuffer());
      if(k.endsWith('_toca.json')&&!k.startsWith('perimetro_zona')){const j=JSON.parse(buf);j.features.forEach(f=>f.geometry=null);buf=Buffer.from(JSON.stringify(j))}
      fs.writeFileSync(FIX+k,buf)}
    if(!fs.existsSync(FIX+k))return r.fulfill({contentType:'application/json',body:'{"type":"FeatureCollection","features":[]}'});
    return r.fulfill({path:FIX+k,contentType:k.endsWith('.pdf')?'application/pdf':'application/json'})}
  return r.abort()});
await ctx.addInitScript(()=>{window.__qdReal=true});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));
await p.goto('http://bkm.test/prototipo/');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(500);
await p.evaluate(poly=>{const k=Object.keys(localStorage).find(x=>/^bkm-terrenos-prototipo-v/.test(x)),S=JSON.parse(localStorage.getItem(k)),t=S.terrenos.find(x=>x.codigo==='TER-000123');
  t.poly=poly;t.lat=-23.56196;t.lng=-46.6553;t.municipio='São Paulo · SP';t.insc=[{sql:'009.027.0009-1',area:null,valores:[],mun:'sp'}];delete t.geoArea;delete t.histUso;localStorage.setItem(k,JSON.stringify(S))},POLY);
await p.goto('http://bkm.test/prototipo/terrenos/TER-000123/parametros');await p.reload();await p.waitForTimeout(800);
// sem consulta: o PA já vem pela poligonal
await p.evaluate(()=>document.querySelector('#sec-rest .qd-tg')?.click());await p.waitForTimeout(200);
let txt=await p.$eval('#sec-rest',x=>x.innerText.replace(/\s+/g,' '));
ok(/Quota Ambiental\)?\s*PA 5/.test(txt),'PA sem consulta: '+txt.slice(0,300));ok(/Consultar pela poligonal/.test(txt),'botão consultar');
await p.click('#sec-rest [data-a=rest-consultar]');await p.waitForFunction(()=>/GeoSampa pela poligonal/.test(document.querySelector('#sec-rest').innerText),null,{timeout:20000});
txt=await p.$eval('#sec-rest',x=>x.innerText.replace(/\s+/g,' '));console.log(nome,'restrições:',txt);
for(const r of ['Inundação em 5 anos','Inundação em 25 anos','Inundação em 100 anos','Córrego a até 30 m','Árvores na calçada a até 30 m','Rede da Comgás','Classificação viária (CET)','Vila a até 20 m','Linha de alta tensão a até 30 m','Ferrovia a até 30 m','Área contaminada a até 30 m'])ok(txt.includes(r),'falta '+r);
ok(!/largura|rodovia/i.test(txt),'sem largura de via nem rodovia');
const st=await p.evaluate(()=>{const k=Object.keys(localStorage).find(x=>/^bkm-terrenos-prototipo-v/.test(x));const t=JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.codigo==='TER-000123');return {pa:t.geoArea?.camadas?.quota_ambiental,erros:t.geoArea?.erros,arv:(t.geoArea?.camadas?.arvore_v2||[]).length,gas:(t.geoArea?.camadas?.rede_comgas||[])[0],hist:t.hist.slice(-2).map(h=>h.txt)}});
console.log(nome,'estado:',JSON.stringify(st));ok(st.pa&&st.pa[0].pa==='PA 5','PA gravado');ok(!st.erros.length,'camadas com erro '+st.erros);ok(st.hist.some(h=>/pela poligonal/.test(h)),'log da consulta');
// histórico de uso digitado
await p.evaluate(()=>document.querySelector('#sec-histuso .qd-tg')?.click());await p.waitForTimeout(150);
await p.fill('#hu-t','Posto de gasolina até 1998, segundo foto aérea de 1994.');await p.press('#hu-t','Tab');await p.waitForTimeout(200);
ok(await p.evaluate(()=>{const k=Object.keys(localStorage).find(x=>/^bkm-terrenos-prototipo-v/.test(x));return JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.codigo==='TER-000123').histUso})==='Posto de gasolina até 1998, segundo foto aérea de 1994.','histórico gravado');
ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,'rolagem lateral');
await p.evaluate(()=>document.getElementById('sec-rest').scrollIntoView({block:'start'}));await p.evaluate(()=>scrollBy(0,-130));await p.waitForTimeout(200);
await p.screenshot({path:`${OUT}${nome}_restricoes.png`,fullPage:nome==='desktop'});
if(nome==='desktop'){await p.evaluate(()=>{document.documentElement.dataset.tema='escuro'});await p.waitForTimeout(150);await p.screenshot({path:`${OUT}desktop_escuro.png`});await p.evaluate(()=>{document.documentElement.dataset.tema='claro'});
  // DXF do lote com as layers novas
  await p.evaluate(()=>document.querySelector('.fi-abas [data-t=terreno]').click());await p.waitForTimeout(300);
  await p.evaluate(()=>{document.querySelectorAll('section.qd-fechado .qd-tg').forEach(x=>x.click());document.querySelectorAll('.lt-det').forEach(d=>d.open=true)});await p.waitForTimeout(200);
  await p.click('[data-a=geo-buscar][data-i="0"]');await p.waitForFunction(k=>{const t=JSON.parse(localStorage.getItem(Object.keys(localStorage).find(x=>/^bkm-terrenos-prototipo-v/.test(x)))).terrenos.find(x=>x.codigo==='TER-000123');return t.docs.some(d=>d.tipo==='lote_dxf')},null,{timeout:20000});
  await p.waitForTimeout(400);
  const [d]=await Promise.all([p.waitForEvent('download'),p.click('[data-a=geo-baixar][data-k=dxf]')]);await d.saveAs(OUT+'lote.dxf');
  const dxf=fs.readFileSync(OUT+'lote.dxf','utf8');const lays=[...new Set([...dxf.matchAll(/\r\n8\r\n([A-Z_0-9]+)\r\n/g)].map(m=>m[1]))];console.log('layers com desenho:',lays.join(', '));
  for(const l of ['ARVORES','CLASSIF_VIARIA_CET','LOTES'])ok(lays.includes(l),'DXF sem '+l);ok(/Quota Ambiental PA 5/.test(dxf),'PA no título do DXF');
  const quadro=await p.$eval('#geo-0',x=>x.innerText.replace(/\s+/g,' '));ok(/Perímetro de qualificação ambiental \(Quota Ambiental\) PA 5/.test(quadro),'PA no quadro do lote: '+quadro.slice(0,400))}
await ctx.close()}
ok(!erros.length,'erros: '+erros.join(' | '));
await b.close();console.log(falhas?falhas+' falha(s)':'ok');process.exit(falhas?1:0)})();
