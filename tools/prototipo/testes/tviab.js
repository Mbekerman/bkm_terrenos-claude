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
const d0=await D();ok(d0.viabs.length>=4&&d0.viabDesp.length===39,tag+' estudos de exemplo e a lista padrão de 39 itens');
const tid=d0.viabs[0].tid;
const ficha=async()=>{await p.evaluate(id=>{document.querySelector('[data-a=nav][data-r=terrenos]').click()},tid);await p.waitForTimeout(200);
  await p.evaluate(id=>document.querySelector(`[data-a=abrir][data-id="${id}"]`).click(),tid);await p.waitForTimeout(400);
  await p.evaluate(()=>{const b=document.querySelector('.fi-abas [data-t=viabilidade]');b&&b.getAttribute('aria-selected')!=='true'&&b.click()});await p.waitForTimeout(300)};
await ficha();
const sec=await p.$eval('#sec-viab',e=>e.innerText.replace(/\s+/g,' '));
ok(/Estudo válido/.test(sec)&&/Margem líquida/.test(sec)&&await p.$('#sec-viab .vb-radio input:checked'),tag+' seção Viabilidade da negociação lista os estudos com o válido marcado');
await p.evaluate(()=>document.querySelector('#sec-viab').scrollIntoView({block:'start'}));await p.screenshot({path:OUT+tag+'_0secao.png'});
// novo estudo
await p.evaluate(()=>document.querySelector('#sec-viab [data-a=vb-novo]').click());await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.body.dataset.rota==='terreno'&&!!document.querySelector('#vb-pop .vb-pop-d[role=dialog]')),tag+' Novo estudo abre o popup sobre a ficha');
const abas=await p.$$eval('#vb-pop .vb-nav .vb-aba',e=>e.map(x=>x.dataset.v+':'+x.querySelector('b').textContent+(x.hasAttribute('aria-current')?'*':'')));
ok(abas.join()==='tip:Tipologias*,terreno:Terreno,comercial:Comercial,obra:Obras,despesas:Gerais,financeiro:Financeiras,taxas:Taxas,res:DRE'&&await p.$$eval('#vb-pop .vb-sec',e=>e.length)===1,tag+' botões das seções sob os indicadores, na ordem, e uma seção de cada vez (abre em Tipologias): '+abas.join());
const aba=async k=>{const ja=await p.evaluate(k=>!!document.querySelector(`.vb-nav [data-a=vb-aba][data-v=${k}][aria-current]`),k);await p.evaluate(k=>document.querySelector(`.vb-nav [data-a=vb-aba][data-v=${k}]`).click(),k);await p.waitForTimeout(120);
  /* Obras abre com os quadros fechados; o roteiro confere e abre todos para mexer nos itens */
  if(k==='obra'&&!ja){const st=await p.$$eval('[data-a=vb-q-tg]',e=>e.map(b=>b.getAttribute('aria-expanded')));ok(st.length===4&&st.every(x=>x==='false'),tag+' a aba Obras abre com os 4 quadros fechados: '+st.join());
    await p.evaluate(()=>{let b;while(b=document.querySelector('[data-a=vb-q-tg][aria-expanded=false]'))b.click()});await p.waitForTimeout(120)}};
const G2A={obra_atipica:'obra',obra_nao_incidente:'obra',projetos:'obra',pos_obra:'obra',terreno:'despesas',incorporacao:'despesas',cef:'despesas',adm_financeiro:'despesas'};
await aba('taxas');const nTx=await p.$$eval('#vb-sec-taxas .vb-r[data-ln]',e=>e.length);
await aba('financeiro');const nFi=await p.$$eval('#vb-sec-financeiro .vb-r[data-ln]',e=>e.map(r=>r.querySelector('.vb-nome')?.textContent).join('|'));await aba('comercial');
ok(nFi==='Custo de alavancagem|Custo de juros PJ|Custo financeiro|Impostos|Custo de capital permuta financeira|Custo de capital pagamento terreno',tag+' Despesas financeiras: alavancagem, juros PJ, custo financeiro, impostos e os dois custos de capital: '+nFi);
ok(nTx===3&&await p.$$eval('#vb-sec-comercial .vb-r[data-ln]',e=>e.length)===9&&await p.$('.vb-aba[data-v=comercial][aria-current]'),tag+' Taxas (3) e Despesas comerciais (9) já vêm com os itens fixos; o botão ativo acompanha a seção');
await aba('tip');
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
const item=async(g,busca,v,t)=>{await aba(G2A[g]);await p.evaluate(g=>document.querySelector(`[data-a=vb-ln-add][data-v=${g}]`).click(),g);await p.waitForTimeout(150);
  const cb=p.locator('[data-vb-cb="nova"]');await cb.fill(busca);await p.waitForTimeout(80);await cb.press('Enter');await p.waitForTimeout(200);
  const id=await p.evaluate(()=>document.activeElement.closest('[data-ln]')?.dataset.ln);if(t)await base(id,t);if(v!=null)await val(id,v);return id};
