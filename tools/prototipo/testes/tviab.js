// Estudo de viabilidade estática: tipologias com área, preço unitário e preço por m² ligados, despesas pela lista
// da empresa (busca), resultado igual ao do teste do banco (supabase/tests/regras.sql), vincular à negociação,
// Leitura só vê, Configurações › Viabilidade muda a obra e o estudo acompanha. Claro, escuro e celular.
// Prints em saida/t_viab.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_viab/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
const KEY='bkm-terrenos-prototipo-v9';
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
const D=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const d0=await D();ok(d0.viabs.length>=4&&d0.viabDesp.length===22,tag+' estudos de exemplo e a lista padrão de 22 despesas');
const tid=d0.viabs[0].tid;
const ficha=async()=>{await p.evaluate(id=>{document.querySelector('[data-a=nav][data-r=terrenos]').click()},tid);await p.waitForTimeout(200);
  await p.evaluate(id=>document.querySelector(`[data-a=abrir][data-id="${id}"]`).click(),tid);await p.waitForTimeout(400);
  await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-a=bloco]')].find(x=>/Negociação/.test(x.textContent));b&&b.getAttribute('aria-expanded')!=='true'&&b.click()});await p.waitForTimeout(300)};
await ficha();
const sec=await p.$eval('#sec-viab',e=>e.innerText.replace(/\s+/g,' '));
ok(/Vinculado/.test(sec)&&/Margem líquida/.test(sec),tag+' seção Viabilidade da negociação lista o estudo vinculado');
await p.evaluate(()=>document.querySelector('#sec-viab').scrollIntoView({block:'start'}));await p.screenshot({path:OUT+tag+'_0secao.png'});
// novo estudo
await p.evaluate(()=>document.querySelector('#sec-viab [data-a=vb-novo]').click());await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.body.dataset.rota==='viab'),tag+' Novo estudo abre a página do estudo');
const tp=async(i,k)=>p.locator('.vb-tips .vb-r[data-tp]').nth(i).locator(`[data-k="${k}"]`);
const preenche=async(loc,v)=>{await loc.click();await loc.fill(v);await loc.press('Tab');await p.waitForTimeout(80)};
await preenche(await tp(0,'nome'),'2 dormitórios');await preenche(await tp(0,'area'),'40');await preenche(await tp(0,'qtd'),'100');await preenche(await tp(0,'perm'),'10');
await preenche(await tp(0,'pu'),'280.000');
ok(await (await tp(0,'pm2')).inputValue()==='7.000',tag+' área e preço unitário dão o preço por m² (7.000)');
await p.evaluate(()=>document.querySelector('[data-a=vb-tip-add]').click());await p.waitForTimeout(200);
await preenche(await tp(1,'nome'),'2 dormitórios com suíte');await preenche(await tp(1,'area'),'50');await preenche(await tp(1,'qtd'),'50');await preenche(await tp(1,'pm2'),'7.200');
ok(await (await tp(1,'pu')).inputValue()==='360.000',tag+' área e preço por m² dão o unitário (360.000)');
await preenche(await tp(0,'area'),'35');
ok(await (await tp(0,'pm2')).inputValue()==='8.000'&&await (await tp(0,'pu')).inputValue()==='280.000',tag+' área nova com os dois preços: mantém o unitário e refaz o m²');
await preenche(await tp(0,'pm2'),'7.000');
ok(await (await tp(0,'pu')).inputValue()==='245.000',tag+' mudar o m² refaz o unitário');
await preenche(await tp(0,'pu'),'280.000');await preenche(await tp(0,'area'),'40');
ok(await (await tp(0,'pm2')).inputValue()==='7.000',tag+' de volta: 40 m², 280.000, 7.000/m²');
await preenche(await tp(0,'perm'),'120');
ok((await D()).viabs.at(-1).tips[0].perm===100,tag+' permuta acima da quantidade volta para a quantidade');
await preenche(await tp(0,'perm'),'10');
// despesas pela busca
const desp=async(busca,mult,qtd)=>{await p.evaluate(()=>document.querySelector('[data-a=vb-ln-add]').click());await p.waitForTimeout(150);
  const cb=p.locator('[data-vb-cb="nova"]');await cb.fill(busca);await p.waitForTimeout(80);await cb.press('Enter');await p.waitForTimeout(200);
  const r=p.locator('.vb-lns .vb-r[data-ln]').last();if(mult!=null){const m=r.locator('[data-k=mult]');await m.fill(mult);await m.press('Tab')}
  if(qtd!=null){const q=r.locator('[data-k=qtd]');await q.fill(qtd);await q.press('Tab')}await p.waitForTimeout(80);return r};
