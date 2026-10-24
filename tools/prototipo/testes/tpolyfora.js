// Edição da poligonal e pino (decisões do Moisés, 24/out/2026): no celular a barra tem só Cancelar e Concluir, sem texto, e o
// Desfazer fica no menu do ponto; clique fora do mapa cancela; clique no mapa fora da poligonal conclui; o log é
// "Ajuste na poligonal", o pino vai para o centro dela e perde o número; ajustes a menos de 2 minutos um do outro viram um log só. Prints em saida/t_polyfora.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_polyfora/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
const KEY='bkm-terrenos-prototipo-v9',NOME='Barão';
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const modo of ['desktop','celular']){const cel=modo==='celular';
const ctx=await b.newContext(cel?{...devices['Pixel 7']}:{viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(modo+': '+e.message));const cdp=cel?await ctx.newCDPSession(p):null;
const abrirMapa=async()=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(800);
  await p.evaluate(n=>[...document.querySelectorAll('[data-a=mp-foco]')].find(x=>x.textContent.includes(n)).click(),NOME);await p.waitForTimeout(900);
  await p.evaluate(()=>document.querySelector('.mapa').scrollIntoView({block:'start'}));await p.waitForTimeout(400)};
await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);await abrirMapa();
const pts=()=>p.$$eval('.v-alvo',e=>e.map(x=>{const r=x.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}));
const salvo=()=>p.evaluate(([k,n])=>{const t=JSON.parse(localStorage.getItem(k)).terrenos.find(t=>t.nome.includes(n));const P=t.poly;let d=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const [yi,xi]=P[i],[yj,xj]=P[j];if((yi>t.lat)!==(yj>t.lat)&&t.lng<(xj-xi)*(t.lat-yi)/(yj-yi)+xi)d=!d}
  return {pino:t.lat+','+t.lng,dentro:d,poly:JSON.stringify(t.poly),logs:t.hist.filter(h=>/^Ajuste na poligonal/.test(h.txt)).map(h=>h.txt)}},[KEY,NOME]);
const segurar=async(x,y,ms=700)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await p.waitForTimeout(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(300)};
const entrar=async()=>{const c=await p.evaluate(()=>{const pin=document.querySelector('.leaflet-marker-icon.pin[title="Área Barão do Jequitibá"]').getBoundingClientRect(),px=pin.x+pin.width/2,py=pin.bottom-4;
    const e=[...document.querySelectorAll('.leaflet-overlay-pane path')].find(x=>{const r=x.getBoundingClientRect();return r.width>10&&px>=r.x&&px<=r.right&&py>=r.y&&py<=r.bottom});const r=e.getBoundingClientRect();return {x:r.x+r.width*0.3,y:r.y+r.height*0.5}});
  if(cel)await segurar(c.x,c.y);else await p.mouse.dblclick(c.x,c.y);await p.waitForTimeout(500);return (await pts()).length};
const arrastar=async(dx,dy)=>{const P=await pts();const q=P[0];if(cel){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[q]});for(let k=1;k<=8;k++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:q.x+dx*k/8,y:q.y+dy*k/8}]});await p.waitForTimeout(20)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
  else{await p.mouse.move(q.x,q.y);await p.mouse.down();await p.mouse.move(q.x+dx,q.y+dy,{steps:8});await p.mouse.up()}await p.waitForTimeout(350)};
const tocar=async q=>{if(cel)await p.touchscreen.tap(q.x,q.y);else await p.mouse.click(q.x,q.y);await p.waitForTimeout(500)};
const foraDaPoly=async()=>{const V=await pts(),m=await p.evaluate(()=>{const r=document.querySelector('.mapa').getBoundingClientRect();return {r:r.right,b:r.bottom}});const mx=Math.max(...V.map(q=>q.x));return {x:mx+(m.r-mx)/2,y:V.reduce((a,q)=>a+q.y,0)/V.length}};
const foraDoMapa=()=>p.evaluate(()=>{for(let y=innerHeight-100;y>80;y-=14)for(let x=20;x<innerWidth-20;x+=30){const e=document.elementFromPoint(x,y);
  if(e&&!e.closest('.mapa-area,button,a,input,select,label,summary,details,[data-a],header,.side,.bnav,nav,.fab,li,.mp-lista,[role=button],[tabindex]'))return {x,y,el:e.tagName+'.'+e.className}}return null});
