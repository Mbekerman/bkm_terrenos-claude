// Modelos de estudo de viabilidade: salvar o estudo como modelo (da empresa, padrão, ou do usuário), Novo estudo
// abre com o padrão marcado e deixa escolher outro ou nenhum, Taxas e Despesas financeiras só da diretoria,
// Configurações › Viabilidade lista os modelos da empresa. Desktop claro e celular. Prints em saida/t_modelo.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_modelo/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
const KEY='bkm-terrenos-prototipo-v9';
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const modo of ['desktop','celular']){const tag=modo;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);
const D=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const papel=async r=>{await p.evaluate(()=>{document.querySelector('#perfil button')?.click()});await p.waitForTimeout(100);
  await p.evaluate(r=>[...document.querySelectorAll('[data-a=role]')].find(x=>x.dataset.v===r)?.click(),r);await p.waitForTimeout(250)};
const d0=await D();ok(Array.isArray(d0.viabModelos)&&d0.viabModelos.length===0,tag+' começa sem modelos');
const v0=d0.viabs[0],tid=v0.tid;
const ficha=async()=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(200);
  await p.evaluate(id=>document.querySelector(`[data-a=abrir][data-id="${id}"]`).click(),tid);await p.waitForTimeout(400);
  await p.evaluate(()=>{const b=document.querySelector('.fi-abas [data-t=viabilidade]');b&&b.getAttribute('aria-selected')!=='true'&&b.click()});await p.waitForTimeout(300)};
