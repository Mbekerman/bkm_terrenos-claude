// Barra do mapa: abre no satélite (já com rótulos, sem a opção à parte), seletor com fundo translúcido, busca legível no mapa estreito; importar KMZ só no Novo terreno
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_barra')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch(),erros=[];
for(const [tema,w,h] of [['claro',1400,900],['claro',1100,800],['escuro',1400,900],['claro',390,844],['escuro',390,844],['claro',1920,1000]]){
const ctx=await b.newContext({viewport:{width:w,height:h}});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/\.(png|jpe?g)/.test(u))return r.fulfill({path:process.env.TILE||path.join(__dirname,'tile.png'),contentType:'image/png',headers:{'access-control-allow-origin':'*'}});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(800);
const r=await p.evaluate(()=>{const q=s=>document.querySelector(s),bx=s=>{const e=q(s);if(!e)return null;const r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)}};
 return {area:bx('.mapa-area'),busca:bx('.mp-busca'),seg:bx('.mp-barra .seg'),kmz:bx('.mp-kmz'),botoes:[...document.querySelectorAll('.mp-barra button')].map(x=>x.textContent.trim()||x.getAttribute('aria-label')).join('|'),fundo:getComputedStyle(q('.mp-barra .seg')).backgroundColor,sat:q('[data-a=mp-base][aria-pressed=true]').dataset.v,ops:[...document.querySelectorAll('[data-a=mp-base]')].map(x=>x.textContent).join('|')}});
const nome=`${tema}_${w}`;console.log(nome,JSON.stringify(r));
ok(r.sat==='satelite',`${nome}: abre no satélite`);ok(!/rótulos/.test(r.ops)&&r.ops.split('|').length===3,`${nome}: só três camadas (${r.ops})`);
ok(r.fundo!=='rgba(0, 0, 0, 0)',`${nome}: segmentado com fundo ${r.fundo}`);
ok(!r.kmz,`${nome}: sem botão de importar KMZ na barra (${r.botoes})`);ok(r.area.w>300,`${nome}: área do mapa com largura (${r.area.w})`);
ok(r.busca.w>=160,`${nome}: busca com ${r.busca.w}px`);
await p.screenshot({path:O+nome+'.png'});await ctx.close()}
ok(!erros.length,'sem erros de página '+erros.join('; '));
await b.close();console.log(falhas.length?falhas.length+' falha(s)':'tudo ok');process.exit(falhas.length?1:0)})();
