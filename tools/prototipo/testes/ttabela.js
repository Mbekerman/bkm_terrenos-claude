/* tabela de terrenos: colunas, ordenação em várias colunas, tela cheia, gaveta da ficha e filtros por seção */
const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_tabela',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');
let falhas=0;const ok=(c,m)=>{console.log((c?'ok  ':'FALHOU ')+m);if(!c)falhas++};
(async()=>{const b=await chromium.launch();const erros=[];
const abrir=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:w<700?2:1.5,isMobile:w<700,hasTouch:w<700});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();if(t)localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.evaluate(()=>{const m=document.createElement('meta');m.name='viewport';m.content='width=device-width, initial-scale=1';document.head.appendChild(m)});await p.waitForTimeout(300);
  await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(200);return {ctx,p}};
{const {ctx,p}=await abrir(1440,900);
  const cab=await p.$$eval('.lista-ter thead th',x=>x.map(t=>t.textContent.replace(/[↕↑↓\d]/g,'').trim()));
  ok(cab.length===9,'9 colunas: '+cab.join(' | '));
  const col=async k=>p.$$eval(`.lista-ter tbody td.col-${k}`,x=>x.map(t=>t.innerText.split('\n')[0].trim()));
  await p.click('.lista-ter th.col-cid .dt-sort');await p.waitForTimeout(100);
  let c=await col('cid');ok(c.join()===c.slice().sort((a,b)=>a.localeCompare(b,'pt-BR')).join(),'cidade crescente');
  await p.click('.lista-ter th.col-zona .dt-sort');await p.waitForTimeout(100);
  const pares=await p.$$eval('.lista-ter tbody tr',x=>x.map(t=>[t.querySelector('.col-cid').innerText.trim(),t.querySelector('.col-zona').innerText.trim()]));
  let bom=true;for(let i=1;i<pares.length;i++){const [c0,z0]=pares[i-1],[c1,z1]=pares[i];if(c0===c1&&z0!=='—'&&z1!=='—'&&z0.localeCompare(z1,'pt-BR')>0)bom=false;if(c0.localeCompare(c1,'pt-BR')>0)bom=false}
  ok(bom,'cidade manda e zona desempata');
  ok((await p.$$eval('.tb-ord',x=>x.map(e=>e.textContent))).join()==='1,2','números da ordem 1 e 2');
  await p.click('.lista-ter th.col-cid .dt-sort');await p.waitForTimeout(100);
  ok(await p.$eval('.lista-ter th.col-cid',t=>t.getAttribute('aria-sort'))==='descending','segundo clique: decrescente');
  await p.click('.lista-ter th.col-cid .dt-sort');await p.waitForTimeout(100);
  ok(await p.$eval('.lista-ter th.col-cid',t=>t.getAttribute('aria-sort'))==='none'&&await p.$eval('.lista-ter th.col-zona',t=>t.getAttribute('aria-sort'))==='ascending','terceiro clique tira a ordem e a zona fica');
  await p.screenshot({path:TMP+'t_tabela/1_tabela.png'});
  // gaveta
  const id=await p.$eval('.lista-ter tbody tr:nth-child(2)',t=>t.dataset.id);
  await p.click(`.lista-ter tr[data-id="${id}"] .tb-olho`);await p.waitForTimeout(600);
  const g=await p.evaluate(()=>{const g=document.querySelector('#tgav').getBoundingClientRect(),th=document.querySelector('.lista-ter th.col-ter').getBoundingClientRect();return {gl:Math.round(g.left),thr:Math.round(th.right),abas:!!document.querySelector('#tgav .fi-abas'),sel:!!document.querySelector('.lista-ter tr.tb-sel'),url:location.hash}});
  ok(Math.abs(g.gl-g.thr)<=1&&g.abas&&g.sel,`gaveta começa no fim da coluna 1 (${g.gl} × ${g.thr}), ficha com abas, linha acesa; ${g.url}`);
  await p.screenshot({path:TMP+'t_tabela/2_gaveta.png'});
  await p.evaluate(()=>[...document.querySelectorAll('#tgav .fi-abas button[role=tab]')].find(b=>b.dataset.t==='terreno')?.click());await p.waitForTimeout(300);
  ok(await p.$eval('#tgav .fi-abas [aria-selected=true]',b=>b.dataset.t)==='terreno','troca de aba dentro da gaveta');
  const ed=await p.$('#tgav [data-a="edit"]');if(ed){await ed.click();await p.waitForTimeout(300)}
  ok(!!ed&&!!await p.$('#tgav form input:not([type=hidden])'),'edição abre dentro da gaveta');
  await p.screenshot({path:TMP+'t_tabela/3_gaveta_editando.png'});
  const id2=await p.$eval('.lista-ter tbody tr:nth-child(4)',t=>t.dataset.id);
  await p.click(`.lista-ter tr[data-id="${id2}"] td.col-ter .tb-c1t`);await p.waitForTimeout(400);
  ok(await p.$eval('.lista-ter tr.tb-sel',t=>t.dataset.id)===id2&&!!await p.$('#tgav'),'clicar noutra linha troca o terreno da gaveta');
  await p.keyboard.press('Escape');await p.waitForTimeout(200);
  ok(!await p.$('#tgav')&&!await p.$('.tb-sel'),'Esc fecha a gaveta');
  await p.click('[data-a=tb-cheia]');await p.waitForTimeout(300);
  ok(await p.$eval('.ter-pg',x=>getComputedStyle(x).position==='fixed'),'tela cheia');
  await p.click(`.lista-ter tr[data-id="${id}"] .tb-olho`);await p.waitForTimeout(500);
  await p.screenshot({path:TMP+'t_tabela/4_tela_cheia_gaveta.png'});
  await p.click('[data-a=tb-gav-x]');await p.waitForTimeout(200);
  await p.evaluate(()=>document.fullscreenElement?document.exitFullscreen():document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));await p.waitForTimeout(300);
  ok(!await p.$('.ter-pg.on'),'sair do modo tela cheia do navegador (ou Esc) sai da tela cheia');
  await p.click('.fx-btn');await p.waitForTimeout(200);
  ok((await p.$$('#fx-dr .fx-aba')).length===5&&(await p.$$('#fx-dr .fx-s')).length===1,'filtros: 5 botões e uma seção');
  await p.click('#fx-dr .fx-aba[data-v=comercial]');await p.waitForTimeout(150);
  await p.click('#fx-dr .fx-op[data-k=temp]');await p.waitForTimeout(200);
  await p.click('#fx-dr .fx-aba[data-v=local]');await p.waitForTimeout(150);
  ok(await p.$eval('#fx-dr .fx-aba[data-v=comercial] .fx-sn',x=>x.textContent)==='1'&&!await p.$('#fx-dr .fx-aba[data-v=local] .fx-sn'),'botão da seção mostra o filtro marcado');
  await p.screenshot({path:TMP+'t_tabela/5_filtros.png'});
  await ctx.close()}
{const {ctx,p}=await abrir(1440,900,'escuro');
  await p.click('.lista-ter tbody tr:nth-child(1) .tb-olho');await p.waitForTimeout(600);await p.screenshot({path:TMP+'t_tabela/6_gaveta_escuro.png'});await ctx.close()}
{const {ctx,p}=await abrir(390,844);
  await p.screenshot({path:TMP+'t_tabela/7_celular.png'});
  await p.click('.lista-ter tbody tr:nth-child(1) .tb-olho');await p.waitForTimeout(600);
  ok(await p.evaluate(()=>{const g=document.querySelector('#tgav').getBoundingClientRect();return g.left===0&&g.width===innerWidth}),'celular: gaveta na tela toda');
  await p.screenshot({path:TMP+'t_tabela/8_celular_gaveta.png'});
  await p.keyboard.press('Escape');await p.waitForTimeout(200);await p.click('.fx-btn');await p.waitForTimeout(200);await p.screenshot({path:TMP+'t_tabela/9_celular_filtros.png'});await ctx.close()}
ok(!erros.length,'sem erros: '+erros.join(' | '));
await b.close();process.exit(falhas?1:0)})();
