// Mapa sem balão; linha com etapa; sem pontos de interesse da empresa no mapa (4/nov/2026); clicar no pino destaca o terreno na lista lateral (número do pino, nome, área, lupa);
// no celular aparece o cartão sobre o mapa; a lupa abre a ficha completa na gaveta da direita (4/nov/2026; tela cheia no celular). Prints em saida/t_lista.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_lista/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(900);
const linhas=await p.$$eval('.mp-it',e=>e.map(x=>x.innerText.replace(/\s+/g,' ').trim()));console.log('   linhas:',JSON.stringify(linhas.slice(0,3)));
ok(linhas.length>0&&!linhas.some(l=>/R\$/.test(l))&&linhas.some(l=>/m² · \S/.test(l)),tag+' linhas com número, nome, área e etapa');
ok(!(await p.$('.mp-acoes [data-a=mp-poi]')),tag+' sem botão Pontos de interesse na barra');
await p.evaluate(()=>{const l=document.querySelector('.mp-legenda');if(l)l.open=true;const b=document.querySelector('#mp-leg [data-a=mp-arv]');if(b&&b.getAttribute('aria-expanded')!=='true')b.click()});await p.waitForTimeout(200);
const leg=await p.$eval('#mp-leg',x=>x.textContent.replace(/\s+/g,' '));ok(/Backlog\s*\d+.*Perdido\s*\d+/.test(leg)&&!/Pontos de interesse/.test(leg),tag+' legenda sem pontos de interesse: '+leg.slice(-60));
ok((await p.$$eval('#mapa .poi',e=>e.length))===0,tag+' pontos de interesse da empresa fora do mapa');
// clicar no pino do Itapura
await p.evaluate(()=>document.querySelector('.mapa').scrollIntoView({block:'start'}));await p.waitForTimeout(300);
const alvo=await p.evaluate(()=>{const pins=[...document.querySelectorAll('#mapa .leaflet-marker-icon.pin')];const e=pins.find(x=>x.title==='Terreno Rua Itapura')||pins[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,t:e.title}});
await p.waitForTimeout(300);const a2=await p.evaluate(t=>{const e=[...document.querySelectorAll('#mapa .leaflet-marker-icon.pin')].find(x=>x.title===t);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}},alvo.t);
if(modo==='desktop')await p.mouse.click(a2.x,a2.y);else await p.touchscreen.tap(a2.x,a2.y);await p.waitForTimeout(600);
ok(!(await p.$('.leaflet-popup')),tag+' sem balão');
const sel=await p.$eval('#mp-lista .mp-it.sel',x=>x.querySelector('.t1').textContent).catch(()=>null);ok(sel===alvo.t,tag+' linha destacada: '+sel);
ok(await p.evaluate(t=>[...document.querySelectorAll('#mapa .leaflet-marker-icon.pin.sel')].map(x=>x.title).join()===t,alvo.t),tag+' só esse pino aceso');
if(modo==='desktop'){ok(await p.evaluate(()=>{const l=document.querySelector('.mapa-lado').getBoundingClientRect(),r=document.querySelector('#mp-lista .mp-it.sel').getBoundingClientRect();return r.top>=l.top&&r.bottom<=l.bottom}),tag+' linha visível na lista');
  await p.screenshot({path:OUT+tag+'_sel.png'})}
else{const c=await p.$eval('#mp-cartao',x=>x.innerText.replace(/\s+/g,' ').trim()).catch(()=>'');ok(c.includes(alvo.t),tag+' cartão sobre o mapa: '+c);await p.screenshot({path:OUT+tag+'_sel.png'})}
if(modo==='celular')ok(await p.$eval('.fab',x=>getComputedStyle(x).display==='none'),tag+' sem o botão + Novo terreno no Mapa');
// no desktop o clique no pino já abre a gaveta (4/nov/2026): fecha para testar a lupa
if(modo==='desktop'&&await p.$('#tgav')){await p.click('#tgav [data-a=tb-gav-x]');await p.waitForTimeout(300)}
// lupa abre a ficha completa na gaveta da direita, com o mapa atrás
await p.click((modo==='desktop'?'#mp-lista':'#mp-cartao')+' .mp-it.sel .mp-lupa');await p.waitForTimeout(800);
const fs=await p.evaluate(()=>{const e=document.querySelector('#tgav.tgav-mapa');if(!e)return null;return {n:e.querySelector('.tgav-n').textContent,mapa:!!document.querySelector('#mapa .leaflet-pane'),r:document.body.dataset.rota,w:Math.round(e.getBoundingClientRect().width)}});
console.log('   gaveta:',JSON.stringify(fs));ok(fs&&fs.n===alvo.t&&fs.mapa,tag+' lupa abre a ficha completa na gaveta, mapa continua atrás');
if(modo==='celular')ok(fs&&fs.w>=380,tag+' gaveta em tela cheia no celular');
await p.screenshot({path:OUT+tag+'_ficha.png'});
await p.click('#tgav [data-a=tb-gav-x]');await p.waitForTimeout(300);ok(!(await p.$('#tgav')),tag+' X fecha a gaveta');
if(modo==='desktop'){await p.click('#mp-lista .mp-it.sel .mp-lupa');await p.waitForTimeout(500);await p.keyboard.press('Escape');await p.waitForTimeout(300);ok(!(await p.$('#tgav')),tag+' Esc fecha a gaveta')}
if(modo==='celular'&&!(await p.$('#mp-cartao .mp-it.sel .mp-lupa'))){const a3=await p.evaluate(t=>{const e=[...document.querySelectorAll('#mapa .leaflet-marker-icon.pin')].find(x=>x.title===t);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}},alvo.t);await p.touchscreen.tap(a3.x,a3.y);await p.waitForTimeout(600)}
await p.click((modo==='desktop'?'#mp-lista':'#mp-cartao')+' .mp-it.sel .mp-lupa');await p.waitForTimeout(500);
await p.click('#tgav [data-a=tb-pagina]');await p.waitForTimeout(800);
ok(await p.evaluate(t=>document.querySelector('h1')?.textContent.includes(t),alvo.t)&&!(await p.$('#tgav')),tag+' Abrir página vai para a ficha e fecha a gaveta');
await ctx.close()}
console.log(errs.length?'ERROS '+JSON.stringify(errs):'TUDO OK');await b.close();process.exit(errs.length?1:0)})();
