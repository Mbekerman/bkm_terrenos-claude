// Novo terreno pela poligonal: passo 1 (desenhar, KMZ), busca de endereço no mapa, checagem de
// sobreposição (mesma área, área nova maior, cruzada, faixa de divisa), município e frentes pela
// localização com escolha do endereço principal. OpenStreetMap simulado. Prints em saida/t_novo/.
const path=require('path'),fs=require('fs'),{chromium,devices}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',OUT=TMP+'t_novo/',L=path.join(__dirname,'..','libs','l')+'/';fs.mkdirSync(OUT,{recursive:true});
const html=fs.readFileSync(TMP+'bkm-terrenos.html','utf8').replace('<title>','<meta name="viewport" content="width=device-width, initial-scale=1"><title>'),KEY='bkm-terrenos-prototipo-v9';
// lugar vazio para o terreno novo e o TER-000123 dos exemplos
const LUGAR={vazio:[-23.60000,-46.62000],cupece:[-23.668125,-46.6513]};
const errs=[],ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
// OpenStreetMap: a busca devolve o lugar; o inverso devolve rua conforme o lado do terreno novo
const nomi=u=>{const q=new URL(u).searchParams;
  if(u.includes('/search')){const k=/cupec/i.test(q.get('q'))?'cupece':'vazio';return [{display_name:k==='cupece'?'Av. Cupecê, Cidade Ademar, São Paulo, Brasil':'Rua Teste, Vila Teste, São Paulo, Brasil',lat:String(LUGAR[k][0]),lon:String(LUGAR[k][1])}]}
  const la=+q.get('lat'),lo=+q.get('lon'),[c0,c1]=LUGAR.vazio,dn=(la-c0)*110574,de=(lo-c1)*111320*Math.cos(c0*Math.PI/180);
  const road=Math.abs(dn)<5&&Math.abs(de)<5?'Rua Norte':dn>20?'Rua Norte':de>10?'Avenida Leste':null;
  return {address:{road:road||undefined,house_number:road==='Avenida Leste'?'900':road?'15':undefined,suburb:'Vila Teste',city:'São Paulo','ISO3166-2-lvl4':'BR-SP',postcode:'04000-000'}}};
