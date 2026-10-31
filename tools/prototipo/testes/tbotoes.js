// Bloco 5b (30/out): botão no cartão (aparece por condição, só para quem edita, roda e registra), agendamento (editor, frase,
// dias do mês curto) e arrastar a barra do cronograma (mover, esticar, sucessora em cascata, concluída não arrasta); prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),O=path.join(__dirname,'..','saida','t_botoes')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const est=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
const abreTk=(p,tit)=>p.evaluate(t=>[...document.querySelectorAll('.tl-r .tl-t')].find(x=>x.textContent.includes(t)).click(),tit);
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,hash)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.goto('file:///x/a.html#'+hash);await p.reload();await p.waitForTimeout(600);return {ctx,p}};
{const {ctx,p}=await abre(1440,900,'/tarefas/lista');
  let s=await est(p);const bt=s.automacoes.find(r=>r.gat==='botao'),ag=s.automacoes.find(r=>r.gat==='agenda');
  ok(bt&&ag&&ag.aFreq==='semanal'&&ag.aDias.join()==='1','exemplos: um botão no quadro e um agendamento da empresa');
  await abreTk(p,'Estudo de viabilidade');await p.waitForTimeout(300);
  ok((await p.$$eval('#modal .tkm-bt',e=>e.map(x=>x.textContent.trim()))).join()==='Cobrar retorno','o botão aparece no cartão aberto');
  await p.screenshot({path:O+'1_botao.png'});
  await p.click('#modal .tkm-bt');await p.waitForTimeout(300);
  s=await est(p);const t0=s.terrenos[0],k=t0.tarefas.find(x=>x.titulo==='Estudo de viabilidade'),ex=s.autoExec.find(x=>x.aid===bt.id);
  ok(t0.listas.find(l=>l.id===k.lista).nome==='Aguardando retorno'&&ex&&ex.res==='ok'&&ex.por&&ex.kid===k.id,'apertar o botão move, adia e registra quem apertou');
  await p.keyboard.press('Escape');await p.waitForTimeout(200);
  await abreTk(p,'Pedir matrícula atualizada');await p.waitForTimeout(300);
  ok(!(await p.$('#modal .tkm-bt')),'cartão concluído não passa na condição: sem botão');
  await p.keyboard.press('Escape');await papel(p,'Leitura');await p.waitForTimeout(200);
  await abreTk(p,'Consultar zoneamento');await p.waitForTimeout(300);
  ok(!(await p.$('#modal .tkm-bt')),'Leitura não vê botão');
  await p.keyboard.press('Escape');await papel(p,'Analista');
  await ctx.close()}
{const {ctx,p}=await abre(1440,900,'/configuracoes/tarefas');await papel(p,'Diretor');await p.waitForTimeout(200);
  await p.evaluate(()=>document.querySelector('[data-a=au-nova][data-v=""]').click());await p.waitForTimeout(200);
  await p.selectOption('#modal [data-au=gat]','agenda');await p.waitForTimeout(150);
  ok(await p.$$eval('#modal [data-au-dia]:checked',e=>e.map(x=>x.value).join())==='1'&&await p.$('#modal [data-auc]'),'agendamento novo nasce semanal na segunda, com uma condição de situação');
  await p.check('#modal [data-au-dia][value="3"]');await p.waitForTimeout(120);await p.check('#modal [data-au-dia][value="5"]');await p.waitForTimeout(120);
  ok((await p.textContent('#modal .au-prev')).includes('Toda segunda, quarta e sexta'),'resumo do semanal com vários dias');
  await p.selectOption('#modal [data-au=aFreq]','mensal');await p.waitForTimeout(150);
  await p.fill('#modal [data-au=aDiasTx]','1, 31');await p.dispatchEvent('#modal [data-au=aDiasTx]','change');await p.waitForTimeout(150);
  await p.fill('#au-nome','Fechamento do mês');
  ok((await p.textContent('#modal .au-prev')).includes('Todo dia 1 e 31 do mês'),'resumo do mensal');
  await p.screenshot({path:O+'2_agenda.png'});
  await p.evaluate(()=>document.querySelector('#modal form[data-form=au-salvar]').requestSubmit());await p.waitForTimeout(200);
  const s=await est(p);ok(s.automacoes.some(r=>r.nome==='Fechamento do mês'&&r.aFreq==='mensal'&&r.aDias.join()==='1,31'),'agendamento salvo');
  await ctx.close()}
{const {ctx,p}=await abre(1600,900,'/tarefas/cronograma');
  const sel='.cr-bar[title^="Estudo de viabilidade"]',tit=()=>p.$eval(sel,e=>e.title);
  let bb=await (await p.$(sel)).boundingBox();const w=26;
  await p.mouse.move(bb.x+20,bb.y+8);await p.mouse.down();await p.mouse.move(bb.x+20+w*2,bb.y+8,{steps:6});await p.mouse.up();await p.waitForTimeout(300);
  let s=await est(p),k=s.terrenos[0].tarefas.find(x=>x.titulo==='Estudo de viabilidade');const d0=k.inicio,dur0=k.dur;
  ok(!(await p.$('#modal .tkm')),'arrastar não abre o cartão');
  bb=await (await p.$(sel)).boundingBox();
  await p.mouse.move(bb.x+bb.width-3,bb.y+8);await p.mouse.down();await p.mouse.move(bb.x+bb.width-3+w*2,bb.y+8,{steps:6});await p.mouse.up();await p.waitForTimeout(300);
  s=await est(p);k=s.terrenos[0].tarefas.find(x=>x.titulo==='Estudo de viabilidade');const suc=s.terrenos[0].tarefas.find(x=>x.titulo==='Levar ao comitê');
  ok(k.inicio===d0&&k.dur===dur0+2&&suc.inicio>k.prazo,'a ponta direita estica o prazo em 2 dias e a sucessora anda junto');
  const fe=await p.$('.cr-bar.feita');const fb=await fe.boundingBox(),antes=await fe.evaluate(e=>e.style.left);
  await p.mouse.move(fb.x+10,fb.y+8);await p.mouse.down();await p.mouse.move(fb.x+80,fb.y+8,{steps:6});await p.mouse.up();await p.waitForTimeout(300);
  ok(await p.$eval('.cr-bar.feita',e=>e.style.left)===antes,'concluída não arrasta');
  await p.screenshot({path:O+'3_cronograma.png'});await ctx.close()}
ok(!erros.length,'sem erro de página'+(erros.length?': '+erros.join(' | '):''));
await b.close();process.exit(falhas.length?1:0)})();
