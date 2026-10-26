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
const d0=await D();ok(d0.viabs.length>=4&&d0.viabDesp.length===36,tag+' estudos de exemplo e a lista padrão de 36 itens');
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
ok(await p.$$eval('#vb-sec-taxas .vb-r[data-ln]',e=>e.length)===6&&await p.$$eval('#vb-sec-comercial .vb-r[data-ln]',e=>e.length)===9,tag+' Taxas (6) e Despesas comerciais (9) já vêm com os itens fixos');
const tp=async(i,k)=>p.locator('.vb-tips .vb-r[data-tp]').nth(i).locator(`[data-k="${k}"]`);
const preenche=async(loc,v)=>{await loc.click();await loc.fill(v);await loc.press('Tab');await p.waitForTimeout(80)};
await preenche(await tp(0,'nome'),'2 dormitórios');await preenche(await tp(0,'area'),'40');await preenche(await tp(0,'qtd'),'100');await preenche(await tp(0,'perm'),'10');await preenche(await tp(0,'com'),'2');
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
await preenche(await tp(0,'com'),'95');
ok((await D()).viabs.at(-1).tips[0].com===90,tag+' permuta mais comissão não passam da quantidade (comissão volta a 90)');
await preenche(await tp(0,'com'),'2');
// itens de lista: busca no grupo, base e valor
const val=async(id,v)=>{const m=p.locator(`[data-ln="${id}"] [data-k=valor]`);await m.fill(v);await m.press('Tab');await p.waitForTimeout(80)};
const base=async(id,t)=>{await p.selectOption(`[data-ln="${id}"] [data-k=tipo]`,t);await p.waitForTimeout(150)};
const item=async(g,busca,v,t)=>{await p.evaluate(g=>document.querySelector(`[data-a=vb-ln-add][data-v=${g}]`).click(),g);await p.waitForTimeout(150);
  const cb=p.locator('[data-vb-cb="nova"]');await cb.fill(busca);await p.waitForTimeout(80);await cb.press('Enter');await p.waitForTimeout(200);
  const id=await p.evaluate(()=>document.activeElement.closest('[data-ln]')?.dataset.ln);if(t)await base(id,t);if(v!=null)await val(id,v);return id};
const fixo=async(sec,nome,v,t,meses)=>{const id=await p.evaluate(([s,n])=>[...document.querySelectorAll(`#vb-sec-${s} .vb-r[data-ln]`)].find(r=>r.querySelector('.vb-nome')?.textContent===n)?.dataset.ln,[sec,nome]);
  if(t)await base(id,t);await val(id,v);if(meses){const q=p.locator(`[data-ln="${id}"] [data-k=qtd]`);await q.fill(meses);await q.press('Tab');await p.waitForTimeout(80)}return id};
