// Parâmetros urbanísticos por lote e zona: quadro por lote com os parâmetros do catálogo, seletor de tipo
// (mercado, HIS, HMP) e potencial construtivo, exceção do lote só com fonte, parte sem inscrição, SJC pela
// macrozona, catálogo editado em Configurações e Leitura sem botões. Prints em saida/t_zonas.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_zonas/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
const KEY='bkm-terrenos-prototipo-v9';
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://')&&!u.includes('/dados/'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
const abrir=async nome=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(200);
  await p.evaluate(n=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes(n)).click(),nome);await p.waitForTimeout(500);
  await p.evaluate(()=>{const b=document.querySelector('[data-a=bloco][data-t=urbanismo]');b&&b.getAttribute('aria-expanded')!=='true'&&b.click()});await p.waitForTimeout(300)};
const res=()=>p.evaluate(()=>document.querySelector('.lz-res')?.innerText.replace(/\s+/g,' ')||'');
const tipo=async v=>{await p.evaluate(v=>document.querySelector(`#sec-analise [data-a=zn-tipo][data-v=${v}]`).click(),v);await p.waitForTimeout(150)};
const toast=()=>p.evaluate(()=>document.querySelector('.toast')?.innerText||'');
await p.evaluate(k=>{const d=JSON.parse(localStorage.getItem(k));const t=d.terrenos.find(t=>t.nome.includes('Cupecê'));
  t.insc[0].geo=[{em:'2026-10-25 10:00',user:'Moisés',lote:{},poly:null,areaPol:1920,zonas:[],erros:['drenagem'],camadas:{patrimonio_cultural_area_envoltoria_CONPRESP:[{nm_area:'Igreja do Carmo',tx_resolucao_conpresp:'Res. 05/2018'}],pde2014_v_eetr_03_map_v2:[{nm_perimetro_divisao_pde:'Eixo Cupecê'}]}}];
  localStorage.setItem(k,JSON.stringify(d))},KEY);await p.reload();await p.waitForTimeout(400);
