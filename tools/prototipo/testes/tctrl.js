// Página Mapa: botões do canto (minha localização e tela cheia), sem o controle de câmera do Google, X no cartão do terreno (celular)
// e cartão sem "O que tem perto"; os botões sobem acima do cartão
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_ctrl')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const base=fs.readFileSync(F,'utf8'),EU={latitude:-23.5275,longitude:-46.6785};
(async()=>{const b=await chromium.launch(),erros=[];
for(const [cfg,tema,w,h,geo] of [['leaflet','claro',1400,900,true],['leaflet','claro',390,844,true],['leaflet','escuro',390,844,false],['google','claro',1400,900,true]]){
const html=cfg==='google'?base.replace('<title>','<meta name="gmaps-key" content="AIzaTESTETESTETESTETESTETESTE0000"><title>'):base;
const ctx=await b.newContext({viewport:{width:w,height:h},geolocation:EU,permissions:geo?['geolocation']:[],hasTouch:w<600});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(u.includes('maps.googleapis.com/maps/api/js'))return r.fulfill({path:path.join(__dirname,'fake_gmaps3.js'),contentType:'application/javascript'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(/\.(png|jpe?g)/.test(u))return r.fulfill({path:process.env.TILE||path.join(__dirname,'tile.png'),contentType:'image/png',headers:{'access-control-allow-origin':'*'}});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(500);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(800);
const nome=`${cfg}_${tema}_${w}`;
if(cfg==='google'){const o=await p.evaluate(()=>window.__mapas.at(-1).opts);ok(o.cameraControl===false&&o.fullscreenControl===false,`${nome}: sem o controle de câmera do Google (cameraControl ${o.cameraControl})`)}
ok(await p.evaluate(()=>!!document.querySelector('.mapa-area [data-a=mp-eu]')&&!!document.querySelector('.mapa-area [data-a=mp-cheia]')),`${nome}: botões de localização e tela cheia no mapa`);
// minha localização
await p.click('[data-a=mp-eu]');await p.waitForTimeout(500);
const eu=await p.evaluate(()=>{const d=[...document.querySelectorAll('.leaflet-overlay-pane path[fill="#1a73e8"]')].at(-1),a=document.querySelector('#mapa').getBoundingClientRect();let dx=null;
  if(d){const r=d.getBoundingClientRect();dx=Math.round(Math.hypot(r.x+r.width/2-(a.x+a.width/2),r.y+r.height/2-(a.y+a.height/2)))}
  return {ponto:!!d,dx,toast:document.querySelector('.toast.show,.toast')?.textContent||''}});
if(geo)ok(cfg==='google'?!/localização/.test(eu.toast):eu.ponto&&eu.dx<30,`${nome}: localização marcada no centro do mapa (${JSON.stringify(eu)})`);
else ok(!eu.ponto&&/bloqueada/.test(eu.toast),`${nome}: sem permissão avisa (${eu.toast})`);
// cartão do terreno no celular: X, sem "O que tem perto", botões acima
if(w<600){await p.evaluate(()=>document.querySelector('[data-a=mp-foco]').click());await p.waitForTimeout(400);
  const c=await p.evaluate(()=>{const k=document.querySelector('#mp-cartao .mp-it'),ct=document.querySelector('#mp-ctrl').getBoundingClientRect(),cr=k?.getBoundingClientRect();return {tem:!!k,x:!!k?.querySelector('[data-a=mp-desel]'),perto:/O que tem perto/.test(k?.textContent||''),acima:cr?ct.bottom<=cr.top:false}});
  ok(c.tem&&c.x,`${nome}: cartão do terreno com X`);ok(!c.perto,`${nome}: cartão sem "O que tem perto"`);ok(c.acima,`${nome}: botões do canto acima do cartão`);
  await p.screenshot({path:O+nome+'_cartao.png'});
  await p.click('#mp-cartao [data-a=mp-desel]');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>!document.querySelector('#mp-cartao').innerHTML.trim()&&!document.querySelector('.mp-it.sel')),`${nome}: X fecha o cartão e tira a seleção`)}
else{await p.evaluate(()=>document.querySelector('[data-a=mp-foco]').click());await p.waitForTimeout(300);
  ok(await p.evaluate(()=>!/O que tem perto/.test(document.querySelector('.mp-it.sel')?.textContent||'x')),`${nome}: linha selecionada sem "O que tem perto"`)}
// tela cheia
await p.click('[data-a=mp-cheia]');await p.waitForTimeout(300);
const tc=await p.evaluate(()=>{const r=document.querySelector('.mapa-area').getBoundingClientRect();return {on:document.body.classList.contains('mp-cheia'),w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y),lbl:document.querySelector('[data-a=mp-cheia]').getAttribute('aria-label')}});
ok(tc.on&&tc.w===w&&tc.h===h&&tc.x===0&&tc.y===0&&tc.lbl==='Sair da tela cheia',`${nome}: tela cheia cobre a página (${JSON.stringify(tc)})`);
await p.screenshot({path:O+nome+'_cheia.png'});
await p.click('[data-a=mp-cheia]');await p.waitForTimeout(300);
ok(await p.evaluate(()=>!document.body.classList.contains('mp-cheia')&&document.querySelector('.mapa-area').getBoundingClientRect().width<innerWidth),`${nome}: sair da tela cheia volta ao normal`);
if(w>600){await p.click('[data-a=mp-cheia]');await p.waitForTimeout(200);const api=await p.evaluate(()=>!!document.fullscreenElement);if(api)await p.evaluate(()=>document.exitFullscreen());else await p.keyboard.press('Escape');console.log('  (tela cheia do navegador: '+api+')');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>!document.body.classList.contains('mp-cheia')),`${nome}: Esc sai da tela cheia`);
  await p.click('[data-a=mp-cheia]');await p.waitForTimeout(200);await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(200);
  ok(await p.evaluate(()=>!document.body.classList.contains('mp-cheia')),`${nome}: sair da página Mapa tira a tela cheia`)}
await p.screenshot({path:O+nome+'.png'});await ctx.close()}
ok(!erros.length,'sem erros de página '+erros.join('; '));
await b.close();console.log(falhas.length?falhas.length+' falha(s)':'tudo ok');process.exit(falhas.length?1:0)})();
