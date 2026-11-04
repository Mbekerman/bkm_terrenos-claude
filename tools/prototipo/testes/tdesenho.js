// Desenho da poligonal no desktop sem a barra escura (decisão do Moisés, 4/nov/2026): Enter ou dois cliques no mapa salvam
// (o duplo clique não marca ponto a mais), Esc ou dois cliques fora do mapa cancelam. No celular a barra continua. Prints em saida/t_desenho/.
const path=require('path'),fs=require('fs'),{chromium,devices}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',OUT=TMP+'t_desenho/',L=path.join(__dirname,'..','libs','l')+'/';fs.mkdirSync(OUT,{recursive:true});
const html=fs.readFileSync(TMP+'bkm-terrenos.html','utf8');
const errs=[],ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
(async()=>{const b=await chromium.launch();
async function pagina(cel){const ctx=await b.newContext(cel?{...devices['Pixel 7']}:{viewport:{width:1440,height:900},deviceScaleFactor:2});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
    if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
    if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});
    if(/nominatim/.test(u))return r.fulfill({contentType:'application/json',body:'{}'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(500);return {p,ctx}}
const comecar=async p=>{await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);await p.click('[data-a=nv-desenhar]');await p.waitForTimeout(900)};
const centro=p=>p.$eval('#mapa',x=>{const r=x.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
const estado=p=>p.evaluate(()=>({modo:document.querySelector('.mapa.modo')?'desenhar':null,n:document.querySelectorAll('.v-alvo').length,modal:document.querySelector('#modal h2')?.textContent||null,barra:(document.querySelector('#mp-modo')?.textContent||'').trim(),nv:window.__nAntes||0}));
const vigiar=p=>p.evaluate(()=>{window.__nAntes=0;if(!window.__vig){window.__vig=1;window.addEventListener('dblclick',()=>{window.__nAntes=document.querySelectorAll('.v-alvo').length},true)}});
const marcar=async(p,pts)=>{const c=await centro(p);for(const [x,y] of pts){await p.mouse.click(c.x+x,c.y+y);await p.waitForTimeout(350)}return c};
const Q=[[-120,-80],[120,-80],[120,80]];
{const {p,ctx}=await pagina(false);
  // 1) dois cliques no 4º canto: marca esse ponto só uma vez e salva
  await comecar(p);let e=await estado(p);ok(e.modo==='desenhar'&&e.barra==='',' desenho sem a barra escura: '+JSON.stringify(e));
  await p.screenshot({path:OUT+'1_desenhando.png'});
  const c=await marcar(p,Q);e=await estado(p);ok(e.n===3&&e.barra==='','3 pontos e nada de barra: '+JSON.stringify(e));await p.screenshot({path:OUT+'2_tres_pontos.png'});
  await vigiar(p);await p.mouse.dblclick(c.x-120,c.y+80);await p.waitForTimeout(700);e=await estado(p);
  ok(e.modo===null&&e.nv===4&&!!e.modal,'dois cliques no mapa salvam com 4 pontos (sem ponto a mais): '+JSON.stringify(e));
  await p.keyboard.press('Escape');await p.waitForTimeout(300);
  // 2) Enter salva
  await comecar(p);await marcar(p,[...Q,[-120,80]]);await p.keyboard.press('Enter');await p.waitForTimeout(700);e=await estado(p);
  ok(e.modo===null&&!!e.modal,'Enter salva: '+JSON.stringify(e));await p.keyboard.press('Escape');await p.waitForTimeout(300);
  // 3) Enter com menos de 3 pontos não salva
  await comecar(p);await marcar(p,Q.slice(0,2));await p.keyboard.press('Enter');await p.waitForTimeout(400);e=await estado(p);
  ok(e.modo==='desenhar'&&e.n===2,'Enter com 2 pontos não salva: '+JSON.stringify(e));
  // 4) Esc cancela
  await p.keyboard.press('Escape');await p.waitForTimeout(400);e=await estado(p);ok(e.modo===null&&e.n===0,'Esc cancela o desenho: '+JSON.stringify(e));
  // 5) dois cliques fora do mapa cancelam
  await comecar(p);await marcar(p,Q);const f=await p.evaluate(()=>{const r=document.querySelector('.mapa-lado').getBoundingClientRect();for(let y=r.bottom-10;y>r.y;y-=12){const x=r.x+r.width-12,el=document.elementFromPoint(x,y);if(el&&!el.closest('button,a,[data-a],input,select,summary,li'))return {x,y,el:el.tagName+'.'+el.className}}return null});console.log('   fora:',JSON.stringify(f));
  await p.mouse.dblclick(f.x,f.y);await p.waitForTimeout(500);e=await estado(p);ok(e.modo===null&&e.n===0,'dois cliques fora do mapa cancelam: '+JSON.stringify(e));
  // 6) dois cliques num ponto já existente abrem o menu dele (com Desfazer e Cancelar desenho)
  await comecar(p);await marcar(p,Q);await p.waitForTimeout(500);const v=await p.$$eval('.v-alvo',x=>x.map(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}));
  await p.mouse.dblclick(v[0].x,v[0].y);await p.waitForTimeout(400);const mn=await p.$eval('.v-menu',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');
  ok(/Excluir ponto/.test(mn)&&/Desfazer/.test(mn)&&/Cancelar desenho/.test(mn),'dois cliques num ponto antigo abrem o menu: '+mn);await p.screenshot({path:OUT+'3_menu_ponto.png'});
  await ctx.close()}
{const {p,ctx}=await pagina(true);await comecar(p);const e=await estado(p);ok(/Concluir/.test(e.barra),'celular mantém a barra com Concluir: '+e.barra);await ctx.close()}
await b.close();console.log(errs.length?'ERROS '+JSON.stringify(errs):'tudo certo');process.exit(errs.length?1:0)})();
