// Enter passa para o próximo campo; clicar num campo seleciona tudo (proto_ui.js).
const path=require('path');const {chromium}=require('playwright');
const L=path.join(__dirname,'..','libs','l')+'/';const F=path.join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.includes('leaflet.js'))return r.fulfill({path:L+'leaflet.js'});if(u.includes('jszip'))return r.fulfill({path:L+'jszip.min.js'});
 if(u.startsWith('http://bkm.test/prototipo')&&!u.includes('/dados/'))return r.fulfill({path:F,contentType:'text/html'});return r.fulfill({status:404,body:''})});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
const at=()=>p.evaluate(()=>{const a=document.activeElement;return a?(a.id||'')+'|'+(a.dataset.k||a.name||'')+'|'+a.value:''});
const sel=()=>p.evaluate(()=>{const a=document.activeElement;try{return a.selectionStart===0&&a.selectionEnd===a.value.length&&a.value.length>0}catch(e){return null}});
// pop-up da viabilidade
await p.goto('http://bkm.test/prototipo/terrenos/TER-000123/viabilidade/1');await p.waitForTimeout(700);
const pu='[data-vb=tp][data-k=pu]';
await p.click(pu);await p.waitForTimeout(100);ok(await sel(),'clicar no preço unitário seleciona todo o valor');
await p.click(pu);await p.waitForTimeout(100);ok(!(await sel()),'segundo clique no mesmo campo põe o cursor');
const a0=await at();await p.keyboard.press('Enter');await p.waitForTimeout(150);const a1=await at();
ok(a1!==a0&&/\|/.test(a1),'Enter no preço unitário vai para outro campo ('+a1+')');
ok(await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')),'foco continua no pop-up');
await p.click('[data-vb=tp][data-k=qtd]');await p.keyboard.type('77');await p.keyboard.press('Enter');await p.waitForTimeout(200);
ok(await p.evaluate(()=>document.activeElement.matches('input,select')&&document.activeElement.dataset.k!=='qtd'),'Enter depois de digitar (que refaz o quadro) mantém o foco no campo seguinte');
ok(await p.inputValue('[data-vb=tp][data-k=qtd]')==='77','valor digitado ficou (substituiu o anterior, que estava selecionado)');
await p.click(pu);await p.keyboard.type('1234567');ok(await p.inputValue(pu)==='1.234.567','máscara de R$ continua ao digitar sobre o valor selecionado');
// ficha: formulário de condições pedidas
await p.goto('http://bkm.test/prototipo/terrenos/TER-000123');await p.waitForTimeout(600);
await p.click('#sec-cond [data-a=edit]');await p.waitForTimeout(300);
const f='form[data-form=cond]';const n=await p.evaluate(s=>document.querySelector(s).querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select').length,f);
await p.focus(f+' input[name=valor]');await p.keyboard.press('Enter');await p.waitForTimeout(100);
ok(await p.evaluate(s=>!!document.querySelector(s)&&document.activeElement.form===document.querySelector(s)&&document.activeElement.name!=='valor',f),'Enter no valor pedido vai ao próximo campo sem gravar ('+await at()+')');
// busca de endereço do mapa: Enter continua buscando
await p.goto('http://bkm.test/prototipo/mapa');await p.waitForTimeout(800);
ok(await p.evaluate(()=>document.querySelector('#mp-end')?.type==='search'),'busca de endereço é type=search (fica de fora)');
// celular: o toque também seleciona
const pc=await (await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})).newPage();
await pc.context().route('**/*',r=>{const u=r.request().url();if(u.includes('leaflet.js'))return r.fulfill({path:L+'leaflet.js'});if(u.includes('jszip'))return r.fulfill({path:L+'jszip.min.js'});
 if(u.startsWith('http://bkm.test/prototipo')&&!u.includes('/dados/'))return r.fulfill({path:F,contentType:'text/html'});return r.fulfill({status:404,body:''})});
await pc.goto('http://bkm.test/prototipo/terrenos/TER-000123/viabilidade/1');await pc.waitForTimeout(700);
await pc.tap(pu);await pc.waitForTimeout(100);ok(await pc.evaluate(()=>{const a=document.activeElement;return a.selectionStart===0&&a.selectionEnd===a.value.length&&a.value.length>0}),'toque no campo (celular) seleciona todo o valor');
// último campo de formulário de inclusão: Enter grava (comportamento de antes)
await p.goto('http://bkm.test/prototipo/terrenos/TER-000123/tarefas');await p.waitForTimeout(600);
await p.evaluate(()=>{const f=document.querySelector('form[data-form=tarefa]');f.scrollIntoView();const a=f.previousElementSibling;if(a?.classList.contains('if-abre'))a.click()});await p.waitForTimeout(200);
const campos=await p.$$('form[data-form=tarefa] input:not([type=hidden]):not([type=checkbox]),form[data-form=tarefa] select');
const tit=await p.$('form[data-form=tarefa] input[name=titulo]');
if(tit){await tit.fill('Tarefa pelo Enter');let i=0;while(i++<campos.length&&await p.evaluate(()=>!!document.activeElement.form)){await p.keyboard.press('Enter');await p.waitForTimeout(80)}
  ok(await p.evaluate(()=>[...document.querySelectorAll('.tt .t1')].some(x=>x.children.length===0&&/Tarefa pelo Enter/.test(x.textContent))),'Enter campo a campo até o último grava a tarefa')}
else ok(false,'formulário de tarefa não achado');
console.log(errs.length?'\n'+errs.length+' falha(s)':'\ntudo ok');await b.close();process.exit(errs.length?1:0)})();