await abrir('Cupecê');
const cam=await p.$eval('#sec-analise .lz-cam',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');
ok(/Demais parâmetros e restrições/.test(cam)&&/Área envoltória Conpresp Igreja do Carmo \(Res\. 05\/2018\)/.test(cam)&&/Eixo de estruturação Eixo Cupecê/.test(cam)&&/Não responderam nesta consulta: Córrego/.test(cam),tag+' camadas do GeoSampa no lote: '+cam.slice(0,200));
await p.evaluate(()=>document.querySelector('#sec-analise .lz-cam')?.scrollIntoView({block:'center'}));await p.screenshot({path:OUT+tag+'_0camadas.png'});
const zs=()=>p.$$eval('#sec-analise .lz-z',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
const lin=await zs();
ok(lin.length===2&&/^ZEU/.test(lin[0])&&/Gabarito Sem limite/.test(lin[0])&&/^ZM/.test(lin[1])&&/Gabarito 28 m/.test(lin[1]),tag+' quadro do lote com ZEU (sem limite) e ZM (28 m)');
ok(/Recuo de frente 5 m/.test(lin[1])&&/Recuos laterais e de fundo Dispensado até 10 m de altura; 3 m acima/.test(lin[1])&&/Lote mínimo 125 m²/.test(lin[1])&&/Frente mínima 5 m/.test(lin[1])&&/CA mínimo 0,3/.test(lin[1]),tag+' ZM com recuos, lote e frente mínimos e CA mínimo: '+lin[1].slice(0,300));
ok(/Cota-parte máxima 20 m² por unidade/.test(lin[0])&&/até 70 unidades/.test(lin[0]),tag+' ZEU com cota-parte (1.400 ÷ 20 = 70 unidades)');
ok(!!(await p.$('#sec-analise .lz-ni')),tag+' tipo não informado: aviso e Mercado só como referência');
const vg=await p.evaluate(()=>[...document.querySelectorAll('.kv')].find(x=>x.querySelector('dt')?.textContent==='Zoneamento')?.innerText||'');
ok(/ZEU \/ ZM/.test(vg)&&!/CA/.test(vg),tag+' Visão geral só com as zonas, separadas por barra: '+vg.replace(/\s+/g,' '));
ok(/ZEU 1\.400 m² · ZM 520 m²/.test(await res())&&/6\.640 m²/.test(await res()),tag+' mercado: zonas da área e potencial 1.400×4 + 520×2 = 6.640 m²');
await p.evaluate(()=>document.querySelector('#sec-analise').scrollIntoView({block:'start'}));await p.screenshot({path:OUT+tag+'_1mercado.png'});
await tipo('his');ok(/9\.960 m²/.test(await res())&&!(await p.$('#sec-analise .lz-ni')),tag+' HIS: 1.400×6 + 520×3 = 9.960 m²');
ok(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).terrenos.find(t=>t.nome.includes('Cupecê')).hist.some(h=>h.txt==='Tipo do empreendimento: não informado → HIS'),KEY),tag+' tipo gravado no terreno, com log');
await tipo('hmp');ok(/8\.300 m²/.test(await res()),tag+' HMP: 1.400×5 + 520×2,5 = 8.300 m²');
await p.screenshot({path:OUT+tag+'_2hmp.png'});await tipo('mercado');
// exceção do lote
await p.evaluate(()=>[...document.querySelectorAll('#sec-analise [data-a=edit]')].find(x=>/Alterar valores/.test(x.textContent)&&x.closest('.lz-z').innerText.startsWith('ZM')).click());await p.waitForTimeout(200);
await p.fill('#sec-analise form[data-form=zexc] [name=ca]','2,5');await p.evaluate(()=>document.querySelector('#sec-analise form[data-form=zexc]').requestSubmit());await p.waitForTimeout(200);
ok(/fonte/i.test(await toast()),tag+' alteração sem fonte é recusada: '+await toast());
await p.fill('#sec-analise form[data-form=zexc] [name=fonte]','Consulta prévia 2026/123');await p.evaluate(()=>document.querySelector('#sec-analise form[data-form=zexc]').requestSubmit());await p.waitForTimeout(300);
ok(/6\.900 m²/.test(await res())&&(await zs())[1].includes('valores alterados no lote'),tag+' valor alterado vale por cima do catálogo: 1.400×4 + 520×2,5 = 6.900 m²');
await p.evaluate(()=>[...document.querySelectorAll('#sec-analise [data-a=edit]')].find(x=>/Editar valores/.test(x.textContent)&&x.closest('.lz-z').innerText.startsWith('ZM')).click());await p.waitForTimeout(200);
await p.fill('#sec-analise form[data-form=zexc] [name=recuo_frente_m]','0');await p.fill('#sec-analise form[data-form=zexc] [name=permeabilidade]','20');await p.selectOption('#sec-analise form[data-form=zexc] [name=outorga_gratuita]','1');
if(modo==='desktop')await p.screenshot({path:OUT+tag+'_2b_alterar.png'});
await p.evaluate(()=>document.querySelector('#sec-analise form[data-form=zexc]').requestSubmit());await p.waitForTimeout(300);
{const zm=(await zs())[1];ok(/Recuo de frente 0 m alterado no lote/.test(zm)&&/Permeabilidade mínima 20% alterado no lote/.test(zm)&&/Outorga onerosa Gratuita alterado no lote/.test(zm)&&/CA máximo 2,5 alterado no lote/.test(zm)&&/Lote mínimo 125 m²/.test(zm),tag+' recuo, permeabilidade e outorga alterados no lote; o resto segue o catálogo: '+zm+' | '+await toast())}
// parte sem inscrição
if(modo==='desktop'){await p.evaluate(()=>document.querySelector('#sec-analise [data-a=edit][data-s=analise]').click());await p.waitForTimeout(200);
  await p.selectOption('#sec-analise form[data-form=analise] [name=lote]','');await p.fill('#sec-analise form[data-form=analise] [name=fonte]','Poligonal do terreno');
  await p.selectOption('#sec-analise form[data-form=analise] [name=sigla0]','ZM');await p.fill('#sec-analise form[data-form=analise] [name=area0]','45');
  await p.evaluate(()=>document.querySelector('#sec-analise form[data-form=analise]').requestSubmit());await p.waitForTimeout(300);
  const lotes=await p.$$eval('#sec-analise .lz-lote .lz-h',e=>e.map(x=>x.innerText));
  ok(lotes.length===2&&/SQL 089\.123\.0045-6/.test(lotes[0])&&/Parte sem inscrição/.test(lotes[1]),tag+' parte sem inscrição vira um quadro próprio: '+lotes.join(' | '));
  ok(/ZM 565 m²/.test(await res())&&(await p.$$eval('#sec-analise .lz-lote',e=>e[0].querySelectorAll('.lz-z').length))===2,tag+' o lote da inscrição fica como estava (ZM soma 520 + 45)');
  const st=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).terrenos.find(t=>t.nome.includes('Cupecê')).analises.filter(a=>a.status==='vigente')[0].zonas.find(z=>z.sigla==='ZM'&&z.ins).exc,KEY);
  ok(st&&st.ca===2.5,tag+' exceção do lote continua na análise nova');
  await p.screenshot({path:OUT+tag+'_3sem_inscricao.png'})}
