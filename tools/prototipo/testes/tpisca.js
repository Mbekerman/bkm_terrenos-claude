const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'demo',{recursive:true});require('fs').mkdirSync(TMP+'t_logclick',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=TMP+'demo/bkm-terrenos-lista-suspensa.html';const OUT=TMP+'t_logclick/';
(async()=>{const b=await chromium.launch();const errs=[];const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto('file://'+F);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(500);
await p.click('[data-a=pn-menu][data-v=per]');await p.click('[data-a=pn-per][data-v=tudo]');await p.waitForTimeout(200);
const n=await p.$$eval('.pn-log',e=>e.length);
for(let i=0;i<n;i++){
  const t=await p.evaluate(i=>{const el=document.querySelectorAll('.pn-log')[i];el.scrollIntoView({block:'nearest'});const t=el.querySelector('.pn-lt').textContent;el.click();return t},i);
  await p.waitForTimeout(1300);
  const lit=await p.$$eval('.pisca',e=>e.map(x=>{const r=x.getBoundingClientRect();return (x.className.toString().split(' ')[0]||x.tagName)+':'+x.innerText.slice(0,28).replace(/\n/g,' ')+(r.bottom<0||r.top>innerHeight?' [FORA DA TELA]':'')}));
  console.log(String(i).padStart(2),t.slice(0,48).padEnd(48),'→',lit.join(' | ')||'NADA');
  if(i===0)await p.screenshot({path:OUT+'pisca_1.png'});if(t.startsWith('Corretor'))await p.screenshot({path:OUT+'pisca_corretor.png'});
  await p.waitForTimeout(100);}
console.log('ERROS',errs);await b.close()})();