const hd=async(k,v)=>{const m=p.locator(`[data-vb=hd][data-k=${k}]`);await m.fill(v);await m.press('Tab');await p.waitForTimeout(80)};
await p.evaluate(()=>document.querySelector('[data-a=vb-ln-add][data-v=obra_atipica]').click());await p.waitForTimeout(150);
const ops=await p.$$eval('.vb-dd [data-vb-op]',e=>e.map(x=>x.dataset.vbOp));
ok(ops.join()==='fundacoes_especiais,contencoes,demolicao',tag+' a busca de Itens atípicos só mostra os itens do grupo: '+ops.join(','));
if(modo==='desktop')await p.screenshot({path:OUT+tag+'_1busca.png'});
await p.evaluate(()=>document.querySelector('[data-a=vb-ln-cancela]').click());await p.waitForTimeout(100);
await hd('cm2','3.000');
await item('obra_atipica','fundações','100','area');await item('obra_atipica','contenções','2','pct_obra_tipica');
const lg=await item('obra_nao_incidente','ligações',null,'pct_obra_raso');
ok((await p.$$eval(`[data-ln="${lg}"] [data-k=tipo] option`,e=>e.map(o=>o.value))).join()==='area,pct_obra_tipica,pct_vgv,verba,pct_obra_raso',tag+' Obra não incidente aceita também % do custo de obra raso');
await val(lg,'1');await item('obra_nao_incidente','infraestrutura ext','1.000.000');
await item('projetos','projetos e','3');await item('projetos','aprovações','200.000');await item('pos_obra','assistência','1');
await item('terreno','itbi do terreno','150.000');await item('incorporacao','registro da inc','100.000');await item('adm_financeiro','administração central','1');
await fixo('taxas','Impostos','4');await fixo('taxas','Taxa de gestão de obra','2');await fixo('taxas','Taxa de desenvolvimento','10');
await fixo('comercial','Comissão','4');await fixo('comercial','Marketing','1,5');await fixo('comercial','ITBI de unidades vendidas','2');
await fixo('comercial','Registro de unidades vendidas','300.000','verba');await fixo('comercial','Custo fixo comercial','50.000',null,'24');
await hd('pfp','8');await hd('dedp','5');await hd('min','3.000.000');await hd('din','1.000.000');await hd('comd','200.000');
for(const c of ['itbi_vendas','registro_vendas']){await p.locator(`[data-vb=ded][value=${c}]`).check();await p.waitForTimeout(150)}
const txt=async s=>(await p.$eval(s,e=>e.innerText)).replace(/\s+/g,' ');
ok(/19\.500\.000/.test(await txt('[data-vbo=oi]'))&&/20\.540\.000/.test(await txt('#vb-raso'))&&/21\.745\.400/.test(await txt('#vb-ot'))&&/22\.815\.216/.test(await txt('#vb-tot-obra')),
  tag+' obra: incidente 19,5 mi, raso 20,54 mi, total 21,7454 mi, seção 22,815216 mi (como no banco)');
