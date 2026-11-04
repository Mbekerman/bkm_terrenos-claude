// Ícones do menu: prints do menu aberto, recolhido, celular e tema escuro
const TMP=require('path').join(__dirname,'..','saida')+'/';
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');
(async()=>{const b=await chromium.launch();
for(const [nome,w,h,min,tema] of [['aberto',1366,560,false,'claro'],['recolhido',1366,560,true,'claro'],['escuro',1366,560,false,'escuro'],['celular',390,844,false,'claro'],['celular-escuro',390,844,false,'escuro']]){
const ctx=await b.newContext({viewport:{width:w,height:h}});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();await p.goto('file:///x/a.html');await p.evaluate(([min,tema])=>{localStorage.clear();localStorage.setItem('bkm-terrenos-menu',min?'min':'aberto');localStorage.setItem('bkm-terrenos-tema',tema)},[min,tema]);await p.reload();await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(200);
const faltam=await p.evaluate(()=>[...document.querySelectorAll('.nav-item svg, #bnav svg')].filter(s=>!s.innerHTML.trim()).length);
if(faltam)console.log('FALHA',nome,'ícones vazios',faltam);
await p.screenshot({path:TMP+'icones-'+nome+'.png'});await ctx.close()}
console.log('ok');await b.close()})();
