const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'demo',{recursive:true});require('fs').mkdirSync(TMP+'t_gend',{recursive:true});
const {chromium}=require('playwright');const fs=require('fs');
const L=require('path').join(__dirname,'..','libs','l')+'/';const OUT=TMP+'t_gend/';
const html=fs.readFileSync(TMP+'demo/bkm-terrenos-lista-suspensa.html','utf8').replace('<title>','<meta name="gmaps-key" content="AIzaTESTETESTETESTETESTETESTE0000"><title>');
(async()=>{const b=await chromium.launch();const errs=[];
for(const tema of ['claro','escuro']){const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(u.includes('maps.googleapis.com/maps/api/js'))return r.fulfill({path:require('path').join(__dirname,'fake_gmaps.js'),contentType:'application/javascript'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto('file:///x/demo.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(800);
await p.click('.fi-abas [data-t=geral]');await p.waitForTimeout(200);await p.click('[data-a=edit][data-s=g-end]');await p.waitForTimeout(300);
console.log(tema,'busca no resumo:',await p.$$eval('#sec-g-end gmp-place-autocomplete',e=>e.length),await p.$eval('#sec-g-end .gbusca',x=>x.innerText.replace(/\s+/g,' ')));
await p.evaluate(()=>document.getElementById('sec-g-end').scrollIntoView({block:'center'}));await p.waitForTimeout(100);
await p.screenshot({path:OUT+tema+'_resumo_busca.png'});
// simula a escolha de um endereço em outra cidade
await p.evaluate(()=>{const pac=document.querySelector('#sec-g-end gmp-place-autocomplete');const C=(t,l,s)=>({types:t,longText:l,shortText:s||l});
  const place={fetchFields:async()=>{},formattedAddress:'Av. Cassiano Ricardo, 601 - Jardim Aquarius, São José dos Campos - SP, 12246-870, Brasil',
    addressComponents:[C(['street_number'],'601'),C(['route'],'Avenida Cassiano Ricardo','Av. Cassiano Ricardo'),C(['sublocality_level_1','sublocality'],'Jardim Aquarius'),C(['administrative_area_level_2'],'São José dos Campos'),C(['administrative_area_level_1'],'São Paulo','SP'),C(['postal_code'],'12246-870')],
    location:{lat:()=>-23.2203,lng:()=>-45.9017}};
  const ev=new Event('gmp-select');ev.placePrediction={toPlace:()=>place};pac.dispatchEvent(ev)});
await p.waitForTimeout(300);
console.log(tema,'preenchido:',await p.$$eval('#sec-g-end input[name]',e=>e.filter(x=>x.value).map(x=>x.name+'='+x.value).join(' | ')));
await p.screenshot({path:OUT+tema+'_resumo_escolhido.png'});
await p.click('#sec-g-end .btn.primary');await p.waitForTimeout(250);
console.log(tema,'resumo:',await p.evaluate(()=>[...document.querySelectorAll('#bl-geral .kv')].slice(0,2).map(k=>k.innerText.replace(/\s+/g,' ')).join(' / ')),'| log:',await p.$eval('.pn-log',x=>x.innerText.replace(/\s+/g,' ')));
// também no Cadastro
await p.click('.fi-abas [data-t=terreno]');await p.click('#sec-loc [data-a=edit]');await p.waitForTimeout(200);console.log(tema,'busca no cadastro:',await p.$$eval('#sec-loc gmp-place-autocomplete',e=>e.length));
await ctx.close()}
console.log('ERROS',errs);await b.close()})();