const fixo=async(sec,nome,v,t,meses)=>{await aba(sec);const id=await p.evaluate(([s,n])=>[...document.querySelectorAll(`#vb-sec-${s} .vb-r[data-ln]`)].find(r=>r.querySelector('.vb-nome')?.textContent===n)?.dataset.ln,[sec,nome]);
  if(t)await base(id,t);await val(id,v);if(meses){const q=p.locator(`[data-ln="${id}"] [data-k=qtd]`);await q.fill(meses);await q.press('Tab');await p.waitForTimeout(80)}return id};
const hd=async(k,v)=>{await aba(k==='cm2'?'obra':'terreno');const m=p.locator(`[data-vb=hd][data-k=${k}]`);await m.fill(v);await m.press('Tab');await p.waitForTimeout(80)};
await aba('obra');await p.evaluate(()=>document.querySelector('[data-a=vb-ln-add][data-v=obra_atipica]').click());await p.waitForTimeout(150);
const ops=await p.$$eval('.vb-dd [data-vb-op]',e=>e.map(x=>x.dataset.vbOp));
ok(ops.join()==='fundacoes_especiais,contencoes,demolicao',tag+' a busca de Custo de obra atípico só mostra os itens do grupo: '+ops.join(','));
if(modo==='desktop')await p.screenshot({path:OUT+tag+'_1busca.png'});
await p.evaluate(()=>document.querySelector('[data-a=vb-ln-cancela]').click());await p.waitForTimeout(100);
await hd('cm2','3.000');
await item('obra_atipica','fundações','100','area');await item('obra_atipica','contenções','2','pct_obra_tipica');
const lg=await item('obra_nao_incidente','ligações',null,'pct_obra_raso');
ok((await p.$$eval(`[data-ln="${lg}"] [data-k=tipo] option`,e=>e.map(o=>o.value))).join()==='area,pct_obra_tipica,pct_vgv,verba,pct_obra_raso',tag+' Obra não incidente aceita também % do custo de obra raso');
await val(lg,'1');await item('obra_nao_incidente','infraestrutura ext','1.000.000');
await item('projetos','projetos e','3');await item('projetos','aprovações','200.000');await item('pos_obra','assistência','1');
await item('terreno','itbi do terreno','150.000');await item('incorporacao','registro da inc','100.000');await item('adm_financeiro','administração central','1');
await fixo('financeiro','Impostos','4');await fixo('taxas','Taxa de gestão de obra','2');await fixo('taxas','Taxa de desenvolvimento','10');
await fixo('comercial','Comissão','4');await fixo('comercial','Marketing','1,5');await fixo('comercial','ITBI de unidades vendidas','2');
await fixo('comercial','Registro de unidades vendidas','300.000','verba');await fixo('comercial','Custo fixo comercial','50.000',null,'24');
await hd('pfp','8');await hd('dedp','5');await hd('min','3.000.000');await hd('din','1.000.000');await hd('comd','200.000');
await aba('terreno');for(const c of ['itbi_vendas','registro_vendas']){await p.locator(`[data-vb=ded][value=${c}]`).check();await p.waitForTimeout(150)}
const txt=async s=>(await p.$eval(s,e=>e.innerText)).replace(/\s+/g,' ');
await aba('obra');ok(/19\.500\.000/.test(await txt('[data-vbo=oi]'))&&/20\.540\.000/.test(await txt('[data-vbo=qt-raso]'))&&/1\.205\.400/.test(await txt('[data-vbo="qt-g-obra_nao_incidente"]'))&&/22\.815\.216/.test(await txt('[data-vbo=sh-obra]')),
  tag+' obra: típica 19,5 mi, quadro incidente 20,54 mi, não incidente 1,2054 mi (obra total 21,7454 mi), seção 22,815216 mi (como no banco)');
