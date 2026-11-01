// Visibilidade por cartão (bloco 3): Público, Individual e Restrito ao criar (marcado com a última escolha), o individual some para o gestor
// e o diretor e aparece para o administrador, pôr outra pessoa o torna restrito, grupos liberam (papel acima do sistema), exceção,
// grupos em Configurações › Equipe; prints em claro, escuro e celular.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_visib')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const est=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{let el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el&&window.__tkAcha)el=window.__tkAcha(s,t);if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{let el=document.querySelector(s);if(!el&&window.__tkAcha)el=window.__tkAcha(s);if(!el)throw new Error('não achei '+s);if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===v)){const o=[...el.options].find(o=>o.textContent.includes(v));if(o)v=o.value}el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const preenche=(p,sel,v)=>p.evaluate(([s,v])=>{let el=document.querySelector(s);if(!el&&window.__tkAcha)el=window.__tkAcha(s);if(!el)throw new Error('não achei '+s);el.value=v},[sel,v]);
const envia=(p,sel)=>p.evaluate(s=>{let f=document.querySelector(s);if(!f&&window.__tkAcha)f=window.__tkAcha(s);if(!f)throw new Error('não achei '+s);f.requestSubmit()},sel);
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
const ficha=(p,id)=>p.evaluate(id=>{const a=document.createElement('button');a.dataset.a='abrir';a.dataset.id=id;a.dataset.tab='tarefas';document.body.appendChild(a);a.click();a.remove();document.querySelector('#bl-tarefas [data-a=cr-vista][data-v=quadro][aria-pressed=false]')?.click()},id);  // roteiro escrito sobre o quadro; a ficha abre na Lista
const toast=p=>p.evaluate(()=>document.querySelector('.toast')?.textContent||'');
const tar=(s,i,tit)=>s.terrenos[i].tarefas.find(k=>k.titulo===tit);
const addD=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const TK_ACHA=()=>{window.__tkAcha=(s,t)=>{for(const v of [...document.querySelectorAll('#modal [data-a=tkc-aba]')].map(x=>x.dataset.v)){document.querySelector(`#modal [data-a=tkc-aba][data-v=${v}]`)?.click();const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(el)return el}return null}};  // cartão com abas: procura o elemento nas abas
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();await p.addInitScript(TK_ACHA);p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
const abreCartao=async(p,tit)=>{await clica(p,'.tk',tit);await p.waitForTimeout(250)};
const fecha=async p=>{await clica(p,'#modal [data-a=close]');await p.waitForTimeout(150)};
const lista=(s,i,k)=>s.terrenos[i].listas.find(l=>l.id===k.lista);
const noQuadro=(p,tit)=>p.evaluate(t=>!![...document.querySelectorAll('.tk')].find(x=>x.getAttribute('aria-label')===t),tit);
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0];await ficha(p,t0.id);await p.waitForTimeout(400);
ok(await noQuadro(p,'Rascunho da contraproposta'),'o administrador do sistema vê o cartão individual de outra pessoa');
ok(await p.$eval('.tk[aria-label="Rascunho da contraproposta"]',x=>!!x.querySelector('.tk-b[title=Individual]')),'o cartão individual mostra o cadeado na frente');
await papel(p,'Gestor');await p.waitForTimeout(250);
ok(!(await noQuadro(p,'Rascunho da contraproposta')),'o gestor não vê o individual do analista');
ok(await noQuadro(p,'Pedir certidão de uso do solo'),'quem criou o restrito o vê');
await abreCartao(p,'Pedir certidão de uso do solo');await p.click('#tkc-d');await p.keyboard.type(' @');await p.waitForTimeout(200);
const lst=await p.evaluate(()=>[...document.querySelectorAll('#mn-pop .mn-n')].map(x=>x.textContent));
ok(lst.includes('Camila Torres')&&lst.includes('Lúcia Mendes')&&!lst.includes('Rafael Souza'),'a lista do @ só traz quem vê o cartão restrito: '+lst.join(', '));
await p.screenshot({path:O+'0_mencao.png'});
await p.keyboard.press('Escape');await p.keyboard.type('rafael.souza ');await p.evaluate(()=>document.querySelector('#tkc-d').blur());await p.waitForTimeout(250);
s=await est(p);ok((tar(s,0,'Pedir certidão de uso do solo').desc||'').includes('@rafael.souza')&&!s.notifs.some(n=>n.para==='Rafael Souza'&&n.tipo==='mencao'&&n.txt.includes('certidão de uso')),'@ digitado à mão para quem não vê o cartão não avisa');
await fecha(p);
await papel(p,'Leitura');await p.waitForTimeout(250);
ok(await noQuadro(p,'Pedir certidão de uso do solo')&&!(await noQuadro(p,'Rascunho da contraproposta')),'o grupo liberado (Jurídico) vê o restrito; o individual não aparece');
await abreCartao(p,'Pedir certidão de uso do solo');
ok(await p.$eval('.tkm-tit',x=>!x.disabled),'liberada como editora, a pessoa de Leitura edita aquele cartão');await fecha(p);
await papel(p,'Analista');await p.waitForTimeout(250);
ok(!(await noQuadro(p,'Pedir certidão de uso do solo'))&&await noQuadro(p,'Rascunho da contraproposta'),'o analista vê o próprio individual e não vê o restrito de que não faz parte');
// nova tarefa: a escolha é obrigatória
await clica(p,'[data-a=tk-nova]');await p.waitForTimeout(200);await clica(p,'[data-a=fm-mais]');await p.waitForTimeout(200);
ok(await p.evaluate(()=>![...document.querySelectorAll('#f-tk input[name=vis]')].some(x=>x.checked)&&document.querySelector('#f-tk input[name=vis]').required),'na primeira vez, nenhuma visibilidade vem marcada e a escolha é obrigatória');
await preenche(p,'#tm-t','Negociar comissão do corretor');await envia(p,'#f-tk');await p.waitForTimeout(200);
s=await est(p);ok(!s.terrenos[0].tarefas.some(k=>k.titulo==='Negociar comissão do corretor'),'sem escolher a visibilidade, não cria');
await p.evaluate(()=>{document.querySelector('#f-tk input[name=vis][value=restrito]').checked=true});await p.waitForTimeout(100);
ok(await p.$eval('.vz-lib',x=>getComputedStyle(x).display!=='none'),'Restrito abre a lista de quem liberar');
await p.evaluate(()=>{document.querySelector('#f-tk input[name=lib][value="Camila Torres"]').checked=true});
await p.screenshot({path:O+'1_nova.png'});
await envia(p,'#f-tk');await p.waitForTimeout(300);
s=await est(p);let k=tar(s,0,'Negociar comissão do corretor');
ok(k&&k.vis==='restrito'&&k.acessos.some(a=>a.u==='Camila Torres'),'cria restrito, liberado para quem foi marcado');await fecha(p);
await clica(p,'[data-a=tk-nova]');await p.waitForTimeout(200);
ok(await p.$eval('#f-tkr input[name=vis][value=restrito]',x=>x.checked),'na próxima, vem marcada a última escolha da pessoa');await fecha(p);
// pôr outra pessoa no individual o torna restrito
await abreCartao(p,'Rascunho da contraproposta');await muda(p,'#tkc-sol','Ana Prado');await p.waitForTimeout(250);
s=await est(p);ok(tar(s,0,'Rascunho da contraproposta').vis==='restrito'&&(await toast(p)).includes('Restrito'),'pôr outra pessoa no individual o torna restrito, com aviso');
// quem vê: grupo como comentarista e exceção
await clica(p,'[data-a=vz-abrir]');await p.waitForTimeout(150);
const gj=s.grupos.find(g=>g.nome==='Jurídico').id;await muda(p,'[data-form=vz-add] select[name=quem]','g:'+gj);await muda(p,'[data-form=vz-add] select[name=papel]','comentarista');await envia(p,'[data-form=vz-add]');await p.waitForTimeout(200);
await muda(p,'[data-form=vz-exc] select[name=quem]','Camila Torres');await envia(p,'[data-form=vz-exc]');await p.waitForTimeout(200);
s=await est(p);k=tar(s,0,'Rascunho da contraproposta');
ok(k.acessos.some(a=>a.g===gj&&a.papel==='comentarista')&&k.acessos.some(a=>a.u==='Camila Torres'&&a.excl),'quem administra o cartão libera um grupo e tira uma pessoa dele');
await p.evaluate(()=>document.querySelector('.vz-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'2_quem_ve.png'});await fecha(p);
await papel(p,'Gestor');await p.waitForTimeout(250);
ok(await noQuadro(p,'Rascunho da contraproposta'),'o gestor, agora no cartão, passa a vê-lo');
await abreCartao(p,'Rascunho da contraproposta');ok(!(await p.$('[data-a=vz-abrir]')),'quem só está no cartão não muda quem vê');await fecha(p);
await papel(p,'Leitura');await p.waitForTimeout(250);await abreCartao(p,'Rascunho da contraproposta');
ok(await p.$eval('.tkm-tit',x=>x.disabled)&&!!(await p.$('[data-form=tkc-com]')),'comentarista comenta mas não edita');await fecha(p);
await p.screenshot({path:O+'3_quadro_leitura.png'});
// grupos em Configurações › Equipe
await papel(p,'Diretor');await p.evaluate(()=>history.replaceState(null,'','#/configuracoes/funil'));await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=cfg-aba][data-v=equipe]').click());await p.waitForTimeout(200);
await preenche(p,'[data-form=vz-g-novo] input','Engenharia');await envia(p,'[data-form=vz-g-novo]');await p.waitForTimeout(200);
s=await est(p);ok(s.grupos.some(g=>g.nome==='Engenharia'),'o administrador cria grupo em Configurações › Equipe');
await p.evaluate(()=>[...document.querySelectorAll('.vz-g')].at(-1).scrollIntoView({block:'center'}));await p.screenshot({path:O+'4_grupos.png'});
await ctx.close()}
{const {ctx,p}=await abre(1440,900,'escuro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Pedir certidão de uso do solo');await clica(p,'[data-a=vz-abrir]');await p.waitForTimeout(150);await p.evaluate(()=>document.querySelector('.vz-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'5_escuro.png'});await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Pedir certidão de uso do solo');await clica(p,'[data-a=vz-abrir]');await p.waitForTimeout(150);await p.evaluate(()=>document.querySelector('.vz-bloco').scrollIntoView({block:'start'}));
ok(await p.evaluate(()=>{const d=document.querySelector('#modal .dialog');return d.scrollWidth<=d.clientWidth+1}),'celular: o cartão não rola de lado');
await p.screenshot({path:O+'6_celular.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
