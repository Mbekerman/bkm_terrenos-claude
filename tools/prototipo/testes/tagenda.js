// Reuniões com o Google Agenda (lote 6 da ficha em abas): marcar cria o evento com convite e Meet, respostas dos
// convidados, cancelar, gravação e transcrição do Meet e o rascunho do resumo da IA para conferir. Claro, escuro e
// celular. Prints em saida/t_agenda.
//   node tools/prototipo/testes/tagenda.js   (depois de python3 tools/prototipo/build.py)
const path=require('path'),fs=require('fs'),{chromium,devices}=require('playwright');
const OUT=path.join(__dirname,'..','saida','t_agenda')+'/';fs.mkdirSync(OUT,{recursive:true});
const L=path.join(__dirname,'..','libs','l')+'/',F=path.join(__dirname,'..','..','..','docs','prototipo.html'),KEY='bkm-terrenos-prototipo-v9';
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema,cel=modo==='celular';
const ctx=await b.newContext(cel?{...devices['Pixel 7']}:{viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
const D=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const d0=await D(),t0=d0.terrenos.find(t=>(t.reunioes||[]).some(r=>r.agenda));
ok(!!t0&&d0.agendaEx,tag+' exemplo com reuniões no Google Agenda');
const reus=()=>D().then(d=>d.terrenos.find(t=>t.id===t0.id).reunioes);
await p.evaluate(c=>{location.hash='#/terrenos/'+c+'/comercial'},t0.codigo);await p.waitForTimeout(500);
// exemplo: marcada (convidados e respostas) e feita ontem com o resumo da IA para conferir
ok(await p.evaluate(()=>{const a=[...document.querySelectorAll('.reu.agendada .ag')].find(x=>x.querySelector('.ag-conv'));return !!a&&/Talvez/.test(a.textContent)&&/Aceitou/.test(a.textContent)&&!!a.querySelector('a[href*="meet.google.com"]')}),
  tag+' reunião marcada mostra o link do Meet e a resposta de cada convidado');
ok(await p.evaluate(()=>!!document.querySelector('.reu.realizada form[data-form=ag-ia] textarea[name=resumo]')&&/Gravação/.test(document.querySelector('.reu.realizada .ag-grav')?.textContent||'')),
  tag+' reunião feita: gravação, transcrição e o resumo da IA para conferir');
if(!cel){await p.evaluate(()=>document.querySelector('form[data-form=ag-ia]').scrollIntoView({block:'center'}));await p.screenshot({path:OUT+tag+'_1resumo.png'})}
// aceitar com ajuste
await p.fill('form[data-form=ag-ia] textarea[name=resumo]','Vendedor baixou para 2,8 mi com permuta de 10 unidades (conferido).');
await p.click('form[data-form=ag-ia] button.primary');await p.waitForTimeout(250);
{const r=(await reus()).find(x=>x.agenda?.ia);ok(r.agenda.ia.sit==='aceito'&&/conferido/.test(r.resumo)&&/minuta/.test(r.enc),tag+' aceitar grava o que foi tratado (ajustado) e os encaminhamentos')}
ok(await p.evaluate(()=>!document.querySelector('form[data-form=ag-ia]')),tag+' aceito, o rascunho some');
// marcar uma reunião online nova com Agenda e Meet
await p.click('[data-a=reu-form]');await p.waitForTimeout(200);
await p.selectOption('#ru-s','agendada');
const amanha=await p.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+2);return d.toISOString().slice(0,10)});
await p.fill('#ru-d',amanha);await p.click('label:has(> input[name=modalidade][value=online])');await p.waitForTimeout(100);
ok(await p.isVisible('input[name=meet]')&&await p.isVisible('#ru-em')&&!(await p.isVisible('#ru-r')),tag+' agendada online: Agenda, Meet e e-mails no formulário; sem o que foi tratado');
await p.fill('#ru-pb','Moisés, Ana Prado');await p.fill('#ru-em','corretor@imob.com, errado');await p.fill('#ru-p','Visita ao terreno');
if(!cel){await p.evaluate(()=>document.querySelector('.reu-form').scrollIntoView({block:'center'}));await p.screenshot({path:OUT+tag+'_2marcar.png'})}
await p.click('.reu-form button.primary');await p.waitForTimeout(300);
let n=(await reus()).at(-1);
ok(n.status==='agendada'&&n.agenda?.meet&&n.agenda.conv.map(c=>c.email).sort().join(',')===['ana.prado@bkm.com.br','corretor@imob.com'].sort().join(',')&&n.dur===60,
  tag+' criada na Agenda com Meet; convite para a colega e o externo (e-mail inválido fica de fora)');
// presencial sem Agenda
await p.click('[data-a=reu-form]');await p.waitForTimeout(200);await p.selectOption('#ru-s','agendada');await p.fill('#ru-d',amanha);
await p.click('label:has(> input[name=modalidade][value=presencial])');await p.waitForTimeout(50);
ok(!(await p.isVisible('input[name=meet]')),tag+' presencial não tem Meet');
await p.click('label:has(> input[name=agenda])');await p.waitForTimeout(50);ok(!(await p.isVisible('#ru-em')),tag+' sem Agenda, sem e-mails');
await p.click('.reu-form button.primary');await p.waitForTimeout(300);
ok(!(await reus()).at(-1).agenda,tag+' sem marcar a Agenda, a reunião fica só no sistema');
// cancelar a online
await p.click(`.reu[data-mid="${n.id}"] [data-a=ag-cancelar]`);await p.waitForTimeout(250);
ok((await reus()).find(x=>x.id===n.id).status==='cancelada'&&await p.evaluate(id=>/Cancelada na Agenda/.test(document.querySelector(`.reu[data-mid="${id}"]`).textContent),n.id),tag+' cancelar cancela na Agenda');
// realizar uma marcada com Meet: chega a gravação e o rascunho; descartar
await p.evaluate(()=>window.BKM_TESTE.escopo("()=>{const t=T(UI.id),r=t.reunioes.find(x=>x.status==='agendada'&&x.agenda&&x.agenda.meet);r.data=HOJE;save();render()}"));await p.waitForTimeout(250);
const rid=(await reus()).find(x=>x.status==='agendada'&&x.agenda?.meet).id;
await p.click(`.reu[data-mid="${rid}"] [data-a=reu-feita]`);await p.waitForTimeout(300);
{const r=(await reus()).find(x=>x.id===rid);ok(r.status==='realizada'&&r.agenda.grav&&r.agenda.ia?.sit==='rascunho',tag+' feita a reunião do Meet: gravação, transcrição e rascunho da IA')}
await p.click(`.reu[data-mid="${rid}"] [data-a=ag-ia-desc]`);await p.waitForTimeout(250);
ok((await reus()).find(x=>x.id===rid).agenda.ia.sit==='descartado'&&!(await reus()).find(x=>x.id===rid).resumo,tag+' descartar não grava o resumo');
const larg=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ok(larg<=0,tag+' sem rolagem lateral ('+larg+')');
if(cel){await p.evaluate(()=>document.querySelector('.reu.agendada .ag')?.scrollIntoView({block:'start'}));await p.screenshot({path:OUT+tag+'_reunioes.png'})}
// Leitura só vê
await p.evaluate(()=>window.BKM_TESTE.escopo("()=>{UI.role='Leitura';render()}"));await p.waitForTimeout(250);
ok(await p.evaluate(()=>!document.querySelector('[data-a=ag-cancelar],form[data-form=ag-ia]')),tag+' Leitura só vê');
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\nTUDO OK');process.exit(errs.length?1:0)})();