await aba('terreno');const pf=await txt('[data-vbo=pfis]');ok(/10/.test(pf)&&/400 m²/.test(pf)&&/6,7%/.test(pf)&&/6,2%/.test(pf),tag+' permuta física: 10 unidades, 400 m², 6,7% das unidades e 6,2% da área: '+pf);
const pfin=await txt('[data-vbo=pfin]');ok(/42\.640\.000/.test(pfin)&&/3\.284\.800/.test(pfin)&&/39\.355\.200/.test(pfin)&&/3\.148\.416/.test(pfin),tag+' permuta financeira: VGV vendido 42,64 mi, deduções 3,2848 mi, VGV líquido 39,3552 mi, 8% = 3,148416 mi: '+pfin);
const tots=[];for(const k of ['terreno','despesas','taxas','comercial','financeiro']){await aba(k);tots.push(await txt('[data-vbo=sh-'+k+']'))}
const nvt=await txt('.vb-aba[data-v=terreno] small');ok(/4,35 mi/.test(nvt)&&/9,5%/.test(nvt),tag+' botão da seção com o total e o % do VGV: '+nvt);
ok(/4\.348\.416/.test(tots[0])&&/676\.400/.test(tots[1])&&/964\.859/.test(tots[2])&&/4\.698\.000/.test(tots[3])&&/1\.705\.600/.test(tots[4]),tag+' totais: terreno 4,348 mi, despesas gerais 676,4 mil, taxas 964,9 mil, comerciais 4,698 mi, financeiras 1,7056 mi: '+tots.join(' | '));
const kp=await txt('#vb-kpis');
ok(/46,00 mi/.test(kp)&&/39,36 mi/.test(kp)&&/5,30 mi/.test(kp)&&/13,5%/.test(kp),tag+' VGV 46 mi, VGV líquido 39,36 mi, lucro 5,30 mi, margem 13,5% (o mesmo do banco): '+kp);
await aba('res');const res=await txt('#vb-res');
ok(/VGV vendido R\$\s?42\.640\.000/.test(res)&&/Deduções da receita R\$\s?3\.284\.800/.test(res)&&/Receita líquida \(VGV líquido\) R\$\s?39\.355\.200/.test(res)&&/Lucro bruto R\$\s?12\.191\.568/.test(res)
  &&/EBITDA R\$\s?7\.969\.968/.test(res)&&/Despesas financeiras R\$\s?1\.705\.600/.test(res)&&/Resultado sem as taxas R\$\s?6\.264\.368/.test(res)&&/Taxas R\$\s?964\.859/.test(res)
  &&['EBITDA','Despesas financeiras','Resultado sem as taxas','(−) Taxas','Lucro líquido (pagando'].every((x,i,a)=>i===0||res.indexOf(a[i-1])<res.indexOf(x))&&/Lucro líquido \(pagando as taxas\) R\$\s?5\.299\.509/.test(res)&&/13,47%/.test(res)&&/fora as deduzidas da receita\) R\$\s?3\.545\.200/.test(res),tag+' DRE: receita líquida 39.355.200, lucro bruto 12.191.568, EBITDA 7.969.968, financeiras 1.705.600, sem as taxas 6.264.368, taxas 964.859 por último, lucro 5.299.509,09, margem 13,47%: '+res.slice(-900));
if(modo==='desktop')await p.screenshot({path:OUT+tag+'_2dre.png'});
const inteira=async(k,nome)=>{await aba(k);await p.evaluate(()=>{const st=document.createElement('style');st.id='t-print';st.textContent='.vb-pop{position:absolute!important;bottom:auto!important;padding:0!important}.vb-pop-d{height:auto!important;border-radius:0!important}.vb-pop-sc{overflow:visible!important}';document.head.appendChild(st)});
  await p.locator('#vb-sec-'+k).screenshot({path:OUT+tag+nome});await p.evaluate(()=>document.getElementById('t-print').remove())};
