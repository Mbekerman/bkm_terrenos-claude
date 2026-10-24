// Área da poligonal: quinta fonte de área, calculada pelo desenho, que pode ser a área adotada e acompanha o ajuste da poligonal.
// Prints em saida/t_areapol.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_areapol/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
const KEY='bkm-terrenos-prototipo-v9';
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
const abrir=async()=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(200);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(500);
await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-a=bloco]')].find(x=>/Cadastro/.test(x.textContent));b&&b.getAttribute('aria-expanded')!=='true'&&b.click()});await p.waitForTimeout(300)};
await abrir();
const cards=await p.$$eval('#sec-areas .area',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
ok(cards.length===5&&/Poligonal/.test(cards[4])&&/m²/.test(cards[4]),tag+' cinco áreas, a quinta é a da poligonal: '+cards[4]);
const nm=x=>+(x.match(/([\d.]+(?:,\d+)?) m²/)||[,'0'])[1].replace(/\./g,'').replace(',','.');const pol=nm(cards[4]);
await p.evaluate(()=>document.querySelector('#sec-areas').scrollIntoView({block:'start'}));await p.screenshot({path:OUT+tag+'_1areas.png'});
await p.evaluate(()=>document.querySelector('[data-a=edit][data-s=areas]').click());await p.waitForTimeout(200);
await p.selectOption('#sec-areas [name=fonteArea]','poligonal');await p.evaluate(()=>document.querySelector('#sec-areas form').requestSubmit());await p.waitForTimeout(400);
const t1=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).terrenos.find(t=>t.nome.includes('Barão')),KEY);
ok(t1.fonteArea==='poligonal',tag+' adotada = poligonal gravada');
const kv=async()=>p.evaluate(()=>document.querySelector('#sec-areas .kvg')?.innerText.replace(/\s+/g,' '));
ok(nm(await kv())===pol,tag+' área adotada = área da poligonal '+pol);
const adot=await p.$eval('#sec-areas .area.sel',e=>e.innerText);ok(/Poligonal/.test(adot)&&/adotada/i.test(adot),tag+' o card da poligonal fica marcado como adotado');
// ajuste na poligonal muda a adotada
await p.evaluate(k=>{const d=JSON.parse(localStorage.getItem(k));const t=d.terrenos.find(t=>t.nome.includes('Barão'));t.poly=t.poly.map(([a,b],i)=>i===0?[a+0.0002,b]:[a,b]);localStorage.setItem(k,JSON.stringify(d))},KEY);
await p.reload();await p.waitForTimeout(500);await abrir();
const c2=await p.$$eval('#sec-areas .area',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));const pol2=nm(c2[4]);
ok(pol2&&pol2!==pol&&nm(await kv())===pol2,tag+' ajuste na poligonal muda a adotada '+pol+' → '+pol2);
const visao=await p.evaluate(()=>document.querySelector('.kvl')?.innerText.replace(/\s+/g,' '));
ok(/Área adotada/.test(visao)&&/Poligonal/.test(visao),tag+' Visão geral mostra a adotada pela poligonal');
await p.evaluate(()=>document.querySelector('#sec-areas').scrollIntoView({block:'start'}));await p.screenshot({path:OUT+tag+'_2adotada.png'});
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\ntudo ok');process.exit(errs.length?1:0)})();
