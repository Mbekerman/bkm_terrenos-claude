// Olhinho e lixeira nos logs: o olhinho mostra a ficha sem a ação só para quem olha (nada gravado) e risca o log;
// a lixeira (quem fez, os superiores dela e o administrador) desfaz de verdade, risca o log original e registra "Desfeito: …"; Leitura só tem o olhinho.
// Prints em saida/t_logacoes.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_logacoes/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
const KEY='bkm-terrenos-prototipo-v9';
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
const abrir=async()=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(200);
  await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(500)};
await abrir();
const ter=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)).terrenos.find(t=>t.nome.includes('Barão')),KEY);
const t0=await ter();const v0=t0.testada,v1=(v0||10)+7;
await p.evaluate(()=>{const b=document.querySelector('.fi-abas [data-t=terreno]')||document.querySelector('.fi-abas [data-t=terreno]');b&&b.click()});await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('[data-a=edit][data-s=areas]').click());await p.waitForTimeout(200);
await p.fill('#sec-areas [name=testada]',String(v1).replace('.',','));await p.evaluate(()=>document.querySelector('#sec-areas form').requestSubmit());await p.waitForTimeout(400);
ok((await ter()).testada===v1,tag+' testada gravada '+v0+' → '+v1);
const vis=modo==='celular'?'.bl-hist ':'.pn ';const logSel=vis+'.pn-log:has([data-a=log-olho])';
const hist=async()=>{if(modo!=='celular')return;await p.evaluate(()=>{const b=document.querySelector('.fi-abas [data-t=historico]');if(b&&b.getAttribute('aria-selected')!=='true')b.click()});await p.waitForTimeout(300)};
await hist();
// no celular o histórico vira a última seção da página
const temBtn=await p.$$eval(logSel,e=>e.map(x=>x.querySelector('.pn-lt').textContent));
ok(temBtn.length===1&&/atualizad|editad|Testada/.test(temBtn[0]+''),tag+' o log da testada tem olhinho: '+temBtn.join(' | '));
ok(!!(await p.$(logSel+' [data-a=log-apagar]')),tag+' diretor tem a lixeira');
// olhinho: prévia
await p.click(logSel+' [data-a=log-olho] >> nth=0');await p.waitForTimeout(300);
const prev=await p.evaluate(sel=>({bar:!!document.querySelector('.log-previa'),off:document.querySelectorAll(sel+'.pn-log.off').length,sec:document.querySelector('#sec-areas')?.innerText.replace(/\s+/g,' ')}),vis);
/* no celular o histórico é uma aba: a testada aparece na aba Terreno */
if(modo==='celular'){await p.click('.fi-abas [data-t=terreno]');await p.waitForTimeout(300);prev.sec=await p.evaluate(()=>document.querySelector('#sec-areas')?.innerText.replace(/\s+/g,' '));prev.bar=prev.bar&&!!(await p.$('.log-previa'));await hist()}
const fmt=v=>v==null?'':v.toLocaleString('pt-BR');
ok(prev.bar&&prev.off===1,tag+' olhinho: faixa de prévia e log riscado');
ok(!prev.sec.includes(fmt(v1)+' m')&&(v0==null||prev.sec.includes(fmt(v0))),tag+' a ficha mostra a testada de antes: '+prev.sec.slice(0,120));
ok((await ter()).testada===v1,tag+' e nada foi gravado');
await p.evaluate(()=>document.querySelector('.pn-log.off')?.scrollIntoView({block:'center'}));await p.screenshot({path:OUT+tag+'_1previa.png'});
await p.click(vis+'[data-a=log-olho].on');await p.waitForTimeout(300);
ok(!(await p.$('.log-previa'))&&!(await p.$('.pn-log.off')),tag+' religar volta ao normal');
// lixeira
await p.click(logSel+' [data-a=log-apagar] >> nth=0');await p.waitForTimeout(250);ok(!!(await p.$('.pn-lconf')),tag+' lixeira pede confirmação');
await p.evaluate(()=>document.querySelector('.pn-lconf')?.scrollIntoView({block:'center'}));await p.screenshot({path:OUT+tag+'_2confirma.png'});
await p.click(vis+'[data-a=log-apagar-sim]');await p.waitForTimeout(400);
const t2=await ter();const orig=t2.hist.find(h=>h.desfeito);const nv=t2.hist[t2.hist.length-1];
ok(t2.testada===v0||t2.testada==null&&v0==null,tag+' desfeito: testada voltou a '+t2.testada);
ok(!!orig&&/^Desfeito: /.test(nv.txt)&&nv.desfaz,tag+' log original riscado e log novo: '+nv.txt+' '+JSON.stringify(nv.det||[]));
ok(await p.$$eval(vis+'.pn-log.desf',e=>e.length===1&&/Desfeito por/.test(e[0].innerText)),tag+' painel mostra "Desfeito por"');
ok(!(await p.$('.pn-log.desf [data-a=log-olho]'))&&!(await p.$$eval('.pn-log',e=>e.some(x=>/^Desfeito: /.test(x.querySelector('.pn-lt')?.textContent)&&x.querySelector('[data-a=log-olho]')))),tag+' sem botões no desfeito e no desfazer');
await p.evaluate(()=>document.querySelector('.pn-log.desf')?.scrollIntoView({block:'center'}));await p.screenshot({path:OUT+tag+'_3desfeito.png'});
// analista: só olhinho
if(modo==='celular'){await p.click('.fi-abas [data-t=terreno]');await p.waitForTimeout(300)}
await p.fill('#sec-areas [name=testada]',String(v1)).catch(async()=>{await p.evaluate(()=>document.querySelector('[data-a=edit][data-s=areas]').click());await p.waitForTimeout(200);await p.fill('#sec-areas [name=testada]',String(v1))});
await p.evaluate(()=>document.querySelector('#sec-areas form').requestSubmit());await p.waitForTimeout(300);
await p.evaluate(()=>{const x=document.createElement('button');x.dataset.a='role';x.dataset.v='Analista';document.body.appendChild(x);x.click();x.remove()});await p.waitForTimeout(400);
await abrir();await hist();ok(!!(await p.$(logSel))&&!(await p.$(vis+'[data-a=log-apagar]')),tag+' analista vê o olhinho e não a lixeira na ação do diretor');
// a própria ação: o analista tem a lixeira; o gestor dele também
await p.evaluate(()=>{const b=document.querySelector('.fi-abas [data-t=terreno]');if(b&&b.getAttribute('aria-selected')!=='true')b.click()});await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelector('[data-a=edit][data-s=areas]').click());await p.waitForTimeout(200);
await p.fill('#sec-areas [name=testada]',String(v1+3));await p.evaluate(()=>document.querySelector('#sec-areas form').requestSubmit());await p.waitForTimeout(400);await hist();
ok(!!(await p.$(vis+'[data-a=log-apagar]')),tag+' analista tem a lixeira na própria ação');
await p.evaluate(()=>{const x=document.createElement('button');x.dataset.a='role';x.dataset.v='Gestor';document.body.appendChild(x);x.click();x.remove()});await p.waitForTimeout(400);
await abrir();await hist();ok(!!(await p.$(vis+'[data-a=log-apagar]')),tag+' gestor (superior do analista) tem a lixeira');
await p.evaluate(()=>{const x=document.createElement('button');x.dataset.a='role';x.dataset.v='Leitura';document.body.appendChild(x);x.click();x.remove()});await p.waitForTimeout(400);
await abrir();await hist();ok(!!(await p.$(logSel))&&!(await p.$(vis+'[data-a=log-apagar]')),tag+' leitura só tem o olhinho');
await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
