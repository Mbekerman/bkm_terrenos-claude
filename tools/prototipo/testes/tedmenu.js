// Edição da poligonal no desktop: sem barra de aviso; clique direito no ponto abre o menu com
// Adicionar / Excluir / Desfazer / Cancelar; Ctrl+Z desfaz; Esc fecha o menu e depois cancela. Prints em saida/t_edmenu.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_edmenu/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const tema of ['claro','escuro']){
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(700);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=mp-foco]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(800);
await p.evaluate(()=>{document.querySelector('.leaflet-popup-close-button')?.click();document.querySelector('.mapa').scrollIntoView({block:'start'})});await p.waitForTimeout(300);
const entra=async()=>{const c=await p.evaluate(()=>{const pin=document.querySelector('.leaflet-marker-icon.pin.sel'),pr=pin.getBoundingClientRect(),px=pr.x+pr.width/2,py=pr.bottom-4;
  const e=[...document.querySelectorAll('.leaflet-overlay-pane path')].find(x=>{const r=x.getBoundingClientRect();return r.width>10&&px>=r.x&&px<=r.right&&py>=r.y&&py<=r.bottom});const r=e.getBoundingClientRect();return {x:r.x+r.width*0.3,y:r.y+r.height*0.5}});
  await p.mouse.dblclick(c.x,c.y);await p.waitForTimeout(900)};
const polyD=()=>p.evaluate(()=>[...document.querySelectorAll('.leaflet-overlay-pane path')].map(x=>x.getAttribute('d')).join('|'));
const antes=await polyD();await entra();
const pts=()=>p.$$eval('.v-alvo',e=>e.map(x=>{const r=x.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}));
const ban=()=>p.$eval('#mp-modo',x=>x.innerText.trim());const n=()=>p.$$eval('.v-alvo',e=>e.length);const editando=()=>p.$$eval('.v-alvo',e=>e.length>0);
ok(await editando(),'entrou em edição');ok(await ban()==='','sem barra de aviso');
let P=await pts();const n0=P.length,P0=P;
await p.mouse.click(P[1].x,P[1].y,{button:'right'});await p.waitForTimeout(300);
ok(!!(await p.$('.v-menu')),'clique direito abre o menu');console.log('   menu:',await p.$eval('.v-menu',x=>x.innerText.replace(/\s+/g,' ')));
const P1=(await pts())[1];ok(Math.hypot(P1.x-P[1].x,P1.y-P[1].y)<1,'clique direito não move o ponto');
await p.screenshot({path:OUT+tema+'_1menu.png',clip:{x:P[1].x-300,y:P[1].y-260,width:600,height:420}});
await p.click('.v-menu [data-a=v-depois]');await p.waitForTimeout(300);ok(await n()===n0+1,'adicionar depois: +1 ponto');
P=await pts();await p.mouse.click(P[2].x,P[2].y,{button:'right'});await p.waitForTimeout(300);
ok(await p.$eval('.v-menu [data-a=v-desfazer]',x=>!x.disabled),'Desfazer habilitado após alteração');
await p.screenshot({path:OUT+tema+'_2menu_desfazer.png',clip:{x:P[2].x-300,y:P[2].y-260,width:600,height:420}});
await p.click('.v-menu [data-a=v-desfazer]');await p.waitForTimeout(300);ok(await n()===n0,'Desfazer pelo menu volta o ponto');
P=await pts();await p.mouse.click(P[0].x,P[0].y,{button:'right'});await p.waitForTimeout(200);await p.click('.v-menu [data-a=v-excluir]');await p.waitForTimeout(300);ok(await n()===n0-1,'excluir pelo menu');
await p.keyboard.press('Control+z');await p.waitForTimeout(300);ok(await n()===n0,'Ctrl+Z desfaz');
P=await pts();await p.mouse.click(P[0].x,P[0].y,{button:'right'});await p.waitForTimeout(200);await p.keyboard.press('Escape');await p.waitForTimeout(200);
ok(!(await p.$('.v-menu'))&&await editando(),'Esc com menu aberto só fecha o menu');
P=await pts();await p.mouse.click(P[1].x,P[1].y,{button:'right'});await p.waitForTimeout(500);{const m=await p.$eval('.mapa',x=>{const r=x.getBoundingClientRect();return {x:r.right-80,y:r.y+r.height*0.6}});await p.mouse.click(m.x,m.y)}await p.waitForTimeout(200);ok(!(await p.$('.v-menu')),'clique fora fecha o menu');
await p.mouse.dblclick(P[1].x,P[1].y);await p.waitForTimeout(300);ok(!!(await p.$('.v-menu')),'dois cliques continuam abrindo o menu');await p.keyboard.press('Escape');
P=await pts();await p.mouse.move(P[0].x,P[0].y);await p.mouse.down();await p.mouse.move(P[0].x+30,P[0].y+20,{steps:6});await p.mouse.up();await p.waitForTimeout(300);ok(Math.abs((await pts())[0].x-P[0].x-30)<3,'arrastou o ponto 1');
P=await pts();await p.mouse.click(P[0].x,P[0].y,{button:'right'});await p.waitForTimeout(200);await p.click('.v-menu [data-a=v-cancelar]');await p.waitForTimeout(400);
ok(!(await editando()),'Cancelar edição sai do modo');await entra();ok(JSON.stringify((await pts()).map(q=>[Math.round(q.x),Math.round(q.y)]))===JSON.stringify(P0.map(q=>[Math.round(q.x),Math.round(q.y)])),'Cancelar descarta o arraste');await p.keyboard.press('Escape');await p.waitForTimeout(300);
await entra();await p.keyboard.press('Escape');await p.waitForTimeout(300);ok(!(await editando()),'Esc sem menu cancela');
await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
