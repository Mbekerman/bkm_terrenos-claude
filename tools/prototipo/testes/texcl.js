// excluir pontos de interesse (Google e da empresa), lista de excluídos e Restaurar
const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_excl',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');
const ok=(c,m)=>console.log((c?'ok  ':'FALHA ')+m);
(async()=>{const b=await chromium.launch();const errs=[];
for(const [w,h,tema] of [[1440,900,'claro'],[1440,900,'escuro'],[390,844,'claro']]){
const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:w<500?2:1.5});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto('file:///x/a.html');
await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(500);
const tag=`${w}${tema}`;
const nomes=()=>p.$$eval('#ent-card .ent-l li .t1',l=>l.filter(x=>!x.closest('.ent-exc')).map(x=>(x.closest('.ent-emp')?'e:':'g:')+x.textContent));
const antes=await nomes();
const nx=await p.$$eval('#ent-card .ent-l li:not(.ent-vazio)',l=>l.filter(x=>!x.closest('.ent-exc')).every(x=>x.querySelector('.poi-x')));
ok(nx,'toda linha tem o botão de excluir');
await (await p.$('#ent-card')).scrollIntoViewIfNeeded();await p.waitForTimeout(150);
await (await p.$('#ent-card')).screenshot({path:TMP+`t_excl/${tag}_1_quadro.png`});
// Google
const g=await p.$('#ent-card .poi-x[data-tp=g]');const gn=await g.evaluate(x=>x.closest('li').querySelector('.t1').textContent);
await g.click();await p.waitForTimeout(200);
ok(/todos os terrenos/.test(await p.$eval('#modal',x=>x.innerText)),'confirmação explica o alcance');
await p.screenshot({path:TMP+`t_excl/${tag}_2_confirmar.png`});
await p.click('#modal [data-a=poi-excl-ok]');await p.waitForTimeout(300);
ok(!(await nomes()).includes('g:'+gn),`Google "${gn}" saiu da lista`);
// empresa
const e=await p.$('#ent-card .ent-emp .poi-x[data-tp=e]');const en=await e.evaluate(x=>x.closest('li').querySelector('.t1').textContent);
await e.click();await p.waitForTimeout(200);await p.click('#modal [data-a=poi-excl-ok]');await p.waitForTimeout(300);
ok(!(await p.$eval('#ent-card .ent-emp',x=>x.innerText)).includes(en),`da empresa "${en}" saiu da lista`);
const st=await p.evaluate(()=>{for(let i=0;i<localStorage.length;i++){const v=localStorage.getItem(localStorage.key(i));if(v&&v.includes('"pontos"'))return JSON.parse(v)}});
ok(!st.pontos.some(x=>x.nome===en)&&st.pontosExcl.length===1&&Object.keys(st.entExcl).length===1,'gravado: ponto fora de S.pontos (sai do mapa) e Google na lista de excluídos');
ok(JSON.stringify(st).includes('Ponto de interesse excluído: '+gn+' (Google)'),'exclusão vai para os logs');
await p.click('[data-a=poi-excl-ver]');await p.waitForTimeout(200);
const exc=await p.$eval('.ent-exc',x=>x.innerText);ok(exc.includes(gn)&&exc.includes(en),'lista de excluídos mostra os dois');
await (await p.$('#ent-card')).screenshot({path:TMP+`t_excl/${tag}_3_excluidos.png`});
// outro terreno também não mostra
// restaurar
for(const n of [gn,en]){await p.evaluate(n=>[...document.querySelectorAll('.ent-exc li')].find(l=>l.querySelector('.t1').textContent===n).querySelector('[data-a=poi-rest]').click(),n);await p.waitForTimeout(200)}
const depois=await nomes();ok(depois.includes('g:'+gn)&&depois.includes('e:'+en)&&!(await p.$('.ent-exc')),'Restaurar devolve os dois e a lista some');
// Leitura
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Leitura'||x.getAttribute('aria-label')==='Leitura'||x.title==='Leitura').click());await p.waitForTimeout(150);
ok(!(await p.$('#ent-card .poi-x')),'Leitura não vê o botão');
await ctx.close()}
console.log('ERROS',errs);await b.close()})();