// SJC: CA pela macrozona
await p.evaluate(k=>{const d=JSON.parse(localStorage.getItem(k));const t=d.terrenos.find(t=>t.nome.includes('Cupecê'));t.municipio='São José dos Campos · SP';t.insc=[{mun:'sjc',sql:'41.0024.0011.0000',area:1920,valores:[]}];t.analises=[];localStorage.setItem(k,JSON.stringify(d))},KEY);
await p.reload();await p.waitForTimeout(400);await abrir('Cupecê');
await p.evaluate(()=>document.querySelector('#sec-analise [data-a=edit][data-s=analise]').click());await p.waitForTimeout(200);
await p.fill('#sec-analise form[data-form=analise] [name=fonte]','GeoSanja');await p.selectOption('#sec-analise form[data-form=analise] [name=sigla0]','ZM3');
await p.fill('#sec-analise form[data-form=analise] [name=area0]','1920');await p.selectOption('#sec-analise form[data-form=analise] [name=macro0]','ME');
await p.evaluate(()=>document.querySelector('#sec-analise form[data-form=analise]').requestSubmit());await p.waitForTimeout(300);
const sj=await zs();
ok(/Estruturação/.test(sj[0])&&/CA básico 1,3/.test(sj[0])&&/CA máximo 2\b/.test(sj[0])&&/3\.840 m²/.test(await res()),tag+' SJC: ZM3 na Estruturação tem CA 2 (1.920×2 = 3.840 m²): '+sj[0]);
await tipo('his');const sjh=(await zs())[0];
ok(/3\.840 m²/.test(await res())&&/Outorga onerosa Gratuita/.test(sjh)&&/A validar/.test(sjh),tag+' SJC: HIS com o mesmo CA, outorga gratuita e a validar: '+sjh);
await p.evaluate(()=>document.querySelector('#sec-analise').scrollIntoView({block:'start'}));await p.screenshot({path:OUT+tag+'_4sjc.png'});
await tipo('mercado');
// catálogo em Configurações muda a ficha
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=config]')?.click());await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelector('[data-a=cfg-aba][data-v=zonas]').click());await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelector('[data-a=zp-cid][data-v=sjc]').click());await p.waitForTimeout(200);
const sel='tr:has(td b:text-is("ZM3")):has(td:text-is("RV1 · Estruturação")) input[data-k=ca_maximo]';
ok(await p.$eval(sel,e=>e.value)==='2',tag+' Configurações mostra o CA máximo da ZM3 RV1 na Estruturação: 2');
await p.screenshot({path:OUT+tag+'_5config.png'});
await p.fill(sel,'0');await p.$eval(sel,e=>e.dispatchEvent(new Event('change',{bubbles:true})));await p.waitForTimeout(200);
ok(/maior que zero/.test(await toast()),tag+' CA zero é recusado no catálogo');
for(const s of ['tr:has(td b:text-is("ZM3")):has(td:text-is("RV2 · Estruturação")) input[data-k=ca_maximo]',sel]){await p.fill(s,'2,5');await p.$eval(s,e=>e.dispatchEvent(new Event('change',{bubbles:true})));await p.waitForTimeout(200)}
await abrir('Cupecê');ok(/4\.800 m²/.test(await res()),tag+' ficha usa o catálogo editado (1.920×2,5 = 4.800 m²)');
// Leitura
await p.evaluate(()=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector('[data-a=role][data-v=Leitura]').click()});await p.waitForTimeout(200);
ok(!(await p.$('#sec-analise [data-a=edit]')),tag+' Leitura não registra zonas nem exceção');
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\ntudo ok');process.exit(errs.length?1:0)})();
