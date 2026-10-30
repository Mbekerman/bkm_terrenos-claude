// Endereço de cada tela: no caminho (servido em http://bkm.test/prototipo/..., como no Railway) e depois do # (arquivo e artifact).
// Navegar muda o endereço, voltar e avançar do navegador trocam a tela, link recebido abre direto. Prints em saida/t_rota.
const path=require('path'),fs=require('fs');const OUT=path.join(__dirname,'..','saida','t_rota')+'/';fs.mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=path.join(__dirname,'..','libs','l')+'/';const F=path.join(__dirname,'..','..','..','docs','prototipo.html');const A=path.join(__dirname,'..','saida','bkm-terrenos.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
const ctxDe=async op=>{const ctx=await b.newContext(op);await ctx.route('**/*',r=>{const u=r.request().url();
  if(u.includes('leaflet.js'))return r.fulfill({path:L+'leaflet.js'});if(u.includes('leaflet.css'))return r.fulfill({path:L+'leaflet.css'});if(u.includes('jszip'))return r.fulfill({path:L+'jszip.min.js'});
  if(u.startsWith('http://bkm.test/prototipo')&&!u.includes('/dados/'))return r.fulfill({path:F,contentType:'text/html'});
  if(u.startsWith('http://bkm.test/a.html'))return r.fulfill({path:A,contentType:'text/html; charset=utf-8'});
  if(u.startsWith('http://bkm.test/'))return r.fulfill({status:404,body:''});return r.abort()});return ctx};
const B='http://bkm.test/prototipo';
const ctx=await ctxDe({viewport:{width:1440,height:900},deviceScaleFactor:1});const p=await ctx.newPage();p.on('pageerror',e=>errs.push('desktop: '+e.message));
const url=()=>p.url().replace('http://bkm.test','');const rota=()=>p.evaluate(()=>document.body.dataset.rota);const espera=()=>p.waitForTimeout(450);
await p.goto(B+'/');await p.evaluate(()=>localStorage.clear());await p.reload();await espera();
ok(url()==='/prototipo/'&&await rota()==='inicio','Início em /prototipo/');
await p.click('#side [data-a=nav][data-r=terrenos]');await espera();ok(url()==='/prototipo/terrenos','Terrenos vira /terrenos ('+url()+')');
await p.click('#main [data-a=abrir][data-id]');await espera();const cod=url().split('/')[3];
ok(/^\/prototipo\/terrenos\/TER-\d{6}$/.test(url())&&await rota()==='terreno','abrir terreno vira /terrenos/código ('+url()+')');
await p.click('#bl-negociacao .bl-h');await espera();ok(url()===`/prototipo/terrenos/${cod}/negociacao`,'abrir a seção Negociação entra no endereço');
await p.click('#bl-negociacao .bl-h');await espera();ok(url()===`/prototipo/terrenos/${cod}`,'recolher a seção tira do endereço');
await p.goBack();await espera();ok(url()==='/prototipo/terrenos'&&await rota()==='terrenos','voltar do navegador volta para Terrenos');
await p.goForward();await espera();ok(url()===`/prototipo/terrenos/${cod}`&&await rota()==='terreno','avançar reabre a ficha');
await p.goBack();await p.goBack();await espera();ok(await rota()==='inicio','voltar de novo chega ao Início');
// link recebido
await p.goto(B+'/terrenos/TER-000123/negociacao');await espera();
ok(await rota()==='terreno'&&await p.evaluate(()=>document.querySelector('#bl-negociacao .bl-h').getAttribute('aria-expanded'))==='true','link da ficha com seção abre a seção');
ok(await p.evaluate(()=>document.querySelector('#side [aria-current=page]')?.dataset.r)==='terrenos','menu marca Terrenos');
ok(await p.evaluate(()=>[...document.querySelectorAll('.bl-h[aria-expanded=true]')].map(x=>x.dataset.t).join())==='negociacao','link com seção: só ela aberta (Visão geral fechada)');
await p.waitForTimeout(900);ok(await p.evaluate(()=>{const t=document.getElementById('bl-negociacao').getBoundingClientRect().top;return t>=0&&t<200}),'link com seção: a página rola até a seção');
await p.screenshot({path:OUT+'1_ficha_secao.png'});
await p.goto(B+'/terrenos/ter-000123');await espera();ok(await rota()==='terreno'&&url()==='/prototipo/terrenos/TER-000123','código em minúsculas também abre');
await p.goto(B+'/terrenos/TER-999999');await espera();ok(await rota()==='terrenos'&&url()==='/prototipo/terrenos'&&/não encontrado/.test(await p.textContent('#toast')),'código que não existe cai em Terrenos com aviso');
await p.goto(B+'/mapa/TER-000123/ficha');await p.waitForTimeout(1200);
ok(await rota()==='mapa'&&!!(await p.$('#ficha-sheet'))&&/TER-000123/.test(await p.textContent('#ficha-sheet')),'link do mapa com a ficha no painel');
await p.screenshot({path:OUT+'2_mapa_ficha.png'});
await p.click('#ficha-sheet [data-a=fs-fechar]');await espera();ok(url()==='/prototipo/mapa/TER-000123','fechar o painel deixa o terreno selecionado no endereço');
await p.goto(B+'/fases/aprovacao');await espera();ok(await rota()==='negociacoes'&&await p.evaluate(()=>!!document.querySelector('#main [data-a=neg-nivel]')),'link da fase abre o quadro da fase (com seta de voltar)');
await p.screenshot({path:OUT+'3_fases.png'});
await p.click('#side [data-a=nav][data-r=negociacoes]');await espera();
await p.goto(B+'/fases/novos_negocios');await espera();await p.evaluate(()=>document.querySelector('#main [data-a=neg-etapa][data-v]')?.click());await espera();
ok(/^\/prototipo\/fases\/novos_negocios\/[a-z_]+$/.test(url()),'descer para a etapa entra no endereço ('+url()+')');
await p.goBack();await espera();ok(url()==='/prototipo/fases/novos_negocios','voltar sobe um nível');
await p.goto(B+'/configuracoes/parametros');await espera();ok(await rota()==='config'&&/true Parâmetros/.test(await p.evaluate(()=>''+document.querySelector('#main [data-a=cfg-aba][data-v=zonas]')?.getAttribute('aria-selected')+' '+document.querySelector('#main [data-a=cfg-aba][data-v=zonas]')?.textContent)),'link de Configurações › Parâmetros urbanísticos');
await p.goto(B+'/tarefas/tabela');await espera();ok(await rota()==='tarefas'&&await p.evaluate(()=>document.querySelector('[data-a=tk-vista][data-v=lista]')?.getAttribute('aria-pressed')==='true'),'link antigo das tarefas em tabela abre a Lista');
await p.goto(B+'/terrenos/TER-000123/viabilidade/1');await p.waitForTimeout(700);const pop=await p.$('.vb-pop');
ok(!!pop||/não encontrado/.test(await p.textContent('#toast')),'link do estudo de viabilidade abre o popup ('+(pop?'aberto':'terreno sem estudo')+')');
if(pop){await p.screenshot({path:OUT+'4_viab.png'});await p.keyboard.press('Escape');await espera();ok(url()==='/prototipo/terrenos/TER-000123','fechar o estudo volta ao endereço da ficha')}
await p.goto(B+'/terrenos/novo');await espera();ok(await p.evaluate(()=>!!document.querySelector('.modal, [role=dialog]')),'link do Novo terreno abre o cadastro');
await p.keyboard.press('Escape');await p.evaluate(()=>document.querySelector('[data-a=close]')?.click());await espera();ok(url()==='/prototipo/terrenos','fechar o Novo terreno tira do endereço');
// filtro continua no endereço
await p.goto(B+'/terrenos#f='+encodeURIComponent(JSON.stringify({temp:['5']})));await p.reload();await espera();
ok(await p.evaluate(()=>!!document.querySelector('.fx-chip, .fx-barra [data-a^=fx-tirar]')),'link com filtro mostra o filtro');
await p.click('#side [data-a=nav][data-r=mapa]');await espera();ok(url().startsWith('/prototipo/mapa#f='),'filtro acompanha a troca de tela ('+url().slice(0,40)+')');
// arquivo / artifact: depois do #
const q=await ctx.newPage();q.on('pageerror',e=>errs.push('hash: '+e.message));
await q.goto('http://bkm.test/a.html#/terrenos/TER-000123/comercial');await q.waitForTimeout(600);
ok(await q.evaluate(()=>document.body.dataset.rota)==='terreno'&&await q.evaluate(()=>document.querySelector('#bl-comercial .bl-h').getAttribute('aria-expanded'))==='true','fora do Railway: #/terrenos/código/comercial abre a seção');
await q.click('#side [data-a=nav][data-r=mapa]');await q.waitForTimeout(500);ok(q.url().endsWith('/a.html#/mapa'),'fora do Railway: Mapa vira #/mapa');
await q.goBack();await q.waitForTimeout(500);ok(await q.evaluate(()=>document.body.dataset.rota)==='terreno','fora do Railway: voltar funciona');
await q.click('#side [data-a=nav][data-r=inicio]');await q.waitForTimeout(500);ok(q.url().endsWith('/a.html'),'fora do Railway: Início sem #');
await ctx.close();
// celular
const c2=await ctxDe({...devices['Pixel 7']});const m=await c2.newPage();m.on('pageerror',e=>errs.push('celular: '+e.message));
await m.goto(B+'/terrenos/TER-000123/documentos');await m.waitForTimeout(800);
ok(await m.evaluate(()=>document.body.dataset.rota)==='terreno'&&await m.evaluate(()=>document.querySelector('#bl-documentos .bl-h').getAttribute('aria-expanded'))==='true','celular: link abre a ficha em Documentos');
await m.screenshot({path:OUT+'5_celular_documentos.png'});
await m.click('#bnav [data-r=mapa]');await m.waitForTimeout(600);ok(m.url().endsWith('/prototipo/mapa'),'celular: barra inferior muda o endereço');
await m.goBack();await m.waitForTimeout(600);ok(await m.evaluate(()=>document.body.dataset.rota)==='terreno','celular: voltar volta à ficha');
await b.close();if(errs.length){console.log('\n'+errs.length+' problema(s):\n'+errs.join('\n'));process.exit(1)}console.log('\ntudo ok')})();