(async()=>{const b=await chromium.launch();
async function pagina(cel){const ctx=await b.newContext(cel?{...devices['Pixel 7']}:{viewport:{width:1440,height:900},deviceScaleFactor:1.25});const pedidos=[];
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
    if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
    if(/nominatim/.test(u)){pedidos.push(u);return r.fulfill({contentType:'application/json',body:JSON.stringify(nomi(u))})}
    if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
  await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(500);return {p,ctx,pedidos}}
const est=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const area=pts=>{const lat0=pts.reduce((s,p)=>s+p[0],0)/pts.length*Math.PI/180,R=6371008,xy=pts.map(([la,lo])=>[R*lo*Math.PI/180*Math.cos(lat0),R*la*Math.PI/180]);let a=0;for(let i=0;i<xy.length;i++){const [x1,y1]=xy[i],[x2,y2]=xy[(i+1)%xy.length];a+=x1*y2-x2*y1}return Math.abs(a)/2};
// abre o passo 1, escolhe desenhar, busca o endereço e marca um retângulo (metros a partir do centro do mapa)
async function desenhar(p,q,ret){await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
  await p.click('[data-a=nv-desenhar]');await p.waitForTimeout(700);
  await p.fill('#mp-end',q);await p.press('#mp-end','Enter');await p.waitForTimeout(900);
  const c=await p.$eval('#mapa',x=>{const r=x.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}),lat=q.match(/cupec/i)?LUGAR.cupece[0]:LUGAR.vazio[0],mpp=156543.03392*Math.cos(lat*Math.PI/180)/2**18;
  const [w,s,e,n]=ret;for(const [x,y] of [[w,n],[e,n],[e,s],[w,s]]){await p.mouse.click(c.x+x/mpp,c.y-y/mpp);await p.waitForTimeout(120)}
  await p.click('[data-a=mp-concluir]');await p.waitForTimeout(500)}
const titulo=p=>p.$eval('#modal h2',x=>x.textContent).catch(()=>'');

// 1. terreno novo num lugar vazio: passo 1, busca no mapa, desenho, passo 2 com município e frentes
{const {p,ctx,pedidos}=await pagina(false);
  await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
  ok(await titulo(p)==='Novo terreno'&&(await p.$$('.nv-op')).length===2&&!(await p.$('#modal [name=sql]')),'passo 1 só com desenho ou KMZ/KML (sem inscrição)');
  ok(!(await p.$('[data-a=nv-ponto]')),'sem cadastro só pelo ponto');
  await p.screenshot({path:OUT+'1_passo1.png'});await p.keyboard.press('Escape');
  await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(700);
  await p.fill('#mp-end','Rua Te');await p.waitForTimeout(1200);ok((await p.$$('#mp-res [data-a=mp-res]')).length===1,'busca no mapa lista o resultado enquanto digita');
  await p.screenshot({path:OUT+'2_busca_mapa.png'});
  await desenhar(p,'Rua Teste 15',[-15,-25,15,25]);
  ok(await titulo(p)==='Novo terreno'&&/Passo 2/.test(await p.$eval('#modal',x=>x.textContent)),'sem sobreposição vai direto ao passo 2');
  await p.waitForFunction(()=>document.querySelector('#nv-frentes [name=frente]'),null,{timeout:12000}).catch(()=>{});
  const f=await p.evaluate(()=>({mun:document.querySelector('#n-mun').value,log:document.querySelector('#n-log').value,num:document.querySelector('#n-num').value,bai:document.querySelector('#n-bai').value,
    nome:document.querySelector('#n-nome').value,frentes:[...document.querySelectorAll('#nv-frentes label')].map(x=>x.textContent.replace(/\s+/g,' ').trim()),cid:document.querySelector('#f-novo [name=mun]:checked').value}));
  console.log('passo 2:',JSON.stringify(f));
  ok(f.mun==='São Paulo · SP'&&f.cid==='sp','município pela localização e inscrição aberta em São Paulo');
  ok(f.frentes.length===2&&/Avenida Leste, 900/.test(f.frentes[0])&&/Rua Norte, 15/.test(f.frentes[1])&&f.log==='Avenida Leste','duas frentes; a mais comprida vem como principal');
  await p.screenshot({path:OUT+'3_passo2_frentes.png'});
  await p.click('#nv-frentes label:has([value="1"])');await p.waitForTimeout(150);
  ok(await p.$eval('#n-log',x=>x.value)==='Rua Norte'&&await p.$eval('#n-nome',x=>x.value)==='Rua Norte, 15','escolher a frente troca o endereço principal e o nome sugerido');
  const tp=await p.evaluate(()=>{const f=document.querySelector('#nv-tipo');return f&&!f.hidden&&[...f.querySelectorAll('input')].map(x=>x.value+(x.required?'*':'')).join()});
  ok(tp==='mercado*,his*,hmp*','São Paulo: tipo do empreendimento obrigatório no passo 2 (Mercado, HIS, HMP): '+tp);
  await p.evaluate(()=>document.querySelector('#f-novo').requestSubmit());await p.waitForTimeout(300);
  ok(!(await est(p)).terrenos.some(x=>x.nome==='Rua Norte, 15'),'sem o tipo, o cadastro não vai');
  await p.click('#nv-tipo label:has([value=his])');await p.screenshot({path:OUT+'3b_passo2_tipo.png'});
  await p.evaluate(()=>document.querySelector('#f-novo').requestSubmit());await p.waitForTimeout(500);
  const t=(await est(p)).terrenos.find(x=>x.nome==='Rua Norte, 15');
  ok(t&&t.tipoEmp==='his','tipo HIS gravado no terreno');
  ok(t&&t.poly.length===4&&Math.abs(area(t.poly)-1500)<60&&t.municipio==='São Paulo · SP'&&t.logradouro==='Rua Norte','terreno gravado com a poligonal ('+(t&&Math.round(area(t.poly)))+' m²), município e endereço');
  ok(t&&t.confr.length===1&&t.confr[0].tipo==='frente'&&/Avenida Leste/.test(t.confr[0].conf)&&t.posicao==='esquina','a outra frente vira confrontação; posição esquina');
  console.log('histórico:',t&&t.hist[0].txt);
  // celular: passo 1, barra do mapa
  await ctx.close()}

// 2. a mesma área do TER-000123: aviso e nova oferta nele
{const {p,ctx}=await pagina(false);
  await desenhar(p,'Av. Cupecê',[-22,-21,21,22]);
  ok(await titulo(p)==='Este terreno já existe no sistema','mesma área: "já existe no sistema"');
  const txt=await p.$eval('.nv-sob',x=>x.innerText.replace(/\s+/g,' '));console.log('aviso:',txt);
  ok(/TER-000123/.test(txt)&&!/TER-000132/.test(txt),'acha o 123 e não o vizinho que só encosta na divisa');
  ok(await p.$eval('.nv-s [data-a=nv-oferta]',x=>x.textContent)==='Nova oferta neste terreno','ação: nova oferta');
  await p.screenshot({path:OUT+'4_mesma_area.png'});
  await p.click('.nv-s [data-a=nv-oferta]');await p.waitForTimeout(500);
  ok(await titulo(p)==='Registrar oferta'&&/TER-000123/.test(await p.$eval('main',x=>x.textContent)),'abre o terreno com o formulário de oferta');
  await ctx.close()}

// 3. área nova maior, que inclui o 123 (3 lotes contra 5): recadastrar com a área nova
{const {p,ctx}=await pagina(false);
  await desenhar(p,'Av. Cupecê',[-23,-70,23,24]);
  ok(await titulo(p)==='Parte desta área já está cadastrada','área maior: "parte já cadastrada"');
  const bt=await p.$$eval('.nv-s [data-a^=nv-]',x=>x.map(b=>b.textContent));ok(bt.join('|')==='Recadastrar com a área nova',' ação: '+bt.join(' | '));
  await p.screenshot({path:OUT+'5_parcial.png'});
  await p.click('.nv-s [data-a=nv-recad]');await p.waitForTimeout(500);
  const t=(await est(p)).terrenos.find(x=>x.codigo==='TER-000123');
  ok(Math.abs(area(t.poly)-46*94)<250&&t.polyAnt?.length===1&&/Recadastro com a área nova/.test(t.hist.at(-1).txt),'poligonal trocada pela nova ('+Math.round(area(t.poly))+' m²), anterior guardada');
  ok(await titulo(p)==='Registrar oferta','segue para a oferta');
  await ctx.close()}

// 4. área cruzada: juntar as duas
{const {p,ctx}=await pagina(false);
  await desenhar(p,'Av. Cupecê',[-60,-21,0,0]);
  const bt=await p.$$eval('.nv-s [data-a^=nv-]',x=>x.map(b=>b.textContent));ok(bt.join('|')==='Recadastrar juntando as áreas|Recadastrar só com a área nova','cruzada: juntar ou trocar');
  const t0=(await est(p)).terrenos.find(x=>x.codigo==='TER-000123'),a0=area(t0.poly);
  await p.click('.nv-s [data-a=nv-juntar]');await p.waitForTimeout(500);
  const t=(await est(p)).terrenos.find(x=>x.codigo==='TER-000123'),au=area(t.poly),esperado=a0+60*21-22*21;
  ok(Math.abs(au-esperado)<0.08*esperado,`união ${Math.round(au)} m² (esperado ~${Math.round(esperado)})`);
  ok(/parte do terreno/.test(await p.$eval('#modal',x=>x.textContent)),'oferta mostra o pedaço oferecido');
  await p.fill('#o-v','1500000');await p.evaluate(()=>document.querySelector('#f-of').requestSubmit());await p.waitForTimeout(300);
  const o=(await est(p)).terrenos.find(x=>x.codigo==='TER-000123').ofertas.at(-1);ok(o.poly&&Math.abs(area(o.poly)-1260)<120,'oferta guarda a poligonal do pedaço ('+Math.round(area(o.poly||[]))+' m²)');
  await ctx.close()}

// 5. faixa de 3 m na divisa não conta; KMZ com dois polígonos pede para escolher
{const {p,ctx}=await pagina(false);
  await desenhar(p,'Av. Cupecê',[-60,-21,-19,21]);
  ok(/Passo 2/.test(await p.$eval('#modal',x=>x.textContent)),'faixa de 3 m sobre a divisa do 123: passo 2 direto');
  await p.click('[data-a=nv-voltar]');await p.waitForTimeout(200);
  const kml=`<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${[['Lote A',-46.6200],['Lote B',-46.6190]].map(([n,lo])=>`<Placemark><name>${n}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${lo},-23.6 ${lo+0.0003},-23.6 ${lo+0.0003},-23.6003 ${lo},-23.6003 ${lo},-23.6</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`).join('')}</Document></kml>`;
  const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=nv-kmz]')]);await fc.setFiles({name:'lotes.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(kml)});await p.waitForTimeout(400);
  ok((await p.$$('[data-a=nv-kmz-i]')).length===2,'KMZ com dois polígonos: escolher qual');
  await p.click('[data-a=nv-kmz-i][data-i="1"]');await p.waitForTimeout(400);
  ok(/importada de KMZ/.test(await p.$eval('#modal',x=>x.textContent)),'polígono escolhido vai ao passo 2');
  await ctx.close()}

// 6. celular: passo 1 e mapa com a busca
{const {p,ctx}=await pagina(true);
  await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(300);
  ok(!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'celular: passo 1 sem rolagem horizontal');await p.screenshot({path:OUT+'6_celular_passo1.png'});
  await p.click('[data-a=nv-desenhar]');await p.waitForTimeout(800);
  const bb=await p.evaluate(()=>{const s=document.querySelector('.mp-busca').getBoundingClientRect(),g=document.querySelector('.mp-barra .seg').getBoundingClientRect();return {w:s.width,sobre:s.bottom<=g.top+1,dentro:s.right<=innerWidth}});
  ok(bb.sobre&&bb.dentro&&bb.w>250,'celular: busca em linha própria acima do tipo de mapa '+JSON.stringify(bb));
  await p.screenshot({path:OUT+'7_celular_mapa.png'});
  await p.evaluate(()=>document.documentElement.dataset.tema='escuro');await p.waitForTimeout(150);await p.screenshot({path:OUT+'8_celular_mapa_escuro.png'});
  await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
