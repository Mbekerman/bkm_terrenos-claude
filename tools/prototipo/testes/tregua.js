// Régua do mapa (pedidos do Moisés, 5/nov/2026): ligada, o cursor do mapa é a seta (não a mãozinha); Esc faz o mesmo que o Del:
// com desenho, apaga; sem desenho, desliga a régua. Prints em saida/t_regua/.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',OUT=TMP+'t_regua/',L=path.join(__dirname,'..','libs','l')+'/';fs.mkdirSync(OUT,{recursive:true});
const html=fs.readFileSync(TMP+'bkm-terrenos.html','utf8');
const errs=[],ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1440,height:900}});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
    if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
    if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});
    if(/nominatim/.test(u))return r.fulfill({contentType:'application/json',body:'{}'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(500);
  await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(900);
  const cursor=()=>p.$eval('#mapa',m=>getComputedStyle(m).cursor);
  const est=()=>p.evaluate(()=>({modo:document.querySelector('.rg-b')?'regua':null,n:document.querySelectorAll('.rg-pt').length,btn:document.querySelector('.mp-cb[data-a="rg-abrir"]')?.getAttribute('aria-pressed')}));
  const ligar=()=>p.click('.mp-cb[data-a="rg-abrir"]');
  const antes=await cursor();
  await ligar();await p.waitForTimeout(300);
  let e=await est();ok(e.modo==='regua'&&e.btn==='true','régua ligada: '+JSON.stringify(e));
  ok(await cursor()==='default','cursor é a seta com a régua ligada (antes: '+antes+', agora: '+await cursor()+')');
  const c=await p.$eval('#mapa',x=>{const r=x.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  for(const [x,y] of [[-150,-60],[100,-40],[60,90]]){await p.mouse.click(c.x+x,c.y+y);await p.waitForTimeout(450)}
  e=await est();ok(e.n===3,'3 pontos marcados: '+JSON.stringify(e));await p.screenshot({path:OUT+'1_medindo.png'});
  await p.keyboard.press('Escape');await p.waitForTimeout(250);e=await est();
  ok(e.modo==='regua'&&e.n===0,'Esc com desenho apaga e a régua continua: '+JSON.stringify(e));
  await p.keyboard.press('Escape');await p.waitForTimeout(250);e=await est();
  ok(e.modo===null&&e.btn==='false','Esc sem desenho desliga a régua: '+JSON.stringify(e));
  ok(await cursor()!=='default','cursor volta ao do mapa: '+await cursor());
  // Del continua igual
  await ligar();await p.waitForTimeout(300);await p.mouse.click(c.x,c.y);await p.waitForTimeout(450);
  await p.keyboard.press('Delete');await p.waitForTimeout(250);e=await est();ok(e.modo==='regua'&&e.n===0,'Del com desenho apaga: '+JSON.stringify(e));
  await p.keyboard.press('Delete');await p.waitForTimeout(250);e=await est();ok(e.modo===null,'Del sem desenho desliga: '+JSON.stringify(e));
  await b.close();console.log(errs.length?'\n'+errs.length+' falha(s)':'\ntudo certo');process.exit(errs.length?1:0)})();
