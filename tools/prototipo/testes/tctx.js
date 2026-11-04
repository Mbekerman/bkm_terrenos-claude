// Menu do clique direito no mapa (toque longo no celular): novo terreno, ponto de interesse, concorrência;
// concorrência na legenda e cadastro na gaveta (detalhes em tconc.js); barra só com tipo de mapa + Importar KMZ, sem fundo branco. Prints em saida/t_ctx.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_ctx/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelector('.mapa').scrollIntoView({block:'start'}));await p.waitForTimeout(300);
ok(!(await p.$('[data-a=mp-modo][data-v=pin]'))&&!(await p.$('[data-a=mp-modo][data-v=poi]')),tag+' sem Novo pin e Ponto de interesse');
const barra=await p.evaluate(()=>{const b=document.querySelector('.mp-barra');return {bg:getComputedStyle(b).backgroundColor,kmz:!!b.querySelector('.mp-kmz,[data-a=mp-kmz]')}});
ok(barra.bg==='rgba(0, 0, 0, 0)'&&!barra.kmz,tag+' barra sem fundo e sem importar KMZ (só no Novo terreno) '+JSON.stringify(barra));
const n0=await p.$$eval('#mapa .conc',e=>e.length);const leg=await p.$eval('#mp-leg',x=>x.textContent.replace(/\s+/g,' '));ok(/Pontos de interesse\s*\d+\s*Concorrência\s*3/.test(leg)&&n0===3,tag+' concorrência na legenda e no mapa ('+n0+')');
// um ponto vazio do mapa (longe de pinos e poligonais: segurar sobre uma poligonal entra em edição)
const m=await p.$eval('#mapa',x=>{const r=x.getBoundingClientRect();for(const fy of [.42,.5,.58,.35,.65])for(const fx of [.55,.45,.65,.35,.75]){const q={x:r.x+r.width*fx,y:r.y+r.height*fy},e=document.elementFromPoint(q.x,q.y);
  if(e&&!e.closest('.leaflet-interactive,.leaflet-marker-icon,.mp-barra,.mp-legenda,.mp-modo,.leaflet-control')&&!document.elementsFromPoint(q.x-25,q.y-25).concat(document.elementsFromPoint(q.x+25,q.y+25)).some(z=>z.matches('.leaflet-interactive,.leaflet-marker-icon')))return q}return {x:r.x+r.width*.55,y:r.y+r.height*.42}});
if(modo==='desktop'){await p.mouse.click(m.x,m.y,{button:'right'});await p.waitForTimeout(300)}
else{const c=await ctx.newCDPSession(p);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:m.x,y:m.y}]});await p.waitForTimeout(400);ok(!(await p.$('.mp-ctx')),tag+' menu não abre antes do tempo');await p.waitForTimeout(500);ok(!(await p.$('.mp-ctx')),tag+' menu espera o dedo sair');await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(400)}
const itens=await p.$$eval('.mp-ctx button',e=>e.map(x=>x.textContent.trim()));ok(itens.join('|')==='Novo terreno aqui',tag+' menu só com Novo terreno aqui: '+itens.join(' | '));
await p.screenshot({path:OUT+tag+'_menu.png'});
if(modo==='desktop'){await p.keyboard.press('Escape');await p.waitForTimeout(200);ok(!(await p.$('.mp-ctx')),tag+' Esc fecha o menu');
  await p.mouse.click(m.x,m.y,{button:'right'});await p.waitForTimeout(200);await p.mouse.click(m.x-200,m.y+100);await p.waitForTimeout(200);ok(!(await p.$('.mp-ctx')),tag+' clique fora fecha o menu');
  await p.mouse.click(m.x,m.y,{button:'right'});await p.waitForTimeout(200)}
if(modo!=='desktop'){await p.keyboard.press('Escape');await p.waitForTimeout(200)}
if(modo==='desktop'){await p.mouse.click(m.x,m.y,{button:'right'});await p.waitForTimeout(200);await p.click('.mp-ctx [data-a=ctx-terreno]');await p.waitForTimeout(600);ok(await p.evaluate(()=>!!document.querySelector('.mapa.modo')&&document.querySelectorAll('.v-alvo').length===1&&!document.querySelector('#mp-modo').textContent.trim()),tag+' Novo terreno aqui começa a poligonal com o primeiro ponto, sem barra');await p.keyboard.press('Escape');await p.waitForTimeout(300);
  /* sem recarregar: o mapa fica onde estava */
  const v0=await p.evaluate(()=>document.querySelector('.leaflet-map-pane').style.transform+'|'+document.querySelector('.leaflet-tile-container')?.parentElement?.style.transform);
  await p.mouse.click(m.x,m.y,{button:'right'});await p.waitForTimeout(200);await p.click('.mp-ctx [data-a=ctx-terreno]');await p.waitForTimeout(600);
  const v1=await p.evaluate(()=>document.querySelector('.leaflet-map-pane').style.transform+'|'+document.querySelector('.leaflet-tile-container')?.parentElement?.style.transform);
  ok(v0===v1,tag+' Novo terreno aqui não mexe no zoom nem na posição: '+v0+' / '+v1);await p.keyboard.press('Escape');await p.waitForTimeout(300)}
// Leitura não tem menu
await p.evaluate(()=>{const x=document.createElement('button');x.dataset.a='role';x.dataset.v='Leitura';document.body.appendChild(x);x.click();x.remove()});await p.waitForTimeout(500);
if(modo==='desktop'){await p.mouse.click(m.x,m.y,{button:'right'});await p.waitForTimeout(200);ok(!(await p.$('.mp-ctx')),tag+' Leitura sem menu')}
await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