const novo=async()=>{await p.evaluate(()=>document.querySelector('#sec-viab [data-a=vb-novo]').click());await p.waitForTimeout(300)};
const marca=async q=>{await p.evaluate(q=>document.querySelector(q).closest('label').click(),q);await p.waitForTimeout(80)};
const fechaPop=async()=>{await p.keyboard.press('Escape');await p.waitForTimeout(200)};
await papel('Diretor');await ficha();
// sem modelo nenhum, Novo estudo cria direto (como antes)
await novo();ok(await p.$('#vb-pop')&&!(await p.$('[data-form=vb-novo]')),tag+' sem modelos, Novo estudo cria direto');
const sem=(await D()).viabs.at(-1);ok(sem.cm2==null&&sem.linhas.find(l=>l.desp==='impostos').valor==null,tag+' estudo sem modelo nasce com a lista');
await fechaPop();
// diretor (administrador) salva o estudo de exemplo como padrão da empresa
await p.evaluate(id=>document.querySelector(`#sec-viab [data-a=vb-abrir][data-v="${id}"]`).click(),v0.id);await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('#vb-pop [data-a=vb-modelo]').click());await p.waitForTimeout(200);
ok(await p.$('[data-form=vb-modelo]')&&await p.$('[name=escopo][value=padrao]'),tag+' Salvar como modelo abre o formulário, com Para a empresa e Padrão para o administrador');
await p.fill('#vbm-n','MCMV padrão');await marca('[name=escopo][value=padrao]');
if(modo==='desktop')await p.screenshot({path:OUT+tag+'_1salvar.png'});
await p.evaluate(()=>document.querySelector('#f-vbm').requestSubmit());await p.waitForTimeout(250);
let ms=(await D()).viabModelos;const m1=ms[0];
ok(ms.length===1&&m1.dono===null&&m1.padrao&&m1.dados.cm2===v0.cm2&&m1.dados.linhas.some(l=>l.desp==='impostos'&&l.valor===4)&&!('tips' in m1.dados),tag+' modelo da empresa, padrão, com obra, linhas e Taxas/Financeiras, sem tipologias');
await fechaPop();
// Novo estudo: escolha do modelo, com o padrão marcado
await novo();
ok(await p.$('[data-form=vb-novo]')&&await p.$eval(`[name=modelo][value="${m1.id}"]`,e=>e.checked),tag+' Novo estudo pergunta o modelo, com o padrão da empresa marcado');
await p.evaluate(()=>document.querySelector('#toast').className='toast');await p.waitForTimeout(250);await p.screenshot({path:OUT+tag+'_2novo.png'});
await p.evaluate(()=>document.querySelector('#f-vbn').requestSubmit());await p.waitForTimeout(300);
const vp=(await D()).viabs.at(-1);
ok(vp.cm2===v0.cm2&&vp.linhas.find(l=>l.desp==='impostos').valor===4&&vp.linhas.find(l=>l.desp==='projetos')?.valor===3&&vp.tips.length===1&&!vp.tips[0].qtd,tag+' estudo pelo padrão: valores e bases do modelo, tipologia em branco');
await fechaPop();
// analista: modelo próprio sem Taxas e Despesas financeiras
await papel('Analista');await ficha();
await p.evaluate(id=>document.querySelector(`#sec-viab [data-a=vb-abrir][data-v="${id}"]`).click(),vp.id);await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('#vb-pop [data-a=vb-modelo]').click());await p.waitForTimeout(200);
ok(!(await p.$('[name=escopo]'))&&/Taxas e Despesas financeiras não entram/.test(await p.$eval('#modal',e=>e.innerText)),tag+' analista salva só para si, avisado de que Taxas e Financeiras não entram');
await p.fill('#vbm-n','Meu rápido');await p.evaluate(()=>document.querySelector('#f-vbm').requestSubmit());await p.waitForTimeout(250);
ms=(await D()).viabModelos;const m2=ms.find(m=>m.nome==='Meu rápido');
ok(m2&&m2.dono&&!m2.padrao&&!m2.dados.linhas.some(l=>['impostos','taxa_desenvolvimento','juros_pj'].includes(l.desp)),tag+' modelo do analista sem Taxas e Despesas financeiras');
await fechaPop();await novo();
const opc=await p.$$eval('[data-form=vb-novo] .vb-mod-r',e=>e.map(r=>r.innerText.replace(/\s+/g,' ').trim()));
ok(opc.length===3&&/MCMV padrão.*Padrão da empresa/.test(opc[0])&&!/Apagar/.test(opc[0])&&/Meu rápido.*Meu modelo.*Apagar/.test(opc[1])&&/Sem modelo/.test(opc[2]),tag+' analista vê o padrão (sem Apagar), o próprio modelo (com Apagar) e Sem modelo: '+opc.join(' | '));
await marca('[name=modelo][value=""]');await p.evaluate(()=>document.querySelector('#f-vbn').requestSubmit());await p.waitForTimeout(300);
const vs=(await D()).viabs.at(-1);ok(vs.cm2==null&&vs.linhas.find(l=>l.desp==='impostos').valor==null,tag+' Sem modelo: só a lista');
await fechaPop();await novo();await marca(`[name=modelo][value="${m2.id}"]`);await p.evaluate(()=>document.querySelector('#f-vbn').requestSubmit());await p.waitForTimeout(300);
const vm=(await D()).viabs.at(-1);ok(vm.cm2===v0.cm2&&vm.linhas.find(l=>l.desp==='impostos').valor==null,tag+' pelo modelo do analista: obra do modelo, Taxas e Financeiras da lista');
await fechaPop();
// gestor não vê o modelo do analista
await papel('Gestor');await ficha();await novo();
ok(!(await p.$(`[name=modelo][value="${m2.id}"]`)),tag+' modelo do usuário só ele vê');await p.keyboard.press('Escape');await p.waitForTimeout(150);
// configurações
if(modo==='desktop'){await papel('Diretor');
  await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=config]').click());await p.waitForTimeout(200);
  await p.evaluate(()=>document.querySelector('[data-a=cfg-aba][data-v=viab]').click());await p.waitForTimeout(200);
  const cfg=await p.evaluate(()=>[...document.querySelectorAll('.sec')].find(s=>/Modelos de estudo/.test(s.innerText))?.innerText.replace(/\s+/g,' '));
  ok(/MCMV padrão/.test(cfg)&&!/Meu rápido/.test(cfg),tag+' Configurações › Viabilidade lista só os modelos da empresa');
  await p.evaluate(()=>[...document.querySelectorAll('.sec')].find(s=>/Modelos de estudo/.test(s.innerText)).scrollIntoView({block:'start'}));await p.evaluate(()=>document.querySelector('#toast').className='toast');await p.waitForTimeout(250);await p.screenshot({path:OUT+tag+'_3config.png'});
  await p.evaluate(()=>document.querySelector('[data-a=vb-mod-padrao][data-v=""]').click());await p.waitForTimeout(200);
  ok(!(await D()).viabModelos.some(m=>m.padrao),tag+' Sem modelo padrão tira o padrão')}
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\ntudo ok');process.exit(errs.length?1:0)})();
