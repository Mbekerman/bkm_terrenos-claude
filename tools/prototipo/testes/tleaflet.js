// Mapa Leaflet abre de verdade: sem erro no console nem na página e com o CSS do Leaflet aplicado (o #183 tirou o CSS
// sem ninguém perceber: o mapa abria em pedaços, sem erro nenhum). Usa o docs/prototipo.html, o que vai para o ar.
// Servido como no ar, em http://bkm.test/prototipo, com docs/dados em /prototipo/dados. O leaflet.js vem do cdnjs, como no ar; com OFFLINE=1, da cópia em libs/l (ver README). Ladrilhos do mapa: tile.png.
const path=require('path'),fs=require('fs'),{chromium,devices}=require('playwright');
const F=path.join(__dirname,'..','..','..','docs','prototipo.html'),L=path.join(__dirname,'..','libs','l')+'/',DADOS=path.join(__dirname,'..','..','..','docs','dados')+'/',TILE=path.join(__dirname,'tile.png');
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch();
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+' '+tema,erros=[];
  const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900}}:{...devices['Pixel 7']});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/^http:\/\/bkm\.test\/prototipo\/dados\//.test(u)){const n=u.split('/dados/')[1].split('?')[0];return fs.existsSync(DADOS+n)?r.fulfill({path:DADOS+n,contentType:'application/json'}):r.fulfill({status:404,body:''})}
    if(u.startsWith('http://bkm.test/prototipo'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});
    if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:TILE,contentType:'image/png'});
    if(/cdnjs\.cloudflare\.com/.test(u)){if(process.env.OFFLINE)return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.continue()}
    if(/fonts\.(googleapis|gstatic)\.com/.test(u))return r.continue();
    return r.abort()});
  const p=await ctx.newPage();
  p.on('pageerror',e=>erros.push('página: '+e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/net::ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text()))erros.push('console: '+m.text())});
  await p.goto('http://bkm.test/prototipo/');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);
  await p.goto('http://bkm.test/prototipo/mapa');  // o link direto abre o Mapa
  await p.waitForSelector('#mapa .leaflet-pane',{timeout:15000}).catch(()=>{});await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>{const m=document.querySelector('#mapa');if(!m||!window.L)return {L:!!window.L,m:!!m};const cs=s=>{const e=m.querySelector(s);return e?getComputedStyle(e):null};
    const mb=m.getBoundingClientRect(),tiles=[...m.querySelectorAll('img.leaflet-tile')];
    return {L:true,m:true,cont:m.classList.contains('leaflet-container'),over:getComputedStyle(m).overflow,
      pane:cs('.leaflet-pane')?.position,tile:cs('img.leaflet-tile')?.position,
      tiles:tiles.length,fora:tiles.filter(t=>{const r=t.getBoundingClientRect();return r.top>mb.bottom+600||r.left>mb.right+600}).length,
      pins:m.querySelectorAll('.leaflet-marker-icon.pin').length,alt:Math.round(mb.height),larg:Math.round(mb.width)}});
  console.log('   '+tag+':',JSON.stringify(r));
  ok(r.L&&r.m&&r.cont,tag+': Leaflet carregou e montou o mapa');
  ok(r.pane==='absolute'&&r.tile==='absolute'&&r.over==='hidden',tag+': CSS do Leaflet aplicado (camadas e ladrilhos posicionados, mapa recorta o que sai)');
  ok(r.tiles>0&&r.fora===0,tag+': ladrilhos dentro do mapa');
  ok(r.pins>0,tag+': pinos dos terrenos no mapa');
  ok(r.alt>200&&r.larg>200,tag+': mapa com tamanho ('+r.larg+' × '+r.alt+')');
  ok(!erros.length,tag+': sem erro no console '+erros.join(' | '));
  await ctx.close()}
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
