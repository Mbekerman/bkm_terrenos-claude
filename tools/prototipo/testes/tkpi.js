// Início e Dashboard nos temas escuro e claro: indicadores na versão A (fundo sóbrio, faixa na lateral, número leve); no Início a faixa muda de cor com alerta
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_kpi')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch(),erros=[];
for(const [tema,w] of [['escuro',390],['escuro',1100],['escuro',1400],['escuro',1920],['claro',390],['claro',1400]]){const ctx=await b.newContext({viewport:{width:w,height:900}});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
for(const tela of ['inicio','dashboard']){
await p.evaluate(r=>document.querySelector(`[data-a=nav][data-r=${r}]`).click(),tela);await p.waitForTimeout(500);
const c=await p.evaluate(()=>[...document.querySelectorAll('.kpis .kpi')].map(k=>{const s=getComputedStyle(k);return s.backgroundColor+'|'+s.borderTopColor+'|'+getComputedStyle(k.querySelector('.v')).color}));
ok(c[0]===(tema==='escuro'?'rgb(12, 20, 51)|rgba(124, 140, 255, 0.28)|rgb(242, 245, 255)':'rgb(255, 255, 255)|rgb(221, 227, 234)|rgb(31, 31, 31)'),`${tela} ${tema} ${w}: versão A (${c[0]})`);
const vaza=await p.evaluate(()=>[...document.querySelectorAll('.kpis .kpi .v')].filter(v=>v.scrollWidth>v.clientWidth+1||v.getBoundingClientRect().right>v.closest('.kpi').getBoundingClientRect().right-4).map(v=>v.textContent));
ok(!vaza.length,`${tela} ${w}: números cabem no quadro ${vaza.join(', ')}`);
ok(c.length===4&&new Set(c).size===1,`${tela} ${w}: 4 indicadores com a mesma cor (${[...new Set(c)].join(' / ')})`);
if(tela==='inicio'){const f=await p.evaluate(()=>[...document.querySelectorAll('.kpis .kpi')].map(k=>(k.classList.contains('crit')?'crit':k.classList.contains('warn')?'warn':'-')+'='+getComputedStyle(k).boxShadow));const az=tema==='escuro'?'rgb(124, 140, 255)':'rgb(11, 87, 208)';ok(f.every(x=>x.startsWith('-')?x.includes(az):!x.includes(az))&&f.some(x=>!x.startsWith('-')),`inicio ${tema} ${w}: faixa colorida só nos alertas (${f.join(' / ')})`)}
await p.screenshot({path:O+`${tela}_${tema}_${w}.png`})}
await ctx.close()}
ok(!erros.length,'sem erros de página '+erros.join('; '));
await b.close();console.log(falhas.length?falhas.length+' falha(s)':'tudo ok');process.exit(falhas.length?1:0)})();
