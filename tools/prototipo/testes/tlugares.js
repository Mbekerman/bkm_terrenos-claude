// Página Mapa com Google: versão escura do mapa no tema escuro; só Mapa e Satélite (Relevo saiu); lugares do Google sempre ligados, sem botão
// para desligar (decisão do Moisés, 23/out/2026; uma meta antiga de Map ID sem lugares não muda nada) e o toque num lugar abre nota e avaliações
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_lugares')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const base=fs.readFileSync(F,'utf8');
(async()=>{const b=await chromium.launch(),erros=[];
for(const [cfg,mapid] of [['sem Map ID',''],['com meta antiga de Map ID','abc123semlugares']]){
const html=base.replace('<title>',`<meta name="gmaps-key" content="AIzaTESTETESTETESTETESTETESTE0000"><meta name="gmaps-mapid-sem-lugares" content="${mapid}"><title>`);
const ctx=await b.newContext({viewport:{width:1400,height:900}});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(u.includes('maps.googleapis.com/maps/api/js'))return r.fulfill({path:path.join(__dirname,'fake_gmaps3.js'),contentType:'application/javascript'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(800);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(600);
const st=()=>p.evaluate(()=>{const m=window.__mapas.at(-1);return {n:window.__mapas.length,mapId:m&&m.opts.mapId,click:m&&m.opts.clickableIcons,ops:[...document.querySelectorAll('[data-a=mp-base]')].map(x=>x.textContent).join('|'),lug:document.querySelector('[data-a=mp-lugares]')?.getAttribute('aria-pressed'),toast:document.querySelector('.toast')?.textContent||''}});
let s=await st();
ok(s.ops==='Mapa|Satélite',`${cfg}: camadas ${s.ops}`);
ok(s.lug===undefined&&s.mapId==='DEMO_MAP_ID'&&s.click===true,`${cfg}: lugares visíveis e clicáveis, sem botão Lugares (${JSON.stringify(s)})`);
// toque num lugar
await p.evaluate(()=>{window.__lugar={displayName:'Padaria <Boa>',formattedAddress:'Rua X, 10',rating:4.4,userRatingCount:1234,googleMapsURI:'https://maps.google.com/?cid=1',reviews:[{rating:5,text:'Ótimo pão',relativePublishTimeDescription:'há 2 semanas',authorAttribution:{displayName:'Ana',uri:'https://maps.google.com/u/ana'}},{rating:3,text:'x'.repeat(300),relativePublishTimeDescription:'há 1 mês',authorAttribution:{displayName:'Beto'}}]};
  const m=window.__mapas.at(-1);let parou=false;m.ls.click.forEach(f=>f({placeId:'lugar1',latLng:{lat:()=>-23.58,lng:()=>-46.58},stop:()=>{parou=true}}));window.__parou=parou});
await p.waitForTimeout(200);
const inf=await p.evaluate(()=>({html:window.__info.html,aberto:window.__info.aberto,parou:window.__parou,f:window.__fetch.length,campos:window.__fetch[0]?.fields.join(',')}));
ok(inf.parou&&inf.aberto&&/Padaria &lt;Boa&gt;/.test(inf.html)&&/4,4/.test(inf.html)&&/1\.234 avaliações/.test(inf.html)&&/Ana/.test(inf.html)&&/…/.test(inf.html)&&/Ver todas no Google Maps/.test(inf.html),`${cfg}: toque no lugar abre nome, nota, avaliações (texto longo cortado) e link`);
ok(/★★★★☆/.test(inf.html)&&!/⯪/.test(inf.html),`${cfg}: estrelas inteiras (sem meia estrela, que some no Android)`);
ok(/reviews/.test(inf.campos)&&/rating/.test(inf.campos),`${cfg}: pede ${inf.campos}`);
await p.evaluate(()=>{const m=window.__mapas.at(-1);m.ls.click.forEach(f=>f({placeId:'lugar1',latLng:{lat:()=>-23.58,lng:()=>-46.58},stop:()=>{}}))});await p.waitForTimeout(150);
ok(await p.evaluate(()=>window.__fetch.length)===1,`${cfg}: segundo toque no mesmo lugar não consulta de novo`);
if(mapid){fs.writeFileSync(O+'quadro.html','<meta charset=utf-8><link rel=stylesheet href="x.css"><style>'+(await p.evaluate(()=>[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).filter(t=>/\.lug/.test(t)).join('\n')}catch(e){return ''}}).join('\n')))+'</style><div style="width:300px;padding:12px;border:1px solid #ccc;border-radius:8px;margin:20px">'+inf.html+'</div>')}
if(!mapid){const n0=await p.evaluate(()=>window.__mapas.length),c0=await p.evaluate(()=>window.__mapas.at(-1).opts.colorScheme);
  await p.click('[data-a=tema-menu]');await p.click('[data-a=tema][data-v=escuro]');await p.waitForTimeout(300);
  const t=await p.evaluate(()=>({n:window.__mapas.length,c:window.__mapas.at(-1).opts.colorScheme}));
  ok(c0==='LIGHT'&&t.n===n0+1&&t.c==='DARK',`${cfg}: tema escuro recria o mapa com a versão escura do Google (${c0} → ${t.c})`);
  await p.click('[data-a=tema-menu]');await p.click('[data-a=tema][data-v=escuro]');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>window.__mapas.length)===n0+1,`${cfg}: escolher o mesmo tema não recria o mapa`);
  await p.click('[data-a=tema-menu]');await p.click('[data-a=tema][data-v=claro]');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>window.__mapas.at(-1).opts.colorScheme)==='LIGHT',`${cfg}: voltar ao claro volta o mapa claro`)}
// fechar: X, clique no mapa e Esc
const fechou=async(acao)=>{await p.evaluate(()=>{const m=window.__mapas.at(-1);m.ls.click.forEach(f=>f({placeId:'lugar1',latLng:{lat:()=>-23.58,lng:()=>-46.58},stop:()=>{}}))});await p.waitForTimeout(100);
  const antes=await p.evaluate(()=>window.__info.aberto);await p.evaluate(acao);await p.waitForTimeout(100);return antes&&!(await p.evaluate(()=>window.__info.aberto))};
ok(await fechou(()=>window.__info.node.querySelector('.lug-x').click()),`${cfg}: o X fecha o quadro`);
ok(await fechou(()=>{const m=window.__mapas.at(-1);m.ls.click.forEach(f=>f({latLng:{lat:()=>-23.5,lng:()=>-46.5},stop:()=>{}}))}),`${cfg}: clique no mapa fecha o quadro`);
ok(await fechou(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))),`${cfg}: Esc fecha o quadro`);
// desligar
s=await st();ok(s.lug===undefined&&s.mapId==='DEMO_MAP_ID'&&s.click===true,`${cfg}: lugares continuam ligados, sem botão para desligar`);
if(mapid)await p.screenshot({path:O+'barra.png',clip:{x:640,y:80,width:740,height:80}});
await ctx.close()}
ok(!erros.length,'sem erros de página '+erros.join('; '));
await b.close();console.log(falhas.length?falhas.length+' falha(s)':'tudo ok');process.exit(falhas.length?1:0)})();