const pf=await txt('[data-vbo=pfis]');ok(/10/.test(pf)&&/400 m²/.test(pf)&&/6,7%/.test(pf)&&/6,2%/.test(pf),tag+' permuta física: 10 unidades, 400 m², 6,7% das unidades e 6,2% da área: '+pf);
const pfin=await txt('[data-vbo=pfin]');ok(/42\.640\.000/.test(pfin)&&/3\.284\.800/.test(pfin)&&/39\.355\.200/.test(pfin)&&/3\.148\.416/.test(pfin),tag+' permuta financeira: VGV vendido 42,64 mi, deduções 3,2848 mi, VGV líquido 39,3552 mi, 8% = 3,148416 mi: '+pfin);
const tots=await p.evaluate(()=>['terreno','despesas','taxas','comercial'].map(k=>document.getElementById('vb-tot-'+k).innerText.replace(/\s+/g,' ')));
ok(/4\.348\.416/.test(tots[0])&&/676\.400/.test(tots[1])&&/2\.670\.459/.test(tots[2])&&/4\.698\.000/.test(tots[3]),tag+' totais: terreno 4,348 mi, despesas gerais 676,4 mil, taxas 2,67 mi, comerciais 4,698 mi: '+tots.join(' | '));
const kp=await txt('#vb-kpis');
ok(/46,00 mi/.test(kp)&&/39,36 mi/.test(kp)&&/5,30 mi/.test(kp)&&/13,5%/.test(kp),tag+' VGV 46 mi, VGV líquido 39,36 mi, lucro 5,30 mi, margem 13,5% (o mesmo do banco): '+kp);
const res=await txt('#vb-res');
ok(/VGV vendido R\$\s?42\.640\.000/.test(res)&&/5\.299\.509/.test(res)&&/13,47%/.test(res)&&/fora as deduzidas\) R\$\s?3\.545\.200/.test(res),tag+' resultado: lucro 5.299.509,09, margem 13,47%, comerciais sem as deduzidas 3.545.200');
const des=await p.evaluate(()=>{const r=[...document.querySelectorAll('#vb-sec-taxas .vb-r[data-ln]')].find(r=>/desenvolvimento/.test(r.innerText));return r.innerText.replace(/\s+/g,' ')});
ok(/529\.951/.test(des)&&/lucro líquido/.test(des),tag+' taxa de desenvolvimento: 10% do lucro líquido (529.950,91)');
await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:OUT+tag+'_2estudo.png',fullPage:true});
await hd('min','3.500.000');
ok(/mínimo garantido/.test(await txt('[data-vbo=pfin]'))&&/4\.979\.887/.test(await txt('#vb-res')),tag+' abaixo do mínimo garantido, a permuta financeira usa o mínimo (lucro 4.979.887,27)');
await hd('min','3.000.000');
const cef=await fixo('comercial','Taxa de emissão de contratos CEF','500','verba_unidade');
ok(/4\.767\.000/.test(await txt('#vb-tot-comercial'))&&/138 unidades líquidas/.test(await txt(`[data-ln="${cef}"]`)),tag+' verba por unidade: 500 × 138 unidades líquidas');
await val(cef,'');
const vs=(await D()).viabs.at(-1);
ok(vs.linhas.length===15+10&&vs.deduz.length===2,tag+' linhas gravadas (15 fixas e 10 da lista) e as duas deduções');
ok(await p.evaluate(()=>document.scrollingElement.scrollWidth<=innerWidth+1),tag+' sem rolagem horizontal');
// vincular
await p.evaluate(()=>document.querySelector('.vb-acoes [data-a=vb-vincular]').click());await p.waitForTimeout(250);
const neg=(await D()).terrenos.find(t=>t.id===tid).neg.viab;
ok(neg.id===vs.id&&neg.margem===13.47,tag+' vincular põe o estudo na negociação (margem 13,47)');
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
ok(await p.$$eval('.vb-cfg-r:not(.cfg-hd)',e=>e.length)===36,tag+' Configurações › Viabilidade lista os 36 itens por grupo');
await p.screenshot({path:OUT+tag+'_4config.png',fullPage:true});
await p.locator('[data-ch=cfg-vd][data-c=registro_vendas][data-k=deduz]').uncheck();await p.waitForTimeout(200);
const n2=(await D()).terrenos.find(t=>t.id===tid).neg.viab;
ok(n2.lucro===5277690.91&&n2.margem===13.31,tag+' registro das vendas deixa de sair do VGV: o estudo vinculado se refaz (lucro 5.277.690,91, margem 13,31, como no banco)');
ok(await p.locator('[data-ch=cfg-vd][data-c=comissao][data-k=grupo]').isDisabled(),tag+' item usado em estudo não muda de grupo');
await p.fill('#vd-n','Prêmio de vendas');await p.selectOption('#vd-g','comercial');await p.evaluate(()=>document.querySelector('[data-form=vb-cfg-nova]').requestSubmit());await p.waitForTimeout(200);
ok((await D()).viabDesp.some(d=>d.nome==='Prêmio de vendas'&&d.grupo==='comercial'&&d.tipo==='pct_vgv'),tag+' item novo entra no grupo, com a primeira base aceita');
}
// volta para a ficha: Visão geral com o resumo do estudo
await ficha();
await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-a=bloco]')].find(x=>/Visão geral/.test(x.textContent));b&&b.getAttribute('aria-expanded')!=='true'&&b.click()});await p.waitForTimeout(300);
const rv=await p.evaluate(()=>[...document.querySelectorAll('.sec')].find(s=>/Resumo da viabilidade/.test(s.innerText))?.innerText.replace(/\s+/g,' '));
ok(/VGV líquido/.test(rv)&&/Lucro líquido/.test(rv)&&/Margem líquida/.test(rv),tag+' Visão geral mostra VGV líquido, lucro e margem do estudo vinculado');
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\ntudo ok');process.exit(errs.length?1:0)})();