// custo de capital (28/out/2026): base única Aporte (permuta financeira em dinheiro; pagamento em dinheiro do terreno), valor em %
const cp=await fixo('financeiro','Custo de capital permuta financeira','2'),cg=await fixo('financeiro','Custo de capital pagamento terreno','1');
const cap=await p.evaluate(([a,b])=>[a,b].map(id=>{const r=document.querySelector(`[data-ln="${id}"]`);return {sel:!!r.querySelector('select'),base:r.querySelector('.vb-tipo .vb-nome').innerText.replace(/\s+/g,' ').trim(),fmt:r.querySelector('[data-k=valor]').dataset.fmt,out:r.querySelector('.vb-out').innerText.replace(/\s+/g,' ')}}),[cp,cg]);
ok(cap.every(x=>!x.sel&&x.base==='Aporte'&&x.fmt==='pct')&&/62\.968/.test(cap[0].out)&&/permuta financeira em dinheiro \(R\$ 3,15 mi\)/.test(cap[0].out)&&/10\.000/.test(cap[1].out)&&/pagamento em dinheiro \(R\$ 1,00 mi\)/.test(cap[1].out),
  tag+' custo de capital: base só Aporte, valor em %; 2% da permuta financeira (3.148.416) = 62.968,32 e 1% do pagamento (1.000.000) = 10.000: '+JSON.stringify(cap));
