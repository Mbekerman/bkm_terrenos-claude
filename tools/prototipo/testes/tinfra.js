/* Aba Infraestrutura (lote 3 da ficha em abas): classificação topográfica medida pela poligonal (laser 2020 de verdade,
   pelo GeoSampa real), exemplo onde não dá para medir, poligonal nova mede de novo, visita técnica, viabilidades técnicas
   com validade e Configurações › Topografia. Precisa de rede para o GeoSampa (WFS das folhas e download do laser) e do
   laz-perf (LAZPERF=pasta com laz-perf.js e .wasm; padrão: npm root -g). Saídas em saida/t_infra/.
     node tools/prototipo/testes/tinfra.js   (depois de python3 tools/prototipo/build.py) */
const path=require('path'),fs=require('fs'),{chromium,devices}=require('playwright');
const OUT=path.join(__dirname,'..','saida','t_infra')+'/',L=path.join(__dirname,'..','libs','l')+'/',DADOS=path.join(__dirname,'..','..','..','docs','dados')+'/';
const LAZ=process.env.LAZPERF||path.join(require('child_process').execSync('npm root -g').toString().trim(),'laz-perf','lib','web')+'/';
fs.mkdirSync(OUT,{recursive:true});
const BASE='https://geo.test/geoserver/geoportal/',REAL='https://geoserver.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/',DL='https://novogeosampa.prefeitura.sp.gov.br/';
const html=fs.readFileSync(path.join(__dirname,'..','..','..','docs','prototipo.html'),'utf8')
  .replace('<title>',`<meta name="geosampa-url" content="${BASE}"><meta name="lazperf-url" content="https://laz.test/"><title>`);
