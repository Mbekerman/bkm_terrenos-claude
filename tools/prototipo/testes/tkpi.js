// Dashboard no tema escuro: os 4 indicadores no estilo do botão "+ Novo terreno" (fundo, contorno e texto)
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_kpi')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch(),erros=[];
for(const w of [390,1400]){const ctx=await b.newContext({viewport:{width:w,height:900}});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema','escuro')});await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=dashboard]').click());await p.waitForTimeout(500);
const c=await p.evaluate(()=>[...document.querySelectorAll('.kpis-v .kpi')].map(k=>{const s=getComputedStyle(k);return s.backgroundColor+'|'+s.borderTopColor+'|'+getComputedStyle(k.querySelector('.v')).color}));
const fab=await p.evaluate(()=>{const f=document.querySelector('.fab');if(!f||!f.offsetWidth)return null;const s=getComputedStyle(f);return s.backgroundColor+'|'+s.borderTopColor});
if(fab)ok(c[0].startsWith(fab),`${w}: mesma cor do botão Novo terreno (${fab})`);
ok(c.length===4&&new Set(c).size===1,`${w}: 4 indicadores com a mesma cor (${[...new Set(c)].join(' / ')})`);
await p.screenshot({path:O+`escuro_${w}.png`});await ctx.close()}
ok(!erros.length,'sem erros de página '+erros.join('; '));
await b.close();console.log(falhas.length?falhas.length+' falha(s)':'tudo ok');process.exit(falhas.length?1:0)})();
