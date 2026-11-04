// Campo obrigatório em branco no Novo terreno: destaque, seção recolhida abre, rola até o campo e o aviso diz qual é.
const path=require('path'),fs=require('fs'),{chromium,devices}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',OUT=TMP+'t_obrig/',L=path.join(__dirname,'..','libs','l')+'/';fs.mkdirSync(OUT,{recursive:true});
const html=fs.readFileSync(TMP+'bkm-terrenos.html','utf8').replace('<title>','<meta name="viewport" content="width=device-width, initial-scale=1"><title>'),KEY='bkm-terrenos-prototipo-v9';
// lugar vazio para o terreno novo e o A123 dos exemplos
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
  if(await p.$('[data-a=mp-concluir]'))await p.click('[data-a=mp-concluir]');else await p.keyboard.press('Enter');await p.waitForTimeout(500)}
const titulo=p=>p.$eval('#modal h2',x=>x.textContent).catch(()=>'');


{const {p}=await pagina(false);
  await desenhar(p,'Rua Teste 15',[-15,-25,15,25]);
  await p.waitForFunction(()=>{const b=document.querySelector('#btn-novo');return b&&!b.disabled},null,{timeout:12000}).catch(()=>{});
  // apaga o nome, rola até o fim e clica em Cadastrar
  await p.fill('#n-nome','');
  await p.evaluate(()=>{const m=document.querySelector('#modal .modal')||document.querySelector('#modal');m.querySelectorAll('*').forEach(x=>{if(x.scrollHeight>x.clientHeight+5)x.scrollTop=x.scrollHeight})});
  await p.click('#btn-novo');await p.waitForTimeout(900);
  const r=await p.evaluate(()=>{const t=document.querySelector('#n-nome').closest('.field'),b=t.getBoundingClientRect();return {erro:t.classList.contains('campo-erro'),msg:t.querySelector('.campo-msg')?.textContent,toast:document.querySelector('#toast').textContent,visivel:b.top>=0&&b.bottom<=innerHeight}});
  console.log(JSON.stringify(r));
  ok(r.erro&&/Preencha este campo/.test(r.msg||''),'nome em branco fica destacado com o aviso embaixo');
  ok(/Nome de referência/.test(r.toast),'o aviso diz qual campo falta: '+r.toast);
  ok(r.visivel,'a página rola até o campo');
  await p.screenshot({path:OUT+'1_nome_em_branco.png'});
  await p.fill('#n-nome','Leste');await p.waitForTimeout(150);
  ok(!(await p.$('#f-novo .campo-erro')),'preenchendo o nome, o destaque some');
  // campo obrigatório dentro da seção recolhida: a seção abre e o nome aparece
  await p.evaluate(()=>{const d=document.createElement('details');d.id='t-sec';d.innerHTML='<summary>Mais dados</summary><div class="field"><label for="t-ace">Aceita permuta</label><input id="t-ace" name="t_ace" required></div>';document.querySelector('#f-novo').append(d)});
  await p.click('#btn-novo');await p.waitForTimeout(900);
  const q=await p.evaluate(()=>({aberta:document.querySelector('#t-sec').open,erro:!!document.querySelector('#t-ace').closest('.campo-erro'),toast:document.querySelector('#toast').textContent}));
  ok(q.aberta&&q.erro&&/Aceita permuta/.test(q.toast),'campo em seção recolhida: a seção abre e o aviso diz o campo: '+q.toast);
  await p.screenshot({path:OUT+'2_secao_recolhida.png'});
  await p.evaluate(()=>{document.querySelector('#t-sec').remove()});
  await p.click('#btn-novo');await p.waitForTimeout(900);
  ok((await est(p)).terrenos.some(x=>x.nome==='Leste'),'preenchido, o terreno é cadastrado');
}
// celular
{const {p}=await pagina(true);
  await desenhar(p,'Rua Teste 15',[-15,-25,15,25]);
  await p.waitForFunction(()=>{const b=document.querySelector('#btn-novo');return b&&!b.disabled},null,{timeout:12000}).catch(()=>{});
  await p.fill('#n-nome','');await p.click('#btn-novo');await p.waitForTimeout(900);
  ok(await p.$('#f-novo .campo-erro #n-nome'),'celular: nome destacado');await p.screenshot({path:OUT+'3_celular.png'});
}
console.log(errs.length?'\n'+errs.length+' FALHA(S)':'\ntudo ok');await b.close();process.exit(errs.length?1:0)})();
