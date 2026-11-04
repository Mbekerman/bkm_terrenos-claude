// Partes no cadastro: passo 2 do Novo terreno com as partes (só o nome obrigatório; tamanho, matrículas,
// inscrições, vendedores e corretor opcionais), quadro Partes no Cadastro da ficha, parte nova pela ficha
// antes de haver negociação, com inscrição, corretor e vendedor novo. Claro, escuro e celular.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const TMP=path.join(__dirname,'..','saida')+'/',O=TMP+'t_partescad/',L=path.join(__dirname,'..','libs','l')+'/',F=TMP+'bkm-terrenos.html';fs.mkdirSync(O,{recursive:true});
const falhas=[],erros=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch();
async function abre(w,h,tema){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5,hasTouch:w<700,isMobile:w<700});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});
    if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
    if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');
  await p.evaluate(t=>{localStorage.clear();if(t)localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(300);return {p,ctx}}
const ter=(p,nome)=>p.evaluate(n=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')).terrenos.find(t=>t.nome===n),nome);
const toast=p=>p.evaluate(()=>document.querySelector('#toast').textContent);
const txt=(p,s)=>p.evaluate(s=>[...document.querySelectorAll(s)].filter(x=>x.offsetParent).map(x=>x.textContent.trim().replace(/\s+/g,' ')).join(' | '),s);
// passo 2 do Novo terreno com uma poligonal num lugar vazio (o passo 1 é coberto pelo tnovo.js)
const KML=Buffer.from('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>Quadra</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-46.6304,-23.6096 -46.6296,-23.6096 -46.6296,-23.6104 -46.6304,-23.6104 -46.6304,-23.6096</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>');
const passo2=async p=>{await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
  const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=nv-kmz]')]);await fc.setFiles({name:'quadra.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:KML});
  await p.waitForSelector('#f-novo');await p.waitForTimeout(400);await p.fill('#n-mun','São Paulo · SP')};
const linha=async(p,i,d)=>{for(const [k,v] of Object.entries(d))await p.fill(`#nv-pt-lista .nv-pt:nth-child(${i}) [data-k=${k}]`,v)};
// lista de escolha da parte: abre, marca pelos nomes; incluir novo pelo pop-up pequeno
const abreMs=async(p,sc,tipo)=>{const b=`${sc} .msel[data-tipo=${tipo}]`;if(!(await p.$eval(b,x=>x.classList.contains('aberto'))))await p.click(`${b} .msel-b`);await p.waitForTimeout(100);return b};
const escolher=async(p,sc,tipo,nomes)=>{const b=await abreMs(p,sc,tipo);for(const n of nomes)await p.locator(`${b} label.chk`,{hasText:n}).locator('input').check()};
const incluir=async(p,sc,tipo,a,bv,shot)=>{const b=await abreMs(p,sc,tipo);await p.click(`${b} [data-a=ms-novo]`);await p.waitForSelector('#ms-dlg');await p.fill('#ms-a',a);if(bv){if(await p.$eval('#ms-b',x=>x.tagName==='SELECT'))await p.selectOption('#ms-b',bv);else await p.fill('#ms-b',bv)}if(shot)await p.screenshot({path:O+shot});
  await p.evaluate(()=>document.getElementById('ms-f').requestSubmit());await p.waitForTimeout(150)};
const R=i=>`#nv-pt-lista .nv-pt:nth-child(${i})`;
const bloco=async(p,k)=>{await p.evaluate(k=>{const b=document.querySelector('.fi-abas [data-t='+({cadastro:'terreno',negociacao:'comercial',urbanismo:'parametros',fases:'jornada'}[k]||k)+']');if(b.getAttribute('aria-selected')!=='true')b.click()},k);await p.waitForTimeout(250)};
const enviar=async(p,id)=>{await p.evaluate(id=>{if(id==='f-novo')document.querySelector('#f-novo [name=tipoEmp][value=mercado]')?.click();document.getElementById(id).requestSubmit()},id);await p.waitForTimeout(300)};

