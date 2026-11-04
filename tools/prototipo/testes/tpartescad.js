// Partes e Lotes da aba Terreno: o Novo terreno (só poligonal e nome, 4/nov/2026) nasce com a parte "Vendedor 1" e
// sem lotes; partes e lotes montados na ficha (as do exemplo entram pelo nvPlGravar), parte e lote novos pela ficha,
// matrícula repetida e de outro terreno, excluir lote e parte. Claro, escuro e celular.
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
const cadastrar=async(p,nome)=>{await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
  const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=nv-kmz]')]);await fc.setFiles({name:'quadra.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:KML});
  await p.waitForSelector('#f-novo');await p.waitForTimeout(400);if(await p.$('#n-mun'))await p.fill('#n-mun','São Paulo · SP');await p.fill('#n-nome',nome);
  await p.evaluate(()=>{const m=document.querySelector('#f-novo [name=municipio]');if(m&&!m.value)m.value='São Paulo · SP';document.getElementById('f-novo').requestSubmit()});await p.waitForTimeout(500);
  await p.evaluate(()=>document.querySelector('#modal [data-a=close]')?.click());await p.waitForTimeout(200);
  await p.evaluate(n=>{const t=JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')).terrenos.find(x=>x.nome===n);location.hash='#/terrenos/'+t.codigo+'/terreno'},nome);await p.waitForTimeout(500);
  await p.evaluate(()=>{document.querySelectorAll('section.qd-fechado .qd-tg').forEach(x=>x.click())});await p.waitForTimeout(150)};
// lista de escolha da parte: abre, marca pelos nomes; incluir novo pelo pop-up pequeno
const abreMs=async(p,sc,tipo)=>{const b=`${sc} .msel[data-tipo=${tipo}]`;if(!(await p.$eval(b,x=>x.classList.contains('aberto'))))await p.click(`${b} .msel-b`);await p.waitForTimeout(100);return b};
const escolher=async(p,sc,tipo,nomes)=>{const b=await abreMs(p,sc,tipo);for(const n of nomes)await p.locator(`${b} label.chk`,{hasText:n}).locator('input').check()};
const incluir=async(p,sc,tipo,a,bv,shot)=>{const b=await abreMs(p,sc,tipo);await p.click(`${b} [data-a=ms-novo]`);await p.waitForSelector('#ms-dlg');await p.fill('#ms-a',a);if(bv){if(await p.$eval('#ms-b',x=>x.tagName==='SELECT'))await p.selectOption('#ms-b',bv);else await p.fill('#ms-b',bv)}if(shot)await p.screenshot({path:O+shot});
  await p.evaluate(()=>document.getElementById('ms-f').requestSubmit());await p.waitForTimeout(150)};
const bloco=async(p,k)=>{await p.evaluate(k=>{const b=document.querySelector('.fi-abas [data-t='+({cadastro:'terreno',negociacao:'comercial',urbanismo:'parametros',fases:'jornada'}[k]||k)+']');if(b.getAttribute('aria-selected')!=='true')b.click()},k);await p.waitForTimeout(250)};

let {p,ctx}=await abre(1440,900);
await cadastrar(p,'Quadra dos Andrade');
let t=await ter(p,'Quadra dos Andrade');
ok(t&&/^[A-Z]\d{3}$/.test(t.codigo)&&t.partes.length===1&&t.partes[0].nome==='Vendedor 1'&&!(t.lotes||[]).length,'cadastro curto: nasce com "Vendedor 1", sem lotes, código '+(t&&t.codigo));
ok((await p.evaluate(c=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')).terrenos.filter(x=>x.codigo===c).length,t.codigo))===1,'código novo não repete o de outro terreno');
// monta pela ficha: Família Andrade (Vendedor 1 renomeado) e Lote do Paulo; Lote 1 com 2 SQLs, Lote 2 com o 2º SQL
const campo=async(sel,v)=>{await p.fill(sel,v);await p.press(sel,'Tab');await p.waitForTimeout(200)};
let pa0=t.partes[0].id;await campo(`#pt2-${pa0} [data-k=nome]`,'Família Andrade');await campo(`#pt2-${pa0} [data-k=pessoa]`,'Rui Andrade');await campo(`#pt2-${pa0} [data-k=email]`,'RUI@Andrade.com');
await p.click('#sec-partes-cad [data-a=pt2-mais]');await p.waitForTimeout(200);t=await ter(p,'Quadra dos Andrade');const pb0=t.partes[1].id;await campo(`#pt2-${pb0} [data-k=nome]`,'Lote do Paulo');
const novoLote=async(parte,num,sqls)=>{await p.click('#sec-lotes [data-a=lt-novo]');await p.waitForTimeout(250);const t=await ter(p,'Quadra dos Andrade'),l=t.lotes[t.lotes.length-1];
  await p.selectOption(`#lt-${l.id} [data-k=parte]`,parte);await p.waitForTimeout(200);await campo(`#lt-${l.id} [data-k=num]`,num);
  for(const q of sqls){await p.fill(`#lt-${l.id} [name=sql]`,q);await p.evaluate(id=>document.querySelector(`#lt-${id} form[data-form=lt-sql]`).requestSubmit(),l.id);await p.waitForTimeout(250)}};
await novoLote(pa0,'301.001',['123.456.0001-1','123.456.0002-1']);await novoLote(pb0,'301.002',['123.456.0002-1']);
t=await ter(p,'Quadra dos Andrade');
ok(t.partes.length===2&&t.partes[0].nome==='Família Andrade'&&t.partes[0].pessoa==='Rui Andrade','duas partes com o contato');
const pa=t.partes[0],pb=t.partes[1];
const l1=t.lotes.find(l=>l.titulo==='Lote 1'),l2=t.lotes.find(l=>l.titulo==='Lote 2');
ok(t.lotes.length===2&&l1.parte===pa.id&&l2.parte===pb.id&&l1.num==='301.001'&&l2.num==='301.002','dois lotes, cada um da sua parte');
const s2=t.insc.find(i=>i.sql==='123.456.0002-1');
ok(t.insc.length===2&&l1.ins.length===2&&l2.ins.length===1&&l1.ins.includes(s2.id)&&l2.ins.includes(s2.id),'SQL nas duas matrículas: um só cadastro, nos dois lotes');
ok(t.mats.length===2&&t.mats.every(m=>m.lote),'matrículas derivadas dos lotes');
ok(!t.neg,'sem oferta, nenhuma negociação aberta');
// ficha: Partes e Lotes na aba Terreno (lote 5, 4/nov/2026): o que veio do passo 2 vira lote da parte
await bloco(p,'cadastro');
ok(await p.$('#sec-partes-cad')!==null&&await p.$('#sec-lotes')!==null,'aba Terreno tem os quadros Partes e Lotes');
ok((await p.$eval('#pt2-n',x=>x.value))==='2','quantidade de partes = 2');
t=await ter(p,'Quadra dos Andrade');
const lA=t.lotes.filter(l=>l.parte===pa.id);
ok(lA.length===1&&lA[0].num==='301.001','a ficha mostra o lote da parte');
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
await p.selectOption(`#lt-${ln.id} [data-k=cri]`,await p.$eval(`#lt-${lA[0].id} [data-k=cri]`,x=>x.value));await p.waitForTimeout(200);
await p.fill(`#lt-${ln.id} [data-k=num]`,'301.001');await p.press(`#lt-${ln.id} [data-k=num]`,'Tab');await p.waitForTimeout(200);
ok((await toast(p)).includes('já está no'),'matrícula de outro lote é recusada');
// matrícula ou SQL de outro terreno: o lote não entra; oferece a nova oferta naquele terreno (4/nov/2026)
await p.fill(`#lt-${ln.id} [data-k=num]`,'184.552');await p.press(`#lt-${ln.id} [data-k=num]`,'Tab');await p.waitForTimeout(250);
ok(!!(await p.$('#modal [data-a=lt-dup-oferta]'))&&(await p.$eval('#modal h2',x=>x.textContent)).includes('já está em outro terreno')&&(await ter(p,'Quadra dos Andrade')).lotes.find(l=>l.id===ln.id).num==='301.900','matrícula de outro terreno: lote recusado, pergunta pela nova oferta');
await p.click('#modal [data-a=close]');await p.waitForTimeout(150);
await p.fill(`#lt-${ln.id} [name=sql]`,'089.123.0045-6');await p.evaluate(id=>document.querySelector(`#lt-${id} form[data-form=lt-sql]`).requestSubmit(),ln.id);await p.waitForTimeout(250);
const dupTxt=await p.$eval('#modal [data-a=lt-dup-oferta]',x=>x.textContent).catch(()=>'');
ok(/Registrar nova oferta no [A-Z]\d{3}/.test(dupTxt)&&!(await ter(p,'Quadra dos Andrade')).insc.some(i=>i.sql==='089.123.0045-6'),'SQL de outro terreno: não entra, oferece a nova oferta');
await p.click('#modal [data-a=lt-dup-oferta]');await p.waitForTimeout(300);
ok(!!(await p.$('#modal form[data-form=oferta]'))&&(await p.evaluate(()=>location.hash+location.pathname)).includes('comercial'),'"Registrar nova oferta" abre o formulário da oferta no outro terreno');
await p.click('#modal [data-a=close]');await p.waitForTimeout(150);
await p.evaluate(c=>{location.hash='#/terrenos/'+c+'/terreno'},t.codigo);await p.waitForTimeout(500);
// parte com lote não sai
await p.click(`#pt2-${pc.id} [data-a=pt2-excluir]`);await p.waitForTimeout(200);
ok((await toast(p)).includes('tem lotes')&&(await ter(p,'Quadra dos Andrade')).partes.some(x=>x.id===pc.id),'parte com lote não é excluída');
await p.click(`#lt-${ln.id} [data-a=lt-excluir]`);await p.waitForTimeout(200);
await p.click(`#pt2-${pc.id} [data-a=pt2-excluir]`);await p.waitForTimeout(200);
t=await ter(p,'Quadra dos Andrade');ok(!t.partes.some(x=>x.id===pc.id)&&!t.mats.some(m=>m.num==='301.900'),'Excluir lote e depois Excluir parte');
await ctx.close();

for(const [w,h,tema,n] of [[1440,900,'escuro','5_escuro'],[412,915,null,'6_celular']]){({p,ctx}=await abre(w,h,tema));
  await cadastrar(p,'Teste '+n);await p.click('#sec-partes-cad [data-a=pt2-mais]');await p.click('#sec-lotes [data-a=lt-novo]');await p.waitForTimeout(200);await p.evaluate(()=>document.getElementById('sec-partes-cad').scrollIntoView());await p.waitForTimeout(150);await p.screenshot({path:O+n+'_cadastro.png'});
  ok(await p.evaluate(()=>[...document.querySelectorAll('.pt2, .lt')].every(x=>x.scrollWidth<=x.clientWidth+1)),n+': quadro Partes sem vazar');
  await ctx.close()}
ok(!erros.length,'sem erros de página'+(erros.length?': '+erros.join(' / '):''));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
