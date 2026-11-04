/* Mapa: bolinha da lista sempre na cor da subetapa; concorrência nas cores das etiquetas, com a legenda aberta por situação */
const {chromium}=require('playwright');const path=require('path');
const L=path.join(__dirname,'..','libs','l')+'/',F=path.join(__dirname,'..','saida','bkm-terrenos.html'),D=path.join(__dirname,'..','saida','dados')+'/';const SHOT=process.env.SHOT||'';
let falhas=0;const ok=(c,m)=>{console.log((c?'ok  ':'FALHOU ')+m);if(!c)falhas++};
(async()=>{const b=await chromium.launch();const erros=[];
for(const tema of ['claro','escuro']){
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:SHOT?2:1});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('http://bkm.test/')){const m=u.match(/\/dados\/([^?#]+)/);return m?r.fulfill({path:D+m[1],contentType:'application/json'}):r.fulfill({path:F,contentType:'text/html; charset=utf-8'})}
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(/arcgisonline|openstreetmap/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();await p.addInitScript(()=>{let _L;Object.defineProperty(window,'L',{configurable:true,get(){return _L},set(v){_L=v;v.Map.addInitHook(function(){window.__map=this})}})});p.on('pageerror',e=>erros.push(e.message));await p.goto('http://bkm.test/a.html');
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
// bolinha ou número de um ramo liga e desliga tudo dentro dele, sem abrir
await p.click('#mp-leg [data-a=mp-arv]');await p.waitForTimeout(200);
const nLista=()=>p.$$eval('.mapa-lado .mp-it',x=>x.length);const tot=await nLista();
const r1=await p.$('#mp-leg .lg-i[data-a=mp-abre][data-l="|"]');const n1=+(await r1.$eval('.n',e=>e.textContent)),v1=await r1.getAttribute('data-v');
await (await r1.$('.pin-mini')).click();await p.waitForTimeout(300);
ok(await nLista()===tot-n1,`bolinha da fase ${v1} apaga os ${n1} terrenos dela (${tot} → ${await nLista()})`);
ok(await p.$eval(`#mp-leg .lg-i[data-l="|"][data-v="${v1}"]`,e=>e.classList.contains('lg-off')&&e.getAttribute('aria-expanded')==='false'),'item apagado e sem abrir');
if(SHOT&&tema==='claro')await p.screenshot({path:SHOT+'/11_legenda_apagar_fase.png'});
await p.click(`#mp-leg .lg-i[data-l="|"][data-v="${v1}"] .n`);await p.waitForTimeout(300);ok(await nLista()===tot,'número liga de novo');
// dentro da fase: a bolinha da etapa apaga a etapa inteira
await p.click(`#mp-leg .lg-i[data-l="|"][data-v="${v1}"]`);await p.waitForTimeout(400);
const r2=await p.$(`#mp-leg .lg-i[data-a=mp-abre][data-l="${v1}|"]`);
if(r2){const n2=+(await r2.$eval('.n',e=>e.textContent)),a=await nLista();await (await r2.$('.pin-mini')).click();await p.waitForTimeout(300);ok(await nLista()===a-n2,`etapa apagada inteira (${n2})`);
  await (await p.$(`#mp-leg .lg-i[data-l="${v1}|"][data-v="${await r2.getAttribute('data-v')}"] .pin-mini`)).click();await p.waitForTimeout(300);ok(await nLista()===a,'etapa ligada de novo')}
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
// destaque: abrir um empreendimento acende; fechar o card mantém; abrir outro troca; sair do Mapa apaga
const abre=id=>p.evaluate(id=>{const e=document.querySelector('[data-a=mk-x]');return id},id);
const ids=await p.evaluate(()=>{const r=[];return r});
// a legenda reenquadra o mapa: centra num empreendimento antes de procurar
await p.evaluate(()=>{const m=window.__map;let c=null;m.eachLayer(l=>{if(!c&&l.options&&l.options.radius===12&&l.getLatLng)c=l.getLatLng()});if(c)m.setView(c,15,{animate:false})});await p.waitForTimeout(900);
const pto=()=>p.evaluate(()=>{const m=window.__map,r=document.querySelector('#mapa').getBoundingClientRect(),g=document.querySelector('#mp-leg').getBoundingClientRect();let res=null;
  m.eachLayer(l=>{if(res||!l.options||l.options.radius!==12||!l.getLatLng)return;const q=m.latLngToContainerPoint(l.getLatLng()),x=r.left+q.x,y=r.top+q.y;if(x>r.left+80&&x<r.right-80&&y>r.top+120&&y<r.bottom-80&&!(x>g.left-20&&y>g.top-20))res=[x,y]});return res});
const achou=await pto();
ok(!!achou,'achou um empreendimento no mapa');
if(achou){await p.mouse.click(achou[0],achou[1]);await p.waitForTimeout(400);ok(!!await p.$('#mk-box .mk-box'),'card aberto');ok(!!await p.$('.mk-dest .mk-dest-b'),'empreendimento destacado');
  if(SHOT)await p.screenshot({path:SHOT+`/10_destaque_${tema}.png`});
  await p.click('#mk-box [data-a=mk-x]');await p.waitForTimeout(300);ok(!await p.$('#mk-box .mk-box')&&!!await p.$('.mk-dest .mk-dest-b'),'fechar o card mantém o destaque');
  await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(300);await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(1500);
  ok(!await p.$('.mk-dest'),'sair do Mapa apaga o destaque')}
if(SHOT){// a legenda reenquadra o mapa: centra num empreendimento antes de procurar
await p.evaluate(()=>{const m=window.__map;let c=null;m.eachLayer(l=>{if(!c&&l.options&&l.options.radius===12&&l.getLatLng)c=l.getLatLng()});if(c)m.setView(c,15,{animate:false})});await p.waitForTimeout(900);await p.screenshot({path:SHOT+`/9_neon_${tema}.png`})}
await ctx.close()}
ok(!erros.length,'sem erros: '+erros.join(' | '));await b.close();process.exit(falhas?1:0)})();
