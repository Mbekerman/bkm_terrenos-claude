// Partes, matrículas e SQLs da aba Terreno: o Novo terreno (só poligonal e nome, 4/nov/2026) nasce com a parte
// "Vendedor 1"; partes com contato, matrículas e SQLs pelas etiquetas, a parte escolhida na janela da etiqueta (o
// arrastar fica no tetiq.js), área e divergência por parte no Comercial, matrícula repetida e de outro terreno,
// excluir parte devolve as etiquetas. Claro, escuro e celular.
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
const incMat=async(n,a)=>{await p.fill('#em-n',n);if(a)await p.fill('#em-a',a);await p.evaluate(()=>document.querySelector('form[data-form=etq-mat]').requestSubmit());await p.waitForTimeout(200)};
const incSql=async q=>{await p.fill('#es-sql',q);await p.evaluate(()=>document.querySelector('form[data-form=etq-sql]').requestSubmit());await p.waitForTimeout(200)};
const naParte=async(k,pid)=>{await p.click(`[data-etq="${k}"] .etq-n`);await p.waitForTimeout(200);await p.selectOption('#modal [data-k=parte]',pid);await p.waitForTimeout(200);await p.click('#modal [data-a=close]');await p.waitForTimeout(150)};
await incMat('301.001','500');await incMat('301.002','300');await incSql('123.456.0001-1');await incSql('123.456.0002-1');
t=await ter(p,'Quadra dos Andrade');
ok(t.partes.length===2&&t.partes[0].nome==='Família Andrade'&&t.partes[0].pessoa==='Rui Andrade','duas partes com o contato');
ok(t.mats.length===2&&t.insc.length===2&&[...t.mats,...t.insc].every(x=>!x.parte),'matrículas e SQLs incluídos, sem parte');
const pa=t.partes[0],pb=t.partes[1],m1=t.mats[0],m2_=t.mats[1],s1=t.insc[0],s2=t.insc[1];
await naParte('m:'+m1.id,pa.id);await naParte('s:'+s1.id,pa.id);await naParte('m:'+m2_.id,pb.id);await naParte('s:'+s2.id,pb.id);
t=await ter(p,'Quadra dos Andrade');
ok(t.mats.find(m=>m.id===m1.id).parte===pa.id&&t.insc.find(i=>i.id===s2.id).parte===pb.id,'parte escolhida na janela da etiqueta');
ok(!t.lotes,'sem lotes no modelo novo');ok(!t.neg,'sem oferta, nenhuma negociação aberta');
ok(await p.$('#sec-partes-cad')!==null&&await p.$('#sec-lotes')!==null,'aba Terreno tem Partes e Matrículas e SQLs');
ok((await p.$eval('#pt2-n',x=>x.value))==='2','quantidade de partes = 2');
{const tx=await p.$eval(`.etq-pt[data-p="${pa.id}"]`,x=>x.innerText);ok(/500\s*m²/.test(tx),'área da parte pelas matrículas: '+tx.replace(/\s+/g,' '))}
await p.evaluate(()=>document.getElementById('sec-partes-cad').scrollIntoView());await p.waitForTimeout(150);await p.screenshot({path:O+'3_cadastro.png'});
// parte nova
await p.click('#sec-partes-cad [data-a=pt2-mais]');await p.waitForTimeout(200);
t=await ter(p,'Quadra dos Andrade');const pc=t.partes.find(x=>x.nome==='Vendedor 3');
ok(!!pc,'Adicionar parte cria "Vendedor 3"');
await p.fill(`#pt2-${pc.id} [data-k=pessoa]`,'Ana Lima');await p.press(`#pt2-${pc.id} [data-k=pessoa]`,'Tab');await p.waitForTimeout(200);
await p.fill(`#pt2-${pc.id} [data-k=email]`,'ANA@Exemplo.com');await p.press(`#pt2-${pc.id} [data-k=email]`,'Tab');await p.waitForTimeout(200);
ok((await ter(p,'Quadra dos Andrade')).partes.find(x=>x.id===pc.id).email==='ana@exemplo.com','e-mail em minúsculas');
// matrícula repetida e de outro terreno
await incMat('301001');ok((await toast(p)).includes('já está no terreno'),'matrícula repetida no terreno é recusada');
await incMat('184.552');
ok(!!(await p.$('#modal [data-a=lt-dup-oferta]'))&&(await p.$eval('#modal h2',x=>x.textContent)).includes('já está em outro terreno')&&!(await ter(p,'Quadra dos Andrade')).mats.some(m=>m.num==='184.552'),'matrícula de outro terreno: não entra, oferece a nova oferta');
await p.click('#modal [data-a=close]');await p.waitForTimeout(150);
await incSql('089.123.0045-6');
const dupTxt=await p.$eval('#modal [data-a=lt-dup-oferta]',x=>x.textContent).catch(()=>'');
ok(/Registrar nova oferta no [A-Z]\d{3}/.test(dupTxt)&&!(await ter(p,'Quadra dos Andrade')).insc.some(i=>i.sql==='089.123.0045-6'),'SQL de outro terreno: não entra, oferece a nova oferta');
await p.click('#modal [data-a=lt-dup-oferta]');await p.waitForTimeout(300);
ok(!!(await p.$('#modal form[data-form=oferta]'))&&(await p.evaluate(()=>location.hash+location.pathname)).includes('comercial'),'"Registrar nova oferta" abre o formulário da oferta no outro terreno');
await p.click('#modal [data-a=close]');await p.waitForTimeout(150);
await p.evaluate(c=>{location.hash='#/terrenos/'+c+'/terreno'},t.codigo);await p.waitForTimeout(500);
await p.evaluate(()=>{document.querySelectorAll('section.qd-fechado .qd-tg').forEach(x=>x.click())});await p.waitForTimeout(150);
// excluir parte: as etiquetas dela voltam para o quadro de cima
await p.click(`#pt2-${pb.id} [data-a=pt2-excluir]`);await p.waitForTimeout(200);
t=await ter(p,'Quadra dos Andrade');ok(!t.partes.some(x=>x.id===pb.id)&&!t.mats.find(m=>m.id===m2_.id).parte&&!t.insc.find(i=>i.id===s2.id).parte,'Excluir parte devolve as etiquetas para o quadro de cima');
// x da etiqueta exclui do terreno
await p.click(`[data-etq="m:${m2_.id}"] .etq-x`);await p.waitForTimeout(200);ok(!(await ter(p,'Quadra dos Andrade')).mats.some(m=>m.id===m2_.id),'x exclui a matrícula do terreno');
await ctx.close();

for(const [w,h,tema,n] of [[1440,900,'escuro','5_escuro'],[412,915,null,'6_celular']]){({p,ctx}=await abre(w,h,tema));
  await cadastrar(p,'Teste '+n);await p.click('#sec-partes-cad [data-a=pt2-mais]');await p.waitForTimeout(200);await p.evaluate(()=>document.getElementById('sec-partes-cad').scrollIntoView());await p.waitForTimeout(150);await p.screenshot({path:O+n+'_cadastro.png'});
  ok(await p.evaluate(()=>[...document.querySelectorAll('.pt2, .etq-pt, .etq-col')].every(x=>x.scrollWidth<=x.clientWidth+1)),n+': quadro Partes sem vazar');
  await ctx.close()}
ok(!erros.length,'sem erros de página'+(erros.length?': '+erros.join(' / '):''));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
