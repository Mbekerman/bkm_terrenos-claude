// Quadros e tarefas (bloco 1): quadro geral com as listas do modelo, nova tarefa com código TAR, janela do cartão
// (checklist com responsável, comentário com @, quem acompanha é avisado, concluir leva para Feito, arquivar),
// quadro do terreno na ficha (listas próprias, arrastar muda a lista), link do cartão, Leitura só vê,
// Configurações › Tarefas; prints em claro, escuro e celular.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_quadros')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const est=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===v)){const o=[...el.options].find(o=>o.textContent.trim()===v);if(o)v=o.value}el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const preenche=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);el.value=v},[sel,v]);
const envia=(p,sel)=>p.evaluate(s=>{const f=document.querySelector(s);if(!f)throw new Error('não achei '+s);f.requestSubmit()},sel);
const nav=(p,r)=>p.evaluate(r=>document.querySelector(`[data-a=nav][data-r=${r}]`).click(),r);
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
// ---------- desktop claro: o caminho inteiro ----------
{const {ctx,p}=await abre(1440,900,'claro');
await nav(p,'tarefas');await p.waitForTimeout(250);
const cols=await p.$$eval('.tk-col .tkl-h > span:first-child',x=>x.map(y=>y.textContent));
ok(cols.join(',')==='Backlog,Fazer,Fazendo,Aguardando retorno,Pausadas,Feito',`quadro geral com as listas do modelo (${cols.join(', ')})`);
let s=await est(p);ok(s.terrenos.every(t=>t.tarefas.every(k=>/^TAR-\d{6}$/.test(k.codigo)&&k.lista&&!('status' in k))),'tarefas antigas ganham código TAR e lista no lugar do status');
await p.screenshot({path:O+'1_quadro_geral.png'});
// nova tarefa no Backlog
await clica(p,'[data-a=tk-nova][data-v=Backlog]');await p.waitForTimeout(200);
const tid=s.terrenos[0].id;await preenche(p,'#tm-t','Pedir certidões do vendedor');await muda(p,'#tm-ter',tid);await envia(p,'#f-tk');await p.waitForTimeout(250);
s=await est(p);let k=s.terrenos[0].tarefas.find(x=>x.titulo==='Pedir certidões do vendedor');
ok(k&&s.terrenos[0].listas.find(l=>l.id===k.lista).nome==='Backlog'&&k.solic==='Moisés','nova tarefa entra na lista escolhida e quem criou é o solicitante');
ok(await p.$eval('.tkm-cod',(x,c)=>x.textContent.includes(c),k.codigo),'criar abre a janela do cartão com o código '+k.codigo);
// checklist com responsável
await clica(p,'[data-a=tkc-ck-novo]');await p.waitForTimeout(100);await preenche(p,'[data-form=tkc-ck] input[name=nome]','Documentos');await envia(p,'[data-form=tkc-ck]');await p.waitForTimeout(150);
await preenche(p,'[data-form=tkc-item] input[name=texto]','Matrícula atualizada');await muda(p,'[data-form=tkc-item] select[name=resp]','Ana Prado');await envia(p,'[data-form=tkc-item]');await p.waitForTimeout(150);
s=await est(p);ok(s.notifs.some(n=>n.para==='Ana Prado'&&n.txt.includes('Item para você')&&n.txt.includes('Matrícula atualizada')),'responsável do item é avisado');
await clica(p,'[data-tkc=item-feito]');await p.waitForTimeout(150);
ok(await p.$eval('.tkm-ckh',x=>x.textContent.includes('1/1')),'marcar o item atualiza o andamento (1/1)');
// quem acompanha e comentário com @
await muda(p,'[data-tkc=add-acomp]','Rafael Souza');await p.waitForTimeout(100);
await muda(p,'[data-tkc=add-exec]','Camila Torres');await p.waitForTimeout(100);
s=await est(p);ok(s.notifs.some(n=>n.para==='Camila Torres'&&n.tipo==='tarefa_atribuida'&&n.txt.includes('executor')),'executor é avisado');
await preenche(p,'[data-form=tkc-com] textarea','Pedi ao cartório, @ana.prado acompanha o protocolo');await envia(p,'[data-form=tkc-com]');await p.waitForTimeout(200);
s=await est(p);ok(s.notifs.some(n=>n.para==='Ana Prado'&&n.tipo==='mencao'&&n.txt.includes('num comentário da tarefa')),'@ no comentário avisa a pessoa');
ok(s.notifs.some(n=>n.para==='Rafael Souza'&&n.tipo==='tarefa_acompanhada'&&n.txt.includes('comentou')),'quem acompanha é avisado do comentário');
ok(await p.$eval('.tkm-cot .mencao',x=>x.textContent==='@ana.prado'),'o @ aparece destacado no comentário');
await clica(p,'[data-a=tkc-reage][data-r="👍"]');await p.waitForTimeout(100);ok(await p.$$eval('.tkm-re.on',x=>x.length)===1,'reação marcada');
await clica(p,'[data-a=tkc-pop][data-v=etq]');await p.waitForTimeout(100);await clica(p,'[data-a=tkc-etq]','Jurídico');await p.waitForTimeout(100);
await p.screenshot({path:O+'2_cartao.png'});
// concluir e arquivar
await clica(p,'[data-a=tkc-concluir]');await p.waitForTimeout(150);
s=await est(p);k=s.terrenos[0].tarefas.find(x=>x.titulo==='Pedir certidões do vendedor');
ok(k.feita&&s.terrenos[0].listas.find(l=>l.id===k.lista).nome==='Feito','marcar como concluída leva para Feito');
ok(s.notifs.some(n=>n.para==='Rafael Souza'&&n.txt.startsWith('Tarefa concluída')),'quem acompanha é avisado da conclusão');
await muda(p,'[data-tkc=lista]',s.terrenos[0].listas.find(l=>l.nome==='Fazendo').id);await p.waitForTimeout(150);
s=await est(p);k=s.terrenos[0].tarefas.find(x=>x.titulo==='Pedir certidões do vendedor');ok(!k.feita,'tirar da lista Feito reabre');
await clica(p,'[data-a=tkc-arq]');await p.waitForTimeout(150);await clica(p,'[data-a=close]');await p.waitForTimeout(150);
ok(!(await p.$$eval('.tk',x=>x.some(y=>y.textContent.includes('Pedir certidões do vendedor')))),'arquivada sai do quadro');
await p.evaluate(()=>{const el=document.querySelector('[data-ch=tk-f][data-k=arq]');el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}))});await p.waitForTimeout(150);
ok(await p.$$eval('.tk',x=>x.some(y=>y.textContent.includes('Pedir certidões do vendedor'))),'filtro Arquivadas mostra a tarefa');
await p.evaluate(()=>{const el=document.querySelector('[data-ch=tk-f][data-k=arq]');el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}))});
// link do cartão
const cod=(await est(p)).terrenos[0].tarefas[0].codigo;await p.evaluate(c=>history.replaceState(null,'','#/tarefas/'+c),cod);await p.reload();await p.waitForTimeout(400);
ok(await p.$eval('.tkm-cod',x=>x.textContent).then(t=>t.includes(cod)).catch(()=>false),'o link /tarefas/'+cod+' abre a janela do cartão');
await clica(p,'[data-a=close]');
// ficha: quadro do terreno, listas próprias e arrastar
await p.evaluate(id=>{const a=document.createElement('button');a.dataset.a='abrir';a.dataset.id=id;a.dataset.tab='tarefas';document.body.appendChild(a);a.click()},tid);await p.waitForTimeout(400);
ok(await p.$$eval('#bl-tarefas .tk-col',x=>x.length)===6,'a ficha mostra o quadro do terreno com as 6 listas');
await clica(p,'[data-a=tk-listas]');await p.waitForTimeout(150);await muda(p,'[data-tkl=nome]','Entrada');await p.waitForTimeout(150);
s=await est(p);ok(s.terrenos[0].listas[0].nome==='Entrada'&&s.terrenos[1].listas[0].nome==='Backlog','renomear a lista vale só para o terreno');
await clica(p,'[data-a=close]');await p.waitForTimeout(150);
await p.evaluate(()=>{window.__dt=new DataTransfer()});
const ev=(sel,tipo,i=0)=>p.evaluate(([s,t,i])=>{const el=document.querySelectorAll(s)[i],r=el.getBoundingClientRect();el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:window.__dt,clientX:r.x+r.width/2,clientY:r.y+r.height-10}))},[sel,tipo,i]);
const kk=await p.$eval('#bl-tarefas .tk[draggable=true]',x=>x.dataset.tk);
await ev('#bl-tarefas .tk[draggable=true]','dragstart');const iF=await p.$$eval('#bl-tarefas .tk-col',x=>x.findIndex(c=>c.dataset.tkcol==='Aguardando retorno'));
await ev('#bl-tarefas .tk-col','dragover',iF);await ev('#bl-tarefas .tk-col','drop',iF);await p.waitForTimeout(200);
s=await est(p);k=s.terrenos[0].tarefas.find(x=>x.id===kk);ok(s.terrenos[0].listas.find(l=>l.id===k.lista).nome==='Aguardando retorno','arrastar na ficha muda a lista');
ok(s.terrenos[0].hist.some(h=>h.txt.includes('→ Aguardando retorno')),'a mudança de lista vai para o log do terreno');
await p.evaluate(()=>document.getElementById('bl-tarefas').scrollIntoView());await p.waitForTimeout(150);await p.screenshot({path:O+'3_ficha.png'});
// Configurações › Tarefas
await p.evaluate(()=>history.replaceState(null,'','#/configuracoes/tarefas'));await p.reload();await p.waitForTimeout(400);
ok(await p.$$eval('[data-tkcfg=nome]',x=>x.length)===6,'Configurações › Tarefas lista as listas padrão');
await preenche(p,'[data-form=tkcfg-lista] input[name=nome]','Revisão');await envia(p,'[data-form=tkcfg-lista]');await p.waitForTimeout(150);
s=await est(p);ok(s.listasModelo.some(l=>l.nome==='Revisão')&&!s.terrenos[0].listas.some(l=>l.nome==='Revisão'),'lista padrão nova vale para quadros novos; os existentes mantêm as suas');
await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-a=tkcfg-ativo]')];b[5].click()});await p.waitForTimeout(150);
s=await est(p);ok(s.listasModelo.find(l=>l.nome==='Feito').ativo,'o modelo não fica sem lista que conclui');
await p.screenshot({path:O+'4_config.png'});
// Leitura só vê
await p.evaluate(()=>history.replaceState(null,'','#/tarefas'));await p.reload();await p.waitForTimeout(300);
await p.evaluate(()=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v='Leitura';document.body.appendChild(a);a.click()});await p.waitForTimeout(200);
ok(!(await p.$('[data-a=tk-nova]')),'Leitura não cria tarefa');
await clica(p,'.tk[data-a=tk-abrir]');await p.waitForTimeout(200);
ok(!(await p.$('[data-form=tkc-com]'))&&(await p.$eval('.tkm-tit',x=>x.disabled))&&!(await p.$('[data-a=tkc-arq]')),'Leitura abre o cartão sem editar, comentar nem arquivar');
await p.screenshot({path:O+'4b_leitura.png'});
await ctx.close()}
// ---------- celular escuro ----------
{const {ctx,p}=await abre(390,844,'escuro');
await nav(p,'tarefas');await p.waitForTimeout(250);await p.screenshot({path:O+'5_celular_quadro.png'});
await clica(p,'.tk[data-a=tk-abrir]','Cobrar resposta');await p.waitForTimeout(250);
const sobra=await p.$eval('#modal .dialog',d=>d.scrollWidth-d.clientWidth);ok(sobra<=1,`celular: a janela do cartão não rola para o lado (${sobra}px)`);
await p.screenshot({path:O+'6_celular_cartao.png'});
await p.evaluate(()=>{const d=document.querySelector('#modal .dialog');d.scrollTop=900});await p.waitForTimeout(150);await p.screenshot({path:O+'7_celular_cartao2.png'});
await ctx.close()}
await b.close();
if(erros.length)console.log('ERROS NA PÁGINA:\n'+erros.join('\n'));
console.log(falhas.length||erros.length?`\n${falhas.length} falha(s)`:'\nTUDO OK');process.exit(falhas.length||erros.length?1:0)})();
