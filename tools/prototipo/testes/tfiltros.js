// Filtros de terrenos: gaveta à direita (tela cheia no celular), a mesma seleção em Terrenos, Mapa e Fases,
// chips com X, Limpar, contagem por opção, campos que dependem de outro (etapa da fase, região da cidade),
// faixa com "Incluir sem informação", visões salvas, filtro no endereço da página, Esc, ficha do mapa
// fecha a gaveta e temperatura só no terreno (parte sem temperatura). Claro, escuro e celular.
const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_filtros',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');const O=TMP+'t_filtros/';
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch();const erros=[];
async function abre(w,h,tema){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5,hasTouch:w<700});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();sessionStorage.clear();if(t)localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(300);return {p,ctx}}
const nav=async(p,r)=>{await p.evaluate(r=>document.querySelector(`[data-a=nav][data-r=${r}]`).click(),r);await p.waitForTimeout(250)};
const clica=async(p,s)=>{await p.evaluate(s=>{const e=document.querySelector(s);if(!e)throw new Error('sem '+s);e.click()},s);await p.waitForTimeout(200)};
const op=async(p,k,v)=>clica(p,`#fx-dr [data-a=fx-op][data-k=${k}][data-v="${v}"]`);
const txt=(p,s)=>p.evaluate(s=>[...document.querySelectorAll(s)].filter(x=>x.offsetParent||x.closest('#fx-dr')).map(x=>x.textContent.trim().replace(/\s+/g,' ')).join(' | '),s);
const conta=(p,s)=>p.evaluate(s=>document.querySelectorAll(s).length,s);
const linhas=p=>p.evaluate(()=>[...document.querySelectorAll('#rows [data-a=abrir]')].map(x=>x.dataset.id).filter((v,i,a)=>a.indexOf(v)===i));
const estado=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
let {p,ctx}=await abre(1440,900);
await nav(p,'terrenos');
const S0=await estado(p);const naoArq=S0.terrenos.filter(t=>t.situacao!=='arquivado');
ok(await conta(p,'.fchip')===0&&await conta(p,'#fx-barra .fx-btn')===1,'Terrenos: os chips antigos saíram; botão Filtros na barra');
ok((await linhas(p)).length===naoArq.length,`sem filtro, todos os terrenos não arquivados (${naoArq.length})`);
await clica(p,'[data-a=fx-abrir]');
ok(await conta(p,'#fx-dr')===1&&(await txt(p,'#fx-dr .fx-sh')).includes('Comercial'),'botão abre a gaveta com os grupos');
ok(!(await txt(p,'#fx-dr .fx-sb')).includes('Testada')&&!(await txt(p,'#fx-dr')).includes('CA máximo'),'sem testada nem CA (decisão do Moisés)');
ok((await txt(p,'#fx-dr')).includes('Marque uma fase para escolher as etapas'),'etapa só depois de escolher a fase');
await op(p,'fase','novos_negocios');
ok(await conta(p,'#fx-dr [data-k=etapa]')>=4,'marcar a fase abre as etapas dela');
const nNeg=await p.evaluate(()=>document.querySelector('#fx-dr [data-k=etapa][data-v="novos_negocios:negociacao"] .q').textContent);
await op(p,'etapa','novos_negocios:negociacao');
let ids=await linhas(p);const S1=await estado(p);
ok(ids.length===Number(nNeg)&&ids.every(id=>{const t=S1.terrenos.find(x=>x.id===id);return t.neg&&t.neg.etapa==='negociacao'&&['ativo','stand_by'].includes(t.neg.status)}),`etapa Negociação: ${ids.length} linhas, igual ao número ao lado da opção`);
ok((await txt(p,'#fx-barra .fx-chip')).includes('Etapa: Negociação'),'chip da etapa na barra');
ok(await p.evaluate(()=>decodeURIComponent(location.hash).includes('"etapa"')),'o endereço da página leva o filtro');
await p.screenshot({path:O+'1_terrenos_gaveta.png'});
// temperatura e preço
await op(p,'temp','4');await op(p,'temp','5');
ids=await linhas(p);ok(ids.length>0&&ids.every(id=>(S1.terrenos.find(x=>x.id===id).neg.temp||0)>=4),'temperatura 4 ou 5 (opções somam)');
await p.evaluate(()=>{const i=document.querySelector('#fx-dr [data-fx=preco][data-p=max]');i.value='9 mi';i.dispatchEvent(new Event('change',{bubbles:true}))});await p.waitForTimeout(250);
ids=await linhas(p);
ok(ids.every(id=>{const t=S1.terrenos.find(x=>x.id===id),o=t.ofertas.find(z=>z.id===t.neg?.ofRef)||t.ofertas[0];return o&&o.valor<=9e6}),'preço pedido até "9 mi"');
ok((await txt(p,'#fx-barra .fx-chip')).includes('até R$ 9'),'chip do preço com o valor');
// cidade abre a região
ok(!(await conta(p,'#fx-dr [data-k=zona]')),'região só com uma cidade marcada');
await op(p,'cidade','São Paulo');ok(await conta(p,'#fx-dr [data-k=zona]')>0,'marcada a cidade, aparece a região');
// X no chip tira só aquele
const antes=await conta(p,'#fx-barra .fx-chip');await clica(p,'#fx-barra [data-a=fx-tira][data-v=temp]');
ok(await conta(p,'#fx-barra .fx-chip')===antes-1&&!(await txt(p,'#fx-barra .fx-chip')).includes('Muito quente'),'X no chip tira só aquele filtro');
// salvar visão
await clica(p,'#fx-dr [data-a=fx-salvar]');await p.fill('#fxs-n','Negociação em SP');await p.evaluate(()=>document.querySelector('#f-fxs').requestSubmit());await p.waitForTimeout(250);
ok((await p.evaluate(()=>document.querySelector('[data-ch=fx-visao]').textContent)).includes('Negociação em SP'),'visão salva aparece no seletor');
const comFiltro=(await linhas(p)).length;
await clica(p,'#fx-barra [data-a=fx-limpar]');ok((await linhas(p)).length===naoArq.length&&!(await conta(p,'#fx-barra .fx-chip')),'Limpar tira todos os filtros');
await p.evaluate(()=>{const s=document.querySelector('[data-ch=fx-visao]');s.value=[...s.options].find(o=>o.textContent.includes('Negociação em SP')).value;s.dispatchEvent(new Event('change',{bubbles:true}))});await p.waitForTimeout(250);
ok((await linhas(p)).length===comFiltro,'escolher a visão volta aos filtros dela');
// Mapa: mesma seleção
await nav(p,'mapa');await p.waitForTimeout(300);
ok(!(await conta(p,'#mp-cor'))&&!(await conta(p,'#mp-zona')),'Mapa: seletores Corretor e Região saíram para o painel');
const nMapa=await conta(p,'#mp-lista .mp-it');ok(nMapa===comFiltro,`Mapa usa os mesmos filtros (${nMapa} na lista)`);
ok(await conta(p,'#fx-dr')===1,'a gaveta continua aberta ao trocar de página');
await p.screenshot({path:O+'2_mapa_gaveta.png'});
await p.evaluate(()=>document.querySelector('#mp-lista [data-a=fs-abrir]').click());await p.waitForTimeout(300);
ok(await conta(p,'#ficha-sheet')===1&&!(await conta(p,'#fx-dr')),'abrir a ficha no mapa fecha a gaveta');
await clica(p,'[data-a=fs-fechar]');await clica(p,'[data-a=fx-abrir]');ok(await conta(p,'#fx-dr')===1&&!(await conta(p,'#ficha-sheet')),'abrir a gaveta fecha a ficha');
// Fases: a descida é o filtro do funil
await nav(p,'negociacoes');
ok((await txt(p,'#fx-dr')).includes('vêm da navegação')&&!(await conta(p,'#fx-dr [data-k=fase]')),'Fases: no quadro, fase e etapa vêm da navegação');
ok(!(await txt(p,'#fx-barra .fx-chip')).includes('Etapa'),'Fases: o chip da etapa não vale no quadro');
await op(p,'temp','5');
const kt=await p.evaluate(()=>[...document.querySelectorAll('#board .kcard')].map(k=>k.dataset.id));const S2=await estado(p);
ok(kt.length>0&&kt.every(id=>S2.terrenos.find(t=>t.id===id).neg?.temp===5),'Fases: temperatura filtra os cards');
await p.screenshot({path:O+'3_kanban_gaveta.png'});
await p.keyboard.press('Escape');await p.waitForTimeout(150);ok(!(await conta(p,'#fx-dr')),'Esc fecha a gaveta');
// partes: sem temperatura por parte
await clica(p,'#fx-barra [data-a=fx-limpar]');await nav(p,'terrenos');
await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Ibitirama')).click());await p.waitForTimeout(400);
await p.evaluate(()=>{const b=document.querySelector('[data-a=bloco][data-t=negociacao]');if(b&&b.getAttribute('aria-expanded')!=='true')b.click()});await p.waitForTimeout(250);
ok(await conta(p,'.pt-card')>=3&&!(await txt(p,'.pt-card')).includes('Temperatura'),'parte sem temperatura: é uma só, a da negociação do terreno');
await ctx.close();
// endereço com filtro abre já filtrado
({p,ctx}=await abre(1440,900));
await p.evaluate(()=>{location.hash='f='+encodeURIComponent(JSON.stringify({temp:['5']}))});await p.reload();await p.waitForTimeout(300);await nav(p,'terrenos');
ok((await txt(p,'#fx-barra .fx-chip')).includes('Muito quente'),'link com o filtro abre já filtrado');await ctx.close();
// escuro e celular
({p,ctx}=await abre(1440,900,'escuro'));await nav(p,'terrenos');await clica(p,'[data-a=fx-abrir]');await op(p,'fase','novos_negocios');await p.screenshot({path:O+'4_escuro.png'});await ctx.close();
({p,ctx}=await abre(390,844));await nav(p,'terrenos');await clica(p,'[data-a=fx-abrir]');
const lw=await p.evaluate(()=>document.querySelector('#fx-dr').getBoundingClientRect().width);ok(lw===390,'celular: gaveta em tela cheia');
await op(p,'fase','novos_negocios');await p.screenshot({path:O+'5_celular.png'});
ok((await txt(p,'#fx-dr .fx-f .btn.primary')).startsWith('Ver '),'celular: botão "Ver N terrenos" no rodapé');
await clica(p,'#fx-dr .fx-f .btn.primary');ok(!(await conta(p,'#fx-dr')),'"Ver N terrenos" fecha a gaveta');
const sx=await p.evaluate(()=>document.documentElement.scrollWidth);ok(sx<=390,'celular: sem rolagem horizontal');
await p.screenshot({path:O+'6_celular_barra.png'});await ctx.close();
ok(!erros.length,'sem erros de página'+(erros.length?': '+erros.join(' / '):''));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
