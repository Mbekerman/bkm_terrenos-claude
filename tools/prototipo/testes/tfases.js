// Fases acima das etapas: kanban por fase, filtro por fase na tabela e no mapa, seção Fases da
// ficha (abrir à mão, antes da hora), quadro de avanço da fase, compra abre a Aprovação e
// Configurações › Fases (criar fase, prefixo, dependência sem ciclo, etapa nova). Claro, escuro e celular.
const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_fases',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');const O=TMP+'t_fases/';
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch();const erros=[];
async function abre(w,h,tema){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5,hasTouch:w<700,isMobile:w<700});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();if(t)localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(300);return {p,ctx}}
const papel=async(p,r)=>{await p.evaluate(r=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector(`[data-a=role][data-v=${r}]`).click()},r);await p.waitForTimeout(150)};
const nav=async(p,r)=>{await p.evaluate(r=>document.querySelector(`[data-a=nav][data-r=${r}]`).click(),r);await p.waitForTimeout(200)};
const clica=async(p,s)=>{await p.evaluate(s=>document.querySelector(s).click(),s);await p.waitForTimeout(200)};
const ficha=async(p,txt)=>{await nav(p,'terrenos');await p.evaluate(()=>{const b=document.querySelector('[data-a=fT][data-v=todos]');b&&b.click()});await p.waitForTimeout(100);await p.evaluate(t=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes(t)).click(),txt);await p.waitForTimeout(400)};
const txt=(p,s)=>p.evaluate(s=>[...document.querySelectorAll(s)].filter(x=>x.offsetParent).map(x=>x.textContent.trim().replace(/\s+/g,' ')).join(' | '),s);
const ter=(p,nome)=>p.evaluate(n=>{const S=JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9'));return S.terrenos.find(t=>t.nome.includes(n))},nome);
const bloco=async(p,k)=>{await p.evaluate(k=>{const b=document.querySelector('.fi-abas [data-t='+({cadastro:'terreno',negociacao:'comercial',urbanismo:'parametros',fases:'jornada'}[k]||k)+']');if(b.getAttribute('aria-selected')!=='true')b.click()},k);await p.waitForTimeout(250)};
let {p,ctx}=await abre(1440,900);

// kanban em três níveis: fases › etapas › subetapas, com seta para voltar
await nav(p,'negociacoes');await p.screenshot({path:O+'0_kanban_fases.png'});
ok((await txt(p,'.board-fases .col-h')).includes('Aprovação de Projetos'),'kanban abre no nível das fases');
ok((await txt(p,'.col[data-fase=entregue] .kcard')).includes('Itaquera'),'empreendimento entregue na coluna Entregue');
ok(!(await p.evaluate(()=>!!document.querySelector('.drill-v'))),'no nível das fases não há seta de voltar');
await clica(p,'.col[data-fase=aprovacao] .col-ab');await p.screenshot({path:O+'1_kanban_aprovacao.png'});
ok((await txt(p,'.col-h')).includes('Análise na Prefeitura'),'desce para as etapas da Aprovação');
ok((await txt(p,'.kcard')).includes("M'Boi Mirim"),'terreno comprado aparece na Aprovação');
ok((await txt(p,'.drill-t')).includes('Fases'),'trilha mostra de onde veio');
await clica(p,'.col-ab[data-v=prefeitura]');await p.screenshot({path:O+'1b_kanban_sub.png'});
ok((await txt(p,'.col-h')).includes('Comunique-se')&&(await txt(p,'h1')).includes('Análise na Prefeitura'),'desce para as subetapas da etapa');
await p.dragAndDrop('.col[data-col="fe:sub:protocolado"] .kcard >> nth=0','.col[data-col="fe:sub:comunique_se"]').catch(()=>{});await p.waitForTimeout(250);
ok((await ter(p,"M'Boi")).procs[0].sub==='comunique_se','arrastar muda a subetapa da fase');
await clica(p,'.drill-v');ok((await txt(p,'h1')).includes('Aprovação de Projetos'),'seta volta para as etapas');
await clica(p,'.drill-v');ok(await p.evaluate(()=>!!document.querySelector('.board-fases')),'seta volta para as fases');
await clica(p,'.col[data-fase=obras] .col-ab');await p.screenshot({path:O+'2_kanban_obras.png'});
ok((await txt(p,'.col[data-col="fe:execucao"] .kcard')).includes('Raimundo'),'terreno em obras na coluna Execução');
// arrastar para a próxima etapa da fase
await p.dragAndDrop('.col[data-col="fe:execucao"] .kcard >> nth=0','.col[data-col="fe:entrega"]').catch(()=>{});await p.waitForTimeout(250);
ok((await ter(p,'Raimundo')).procs.find(x=>x.fase==='obras').etapa==='entrega','arrastar muda a etapa da fase');
await clica(p,'.drill-t [data-a=neg-nivel]');await clica(p,'.col[data-fase=novos_negocios] .col-ab');
ok((await txt(p,'.col-h')).includes('Em Triagem'),'Novos Negócios desce para as etapas da negociação');
await clica(p,'.col-ab[data-v=negociacao]');ok((await txt(p,'.drill-t')).includes('Novos Negócios'),'subetapas de Negociação com a trilha');
await clica(p,'.drill-t [data-a=neg-nivel][data-v=""]');ok(await p.evaluate(()=>!!document.querySelector('.board-fases')),'trilha volta direto às fases');

// tabela: filtro por fase (na gaveta de filtros)
await nav(p,'terrenos');await clica(p,'[data-a=fx-abrir]');await clica(p,'#fx-dr [data-a=fx-op][data-k=fase][data-v=obras]');await clica(p,'#fx-dr .fx-f .btn.primary');await p.waitForTimeout(200);await p.screenshot({path:O+'3_tabela_obras.png'});
ok((await txt(p,'#rows tbody tr')).includes('Raimundo')&&!(await txt(p,'#rows tbody tr')).includes('Cupecê'),'tabela filtrada pela fase Obras');
ok((await txt(p,'#rows .c-etapa')).includes('Obras'),'coluna mostra a fase e a etapa');
await clica(p,'#fx-barra [data-a=fx-limpar]');

// mapa em três níveis pela legenda em árvore: Terrenos › fase › etapa › subetapa
await nav(p,'mapa');await p.waitForTimeout(400);
await p.evaluate(()=>{const l=document.querySelector('.mp-legenda');if(l)l.open=true});await p.waitForTimeout(200);
ok(!(await txt(p,'#mp-leg .lg-i')).includes('Obras'),'legenda começa com Terrenos fechado');
await clica(p,'[data-a=mp-arv]');await p.waitForTimeout(300);
ok((await txt(p,'#mp-leg .lg-i')).includes('Obras'),'Terrenos abre as fases');
ok((await txt(p,'#mp-lista .mp-it')).includes('Entregue'),'linha do mapa mostra a fase');
await clica(p,'[data-a=mp-abre][data-f=aprovacao]');await p.waitForTimeout(300);await p.screenshot({path:O+'4_mapa_aprovacao.png'});
const lm=await txt(p,'#mp-lista .mp-it');ok(lm.includes("M'Boi")&&!lm.includes('Cupecê'),'clicar na Aprovação mostra só os terrenos dela');
ok((await txt(p,'#mp-leg .lg-i')).includes('Análise na Prefeitura')&&(await txt(p,'#mp-leg .lg-i')).includes('Obras'),'etapas da Aprovação abaixo dela, com as outras fases na árvore');
await clica(p,'[data-a=mp-abre][data-e=prefeitura]');await p.waitForTimeout(300);
ok((await txt(p,'#mp-leg .lg-i')).includes('Comunique-se')&&(await txt(p,'#mp-lista .mp-it')).includes("M'Boi"),'etapa abre as subetapas');
await p.screenshot({path:O+'4b_mapa_sub.png'});
await clica(p,'[data-a=mp-abre][aria-expanded=true][style*="--p:1"]');await p.waitForTimeout(300);
ok(!(await txt(p,'#mp-leg .lg-i')).includes('Análise na Prefeitura')&&(await txt(p,'#mp-lista .mp-it')).includes('Cupecê'),'clicar de novo na fase fecha e volta para as fases');
await clica(p,'[data-a=mp-abre][data-f=aprovacao]');await p.waitForTimeout(300);
await p.evaluate(()=>{const l=document.querySelector('.mp-legenda');l.open=false});await p.waitForTimeout(300);
await p.evaluate(()=>{const l=document.querySelector('.mp-legenda');l.open=true});await p.waitForTimeout(300);
ok(!(await txt(p,'#mp-leg .lg-i')).includes('Obras')&&(await txt(p,'#mp-lista .mp-it')).includes('Cupecê'),'fechar e abrir a legenda deixa a árvore fechada e volta para as fases');

// ficha: linha do tempo das fases, quadro da fase, seção Fases
await ficha(p,"M'Boi Mirim");await bloco(p,'fases');await p.screenshot({path:O+'5_ficha_aprovacao.png',fullPage:true});
ok((await txt(p,'.tl-topo')).includes('Registro de Incorporação'),'linha do tempo do topo com as fases');
ok((await txt(p,'.adv-sub')).includes('Análise na Prefeitura'),'quadro de avanço da fase atual');
ok((await txt(p,'.fs-lst')).includes('Aprovado em Aprovação de Projetos'),'seção Fases mostra a dependência da próxima');
ok((await p.evaluate(()=>[...document.querySelectorAll('[data-a=f-abrir]')].filter(b=>b.textContent.includes('antes da hora')).length))===1,'só a próxima fase tem o botão de abrir antes da hora');
ok((await p.evaluate(()=>[...document.querySelectorAll('[data-a=f-abrir]')].some(b=>b.dataset.v==='funding'&&!b.textContent.includes('antes da hora')))),'Funding, sem dependência, abre à mão sem justificativa');
await clica(p,'[data-a=p-ir]');
ok((await ter(p,"M'Boi")).procs[0].etapa==='alvaras','Avançar leva à próxima etapa da fase');
await clica(p,'[data-a=p-ir]');ok(await p.evaluate(()=>!!document.querySelector('#f-pc')),'na última etapa, Avançar vira Concluir como Aprovado');
await p.fill('#pc-r','Alvará de execução emitido');await clica(p,'.df .btn.primary');
const t98=await ter(p,"M'Boi");ok(t98.procs[0].status==='concluido'&&t98.procs.some(x=>x.fase==='incorporacao'&&x.status==='ativo'),'concluir a Aprovação abre o Registro de Incorporação');

// compra abre a Aprovação sozinha
await papel(p,'Diretor');await ficha(p,'Cupecê — esquina');
await p.evaluate(()=>{});
// abrir fase à mão antes da hora (gestor ou diretor, com justificativa)
await bloco(p,'fases');await clica(p,'[data-a=f-abrir][data-v=aprovacao]');
ok(await p.evaluate(()=>!!document.querySelector('#f-ff')),'abrir antes da hora pede justificativa');
await p.fill('#ff-j','Projeto já em andamento com o vendedor');await clica(p,'.df .btn.primary');
const t123=await ter(p,'Cupecê — esquina');ok(t123.procs.some(x=>x.fase==='aprovacao'&&x.trilha[0].forcado),'abriu a Aprovação antes da hora, com a justificativa');
await p.screenshot({path:O+'6_ficha_paralelo.png'});
ok((await txt(p,'.fi-meta')).includes('Aprovação de Projetos'),'chip da ficha mostra a fase mais adiante');
await papel(p,'Analista');await ficha(p,'Pico Alto');await bloco(p,'fases');await clica(p,'[data-a=f-abrir][data-v=aprovacao]');
ok(await p.evaluate(()=>!!document.querySelector('.adv-modal')),'analista vê o que falta, sem forçar');
await clica(p,'[data-a=close]');await papel(p,'Diretor');

// Configurações › Fases
await nav(p,'config');await p.screenshot({path:O+'7_config_fases.png',fullPage:true});
ok((await txt(p,'.cfg-fase input')).length>=0&&(await p.evaluate(()=>document.querySelectorAll('.cfg-r.cfg-fase:not(.cfg-hd)').length))===8,'8 fases na configuração');
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));await p.fill('#nf-n','Regularização');await p.fill('#nf-p','neg');await clica(p,'form[data-form=cfg-fase] .btn');
ok((await p.evaluate(()=>document.querySelector('#toast').textContent)).includes('já é de outra fase'),'prefixo repetido é recusado');
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));await p.fill('#nf-p','REG');await clica(p,'form[data-form=cfg-fase] .btn');
ok((await p.evaluate(()=>document.querySelectorAll('.cfg-r.cfg-fase:not(.cfg-hd)').length))===9,'fase nova criada');
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));await p.selectOption('#dp-f','aprovacao');await p.selectOption('#dp-r','regularizacao|conclusao|');await clica(p,'form[data-form=cfg-dep] .btn');
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));await p.selectOption('#dp-f','regularizacao');await p.selectOption('#dp-r','aprovacao|conclusao|');await clica(p,'form[data-form=cfg-dep] .btn');
ok((await p.evaluate(()=>document.querySelector('#toast').textContent)).includes('ciclo'),'dependência em ciclo é recusada');
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));await p.fill('#fe-regularizacao','Levantamento');await clica(p,'form[data-form=cfg-fe][data-f="8"] .btn');
ok((await txt(p,'.cfg-fe input')).length>=0&&(await p.evaluate(()=>[...document.querySelectorAll('.cfg-fe input')].some(i=>i.value==='Levantamento'))),'etapa nova na fase nova');
await p.screenshot({path:O+'8_config_nova.png',fullPage:true});

// escuro e celular
({p,ctx}=await abre(1440,900,'escuro'));await nav(p,'negociacoes');await p.screenshot({path:O+'9a_fases_escuro.png'});await clica(p,'.col[data-fase=obras] .col-ab');await p.screenshot({path:O+'9_kanban_escuro.png'});
await ficha(p,'Raimundo');await bloco(p,'fases');await p.screenshot({path:O+'10_ficha_escuro.png'});
({p,ctx}=await abre(390,844));await nav(p,'negociacoes');await p.screenshot({path:O+'11a_celular_fases.png'});await clica(p,'.col[data-fase=aprovacao] .col-ab');await p.screenshot({path:O+'11_celular_kanban.png'});
await ficha(p,'Raimundo');await bloco(p,'fases');await p.screenshot({path:O+'12_celular_ficha.png',fullPage:true});
await papel(p,'Diretor');await nav(p,'config');await p.screenshot({path:O+'13_celular_config.png',fullPage:true});
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'configuração no celular sem rolagem horizontal');

ok(!erros.length,'sem erros de JS'+(erros.length?': '+erros.join(' / '):''));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