const a0=await salvo();
// 1) entrar: barra só com os dois botões no celular
ok(await entrar()>=3,modo+' entrou na edição');
if(cel){const bar=await p.$eval('#mp-modo',x=>({t:x.innerText.replace(/\s+/g,' ').trim(),b:[...x.querySelectorAll('button')].map(b=>b.dataset.a)}));
  ok(bar.t==='Cancelar Concluir'&&bar.b.join()==='mp-sair,mp-concluir',modo+' barra só com Cancelar e Concluir: '+JSON.stringify(bar));await p.screenshot({path:OUT+modo+'_1barra.png'});
  const P=await pts();await segurar(P[1].x,P[1].y);const mn=await p.$eval('.v-menu',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');
  ok(/Desfazer/.test(mn)&&!/Cancelar edição/.test(mn)&&!/Ctrl/.test(mn),modo+' menu do ponto com Desfazer: '+mn);await p.screenshot({path:OUT+modo+'_2menu.png'});
  await p.keyboard.press('Escape');await p.waitForTimeout(200);if(await p.$('.v-menu')){const P2=await pts();await segurar(P2[1].x,P2[1].y,50)}}
// 2) clique fora do mapa cancela
await arrastar(-35,-25);const f=await foraDoMapa();ok(!!f,modo+' ponto fora do mapa: '+JSON.stringify(f));
await tocar(f);ok((await pts()).length===0,modo+' clique fora do mapa sai da edição');
ok(/cancelada/.test(await p.$eval('#toast',x=>x.textContent))&&(await salvo()).poly===a0.poly,modo+' e não grava a mudança');
// 3) dois ajustes seguidos: um log só
await p.evaluate(()=>document.querySelector('.mapa').scrollIntoView({block:'start'}));await p.waitForTimeout(300);
await entrar();await arrastar(-35,-25);await tocar(await foraDaPoly());const s1=await salvo();
ok(s1.poly!==a0.poly&&s1.logs.length===a0.logs.length+1&&/^Ajuste na poligonal: .+ → .+/.test(s1.logs.at(-1)),modo+' clique no mapa fora da poligonal conclui: '+s1.logs.at(-1));
ok(s1.pino!==a0.pino&&s1.dentro,modo+' o pino vai para dentro da poligonal ajustada: '+a0.pino+' → '+s1.pino);
ok(await p.$$eval('#mapa .pin-b',e=>e.length>0&&e.every(x=>x.textContent.trim()==='')),modo+' pinos sem número dentro');
await p.waitForTimeout(600);await entrar();await arrastar(25,30);await tocar(await foraDaPoly());const s2=await salvo();
ok(s2.poly!==s1.poly&&s2.logs.length===s1.logs.length&&s2.logs.at(-1).split(':')[1].split('→')[0]===s1.logs.at(-1).split(':')[1].split('→')[0],modo+' segundo ajuste em menos de 2 min junta no mesmo log: '+s2.logs.at(-1));
await p.screenshot({path:OUT+modo+'_3salvo.png'});
// 4) passados 2 minutos, outro log
await p.evaluate(([k,n])=>{const s=JSON.parse(localStorage.getItem(k));const t=s.terrenos.find(t=>t.nome.includes(n));const h=t.hist.at(-1);h.em=new Date(Date.parse(h.em)-180000).toISOString().replace('Z','');localStorage.setItem(k,JSON.stringify(s))},[KEY,NOME]);
await p.reload();await p.waitForTimeout(400);await abrirMapa();await entrar();await arrastar(20,-20);await tocar(await foraDaPoly());const s3=await salvo();
ok(s3.logs.length===s2.logs.length+1,modo+' passados 2 minutos, o ajuste é outro log ('+s3.logs.length+')');
await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
