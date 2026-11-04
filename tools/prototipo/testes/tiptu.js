// IPTU e valor venal à vista (pedido do Moisés, 4/nov/2026): gravados por SQL, somados no quadro de cada parte e no
// total do terreno (SQL sem IPTU não vira zero: "N de M SQLs sem IPTU"), IPTU do ano na etiqueta do SQL e a área
// construída do cadastro da prefeitura como referência em Características físicas. Imagens em saida/t_iptu/.
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');const D=path.join(__dirname,'..')+'/';
let falhas=0;const ok=(c,m)=>{console.log((c?'ok   ':'FALHOU ')+m);if(!c)falhas++};
const html=fs.readFileSync(D+'saida/bkm-terrenos.html','utf8');const OUT=D+'saida/t_iptu/';
(async()=>{const b=await chromium.launch(),errs=[];
for(const [nome,vp,tema] of [['d',{width:1440,height:900},'claro'],['m',{width:390,height:844},'claro'],['de',{width:1440,height:900},'escuro']]){
const ctx=await b.newContext({viewport:vp,deviceScaleFactor:2});
await ctx.route('**/*',r=>r.request().url().startsWith('file://')?r.fulfill({body:html,contentType:'text/html; charset=utf-8'}):r.abort());
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(700);
const info=await p.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bkm-terrenos-prototipo'));const S=JSON.parse(localStorage.getItem(k));
  const t=S.terrenos.find(t=>t.insc.filter(i=>(i.valores||[]).length).length>=1&&t.insc.length>=2)||S.terrenos.find(t=>t.insc.some(i=>(i.valores||[]).length));
  return {k,cod:t.codigo,n:t.insc.length,v:t.insc.map(i=>(i.valores||[]).length)}});
await p.evaluate(({k,cod})=>{const S=JSON.parse(localStorage.getItem(k)),t=S.terrenos.find(x=>x.codigo===cod);
  const P=t.partes=t.partes&&t.partes.length?t.partes:[{id:'p1',ativa:true,neg:null,propostas:[],nome:'Vendedor 1',essencial:true,area:null}];
  if(!P[0].id)P[0].id='p1';P.push({id:'p2',ativa:true,neg:null,propostas:[],nome:'Família Souza',essencial:true,area:null});
  t.insc[0].parte=P[0].id;t.insc[0].geo=[{lote:{qt_area_construida:320}}];t.aConst=null;
  t.insc.push({id:'i2',mun:t.insc[0].mun,sql:'089.123.0046-4',area:410,parte:'p2',geo:[{lote:{qt_area_construida:180}}],valores:[{ex:2026,rev:1,vig:true,vt:1500000,vc:120000,sit:'tributado',iptu:16200,parc:10,fonte:'Carnê'}]});
  t.insc.push({id:'i3',mun:t.insc[0].mun,sql:'089.123.0047-2',area:300,parte:'p2',valores:[]});
  localStorage.setItem(k,JSON.stringify(S))},info);await p.reload();await p.waitForTimeout(600);
await p.goto('file:///x/a.html#/terrenos/'+info.cod+'/terreno');await p.waitForTimeout(900);
const sec=p.locator('#sec-lotes');await sec.scrollIntoViewIfNeeded();await p.waitForTimeout(300);
const tot=await sec.locator('.etq-tot').innerText(),pts=await sec.locator('.etq-pt-iptu').allInnerTexts(),etqs=await sec.locator('.etq.s').allInnerTexts();
ok(/Venal R\$\s5\.740\.000/.test(tot)&&/IPTU anual R\$\s61\.500/.test(tot)&&/1 de 3 SQLs sem IPTU/.test(tot),nome+': total do terreno soma os SQLs e avisa o que falta');
ok(pts.length===2&&/R\$\s4\.530,00/.test(pts[0])&&/1 de 2 SQLs sem IPTU/.test(pts[1]),nome+': resumo em cada parte');
ok(/45,3\smil/.test(etqs[0])&&!/mil/.test(etqs[2]),nome+': IPTU do ano na etiqueta, nada na que não tem');
await sec.screenshot({path:OUT+nome+'_lotes.png'});
const fh=(await p.locator('#sec-fis .hint').allInnerTexts()).join(' ');ok(/500\sm²\sconstruídos\s\(soma de 2 de 3 SQLs/.test(fh),nome+': área construída da prefeitura como referência');
await ctx.close()}
ok(!errs.length,'sem erro de página '+errs.join(' | '));await b.close();console.log(falhas?'FALHOU '+falhas:'TODOS OK');process.exit(falhas?1:0)})();
