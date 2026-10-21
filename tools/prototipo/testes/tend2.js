const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'demo',{recursive:true});require('fs').mkdirSync(TMP+'t_end2',{recursive:true});
const {chromium}=require('playwright');const fs=require('fs');
const L=require('path').join(__dirname,'..','libs','l')+'/';const OUT=TMP+'t_end2/';
const html=fs.readFileSync(TMP+'demo/bkm-terrenos-lista-suspensa.html','utf8').replace('<title>','<meta name="gmaps-key" content="AIzaTESTETESTETESTETESTETESTE0000"><title>');
const lugar=(num)=>`(()=>{const C=(t,l,s)=>({types:t,longText:l,shortText:s||l});return {fetchFields:async()=>{},formattedAddress:'Av. Cassiano Ricardo${num?', '+num:''} - Jardim Aquarius, São José dos Campos - SP, 12246-870, Brasil',
  addressComponents:[${num?`C(['street_number'],'${num}'),`:''}C(['route'],'Avenida Cassiano Ricardo'),C(['sublocality_level_1'],'Jardim Aquarius'),C(['administrative_area_level_2'],'São José dos Campos'),C(['administrative_area_level_1'],'São Paulo','SP'),C(['postal_code'],'12246-870')],location:{lat:()=>-23.2203,lng:()=>-45.9017}}})()`;
const escolher=(p,sel,num)=>p.evaluate(([sel,src])=>{const pac=document.querySelector(sel+' gmp-place-autocomplete');const place=eval(src);const ev=new Event('gmp-select');ev.placePrediction={toPlace:()=>place};pac.dispatchEvent(ev)},[sel,lugar(num)]);
(async()=>{const b=await chromium.launch();const errs=[];
for(const tema of ['claro','escuro']){const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(u.includes('maps.googleapis.com/maps/api/js'))return r.fulfill({path:require('path').join(__dirname,'fake_gmaps.js'),contentType:'application/javascript'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto('file:///x/demo.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(800);
// Visão geral
await p.click('#bl-geral .bl-h');await p.waitForTimeout(200);await p.click('[data-a=edit][data-s=g-end]');await p.waitForTimeout(300);
await p.evaluate(()=>document.getElementById('sec-g-end').scrollIntoView({block:'center'}));await p.waitForTimeout(100);
await p.screenshot({path:OUT+tema+'_resumo_antes.png'});
console.log(tema,'zona opções:',await p.$$eval('#sec-g-end #f-zona option',e=>e.map(x=>x.textContent).join(',')));
console.log(tema,'readonly:',await p.$$eval('#sec-g-end input.auto-v',e=>e.map(x=>x.name).join(',')));
await escolher(p,'#sec-g-end','601');await p.waitForTimeout(300);
await p.fill('#sec-g-end #f-complemento','Lote 4');await p.selectOption('#sec-g-end #f-zona','centro');
await p.screenshot({path:OUT+tema+'_resumo_preenchido.png'});
await p.click('#sec-g-end .btn.primary');await p.waitForTimeout(250);
console.log(tema,'salvo:',JSON.stringify(await p.evaluate(()=>{const t=JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v7')).terrenos.find(t=>t.nome.includes('Barão'));return {cep:t.cep,log:t.logradouro,num:t.numero,comp:t.complemento,bairro:t.bairro,mun:t.municipio,zona:t.zona,lat:t.lat}})));
// Cadastro: Google sem número destrava o campo número; corrigir à mão destrava todos
await p.click('#bl-cadastro .bl-h');await p.click('#sec-loc [data-a=edit]');await p.waitForTimeout(200);
await escolher(p,'#sec-loc','');await p.waitForTimeout(300);
console.log(tema,'sem número → editável:',await p.$eval('#sec-loc #f-numero',x=>!x.readOnly),'foco',await p.evaluate(()=>document.activeElement.id));
await p.evaluate(()=>document.getElementById('sec-loc').scrollIntoView());await p.waitForTimeout(100);await p.screenshot({path:OUT+tema+'_cadastro.png'});
await p.click('#sec-loc [data-a=end-manual]');console.log(tema,'corrigir à mão: travados restantes',await p.$$eval('#sec-loc input.auto-v',e=>e.filter(x=>x.readOnly).length));
await ctx.close()}
console.log('ERROS',errs);await b.close()})();
