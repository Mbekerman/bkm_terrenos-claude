/* clicar num log deixa a lista de Logs onde estava e o log aceso por alguns segundos */
const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_logrola',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=TMP+'demo/bkm-terrenos-lista-suspensa.html';const OUT=TMP+'t_logrola/';
(async()=>{const b=await chromium.launch();const errs=[];let falhas=0;const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas++};
for(const tema of ['claro','escuro']){
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto('file://'+F);await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(500);
await p.click('[data-a=pn-menu][data-v=per]');await p.click('[data-a=pn-per][data-v=tudo]');await p.waitForTimeout(200);
const n=await p.$$eval('.pn-log',e=>e.length);ok(n>8,`${tema}: ${n} logs no painel`);
const alvo=Math.floor(n*0.6);
const antes=await p.evaluate(i=>{const b=document.querySelector('.pn-b');const el=document.querySelectorAll('.pn-log')[i];b.scrollTop=el.offsetTop-b.offsetTop-120;return b.scrollTop},alvo);
ok(antes>100,`${tema}: lista rolada para ${antes}px`);
const i=await p.evaluate(k=>document.querySelectorAll('.pn-log')[k].dataset.i,alvo);
await p.click(`.pn-log[data-i="${i}"] .pn-lt`);await p.waitForTimeout(1200);
const depois=await p.$eval('.pn-b',b=>b.scrollTop);ok(Math.abs(depois-antes)<2,`${tema}: rolagem mantida (${antes} → ${depois})`);
const aceso=await p.$eval(`.pn-log[data-i="${i}"]`,el=>el.classList.contains('pn-log-sel')&&getComputedStyle(el).backgroundColor!=='rgba(0, 0, 0, 0)');ok(aceso,`${tema}: log clicado aceso`);
await p.screenshot({path:OUT+`log_aceso_${tema}.png`});
await p.waitForTimeout(3600);
const apagou=await p.$$eval('.pn-log-sel',e=>e.length);ok(apagou===0,`${tema}: destaque some depois de ~4 s`);
const mantem=await p.$eval('.pn-b',b=>b.scrollTop);ok(Math.abs(mantem-antes)<2,`${tema}: rolagem continua (${mantem})`);
/* trocar o filtro de período volta ao topo, como antes */
await p.click('[data-a=pn-menu][data-v=per]');await p.click('[data-a=pn-per][data-v="30"]').catch(()=>{});await p.waitForTimeout(200);
await ctx.close()}
console.log('ERROS',errs);console.log(falhas?`${falhas} falha(s)`:'tudo ok');await b.close();process.exit(falhas?1:0)})();