ok(/1\.778\.568/.test(await txt('[data-vbo=sh-financeiro]')),tag+' Despesas financeiras somam o custo de capital: 1.778.568,32');
const hdA=await p.$$eval('#vb-sec-financeiro .vb-hd > span',e=>e.filter(x=>getComputedStyle(x).display!=='none').map(x=>x.textContent+':'+getComputedStyle(x).textAlign));
ok(modo!=='desktop'||hdA.join().replace('Item:start','Item:left')==='Item:left,Base de cálculo:left,Valor:left,Resultado:right',tag+' cabeçalho de Financeiras: Item à esquerda, Base e Valor à esquerda, Resultado à direita, sem a coluna Meses: '+hdA.join());
const al=async s=>p.$$eval(s,e=>e.filter(x=>getComputedStyle(x).display!=='none').map(x=>(x.textContent||'·')+':'+getComputedStyle(x).textAlign.replace('start','left')).join());
await aba('comercial');const hdC=await al('#vb-sec-comercial .vb-hd > span');await aba('tip');const hdT=await al('.vb-tips .vb-hd > span');
ok(modo!=='desktop'||(hdC==='Item:left,Base de cálculo:left,Valor:left,Meses:left,Resultado:right'&&/^Tipologia:left,.*Preço por m² \(R\$\):left,VGV:right/.test(hdT)&&!/Quantidade:right|Área privativa \(m²\):right/.test(hdT)),tag+' Comercial e Tipologias: títulos à esquerda, só o resultado à direita: '+hdC+' | '+hdT);
await aba('res');const resC=await txt('#vb-res');ok(/Custo de capital permuta financeira R\$\s?62\.968/.test(resC)&&/Custo de capital pagamento terreno R\$\s?10\.000/.test(resC),tag+' DRE detalha o custo de capital nas despesas financeiras (diretoria)');
if(tema==='claro'){await inteira('res','_2dre_inteira.png');await inteira('financeiro','_2financeiras.png')}
if(modo==='desktop'&&tema==='escuro')await inteira('financeiro','_2financeiras.png');
if(modo==='desktop'&&tema==='claro'){await inteira('tip','_2tipologias.png');await inteira('comercial','_2comercial.png');await aba('financeiro')}
await val(cp,'');await val(cg,'');
await aba('taxas');const des=await p.evaluate(()=>{const r=[...document.querySelectorAll('#vb-sec-taxas .vb-r[data-ln]')].find(r=>/desenvolvimento/.test(r.innerText));return r.innerText.replace(/\s+/g,' ')});
ok(/529\.951/.test(des)&&/lucro líquido/.test(des),tag+' taxa de desenvolvimento: 10% do lucro líquido (529.950,91)');
await aba('terreno');const sh=await txt('[data-vbo=sh-terreno]');ok(/4\.348\.416/.test(sh)&&/9,5% do VGV/.test(sh),tag+' título da seção com o total e o % do VGV: '+sh);
await aba('obra');await p.evaluate(()=>{const sc=document.querySelector('.vb-pop-sc');sc.scrollTop=sc.scrollHeight/2});await p.waitForTimeout(150);
ok(await p.evaluate(()=>Math.abs(document.querySelector('.vb-fixo').getBoundingClientRect().top-document.querySelector('.vb-pop-sc').getBoundingClientRect().top)<2&&document.querySelector('.vb-nav').getBoundingClientRect().bottom<innerHeight/2),tag+' indicadores e botões das seções ficam fixos no topo ao rolar o estudo');
await p.screenshot({path:OUT+tag+'_2fixo.png'});
await p.evaluate(()=>{const st=document.createElement('style');st.id='t-print';st.textContent='.vb-pop{position:absolute!important;bottom:auto!important;padding:0!important}.vb-pop-d{height:auto!important;border-radius:0!important}.vb-pop-sc{overflow:visible!important}';document.head.appendChild(st)});await p.evaluate(()=>window.scrollTo(0,0));
await p.screenshot({path:OUT+tag+'_2estudo.png',fullPage:true});await p.evaluate(()=>document.getElementById('t-print').remove());
await hd('min','3.500.000');const pmin=await txt('[data-vbo=pfin]');await aba('res');
ok(/mínimo garantido/.test(pmin)&&/4\.979\.887/.test(await txt('#vb-res')),tag+' abaixo do mínimo garantido, a permuta financeira usa o mínimo (lucro 4.979.887,27)');
await hd('min','3.000.000');
const cef=await fixo('comercial','Taxa de emissão de contratos CEF','500','verba_unidade');
ok(/4\.767\.000/.test(await txt('[data-vbo=sh-comercial]'))&&/138 unidades líquidas/.test(await txt(`[data-ln="${cef}"]`)),tag+' verba por unidade: 500 × 138 unidades líquidas');
await val(cef,'');
const vs=(await D()).viabs.at(-1);
ok(vs.linhas.length===18+10&&vs.deduz.length===2,tag+' linhas gravadas (18 fixas e 10 da lista) e as duas deduções');
ok(await p.evaluate(()=>{const sc=document.querySelector('.vb-pop-sc');return sc.scrollWidth<=sc.clientWidth+1&&document.scrollingElement.scrollWidth<=innerWidth+1||[sc.scrollWidth,sc.clientWidth,document.scrollingElement.scrollWidth,innerWidth,[...sc.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>sc.getBoundingClientRect().right+1).slice(0,3).map(e=>e.className).join('|')].join(',')}),tag+' sem rolagem horizontal');
await aba('obra');await p.evaluate(()=>document.querySelector('.vb-pop-sc').scrollTop=1e6);await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('.vb-passo [data-a=vb-aba]')].find(b=>/Gerais/.test(b.textContent)).click());await p.waitForTimeout(200);
ok(await p.evaluate(()=>!!document.getElementById('vb-sec-despesas')&&!document.getElementById('vb-sec-obra')&&document.querySelector('.vb-fixo').getBoundingClientRect().top>=document.querySelector('.vb-pop-sc').getBoundingClientRect().top-1),tag+' "Gerais ›" no fim de Obras leva à seção seguinte, do começo');
ok(!(await p.$('#vb-pmax')),tag+' sem o campo de preço máximo no estudo');
// vincular
await p.evaluate(()=>document.querySelector('.vb-acoes [data-a=vb-vincular]').click());await p.waitForTimeout(250);
const neg=(await D()).terrenos.find(t=>t.id===tid).neg.viab;
ok(neg.id===vs.id&&neg.margem===13.47,tag+' vincular põe o estudo na negociação (margem 13,47)');
ok(!(await p.$('.vb-acoes [data-a=vb-apagar]')),tag+' estudo vinculado não tem Apagar');
// Leitura
await p.evaluate(()=>{document.querySelector('#perfil button')?.click()});await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=role]')].find(x=>x.dataset.v==='Leitura')?.click());await p.waitForTimeout(250);
ok(await p.evaluate(()=>[...document.querySelectorAll('.vb-tab input')].every(i=>i.disabled)&&!document.querySelector('[data-a=vb-tip-add]')&&!document.querySelector('[data-a=vb-ln-add]')),tag+' Leitura vê o estudo sem editar');
const abL=await p.$$eval('#vb-pop .vb-nav .vb-aba',e=>e.map(x=>x.dataset.v).join());await aba('res');const resL=await txt('#vb-res');
ok(abL==='tip,terreno,comercial,obra,despesas,res'&&/Resultado sem as taxas/.test(resL)&&!/Impostos|Taxa de gestão|Custo de capital/.test(resL),tag+' fora da diretoria, sem as abas Financeiras e Taxas, e a DRE só com os totais delas: '+abL);
if(modo==='desktop'&&tema==='claro')await p.screenshot({path:OUT+tag+'_3leitura.png'});
await p.evaluate(()=>{document.querySelector('#perfil button')?.click()});await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=role]')].find(x=>x.dataset.v==='Diretor')?.click());await p.waitForTimeout(250);
// configuração muda a obra e o estudo acompanha
if(modo==='desktop'){
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=config]').click());await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelector('[data-a=cfg-aba][data-v=viab]').click());await p.waitForTimeout(200);
ok(await p.$$eval('.vb-cfg-r:not(.cfg-hd)',e=>e.length)===39&&await p.$('.vb-cfg-r [data-c=juros_pj][data-k=tipo]'),tag+' Configurações › Viabilidade lista os 39 itens por grupo, com o Custo de juros PJ em Despesas financeiras');
await p.fill('#vb-mmin','14');await p.press('#vb-mmin','Tab');await p.waitForTimeout(200);
ok((await D()).vbMargemMin===14,tag+' administrador define a rentabilidade mínima da empresa (14%)');
await p.screenshot({path:OUT+tag+'_4config.png',fullPage:true});
await p.locator('[data-ch=cfg-vd][data-c=registro_vendas][data-k=deduz]').uncheck();await p.waitForTimeout(200);
const n2=(await D()).terrenos.find(t=>t.id===tid).neg.viab;
ok(n2.lucro===5277690.91&&n2.margem===13.31,tag+' registro das vendas deixa de sair do VGV: o estudo vinculado se refaz (lucro 5.277.690,91, margem 13,31, como no banco)');
ok(await p.locator('[data-ch=cfg-vd][data-c=comissao][data-k=grupo]').isDisabled(),tag+' item usado em estudo não muda de grupo');
await p.evaluate(()=>document.querySelectorAll('.if-abre').forEach(b=>b.click()));await p.fill('#vd-n','Prêmio de vendas');await p.selectOption('#vd-g','comercial');await p.evaluate(()=>document.querySelector('[data-form=vb-cfg-nova]').requestSubmit());await p.waitForTimeout(200);
ok((await D()).viabDesp.some(d=>d.nome==='Prêmio de vendas'&&d.grupo==='comercial'&&d.tipo==='pct_vgv'),tag+' item novo entra no grupo, com a primeira base aceita');
}
// volta para a ficha: aba Estudos de viabilidade com o resumo do estudo (saiu da Visão geral em 3/nov/2026)
await ficha();
await p.evaluate(()=>{const b=document.querySelector('.fi-abas [data-t=viabilidade]');b&&b.getAttribute('aria-selected')!=='true'&&b.click()});await p.waitForTimeout(300);
const rv=await p.evaluate(()=>[...document.querySelectorAll('.sec')].find(s=>/Resumo da viabilidade/.test(s.innerText))?.innerText.replace(/\s+/g,' '));
ok(/VGV líquido/.test(rv)&&/Lucro líquido/.test(rv)&&/Margem líquida/.test(rv),tag+' Visão geral mostra VGV líquido, lucro e margem do estudo vinculado');
ok(/Rentabilidade abaixo da mínima/.test(rv)&&!/Preço máximo/.test(rv),tag+' estudo válido abaixo da margem mínima acende o aviso na Visão geral (sem preço máximo)');
const nv=(await D()).viabs.filter(v=>v.tid===tid);const sel=p.locator('[data-ch=vb-valido]').first();
ok(await sel.locator('option').count()===nv.length,tag+' Visão geral lista todos os estudos do terreno ('+nv.length+') para escolher o válido');
await sel.selectOption(nv[0].id);await p.waitForTimeout(200);
if(tag==='desktop_claro'){await p.evaluate(()=>document.querySelector('.vb-escolha').scrollIntoView({block:'center'}));await p.waitForTimeout(150);await p.screenshot({path:OUT+tag+'_5valido.png'})}
ok((await D()).terrenos.find(t=>t.id===tid).neg.viab.id===nv[0].id,tag+' escolher outro estudo na Visão geral o torna o válido');
await p.evaluate(()=>document.querySelector('.vb-escolha [data-a=vb-abrir]').click());await p.waitForTimeout(250);
ok(await p.$('#vb-pop'),tag+' Abrir estudo abre o popup pela ficha');
await p.keyboard.press('Escape');await p.waitForTimeout(150);ok(!(await p.$('#vb-pop')),tag+' Esc fecha o popup');
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\ntudo ok');process.exit(errs.length?1:0)})();
