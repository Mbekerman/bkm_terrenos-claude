/* Mapa: bolinha da lista sempre na cor da subetapa; concorrência em neon, com a legenda aberta por situação */
const {chromium}=require('playwright');const path=require('path');
const L=path.join(__dirname,'..','libs','l')+'/',F=path.join(__dirname,'..','saida','bkm-terrenos.html'),D=path.join(__dirname,'..','saida','dados')+'/';const SHOT=process.env.SHOT||'';
let falhas=0;const ok=(c,m)=>{console.log((c?'ok  ':'FALHOU ')+m);if(!c)falhas++};
(async()=>{const b=await chromium.launch();const erros=[];
for(const tema of ['claro','escuro']){
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:SHOT?2:1});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('http://bkm.test/')){const m=u.match(/\/dados\/([^?#]+)/);return m?r.fulfill({path:D+m[1],contentType:'application/json'}):r.fulfill({path:F,contentType:'text/html; charset=utf-8'})}
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(/arcgisonline|openstreetmap/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('http://bkm.test/a.html');
await p.evaluate(t=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(2500);
const cores=()=>p.$$eval('.mapa-lado .mp-it',x=>Object.fromEntries(x.map(e=>[e.dataset.id,e.querySelector('.mp-cod').style.background])));
const c0=await cores();const n0=new Set(Object.values(c0)).size;ok(n0>=4,`${tema}: bolinhas em ${n0} cores com a legenda fechada`);
// abre a árvore até a primeira etapa com subetapas de Novos Negócios: a cor do terreno na lista bate com a da legenda
await p.click('#mp-leg [data-a=mp-arv]');await p.waitForTimeout(200);await p.click('#mp-leg [data-a=mp-abre][data-f]:not([data-f=""])');await p.waitForTimeout(300);
const et=await p.$('#mp-leg [data-a=mp-abre][data-e]:not([data-e=""])');if(et){await et.click();await p.waitForTimeout(400)}
const c1=await cores();ok(Object.keys(c1).every(k=>c0[k]===c1[k]),'abrir a legenda não muda a cor das bolinhas');
const leg=await p.$$eval('#mp-leg [data-a=mp-sit] .pin-mini',x=>x.map(e=>e.style.background));
ok(Object.values(c1).every(c=>leg.includes(c))||!leg.length,'na subetapa, cada bolinha tem a cor de um item da legenda');
await p.click('#mp-leg [data-a=mp-arv]');await p.waitForTimeout(300);
// concorrência
const nTot=+await p.evaluate(()=>document.querySelector('.mapa-area').dataset.merc);ok(nTot>1000,'concorrência carregada: '+nTot);
await p.click('#mp-leg [data-a=mk-arv]');await p.waitForTimeout(200);
const sits=await p.$$eval('#mp-leg [data-a=mk-sit]',x=>x.map(e=>[e.dataset.v,+e.querySelector('.n').textContent.replace(/\D/g,''),getComputedStyle(e.querySelector('.mk-b')).backgroundColor]));
ok(sits.length>=3,'situações na legenda: '+sits.map(s=>s[0]+' '+s[1]).join(', '));
ok(sits.reduce((a,s)=>a+s[1],0)===nTot,'contagens somam o total');
if(SHOT)await p.screenshot({path:SHOT+`/8_legenda_concorrencia_${tema}.png`});
const [k,qt]=sits.find(s=>s[1]>0);await p.click(`#mp-leg [data-a=mk-sit][data-v=${k}]`);await p.waitForTimeout(300);
ok(+await p.evaluate(()=>document.querySelector('.mapa-area').dataset.merc)===nTot-qt,`desligar ${k} tira ${qt} do mapa`);
ok(await p.$eval(`#mp-leg [data-a=mk-sit][data-v=${k}]`,e=>e.getAttribute('aria-pressed'))==='false','item desligado');
await p.click(`#mp-leg [data-a=mk-sit][data-v=${k}]`);await p.waitForTimeout(300);ok(+await p.evaluate(()=>document.querySelector('.mapa-area').dataset.merc)===nTot,'religar volta');
await p.click('#mp-leg [data-a=mp-merc]');await p.waitForTimeout(200);ok(await p.$eval('#mp-leg [data-a=mp-merc]',e=>e.getAttribute('aria-pressed'))==='false','Concorrência desliga a camada inteira');
await p.click('#mp-leg [data-a=mp-merc]');await p.waitForTimeout(200);
if(SHOT){await p.mouse.move(1150,520);for(let i=0;i<2;i++){await p.mouse.wheel(0,-300);await p.waitForTimeout(600)}await p.waitForTimeout(900);await p.screenshot({path:SHOT+`/9_neon_${tema}.png`})}
await ctx.close()}
ok(!erros.length,'sem erros: '+erros.join(' | '));await b.close();process.exit(falhas?1:0)})();
