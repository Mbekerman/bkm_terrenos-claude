// Terreno com vários donos: seção Partes na ficha (resumo e um cartão por parte), negociação de cada parte
// (subetapa, temperatura, proposta, avanço, compra com aprovação, perdida), terreno que anda pela parte mais
// atrasada e não se move à mão, compra do terreno só com as partes compradas, parte nova dividindo a
// negociação, coluna Parte no cadastro, kanban com o resumo. Claro, escuro e celular.
const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_partes',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');const O=TMP+'t_partes/';
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch();const erros=[];
async function abre(w,h,tema){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5,hasTouch:w<700,isMobile:w<700});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();if(t)localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(300);return {p,ctx}}
const papel=async(p,r)=>{await p.evaluate(r=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector(`[data-a=role][data-v=${r}]`).click()},r);await p.waitForTimeout(150)};
const nav=async(p,r)=>{await p.evaluate(r=>document.querySelector(`[data-a=nav][data-r=${r}]`).click(),r);await p.waitForTimeout(200)};
const clica=async(p,s)=>{await p.evaluate(s=>{const e=document.querySelector(s);if(!e)throw new Error('sem '+s);e.click()},s);await p.waitForTimeout(200)};
const ficha=async(p,txt)=>{await nav(p,'terrenos');await p.evaluate(()=>{const b=document.querySelector('[data-a=fT][data-v=todos]');b&&b.click()});await p.waitForTimeout(100);await p.evaluate(t=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes(t)).click(),txt);await p.waitForTimeout(400)};
const txt=(p,s)=>p.evaluate(s=>[...document.querySelectorAll(s)].filter(x=>x.offsetParent).map(x=>x.textContent.trim().replace(/\s+/g,' ')).join(' | '),s);
const ter=(p,nome)=>p.evaluate(n=>{const S=JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9'));return S.terrenos.find(t=>t.nome.includes(n))},nome);
const bloco=async(p,k)=>{await p.evaluate(k=>{const b=document.querySelector('.fi-abas [data-t='+({cadastro:'terreno',negociacao:'comercial',urbanismo:'parametros',fases:'jornada'}[k]||k)+']');if(b.getAttribute('aria-selected')!=='true')b.click()},k);await p.waitForTimeout(250)};
const parte=(t,n)=>t.partes.find(x=>x.nome===n);
const enviar=async(p,form)=>{await p.evaluate(f=>document.querySelector(`#modal form[data-form=${f}]`).requestSubmit(),form);await p.waitForTimeout(250)};
const toast=p=>p.evaluate(()=>document.querySelector('#toast').textContent);
let {p,ctx}=await abre(1440,900);
const NOME='Três lotes Rua Ibitirama';

await ficha(p,NOME);await bloco(p,'negociacao');
await p.evaluate(()=>document.getElementById('sec-partes').scrollIntoView());await p.waitForTimeout(150);
await p.screenshot({path:O+'1_partes_claro.png'});
ok((await txt(p,'#sec-partes .pt-card')).includes('Família Souza')&&(await txt(p,'#sec-partes .pt-card')).includes('Oficina do Zé'),'um cartão por parte');
ok((await txt(p,'#sec-partes .pt-res')).includes('0 de 3')&&(await txt(p,'#sec-partes .pt-res')).includes('9,80'),'resumo: compradas e pedido somado');
ok((await txt(p,'#pt-pa1 .pt-m')).includes('Ana Souza, Beto Souza')&&(await txt(p,'#pt-pa1 .pt-m')).includes('2 matrículas'),'parte mostra donos e matrículas');
ok((await txt(p,'#pt-pa1')).includes('R$ 5,00 mi')&&(await txt(p,'#pt-pa2')).includes('R$ 2,90 mi'),'preço pedido e última proposta por parte');
ok((await txt(p,'.sec-adv')).includes('Anda pelas partes'),'quadro de avanço do terreno: anda pelas partes');
ok((await ter(p,NOME)).neg.etapa==='negociacao','terreno na etapa da parte mais atrasada (Negociação)');

// Analista: subetapa da parte (temperatura só no terreno); terreno não se move à mão
await papel(p,'Analista');
await p.selectOption('#pt-pa3 select[data-ch=pt-sub]','preparando_proposta');await p.waitForTimeout(200);
let t=await ter(p,NOME);
ok(parte(t,'Oficina do Zé').neg.sub==='preparando_proposta','muda a subetapa da parte');
ok(t.neg.sub==='preparando_proposta','terreno acompanha a parte mais atrasada (subetapa)');
ok(t.hist.some(h=>h.txt.startsWith('Parte Oficina do Zé · Subetapa')),'log com o nome da parte');
ok(!(await p.evaluate(()=>!!document.querySelector('#pt-pa3 [data-a=pt-temp]'))),'temperatura é uma só, a da negociação do terreno: a parte não tem a sua');
await clica(p,'#pt-pa3 [data-a=pt-prop]');await p.fill('#ptp-v','1.500.000');await enviar(p,'pt-prop');
ok(parte(await ter(p,NOME),'Oficina do Zé').propostas.length===1,'proposta registrada na parte');

// Carlos Pires para o Contrato: aprovação do gestor (configurada no Contrato)
await clica(p,'#pt-pa2 [data-a=pt-ir]');
t=await ter(p,NOME);ok(parte(t,'Carlos Pires').neg.pedido?.dest==='contrato','analista pede aprovação para a parte ir ao Contrato');
ok((await txt(p,'#pt-pa2 .pt-ped')).includes('Aguardando'),'cartão mostra o pedido');
await papel(p,'Gestor');await clica(p,'#pt-pa2 [data-a=pt-aprovar]');
t=await ter(p,NOME);ok(parte(t,'Carlos Pires').neg.etapa==='contrato','gestor aprova: a parte vai ao Contrato');
ok(t.neg.etapa==='negociacao','com a Oficina na Negociação, o terreno continua nela');

// Oficina perdida
await clica(p,'#pt-pa3 [data-a=pt-perder]');await p.selectOption('#mo-m','vendido_terceiro');await p.fill('#pd-d','Zé vendeu a oficina');await enviar(p,'perder');
t=await ter(p,NOME);ok(parte(t,'Oficina do Zé').neg.status==='perdido','parte marcada como perdida');
ok(t.neg.etapa==='contrato','sem parte em aberto na Negociação, o terreno vai ao Contrato');
ok((await txt(p,'#sec-partes .banner')).includes('perdida'),'aviso da parte perdida');

// Diretor compra as duas partes (checklist pendente: força com justificativa)
await papel(p,'Diretor');
for(const id of ['pa1','pa2']){await clica(p,`#pt-${id} [data-a=pt-ir]`);await p.fill('#ptc-r','Escritura assinada');await p.fill('#ptc-j','Certidões na escritura');await enviar(p,'pt-comprar')}
t=await ter(p,NOME);ok(parte(t,'Família Souza').neg.status==='comprado'&&parte(t,'Carlos Pires').neg.status==='comprado','partes compradas');
ok(t.neg.status==='ativo','partes compradas não compram o terreno sozinhas');
ok(!t.procs||!t.procs.some(x=>x.fase==='aprovacao'),'compra de parte não abre a Aprovação');
await p.evaluate(()=>window.scrollTo(0,0));
await clica(p,'.sec-adv [data-a=adv-ir]');
ok((await txt(p,'#modal')).includes('Oficina do Zé')&&!(await txt(p,'#modal')).includes('Justificativa'),'compra do terreno travada pela parte perdida, sem forçar');
await clica(p,'#modal [data-a=close]');

// a Oficina (dispensável) sai do terreno; o analista pode tirá-la; terreno pode ser comprado
await papel(p,'Analista');await clica(p,'#pt-pa3 [data-a=pt-remover]');
ok((await txt(p,'#modal h2')).includes('Tirar Oficina'),'analista tira parte dispensável (essencial só gestor ou diretor)');await p.fill('#ptr-m','Vendida a terceiro: seguimos com dois lotes');await enviar(p,'pt-remover');
t=await ter(p,NOME);ok(!parte(t,'Oficina do Zé').ativa,'parte sai do terreno com motivo');
await p.evaluate(()=>document.getElementById('sec-partes').scrollIntoView());await p.screenshot({path:O+'2_compradas.png'});
await papel(p,'Diretor');await p.evaluate(()=>window.scrollTo(0,0));await clica(p,'.sec-adv [data-a=adv-ir]');
ok((await txt(p,'#modal h2')).includes('Comprado'),'com as partes ativas compradas, o terreno pode ser comprado');
await p.evaluate(()=>{document.querySelector('#cp-rel').innerHTML='Área comprada em duas escrituras'});await p.fill('#cp-p','Negociação separada por família');await enviar(p,'comprar');
t=await ter(p,NOME);ok(t.neg.status==='comprado','terreno Comprado');
ok((t.procs||[]).some(x=>x.fase==='aprovacao'&&x.status==='ativo'),'a compra do terreno abre a Aprovação');

// parte nova divide a negociação; cadastro com coluna Parte
await ficha(p,'Terreno Rua Itapura');await bloco(p,'negociacao');
ok(!(await p.$('#sec-partes')),'um dono só: sem o quadro de partes na negociação');
await bloco(p,'cadastro');await clica(p,'[data-a=pt2-mais]');
for(const [i,n] of [[0,'Espólio Ferraz'],[1,'Dona Rosa']]){await p.fill(`#sec-partes-cad .pt2 >> nth=${i} >> [data-k=nome]`,n);await p.press(`#sec-partes-cad .pt2 >> nth=${i} >> [data-k=nome]`,'Tab');await p.waitForTimeout(200)}
t=await ter(p,'Rua Itapura');ok(t.partes.length===2&&t.partes.every(x=>x.neg&&x.neg.etapa==='negociacao'),'duas partes na Negociação: cada uma ganha a sua negociação');
ok(t.partes.map(x=>x.nome).join()==='Espólio Ferraz,Dona Rosa','títulos das partes editados no cadastro');
ok(t.partes[0].neg.codigo===t.neg.codigo+'-1','código da parte com o do terreno');
await bloco(p,'negociacao');ok(!!(await p.$('#sec-partes')),'com duas partes, a negociação mostra o quadro Partes');
await bloco(p,'cadastro');ok((await txt(p,'#sec-pessoas th')).includes('Parte'),'coluna Parte nos donos');
await p.selectOption('#sec-pessoas select[data-ch=pes-parte] >> nth=0',t.partes[0].id);await p.waitForTimeout(150);
ok((await ter(p,'Rua Itapura')).pessoas[0].parte===t.partes[0].id,'dono ligado à parte');
await nav(p,'negociacoes');ok((await txt(p,'.kcard')).includes('2 partes · 0 compradas'),'kanban mostra o resumo das partes');
await p.screenshot({path:O+'3_kanban.png'});

// escuro e celular
({p,ctx}=await abre(1440,900,'escuro'));await ficha(p,NOME);await bloco(p,'negociacao');await p.evaluate(()=>document.getElementById('sec-partes').scrollIntoView());await p.waitForTimeout(150);await p.screenshot({path:O+'4_partes_escuro.png'});
({p,ctx}=await abre(390,844));await ficha(p,NOME);await bloco(p,'negociacao');await p.evaluate(()=>document.getElementById('sec-partes').scrollIntoView());await p.waitForTimeout(150);await p.screenshot({path:O+'5_celular.png'});
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'celular sem rolagem horizontal');
ok(await p.evaluate(()=>[...document.querySelectorAll('.pt-card')].every(c=>c.scrollWidth<=c.clientWidth+1)),'cartões não vazam no celular');

ok(!erros.length,'sem erros de página'+(erros.length?': '+erros.join(' / '):''));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