let falhas=0;const ok=(c,m)=>{if(!c){falhas++;console.log('FALHOU:',m)}else console.log('ok ',m)};
// Av. Paulista 1500 (quase plano) e uma rampa no Morumbi (mais inclinada)
const quad=(lat,lng,m)=>{const dy=m/2/111320,dx=m/2/(111320*Math.cos(lat*Math.PI/180));return [[lat-dy,lng-dx],[lat-dy,lng+dx],[lat+dy,lng+dx],[lat+dy,lng-dx]]};
const POLY=quad(-23.56196,-46.65530,40),POLY2=quad(-23.59610,-46.71890,40);
(async()=>{const b=await chromium.launch(),erros=[];
for(const [nome,opt] of [['desktop',{viewport:{width:1440,height:900},deviceScaleFactor:1}],['celular',{...devices['Pixel 7']}]]){
const ctx=await b.newContext({...opt});
await ctx.route('**/*',async r=>{const u=r.request().url();
  if(/\/dados\//.test(u)){const n=u.split('/dados/')[1];return fs.existsSync(DADOS+n)?r.fulfill({path:DADOS+n,contentType:'application/json'}):r.fulfill({status:404,body:''})}
  if(u.startsWith('file://'))return r.continue();
  if(u.startsWith('http://bkm.test/'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(u.startsWith('https://laz.test/'))return r.fulfill({path:LAZ+u.split('/').pop(),contentType:u.endsWith('.wasm')?'application/wasm':'application/javascript'});
  if(u.startsWith('https://geo.test/Download/'))return r.fulfill({response:await r.fetch({url:u.replace('https://geo.test/',DL),timeout:120000})});
  if(u.startsWith(BASE))return r.fulfill({response:await r.fetch({url:u.replace(BASE,REAL),headers:{Referer:DL},timeout:60000})});
  return r.abort()});
await ctx.addInitScript(()=>{window.__qdReal=true});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));p.on('console',m=>{if(m.type()==='error')console.log('console:',m.text().slice(0,200))});
await p.goto('http://bkm.test/prototipo/');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(500);
const mudar=async(cod,fn,arg)=>{await p.evaluate(([c,f,a])=>{const k=Object.keys(localStorage).find(x=>/^bkm-terrenos-prototipo-v/.test(x)),S=JSON.parse(localStorage.getItem(k)),t=S.terrenos.find(x=>x.codigo===c);(new Function('t','a',f))(t,a);localStorage.setItem(k,JSON.stringify(S))},[cod,fn,arg])};
const ev=(f,a)=>p.evaluate(([f,a])=>BKM_TESTE.escopo(f,a),[f.toString(),a]);
const txt=sel=>p.$eval(sel,x=>x.innerText.replace(/\s+/g,' '));
// 1. laser de verdade: mede sozinho ao abrir a aba
await mudar('A123',"t.poly=a;t.lat=a[0][0];t.lng=a[0][1];t.municipio='São Paulo · SP';delete t.topoClass;t.infra={};delete t.vtec;delete t.visita",POLY);
await p.goto('http://bkm.test/prototipo/terrenos/A123/infra');await p.waitForTimeout(400);
if(nome==='desktop'){const m=await txt('#sec-relevo');ok(/Medindo/.test(m),'mostra que está medindo: '+m.slice(0,80))}
const t0=Date.now();await p.waitForSelector('#sec-relevo .tp-faixa',{timeout:180000}).catch(()=>{});
let r=await txt('#sec-relevo');console.log(nome,'laser em',((Date.now()-t0)/1000).toFixed(1),'s:',r.slice(0,400));
const c1=await ev(()=>T(UI.id).topoClass);ok(c1&&c1.fonte==='laser'&&c1.terra!=null&&c1.n>1000,'medição do laser gravada com a terra mexida ('+JSON.stringify(c1&&{perfil:c1.perfil,incl:c1.incl,terra:c1.terra,n:c1.n})+')');
ok(c1&&c1.perfil===(await ev(c=>tpClassificar(c.incl,c.terra),c1)),'perfil pelos limites ('+(c1&&c1.perfil)+')');
await p.screenshot({path:OUT+nome+'_1_relevo.png',fullPage:nome==='celular'});
// Visão geral: o perfil no Resumo, com a cor
await p.click('[data-a=tab][data-t=geral]');await p.waitForTimeout(300);ok(new RegExp('Perfil topográfico\\s*'+(await ev(c=>tpNome(c),c1)).split(' ·')[0]).test(await txt('.g-res')),'Resumo mostra o perfil');
ok(await p.$('.g-res .tp-chip.tp-'+c1.perfil),'chip na cor do perfil no Resumo');
// 2. poligonal nova: a medição antiga deixa de valer e mede de novo
await ev(a=>{const t=T(UI.id);t.poly=a;t.lat=a[0][0];t.lng=a[0][1];save();tpAuto(t)},POLY2);
await p.click('[data-a=tab][data-t=infra]');await p.waitForFunction(()=>BKM_TESTE.escopo('()=>{const c=T(UI.id).topoClass;return c&&c.key===tpKey(T(UI.id))}'),null,{timeout:180000}).catch(()=>{});await p.waitForTimeout(300);
const c2=await ev(()=>T(UI.id).topoClass);r=await txt('#sec-relevo');console.log(nome,'segunda poligonal:',r.slice(0,200));
ok(c2&&c2.key!==c1.key&&c2.incl>c1.incl,'poligonal nova mede de novo ('+(c2&&c2.perfil)+' '+(c2&&c2.incl)+'%)');
ok((await ev(()=>T(UI.id).hist.filter(h=>/Classificação topográfica/.test(h.txt)).length))===2,'cada medição vai para os logs');
// 3. visita técnica
await p.evaluate(()=>{const q=[...document.querySelectorAll('.qd-tg')].find(x=>x.closest('#sec-visita'));if(q&&q.getAttribute('aria-expanded')==='false')q.click()});
await p.selectOption('#vt-agua [data-ch=vt-d]','parcial');await p.waitForTimeout(200);
await p.fill('#vt-agua .vt-obs','Rede só na rua de trás');await p.press('#vt-agua .vt-obs','Tab');await p.waitForTimeout(200);
const inf=await ev(()=>({a:T(UI.id).infra.agua,v:T(UI.id).visita,h:T(UI.id).hist.slice(-3).map(h=>h.txt+' '+(h.det||[]).join(' | '))}));
ok(inf.a.d==='parcial'&&inf.a.obs==='Rede só na rua de trás'&&inf.v,'água Parcial com observação e data da visita');
ok(inf.h.some(x=>/Visita técnica · Água: Não verificado → Parcial/.test(x)),'log da visita técnica: '+inf.h.join(' | '));ok(inf.h.some(x=>/Água, observação: vazia → Rede só na rua de trás/.test(x)),'log da observação');
ok((await p.$$eval('#sec-visita [data-ch=vt-d]',x=>x.length))===8,'8 itens na visita técnica');
// 4. viabilidade técnica vencida
await p.evaluate(()=>{const q=[...document.querySelectorAll('.qd-tg')].find(x=>x.closest('#sec-vtec'));if(q&&q.getAttribute('aria-expanded')==='false')q.click()});
await p.selectOption('#vtec-agua [data-ch=vtec][data-c=s]','viavel');await p.waitForTimeout(200);
await p.fill('#vc-agua-e','2025-01-10');await p.press('#vc-agua-e','Tab');await p.waitForTimeout(150);
await p.fill('#vc-agua-v','2025-12-31');await p.press('#vc-agua-v','Tab');await p.waitForTimeout(200);
await p.selectOption('#vtec-energia [data-ch=vtec][data-c=s]','condicionada');await p.waitForTimeout(200);
await p.fill('#vc-energia-o','Reforço da rede pela incorporadora');await p.press('#vc-energia-o','Tab');await p.waitForTimeout(200);
r=await txt('#sec-vtec');console.log(nome,'viabilidades:',r.slice(0,300));ok(/Vencida em/.test(r)&&/1 vencida/.test(r),'viabilidade com a validade passada sai vencida');
await p.$eval('#sec-visita',x=>x.scrollIntoView());await p.screenshot({path:OUT+nome+'_2_visita.png',fullPage:nome==='celular'});
const larg=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);ok(larg<=0,'nada passa da largura da tela ('+larg+')');
// 5. tema escuro
await p.evaluate(()=>{document.documentElement.dataset.tema='escuro'});await p.waitForTimeout(150);await p.$eval('#sec-relevo',x=>x.scrollIntoView());
await p.screenshot({path:OUT+nome+'_3_escuro.png'});await p.evaluate(()=>{delete document.documentElement.dataset.tema});
// 6. sem GeoSampa (arquivo local): exemplo nos terrenos de exemplo, aviso nos outros
if(nome==='desktop'){
  // 7. Configurações › Topografia: limites novos reclassificam
  await p.goto('http://bkm.test/prototipo/configuracoes/topografia');await p.waitForTimeout(400);
  await p.screenshot({path:OUT+'desktop_4_config.png'});
  await p.fill('#tp-c-plano','12');await p.press('#tp-c-plano','Tab');await p.waitForTimeout(200);
  const c3=await ev(()=>S.terrenos.find(t=>t.codigo==='A123').topoClass);
  ok(c3.perfil===(c3.terra>0.25?c3.perfil:'plano'),'limite novo reclassifica ('+c3.perfil+' '+c3.incl+'%)');
  await p.fill('#tp-c-inclinado','5');await p.press('#tp-c-inclinado','Tab');await p.waitForTimeout(200);
  ok((await ev(()=>tpCfg().inclinado))===30,'limite fora de ordem é recusado');
  // 6. sem GeoSampa (arquivo local): exemplo nos terrenos de exemplo, aviso nos outros
  const html2=html.replace(/<meta name="geosampa-url"[^>]*>/,''),ARQ=OUT+'local.html';fs.writeFileSync(ARQ,html2);
  await p.goto('file://'+ARQ);await p.evaluate(()=>localStorage.clear());await p.goto('file://'+ARQ+'#/terrenos/A118/infra');await p.reload();await p.waitForTimeout(800);
  r=await txt('#sec-relevo');console.log('exemplo:',r.slice(0,200));ok(/exemplo do protótipo/.test(r),'sem GeoSampa, o exemplo');
  await mudar('A098',"t.municipio='São Paulo · SP'");await p.goto('file://'+ARQ+'#/terrenos/A098/infra');await p.reload();await p.waitForTimeout(800);
  r=await txt('#sec-relevo');console.log('sem medir:',r.slice(0,200));ok(/versão publicada/.test(r)&&!/Tentar de novo/.test(r),'sem GeoSampa nem exemplo, o aviso')}
await ctx.close()}
console.log(erros.length?'ERROS: '+erros.join(' | '):'sem erros na página');console.log(falhas?falhas+' falha(s)':'tudo certo');await b.close();process.exit(falhas||erros.length?1:0)})().catch(e=>{console.error(e);process.exit(1)});