let {p,ctx}=await abre(1440,900);
await passo2(p);
ok(await p.$('#nv-partes')!==null&&!(await p.$eval('#nv-partes',x=>x.open)),'passo 2 tem as partes, recolhidas');
await p.fill('#n-nome','Quadra dos Andrade');
await p.click('#nv-partes summary');await p.click('[data-a=nv-pt-add]');await p.click('[data-a=nv-pt-add]');await p.click('[data-a=nv-pt-add]');
ok((await p.$$('#nv-pt-lista .nv-pt')).length===3,'adicionar parte acrescenta linhas');
ok(!(await p.$(`${R(1)} [data-k=mats]`))&&(await p.$$(`${R(1)} .msel`)).length===4,'matrículas, inscrições, vendedores e corretores da parte são listas, não campos digitados');
await p.evaluate(()=>{document.querySelector('#f-novo details.details').open=true});await p.fill('#n-mat','301.001');
await linha(p,1,{nome:'Família Andrade',area:'1.200'});
await escolher(p,R(1),'mat',['301.001']);
ok((await txt(p,`${R(1)} .msel[data-tipo=mat] label.chk`))==='301.001 1º CRI','lista traz a matrícula digitada no passo 2');
await incluir(p,R(1),'mat','301.002','9º CRI','2a_popup.png');
ok(!(await p.$('#ms-dlg'))&&(await p.$eval(`${R(1)} .msel[data-tipo=mat] .msel-r`,x=>x.textContent))==='301.001, 301.002','incluir matrícula pelo pop-up: entra na lista já marcada');
await incluir(p,R(1),'ins','123.456.0001-1');await incluir(p,R(1),'pes','Rui Andrade','11 99999-0000');await incluir(p,R(1),'pes','Lia Andrade');
await escolher(p,R(1),'cor',['Marcos Lemos']);await p.locator(`${R(1)} .msel[data-tipo=cor] label.chk input`).nth(1).check();
await p.screenshot({path:O+'2b_lista.png'});
await linha(p,2,{nome:'Lote do Paulo'});await escolher(p,R(2),'cor',['Marcos Lemos']);
await abreMs(p,R(2),'mat');ok((await txt(p,`${R(2)} .msel[data-tipo=mat] label.chk`)).includes('301.002'),'o incluído numa parte aparece na lista das outras');
await p.click('#n-nome');
await p.click('#nv-pt-lista .nv-pt:nth-child(3) [data-a=nv-pt-del]');
ok((await p.$$('#nv-pt-lista .nv-pt')).length===2&&(await txt(p,'#nv-pt-lista legend'))==='Parte 1 | Parte 2','tirar uma linha renumera as outras');
await p.screenshot({path:O+'1_passo2.png',fullPage:false});
await p.evaluate(()=>document.getElementById('nv-partes').scrollIntoView());await p.screenshot({path:O+'2_passo2_partes.png'});
// parte sem nome é recusada
await p.click('[data-a=nv-pt-add]');await linha(p,3,{area:'300'});await enviar(p,'f-novo');
ok((await toast(p)).includes('nome a cada parte')&&await p.$('#f-novo')!==null,'parte sem nome não deixa cadastrar');
await p.click('#nv-pt-lista .nv-pt:nth-child(3) [data-a=nv-pt-del]');
await enviar(p,'f-novo');
let t=await ter(p,'Quadra dos Andrade');
ok(t&&t.partes.length===2,'terreno cadastrado com as duas partes');
ok(t.codigo!=='TER-000133'&&(await p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')).terrenos.filter(x=>x.codigo==='TER-000133').length))===1,'código novo não repete o do terreno de exemplo');
const pa=t.partes.find(x=>x.nome==='Família Andrade'),pb=t.partes.find(x=>x.nome==='Lote do Paulo');
ok(pa.area===1200&&pb.area==null,'tamanho do lote digitado e opcional');
ok(t.mats.filter(m=>m.parte===pa.id).length===2&&t.insc.some(i=>i.parte===pa.id&&i.sql==='123.456.0001-1'),'matrículas e inscrição entram no cadastro ligadas à parte');
ok(t.pessoas.filter(x=>x.parte===pa.id&&x.papel==='proprietario').length===2,'vendedores entram como proprietários da parte');
ok(t.corretores.filter(x=>(x.partes||[]).includes(pa.id)).length===2,'parte com dois corretores');
ok(t.corretores.some(x=>(x.partes||[]).includes(pa.id)&&x.partes.includes(pb.id))&&t.corretores.filter(x=>x.principal).length===1,'o mesmo corretor traz duas partes; um só principal no terreno');
ok(!t.neg,'sem oferta, nenhuma negociação aberta');
// ficha: Partes e Lotes na aba Terreno (lote 5, 4/nov/2026): o que veio do passo 2 vira lote da parte
await bloco(p,'cadastro');
ok(await p.$('#sec-partes-cad')!==null&&await p.$('#sec-lotes')!==null,'aba Terreno tem os quadros Partes e Lotes');
ok((await p.$eval('#pt2-n',x=>x.value))==='2','quantidade de partes = 2');
t=await ter(p,'Quadra dos Andrade');
const lA=t.lotes.filter(l=>l.parte===pa.id);
ok(lA.length===2&&lA.map(l=>l.num).sort().join()==='301.001,301.002','cada matrícula da parte virou um lote dela');
ok(lA.some(l=>l.ins.length===1&&t.insc.find(i=>i.id===l.ins[0]).sql==='123.456.0001-1'),'o SQL da parte entra num lote dela');
await p.evaluate(()=>document.getElementById('sec-partes-cad').scrollIntoView());await p.waitForTimeout(150);await p.screenshot({path:O+'3_cadastro.png'});
// parte nova e lote novo pela ficha
await p.click('#sec-partes-cad [data-a=pt2-mais]');await p.waitForTimeout(200);
t=await ter(p,'Quadra dos Andrade');const pc=t.partes.find(x=>x.nome==='Vendedor 3');
ok(!!pc,'Adicionar parte cria "Vendedor 3"');
await p.fill(`#pt2-${pc.id} [data-k=pessoa]`,'Ana Lima');await p.press(`#pt2-${pc.id} [data-k=pessoa]`,'Tab');await p.waitForTimeout(200);
await p.fill(`#pt2-${pc.id} [data-k=email]`,'ANA@Exemplo.com');await p.press(`#pt2-${pc.id} [data-k=email]`,'Tab');await p.waitForTimeout(200);
await p.click('#sec-lotes [data-a=lt-novo]');await p.waitForTimeout(200);
t=await ter(p,'Quadra dos Andrade');const ln=t.lotes[t.lotes.length-1];
ok(ln.titulo==='Lote 3','lote novo nasce com o próximo título');
await p.selectOption(`#lt-${ln.id} [data-k=parte]`,pc.id);await p.waitForTimeout(200);
await p.fill(`#lt-${ln.id} [data-k=num]`,'301.900');await p.press(`#lt-${ln.id} [data-k=num]`,'Tab');await p.waitForTimeout(200);
t=await ter(p,'Quadra dos Andrade');const pc2=t.partes.find(x=>x.id===pc.id);
ok(pc2.pessoa==='Ana Lima'&&pc2.email==='ana@exemplo.com','contato da parte gravado (e-mail em minúsculas)');
ok(t.lotes.find(l=>l.id===ln.id).parte===pc.id&&t.mats.find(m=>m.num==='301.900').parte===pc.id,'lote da parte nova com a matrícula');
// matrícula repetida em outro lote (mesmo cartório) é recusada
await p.selectOption(`#lt-${ln.id} [data-k=cri]`,'1º CRI');await p.waitForTimeout(200);
await p.fill(`#lt-${ln.id} [data-k=num]`,'301.001');await p.press(`#lt-${ln.id} [data-k=num]`,'Tab');await p.waitForTimeout(200);
ok((await toast(p)).includes('já está no'),'matrícula de outro lote é recusada');
// parte com lote não sai
await p.click(`#pt2-${pc.id} [data-a=pt2-excluir]`);await p.waitForTimeout(200);
ok((await toast(p)).includes('tem lotes')&&(await ter(p,'Quadra dos Andrade')).partes.some(x=>x.id===pc.id),'parte com lote não é excluída');
await p.click(`#lt-${ln.id} [data-a=lt-excluir]`);await p.waitForTimeout(200);
await p.click(`#pt2-${pc.id} [data-a=pt2-excluir]`);await p.waitForTimeout(200);
t=await ter(p,'Quadra dos Andrade');ok(!t.partes.some(x=>x.id===pc.id)&&!t.mats.some(m=>m.num==='301.900'),'Excluir lote e depois Excluir parte');
await ctx.close();

for(const [w,h,tema,n] of [[1440,900,'escuro','5_escuro'],[412,915,null,'6_celular']]){({p,ctx}=await abre(w,h,tema));
  await passo2(p);await p.fill('#n-nome','Teste '+n);await p.click('#nv-partes summary');await p.click('[data-a=nv-pt-add]');await linha(p,1,{nome:'Dono A'});await incluir(p,R(1),'mat','1');
  await p.evaluate(()=>document.getElementById('nv-partes').scrollIntoView());await p.waitForTimeout(150);await p.screenshot({path:O+n+'_passo2.png'});
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.nv-pt')].every(x=>x.scrollWidth<=x.clientWidth+1)),n+': passo 2 sem rolagem lateral');
  await enviar(p,'f-novo');await bloco(p,'cadastro');await p.evaluate(()=>document.getElementById('sec-partes-cad').scrollIntoView());await p.waitForTimeout(150);await p.screenshot({path:O+n+'_cadastro.png'});
  ok(await p.evaluate(()=>[...document.querySelectorAll('.pt2, .lt')].every(x=>x.scrollWidth<=x.clientWidth+1)),n+': quadro Partes sem vazar');
  await ctx.close()}
ok(!erros.length,'sem erros de página'+(erros.length?': '+erros.join(' / '):''));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