await p.evaluate(()=>document.querySelector('[data-a=vb-ln-add]').click());await p.waitForTimeout(150);
await p.locator('[data-vb-cb="nova"]').fill('obra');await p.waitForTimeout(100);
const ops=await p.$$eval('.vb-dd [data-vb-op]',e=>e.map(x=>x.dataset.vbOp));
ok(ops.includes('construcao')&&ops.includes('adm_obra')&&!ops.includes('comissao'),tag+' busca "obra" acha as despesas do grupo Obra: '+ops.join(','));
if(modo==='desktop')await p.screenshot({path:OUT+tag+'_1busca.png'});
await p.evaluate(()=>document.querySelector('[data-a=vb-ln-cancela]').click());await p.waitForTimeout(100);
await desp('terreno','2.000.000','3');await desp('constru','150.000');await desp('infraestrutura ext','1.000.000');
const adm=await desp('administração da obra');
ok(await adm.locator('[data-k=tipo]').inputValue()==='pct_obra_total'&&await adm.locator('[data-k=mult]').inputValue()==='5',tag+' despesa escolhida vem com o tipo e o multiplicador da lista (5% da obra total)');
await desp('conting');await desp('comiss');
const kp=await p.$eval('#vb-kpis',e=>e.innerText.replace(/\s+/g,' '));
ok(/46,00 mi/.test(kp)&&/43,20 mi/.test(kp)&&/10,12 mi/.test(kp)&&/23,4%/.test(kp),tag+' VGV 46 mi, VGV líquido 43,2 mi, lucro 10,12 mi, margem 23,4% (o mesmo do banco): '+kp);
const res=await p.$eval('#vb-res',e=>e.innerText.replace(/\s+/g,' '));
ok(/33\.078\.000/.test(res)&&/10\.122\.000/.test(res)&&/23,43%/.test(res)&&/Obra total R\$\s?23\.500\.000/.test(res)&&/incidente R\$\s?22\.500\.000/.test(res),tag+' resultado: despesas 33.078.000, lucro 10.122.000, margem 23,43%, obra total 23,5 mi e incidente 22,5 mi');
const vs=(await D()).viabs.at(-1);
ok(vs.linhas.length===6&&vs.linhas[0].qtd===3,tag+' seis linhas gravadas, terreno em 3 parcelas');
await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:OUT+tag+'_2estudo.png',fullPage:true});
ok(await p.evaluate(()=>document.scrollingElement.scrollWidth<=innerWidth+1),tag+' sem rolagem horizontal');
// vincular
await p.evaluate(()=>document.querySelector('.vb-acoes [data-a=vb-vincular]').click());await p.waitForTimeout(250);
const neg=(await D()).terrenos.find(t=>t.id===tid).neg.viab;
ok(neg.id===vs.id&&neg.margem===23.43,tag+' vincular põe o estudo na negociação (margem 23,43)');
ok(!(await p.$('.vb-acoes [data-a=vb-apagar]')),tag+' estudo vinculado não tem Apagar');
// Leitura
await p.evaluate(()=>{document.querySelector('#perfil button')?.click()});await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=role]')].find(x=>x.dataset.v==='Leitura')?.click());await p.waitForTimeout(250);
ok(await p.evaluate(()=>[...document.querySelectorAll('.vb-tab input')].every(i=>i.disabled)&&!document.querySelector('[data-a=vb-tip-add]')&&!document.querySelector('[data-a=vb-ln-add]')),tag+' Leitura vê o estudo sem editar');
if(modo==='desktop'&&tema==='claro')await p.screenshot({path:OUT+tag+'_3leitura.png'});
await p.evaluate(()=>{document.querySelector('#perfil button')?.click()});await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=role]')].find(x=>x.dataset.v==='Diretor')?.click());await p.waitForTimeout(250);
// configuração muda a obra e o estudo acompanha
if(modo==='desktop'){
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=config]').click());await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelector('[data-a=cfg-aba][data-v=viab]').click());await p.waitForTimeout(200);
ok(await p.$$eval('.vb-cfg-r:not(.cfg-hd)',e=>e.length)===22,tag+' Configurações › Viabilidade lista as 22 despesas');
await p.screenshot({path:OUT+tag+'_4config.png'});
const i=(await D()).viabDesp.findIndex(d=>d.codigo==='infra_externa');
await p.selectOption(`[data-ch=cfg-vd][data-i="${i}"][data-k=obra]`,'nao');await p.waitForTimeout(200);
const n2=(await D()).terrenos.find(t=>t.id===tid).neg.viab;
ok(n2.lucro===10172000,tag+' tirar a infraestrutura externa da obra refaz o estudo vinculado (lucro 10.172.000, como no banco)');
await p.fill('#vd-n','Prêmio de vendas');await p.selectOption('#vd-g','comercial');await p.selectOption('#vd-t','pct_vgv');await p.evaluate(()=>document.querySelector('[data-form=vb-cfg-nova]').requestSubmit());await p.waitForTimeout(200);
ok((await D()).viabDesp.some(d=>d.nome==='Prêmio de vendas'&&d.grupo==='comercial'),tag+' despesa nova entra na lista');
}
// volta para a ficha: Visão geral com o resumo do estudo
await ficha();
await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-a=bloco]')].find(x=>/Visão geral/.test(x.textContent));b&&b.getAttribute('aria-expanded')!=='true'&&b.click()});await p.waitForTimeout(300);
const rv=await p.evaluate(()=>[...document.querySelectorAll('.sec')].find(s=>/Resumo da viabilidade/.test(s.innerText))?.innerText.replace(/\s+/g,' '));
ok(/VGV líquido/.test(rv)&&/Lucro líquido/.test(rv)&&/Margem líquida/.test(rv),tag+' Visão geral mostra VGV líquido, lucro e margem do estudo vinculado');
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\ntudo ok');process.exit(errs.length?1:0)})();
