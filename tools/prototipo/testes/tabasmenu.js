/* barra das abas da ficha sem rolagem lateral: o que não cabe vai para o ⋮ "Mais ações", com setas de anterior e próxima
   (pedido do Moisés, 4/nov/2026). Larguras de 1440 a celular, claro e escuro. Prints em saida/t_abasmenu. */
const path=require('path'),fs=require('fs'),{chromium,devices}=require('playwright');
const OUT=path.join(__dirname,'..','saida','t_abasmenu')+'/';fs.mkdirSync(OUT,{recursive:true});
const L=path.join(__dirname,'..','libs','l')+'/',F=path.join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [w,tema,cel] of [[1440,'claro',0],[1440,'escuro',0],[1100,'claro',0],[820,'claro',0],[390,'claro',1]]){const tag=w+'_'+tema;
const ctx=await b.newContext(cel?{...devices['Pixel 7']}:{viewport:{width:w,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);
await p.goto('file:///x/a.html#/terrenos/A123');await p.reload();await p.waitForTimeout(600);
const est=()=>p.evaluate(()=>{const w=document.querySelector('.fi-abas-w'),bar=w.querySelector('.fi-abas');
  const vis=[...bar.querySelectorAll('button[role=tab]')].filter(x=>getComputedStyle(x).display!=='none');
  return {cabe:bar.scrollWidth<=bar.clientWidth+1&&w.scrollWidth<=w.clientWidth+1,ativa:document.querySelector('.fi-abas [aria-selected=true]').dataset.t,
    mostradas:vis.map(x=>x.dataset.t),menu:[...w.querySelectorAll('.fi-mais .adv-menu [data-t]')].map(x=>x.dataset.t),mais:!w.querySelector('.fi-mais').hidden,
    ant:w.querySelector('.fi-ant').disabled,prox:w.querySelector('.fi-prox').disabled,txt:bar.textContent,pag:document.documentElement.scrollWidth-innerWidth}});
let e=await est();
ok(/Parâmetros/.test(e.txt)&&!/urbanísticos/.test(e.txt)&&!/Estudos de viabilidade/.test(e.txt)&&!/Jornada do Terreno/.test(e.txt)||e.menu.length>0,tag+' nomes curtos');
ok(e.cabe&&e.pag<=0,tag+' sem rolagem lateral');
ok(e.mostradas.length+e.menu.length>=10,tag+' toda aba está na barra ou no menu ('+e.mostradas.length+' + '+e.menu.length+')');
ok(e.mais===(e.menu.length>0),tag+' ⋮ só quando falta espaço');
ok(e.ant&&!e.prox,tag+' na primeira aba, só a seta da direita');
if(e.menu.length){
  await p.click('.fi-mais .adv-mb');await p.waitForTimeout(100);ok(await p.isVisible('.fi-mais .adv-menu'),tag+' ⋮ abre o menu');
  if(!cel)await p.screenshot({path:OUT+tag+'_menu.png',clip:{x:0,y:0,width:w,height:520}});
  const alvo=e.menu.at(-1);await p.click(`.fi-mais .adv-menu [data-t="${alvo}"]`);await p.waitForTimeout(300);e=await est();
  ok(e.ativa===alvo&&e.mostradas.includes(alvo)&&e.cabe,tag+' aba do menu abre e fica visível na barra ('+alvo+')')}
else if(!cel)await p.screenshot({path:OUT+tag+'_barra.png',clip:{x:0,y:0,width:w,height:520}});
await p.click('.fi-ant');await p.waitForTimeout(300);const e2=await est();ok(e2.ativa!==e.ativa&&e2.cabe,tag+' seta da esquerda vai para a anterior ('+e2.ativa+')');
await p.click('.fi-prox');await p.waitForTimeout(300);ok((await est()).ativa===e.ativa,tag+' seta da direita volta');
if(cel){await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:OUT+tag+'_cel.png'})}
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\nTUDO OK');process.exit(errs.length?1:0)})();
