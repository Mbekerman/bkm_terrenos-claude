const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_inline',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');const OUT=TMP+'t_inline/';
(async()=>{const b=await chromium.launch();const errs=[];
for(const tema of ['claro','escuro']){
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://')&&u.endsWith('.html'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+F);await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(150);
await p.evaluate(()=>{[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click()});await p.waitForTimeout(400);
let falhas=0;const ok=(c,m)=>{if(!c){falhas++;console.log('FALHA',tema,m)}};
const kv=async r=>p.evaluate(r=>{const k=[...document.querySelectorAll('#bl-geral .kv')].find(x=>x.querySelector('dt').textContent===r);return k&&k.querySelector('dd').innerText},r);
const cad=async lab=>{await p.click('.fi-abas [data-t=terreno]');await p.waitForTimeout(150);const v=await p.evaluate(l=>{const k=[...document.querySelectorAll('#bl-terreno .k')].find(x=>x.textContent.trim()===l);return k&&k.parentElement.innerText.replace(l,'').trim()},lab);await p.click('.fi-abas [data-t=geral]');await p.waitForTimeout(150);return v};
await p.click('[data-a=edit][data-s=g-end]');await p.waitForTimeout(150);
await p.screenshot({path:OUT+tema+'_editando.png'});
await p.fill('#sec-g-end #f-numero','520');await p.click('#sec-g-end .btn.primary');await p.waitForTimeout(200);
ok(/520/.test(await kv('Endereço')),'resumo mostra o número novo');ok(await cad('Número')==='520','a aba Terreno grava no mesmo campo');
await p.click('[data-a=edit][data-s=g-reg]');await p.click('[data-a=cancel-edit]');ok(await p.$$eval('.kv.editando',e=>e.length)===0,'cancelar fecha');
await p.click('.fi-head .temp .bars button:nth-child(2)');await p.waitForTimeout(150);ok(/2/.test(await p.$eval('.fi-head .temp',x=>x.textContent)),'temperatura no topo muda');
await p.screenshot({path:OUT+tema+'_resumo.png'});
await p.click('[data-a=perfil-menu]');await p.click('[data-a=role][data-v=Leitura]');await p.waitForTimeout(150);
ok(await p.$$eval('#bl-geral .kv-ed[data-a=edit]',e=>e.filter(x=>getComputedStyle(x).display!=='none').length)===0,'Leitura sem lápis');
if(falhas)process.exitCode=1;
await ctx.close()}
if(errs.length){console.log('ERROS',errs);process.exitCode=1}else console.log('ok');await b.close()})();
