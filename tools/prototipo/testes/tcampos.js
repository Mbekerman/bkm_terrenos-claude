// Campos personalizados (bloco 4): frente do cartão, bloco no cartão (lista, número com "270 mil", sim/não com "Não" ≠ não informado),
// Leitura só vê, filtro na página Tarefas, Configurações › Tarefas (criar, opções, tipo travado com valor, desativar); prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_campos')+'/';fs.mkdirSync(O,{recursive:true});
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
const chips=(p,tit)=>p.evaluate(t=>{const c=[...document.querySelectorAll('.tk')].find(x=>x.getAttribute('aria-label')===t);return c?[...c.querySelectorAll('.cpo-ch')].map(x=>x.textContent.replace(/\s+/g,' ').trim()):null},tit);
const incluir=async(p,dest)=>{if(!(await p.$('#modal [data-a=fm-nova]'))){await clica(p,'#modal [data-a=fm-modo][data-v=montar]');await p.waitForTimeout(100)}await clica(p,'#modal [data-a=fm-nova]');await p.waitForTimeout(100);await p.click('#fme-d');await p.waitForTimeout(80);await p.click(`#modal [data-gvv="${dest}"]`);await p.waitForTimeout(100);await clica(p,'#modal [data-a=fm-salva]');await p.waitForTimeout(120);await clica(p,'#modal [data-a=fm-modo][data-v=responder]');await p.waitForTimeout(120)};
const campo=(s,nome)=>s.campos.find(c=>c.nome===nome);
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0];await ficha(p,t0.id);await p.waitForTimeout(400);
ok((await chips(p,'Análise jurídica da matrícula')).includes('Cartório: 2º RI'),'a frente do cartão mostra o campo marcado com valor');
ok((await chips(p,'Estudo de massa')).some(x=>x.includes('Valor do laudo')&&x.includes('185.000')),'número formatado na frente');
ok(!(await chips(p,'Análise jurídica da matrícula')).some(x=>x.includes('vistoria')),'campo fora da frente não aparece no cartão');
await p.evaluate(()=>document.querySelector('.tk-board').scrollIntoView({block:'center'}));await p.screenshot({path:O+'1_frente.png'});
await abreCartao(p,'Estudo de massa');
s=await est(p);const cc=campo(s,'Cartório'),cv=campo(s,'Valor do laudo'),cx=campo(s,'Exige vistoria');
ok(await p.$eval('#modal .fm',x=>x.textContent.includes('Valor do laudo')&&!x.textContent.includes('Exige vistoria')),'o cartão mostra o campo com valor; os outros entram pelo + Campo (31/out)');
for(const c of [cc,cx])await incluir(p,'c:'+c.id);
s=await est(p);const ii=c=>tar(s,0,'Estudo de massa').itens.find(i=>i.campo===c.id).id;const icc=ii(cc),icv=ii(cv),icx=ii(cx);
ok(await p.$eval('#modal .fm',x=>x.textContent.includes('Cartório')&&x.textContent.includes('Exige vistoria')),'+ Pergunta inclui os campos personalizados no formulário');
await muda(p,`[data-fm="${icc}"]`,cc.opcoes[0].id);await p.waitForTimeout(150);
await preenche(p,`[data-fm="${icv}"]`,'270 mil');await muda(p,`[data-fm="${icv}"]`,'270 mil');await p.waitForTimeout(150);
await clica(p,`#modal [data-a=fm-v][data-i="${icx}"][data-v=n]`);await p.waitForTimeout(150);
s=await est(p);let k=tar(s,0,'Estudo de massa');
ok(k.campos[cc.id]===cc.opcoes[0].id&&k.campos[cv.id]===270000,'lista e número gravam; "270 mil" vira 270.000');
ok(k.campos[cx.id]===false,'"Não" é gravado como não (diferente de não informado)');
await clica(p,`#modal [data-a=fm-menu][data-v="${icx}"]`);await clica(p,`#modal [data-a=fm-limpa][data-v="${icx}"]`);await p.waitForTimeout(150);s=await est(p);k=tar(s,0,'Estudo de massa');
ok(!(cx.id in k.campos),'voltar a "Não informado" apaga o valor');
await muda(p,`[data-fm="${icv}"]`,'abc');await p.waitForTimeout(150);s=await est(p);
ok(tar(s,0,'Estudo de massa').campos[cv.id]===270000&&(await toast(p)).includes('inválido'),'número inválido é recusado e o valor fica');
ok(s.terrenos[0].hist.some(h=>h.txt.includes('Valor do laudo de 185.000 para 270.000')),'a mudança vai para o histórico');
await p.evaluate(()=>document.querySelector('#modal .fm').scrollIntoView({block:'center'}));await p.screenshot({path:O+'2_cartao.png'});await fecha(p);
await papel(p,'Leitura');await p.waitForTimeout(200);await abreCartao(p,'Estudo de massa');
ok(await p.$$eval('#modal .fm .fm-ro',xs=>xs.length>0)&&!(await p.$('#modal [data-fm]'))&&!(await p.$('#modal [data-a=fm-v]')),'Leitura só vê os campos');await fecha(p);
// filtro na página Tarefas
await papel(p,'Diretor');await p.evaluate(()=>history.replaceState(null,'','#/tarefas'));await p.reload();await p.waitForTimeout(400);
s=await est(p);await muda(p,'#tk-cp',`${campo(s,'Cartório').id}:${campo(s,'Cartório').opcoes[1].id}`);await p.waitForTimeout(250);
const vis=await p.$$eval('.tk',xs=>xs.map(x=>x.getAttribute('aria-label')));
ok(vis.length===1&&vis[0]==='Análise jurídica da matrícula','o filtro "Cartório: 2º RI" deixa só o cartão com esse valor');
await muda(p,'#tk-cp',`${campo(s,'Cartório').id}:-`);await p.waitForTimeout(250);
ok(!(await p.$$eval('.tk',xs=>xs.map(x=>x.getAttribute('aria-label')))).includes('Análise jurídica da matrícula'),'"Não informado" traz os cartões sem valor');
await p.screenshot({path:O+'3_filtro.png'});
// Configurações › Tarefas
await p.evaluate(()=>history.replaceState(null,'','#/configuracoes/tarefas'));await p.reload();await p.waitForTimeout(400);
s=await est(p);const cid=campo(s,'Cartório').id;
ok(await p.$eval(`[data-cpoc=tipo][data-v="${cid}"]`,x=>x.disabled)&&!(await p.$(`[data-a=cpo-apaga][data-v="${cid}"]`)),'campo com valor: tipo travado e sem Apagar (só desativar)');
await preenche(p,'[data-form=cpo-novo] input','Fase do laudo');await muda(p,'[data-form=cpo-novo] select','lista');await envia(p,'[data-form=cpo-novo]');await p.waitForTimeout(200);
s=await est(p);const fl=campo(s,'Fase do laudo');ok(fl&&fl.tipo==='lista','o administrador cria um campo de lista');
await preenche(p,`[data-form=cpo-op][data-v="${fl.id}"] input`,'Pedido');await envia(p,`[data-form=cpo-op][data-v="${fl.id}"]`);await p.waitForTimeout(200);
s=await est(p);ok(campo(s,'Fase do laudo').opcoes.some(o=>o.nome==='Pedido'),'e as opções dele');
await clica(p,`[data-a=cpo-ativo][data-v="${cid}"]`);await p.waitForTimeout(200);s=await est(p);ok(campo(s,'Cartório').ativo===false,'desativar o campo');
s=await est(p);const vid=campo(s,'Valor do laudo').id;ok(!(await p.$('[data-cpoc=obrig]')),'"Obrigatório para concluir" saiu da configuração: a regra é do cartão (31/out)');
await p.evaluate(()=>document.querySelector('[data-form=cpo-novo]').closest('.sec').scrollIntoView({block:'center'}));await p.screenshot({path:O+'4_config.png'});
await p.evaluate(()=>history.replaceState(null,'','#/terrenos'));await p.reload();await p.waitForTimeout(300);await ficha(p,t0.id);await p.waitForTimeout(400);
ok(!(await chips(p,'Análise jurídica da matrícula')).some(x=>x.includes('Cartório')),'campo desativado sai da frente do cartão (o valor fica guardado)');
s=await est(p);ok(!!tar(s,0,'Análise jurídica da matrícula').campos[cid],'o valor do campo desativado continua guardado');
// obrigatório para concluir
{const kk=s.terrenos[0].tarefas.find(k=>!k.feita&&!k.arq&&!(k.aprov||[]).length&&!(k.checklists||[]).some(c=>c.itens.some(i=>!i.feito))&&!(k.campos||{})[vid]&&(!k.vis||k.vis==='publico'));
 ok(!!kk,'há um cartão sem o campo');await abreCartao(p,kk.titulo);
 await incluir(p,'c:'+vid);
 await clica(p,'#modal [data-a=tkc-aba][data-v=config]');await p.waitForTimeout(150);
 s=await est(p);const it=tar(s,0,kk.titulo).itens.find(i=>i.campo===vid);await muda(p,`[data-itr="${it.id}"]`,'bloqueia');await p.waitForTimeout(150);
 await fecha(p);await papel(p,'Analista');await p.waitForTimeout(200);await abreCartao(p,kk.titulo);
 ok(await p.$eval(`[data-fm="${it.id}"]`,x=>x.closest('.fm-ans').classList.contains('falta')),'o cartão marca o campo que falta (regra "não conclui" no cartão)');
 await clica(p,'#modal [data-a=tkc-concluir]');await p.waitForTimeout(200);let s2=await est(p);
 ok(!tar(s2,0,kk.titulo).feita&&(await toast(p)).includes('Valor do laudo'),'sem o campo obrigatório, não conclui e diz qual falta');
 await p.evaluate(()=>document.querySelector('#modal .fm').scrollIntoView({block:'center'}));await p.screenshot({path:O+'7_obrigatorio.png'});
 await preenche(p,`[data-fm="${it.id}"]`,'90 mil');await muda(p,`[data-fm="${it.id}"]`,'90 mil');await p.waitForTimeout(150);
 await clica(p,'#modal [data-a=tkc-concluir]');await p.waitForTimeout(200);s2=await est(p);
 ok(!!tar(s2,0,kk.titulo).feita,'preenchido, conclui')}
await ctx.close()}
{const {ctx,p}=await abre(1440,900,'escuro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Análise jurídica da matrícula');await p.evaluate(()=>document.querySelector('#modal .fm').scrollIntoView({block:'center'}));await p.screenshot({path:O+'5_escuro.png'});await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Análise jurídica da matrícula');await p.evaluate(()=>document.querySelector('#modal .fm').scrollIntoView({block:'start'}));
ok(await p.evaluate(()=>{const d=document.querySelector('#modal .dialog');return d.scrollWidth<=d.clientWidth+1}),'celular: o cartão não rola de lado');
await p.screenshot({path:O+'6_celular.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
