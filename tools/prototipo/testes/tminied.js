// Mini-mapa da ficha: dois cliques (desktop) ou dois toques (celular) sobre a poligonal editam ali mesmo;
// fora dela abrem a página Mapa. Pontos, menu do ponto, Ctrl+Z, Esc, clique fora salva; Leitura abre o Mapa. Prints em saida/t_minied.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_minied/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
const KEY='bkm-terrenos-prototipo-v9';
for(const modo of ['desktop','escuro','celular']){
const cel=modo==='celular';
const ctx=await b.newContext(cel?{...devices['Pixel 7']}:{viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(modo+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();if(t)localStorage.setItem('bkm-terrenos-tema','escuro')},modo==='escuro');await p.reload();await p.waitForTimeout(400);
const abrir=async()=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(200);
  await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(900);
  await p.evaluate(()=>{const s=document.querySelector('.g-loc');s.scrollIntoView({block:'start'});scrollBy(0,-90)});await p.waitForTimeout(300)};
await abrir();
const cdp=cel?await ctx.newCDPSession(p):null;
const toque=async(x,y)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await p.waitForTimeout(40);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})};
const duplo=async(x,y)=>{if(cel){await toque(x,y);await p.waitForTimeout(120);await toque(x,y)}else await p.mouse.dblclick(x,y);await p.waitForTimeout(500)};
const clique=async(x,y)=>{if(cel)await toque(x,y);else await p.mouse.click(x,y);await p.waitForTimeout(400)};
/* centro da poligonal e um ponto fora dela, dentro do mini-mapa */
const alvos=()=>p.evaluate(()=>{const m=document.querySelector('#mini-mapa').getBoundingClientRect();const e=[...document.querySelectorAll('#mini-mapa .leaflet-overlay-pane path')].sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0];const r=e.getBoundingClientRect();
  return {dentro:{x:r.x+r.width*0.45,y:r.y+r.height*0.6},fora:{x:m.right-24,y:m.y+24},m:{x:m.x,y:m.y,r:m.right,b:m.bottom}}});
const pts=()=>p.$$eval('#mini-mapa .v-alvo',e=>e.map(x=>{const r=x.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}));
const salvo=()=>p.evaluate(k=>{const t=JSON.parse(localStorage.getItem(k)).terrenos.find(t=>t.nome.includes('Barão'));return {n:t.poly.length,poly:JSON.stringify(t.poly),log:t.hist[t.hist.length-1]?.txt||''}},KEY);
const antes=await salvo();
// 1) dois cliques sobre a poligonal: edita ali mesmo
let A=await alvos();await duplo(A.dentro.x,A.dentro.y);
let P=await pts();ok(P.length===antes.n,modo+': entrou em edição no mini-mapa ('+P.length+' pontos)');
ok(await p.evaluate(()=>document.body.dataset.rota)==='terreno',modo+': continua na ficha');
if(cel)ok(/Concluir/.test(await p.$eval('#mini-modo',x=>x.innerText).catch(()=>'')),'celular: barra de aviso abaixo do mini-mapa com Concluir');
await p.screenshot({path:OUT+modo+'_1edicao.png'});
// 2) arrastar um ponto
if(cel){const q=P[0];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:q.x,y:q.y}]});for(let k=1;k<=8;k++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:q.x-25*k/8,y:q.y-15*k/8}]});await p.waitForTimeout(20)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
else{await p.mouse.move(P[0].x,P[0].y);await p.mouse.down();await p.mouse.move(P[0].x-25,P[0].y-15,{steps:8});await p.mouse.up()}
await p.waitForTimeout(400);let P2=await pts();ok(Math.abs(P2[0].x-P[0].x)>10,modo+': arrastou o ponto 1 ('+Math.round(P2[0].x-P[0].x)+' px)');
if(!cel){
  // 3) menu do ponto (clique direito), Adicionar ponto depois, Ctrl+Z
  await p.mouse.click(P2[1].x,P2[1].y,{button:'right'});await p.waitForTimeout(300);
  const menu=await p.$eval('.mini-wrap .v-menu',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');ok(/Excluir ponto/.test(menu)&&/Cancelar edição/.test(menu),modo+': menu do ponto no mini-mapa ('+menu+')');
  await p.screenshot({path:OUT+modo+'_2menu.png'});
  await p.click('.mini-wrap .v-menu [data-a=v-depois]');await p.waitForTimeout(300);ok((await pts()).length===antes.n+1,modo+': Adicionar ponto depois');
  await p.keyboard.press('Control+z');await p.waitForTimeout(300);ok((await pts()).length===antes.n,modo+': Ctrl+Z desfaz');
  // 4) Esc cancela sem salvar
  await p.keyboard.press('Escape');await p.waitForTimeout(500);ok((await pts()).length===0&&(await salvo()).poly===antes.poly,modo+': Esc cancela sem mudar a poligonal');
  A=await alvos();await duplo(A.dentro.x,A.dentro.y);P=await pts();ok(P.length===antes.n,modo+': entrou de novo');
  await p.mouse.move(P[0].x,P[0].y);await p.mouse.down();await p.mouse.move(P[0].x-25,P[0].y-15,{steps:8});await p.mouse.up();await p.waitForTimeout(300)}
// 5) clicar dentro não conclui; clicar fora salva
A=await alvos();P=await pts();const cx=P.reduce((a,q)=>a+q.x,0)/P.length,cy=P.reduce((a,q)=>a+q.y,0)/P.length;await clique(cx,cy);ok((await pts()).length>0,modo+': clique dentro continua editando');
if(cel)await p.tap('#mini-modo [data-a=mp-concluir]');else await clique(A.fora.x,A.fora.y);await p.waitForTimeout(600);
const dep=await salvo();ok((await pts()).length===0,modo+': saiu da edição');ok(dep.poly!==antes.poly&&/Ajuste na poligonal/.test(dep.log),modo+': salvou ('+dep.log+')');
ok(await p.evaluate(()=>!!document.querySelector('#mini-mapa .leaflet-overlay-pane path')),modo+': mini-mapa redesenhado com a poligonal');
await p.screenshot({path:OUT+modo+'_3salvo.png'});
// 6) dois cliques fora da poligonal: página Mapa
A=await alvos();await duplo(A.fora.x,A.fora.y);await p.waitForTimeout(700);ok(await p.evaluate(()=>!!document.querySelector('.mapa-area #mapa')),modo+': dois cliques fora abrem a página Mapa');
// 7) Leitura: sobre a poligonal também abre o Mapa
if(modo==='desktop'){await p.evaluate(()=>document.querySelector('[data-a=perfil-menu]').click());await p.waitForTimeout(200);await p.evaluate(()=>document.querySelector('[data-a=role][data-v=Leitura]').click());await p.waitForTimeout(300);await abrir();
  A=await alvos();await duplo(A.dentro.x,A.dentro.y);await p.waitForTimeout(700);ok((await pts()).length===0&&await p.evaluate(()=>!!document.querySelector('.mapa-area #mapa')),'Leitura: dois cliques na poligonal abrem o Mapa')}
await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
