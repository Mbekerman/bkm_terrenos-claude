// Novo funil: kanban por etapa e subetapa, quadro de avanço, aprovações por hierarquia,
// formulários de status, sino de notificações e Configurações › Funil.
const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_funil',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');const O=TMP+'t_funil/';
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch();const erros=[];
async function abre(w,h,tema){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5,hasTouch:w<700,isMobile:w<700});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();if(t)localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(300);return {p,ctx}}
const papel=async(p,r)=>{await p.evaluate(r=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector(`[data-a=role][data-v=${r}]`).click()},r);await p.waitForTimeout(150)};
const nav=async(p,r)=>{await p.evaluate(r=>document.querySelector(`[data-a=nav][data-r=${r}]`).click(),r);await p.waitForTimeout(200)};
const ficha=async(p,txt)=>{await nav(p,'terrenos');await p.evaluate(()=>{const b=document.querySelector('[data-a=fT][data-v=todos]');b&&b.click()});await p.waitForTimeout(100);await p.evaluate(t=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes(t)).click(),txt);await p.waitForTimeout(400)};
const txt=(p,s)=>p.evaluate(s=>[...document.querySelectorAll(s)].filter(x=>x.offsetParent).map(x=>x.textContent.trim().replace(/\s+/g,' ')).join(' | '),s);
const neg=(p,nome)=>p.evaluate(n=>{const S=JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9'));return S.terrenos.find(t=>t.nome.includes(n)).neg},nome);
let {p,ctx}=await abre(1440,900);

// kanban por etapa
await nav(p,'negociacoes');await p.evaluate(()=>document.querySelector('[data-a=neg-fase][data-v=novos_negocios]').click());await p.waitForTimeout(200);await p.screenshot({path:O+'1_kanban.png'});
ok((await txt(p,'.col-h')).includes('Em Triagem'),'colunas com as etapas novas');
ok((await txt(p,'.kcard .ksub')).includes('Proposta Enviada'),'card mostra a subetapa');
ok((await txt(p,'.kped')).includes('Ana Prado'),'card com pedido aguardando a gestora');
// drill-down por subetapa
await p.evaluate(()=>document.querySelector('.col-ab[data-v=negociacao]').click());await p.waitForTimeout(200);await p.screenshot({path:O+'2_subetapas.png'});
ok((await txt(p,'.col-h')).includes('Contra Proposta'),'drill-down mostra as subetapas de Negociação');
// arrastar entre subetapas
await p.dragAndDrop('.col[data-col="sub:contra_proposta"] .kcard >> nth=0','.col[data-col="sub:preparando_proposta"]').catch(()=>{});await p.waitForTimeout(200);
ok((await p.evaluate(()=>document.querySelector('#toast').textContent)).length>0,'arrastar para outra subetapa responde: '+await p.evaluate(()=>document.querySelector('#toast').textContent));

// pré-requisito: Pico Alto (Estudos, em Estudo de Viabilidade) → Negociação exige ter passado por Estudo de Viabilidade (passou)
await ficha(p,'Pico Alto');await p.screenshot({path:O+'3_ficha_estudos.png'});
ok((await txt(p,'.pn .adv-sub')).includes('Estudo de Viabilidade'),'quadro mostra a subetapa');
await p.evaluate(()=>document.querySelector('.pn [data-a=adv-ir]').click());await p.waitForTimeout(200);
ok((await neg(p,'Pico Alto')).etapa==='negociacao','diretor avança para Negociação (pré-requisito cumprido)');
ok((await neg(p,'Pico Alto')).sub==='aguardando_reuniao','entra na subetapa inicial');

// trocar subetapa pelo seletor
await p.selectOption('.pn select[data-ch=sub]','proposta_enviada');await p.waitForTimeout(200);
ok((await neg(p,'Pico Alto')).sub==='proposta_enviada','seletor muda a subetapa');

// aprovação: Barão tem pedido para Contrato aguardando Ana Prado (gestor)
await ficha(p,'Barão');await p.screenshot({path:O+'4_pedido_diretor.png'});
ok((await txt(p,'.pn .adv-ped')).includes('Aguardando aprovação'),'quadro mostra o pedido');
await papel(p,'Analista');ok(!(await p.$('.pn [data-a=aprovar]')),'analista não aprova');
await papel(p,'Gestor');await p.screenshot({path:O+'5_pedido_gestor.png'});
// sino da gestora
ok(/\d/.test(await txt(p,'.sino-n')),'sino da gestora com contador: '+await txt(p,'.sino-n'));
await p.click('[data-a=sino]');await p.waitForTimeout(150);await p.screenshot({path:O+'6_sino.png'});
ok((await txt(p,'.sino-menu')).includes('pede aprovação'),'sino lista o pedido de aprovação');
await p.click('[data-a=sino]');
await p.evaluate(()=>document.querySelector('.pn [data-a=aprovar]').click());await p.waitForTimeout(200);
ok((await neg(p,'Barão')).etapa==='contrato','gestora aprova e o card vai para Contrato');

// analista pede: Itapura (Negociação) → Contrato exige gestor; analista Rafael responde a Ana
await ficha(p,'Itapura');await papel(p,'Analista');
await p.evaluate(()=>document.querySelector('.pn [data-a=adv-ir]').click());await p.waitForTimeout(200);
let n=await neg(p,'Itapura');ok(n.pedido&&n.pedido.niveis[0].previsto==='Ana Prado','analista gera pedido para a gestora dele');
await p.screenshot({path:O+'7_pedido_analista.png'});
// diretor aprova por cima
await papel(p,'Diretor');await p.evaluate(()=>document.querySelector('.pn [data-a=aprovar]').click());await p.waitForTimeout(200);
n=await neg(p,'Itapura');ok(n.etapa==='contrato'&&!n.pedido,'diretor aprova por quem está abaixo');

// Comprado: Lajeado (Contrato) tem diligência impeditiva e IPTU sem validar → diretor força com justificativa e vira pedido? (diretor está isento)
await ficha(p,'Lajeado');
await p.evaluate(()=>document.querySelector('.pn [data-a=adv-ir]').click());await p.waitForTimeout(200);await p.screenshot({path:O+'8_comprar.png'});
ok((await txt(p,'.dh h2')).includes('Comprado'),'abre o formulário de Comprado');
await p.click('#cp-rel');await p.keyboard.type('Compromisso assinado com 30% na promessa.');await p.fill('#cp-p','Proposta firme e rápida.');await p.fill('#cp-j','Diretoria assume o risco ambiental.');
await p.click('.df .btn.primary');await p.waitForTimeout(200);
ok((await neg(p,'Lajeado')).status==='comprado','diretor conclui como Comprado (isento das aprovações)');
await p.screenshot({path:O+'9_comprado.png'});

// gestor em Comprado: exige diretor depois (sequência)
await ficha(p,'Barão');await papel(p,'Gestor');
await p.evaluate(()=>document.querySelector('.pn [data-a=adv-ir]').click());await p.waitForTimeout(200);
ok((await txt(p,'.dh h2')).includes('Comprado'),'gestor abre o Comprado');
ok((await txt(p,'.dialog .banner.blue')).includes('diretor'),'aviso de que vai como pedido para o diretor');
await p.click('#cp-rel');await p.keyboard.type('Fechamos.');await p.fill('#cp-p','Paciência.');if(await p.$('#cp-j'))await p.fill('#cp-j','Certidões chegam semana que vem.');
await p.click('.df .btn.primary');await p.waitForTimeout(200);n=await neg(p,'Barão');
ok(n.pedido&&n.pedido.niveis.length===1&&n.pedido.niveis[0].nivel===3,'gestor isento do nível dele; pedido só para o diretor');
await papel(p,'Diretor');await p.evaluate(()=>document.querySelector('.pn [data-a=recusar]').click());await p.waitForTimeout(150);
await p.fill('#rc-c','Esperar as certidões.');await p.click('.df .btn.primary');await p.waitForTimeout(200);
n=await neg(p,'Barão');ok(!n.pedido&&n.status==='ativo','diretor recusa com motivo');

// Perdido, Descartado, Stand By
await ficha(p,'Cupecê — esquina');
await p.evaluate(()=>{document.querySelector('.pn [data-a=adv-mais]').click()});await p.waitForTimeout(100);await p.screenshot({path:O+'10_menu.png'});
await p.evaluate(()=>document.querySelector('.pn [data-a=descartar]').click());await p.waitForTimeout(150);await p.screenshot({path:O+'11_descartar.png'});
await p.selectOption('#mo-m','outros');await p.click('.df .btn.primary');await p.waitForTimeout(150);
ok((await neg(p,'Cupecê — esquina')).status==='ativo','Outros sem texto não descarta');
await p.fill('#ds-d','Sócio pediu para parar.');await p.click('.df .btn.primary');await p.waitForTimeout(200);
ok((await neg(p,'Cupecê — esquina')).status==='descartado','descarta com motivo e texto');
await p.screenshot({path:O+'12_descartado.png'});
await ficha(p,'Pico Alto');await p.evaluate(()=>{document.querySelector('.pn [data-a=adv-mais]').click();document.querySelector('.pn [data-a=perder]').click()});await p.waitForTimeout(150);
await p.screenshot({path:O+'13_perdido.png'});
await p.selectOption('#mo-m','vendido_terceiro');await p.fill('#pd-d','Vendido para a construtora X.');await p.click('.df .btn.primary');await p.waitForTimeout(200);
n=await neg(p,'Pico Alto');ok(n.status==='perdido'&&n.motivo==='vendido_terceiro','perdido com motivo Vendido para terceiro');

// Configurações › Funil
await nav(p,'config');await p.screenshot({path:O+'14_config.png',fullPage:true});
await p.evaluate(()=>document.querySelector('[data-a=cfg-aba][data-v=funil]').click());await p.waitForTimeout(150);
ok((await txt(p,'h1')).includes('Configurações'),'admin abre a configuração');
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));await p.fill('form[data-form=cfg-sub][data-e=triagem] input[name=nome]','Visita ao terreno');await p.click('form[data-form=cfg-sub][data-e=triagem] .btn');await p.waitForTimeout(150);
ok((await p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')).cfg.subs.some(s=>s.nome==='Visita ao terreno'))),'cria subetapa');
await p.evaluate(()=>document.querySelector('[data-a=cfg-aba][data-v=prereq]').click());await p.waitForTimeout(150);await p.screenshot({path:O+'15_prereq.png',fullPage:true});
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));await p.selectOption('#pr-a','subetapa:aguardando_documentos');await p.selectOption('#pr-r','aguardando_documentos');await p.click('form[data-form=cfg-pre] .btn');await p.waitForTimeout(150);
ok((await p.evaluate(()=>document.querySelector('#toast').textContent)).includes('ela mesma'),'recusa pré-requisito para si mesma');
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));await p.selectOption('#pr-a','etapa:estudos');await p.selectOption('#pr-r','contra_proposta');await p.click('form[data-form=cfg-pre] .btn');await p.waitForTimeout(150);
ok((await p.evaluate(()=>document.querySelector('#toast').textContent)).includes('depois'),'recusa requisito de etapa posterior');
for(const a of ['status','checklist','notif','equipe']){await p.evaluate(a=>document.querySelector(`[data-a=cfg-aba][data-v=${a}]`).click(),a);await p.waitForTimeout(150);await p.screenshot({path:O+`16_${a}.png`,fullPage:true})}
await papel(p,'Gestor');ok(!(await p.$('.nav-item[data-r=config]')),'gestor sem administrador não vê Configurações');
await ctx.close();

// celular e escuro
({p,ctx}=await abre(390,844));await nav(p,'negociacoes');await p.evaluate(()=>document.querySelector('[data-a=neg-fase][data-v=novos_negocios]').click());await p.waitForTimeout(200);await p.screenshot({path:O+'20_cel_kanban.png'});
await ficha(p,'Barão');await p.evaluate(()=>document.querySelector('.adv-main').scrollIntoView({block:'center'}));await p.waitForTimeout(150);await p.screenshot({path:O+'21_cel_quadro.png'});
await papel(p,'Gestor');await p.click('[data-a=sino]');await p.waitForTimeout(150);await p.screenshot({path:O+'22_cel_sino.png'});
const sobra=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ok(sobra<=0,'celular sem rolagem horizontal');
await ctx.close();
({p,ctx}=await abre(1440,900,'escuro'));await ficha(p,'Barão');await p.screenshot({path:O+'23_escuro.png'});await nav(p,'negociacoes');await p.evaluate(()=>document.querySelector('[data-a=neg-fase][data-v=novos_negocios]').click());await p.waitForTimeout(200);await p.screenshot({path:O+'24_escuro_kanban.png'});await ctx.close();
console.log('ERROS',erros);console.log(falhas.length?`${falhas.length} falha(s)`:'tudo ok');await b.close()})();
