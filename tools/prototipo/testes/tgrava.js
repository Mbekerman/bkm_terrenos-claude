// "Grava em" em três níveis (pedido do Moisés, 3/nov/2026): Sistema travado, Tabela e Campo com busca direta,
// no formulário do cartão e na Jornada; prints em claro, escuro e celular.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_grava')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const clica=(p,sel)=>p.evaluate(s=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);el.click()},sel);
const X=(p,f,arg)=>p.evaluate(([f,a])=>window.BKM_TESTE.escopo(f,a),[f.toString(),arg===undefined?null:arg]);
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema,dpr)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr||2});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
const cartao=(p)=>X(p,()=>{const t=S.terrenos[0];go('terreno',{id:t.id});UI.tkSel={tid:t.id,kid:S.fmExemploK};UI.tkAba='geral';UI.modal='tarefa';renderModal()});
const shot=async(p,n)=>{const el=await p.$('#modal .fm-ed')||await p.$('#modal .dialog');await el.screenshot({path:O+n})};
for(const [w,h,tema,suf] of [[1440,1400,'claro','d_claro'],[1440,1400,'escuro','d_escuro'],[390,1600,'claro','m_claro']]){
  const {ctx,p}=await abre(w,h,tema);
  await cartao(p);await p.waitForTimeout(300);await clica(p,'[data-a=fm-modo][data-v=montar]');await p.waitForTimeout(100);
  await clica(p,'[data-a=fm-nova]');await p.waitForTimeout(250);
  await p.evaluate(()=>document.querySelector('#modal .fm-ed').scrollIntoView({block:'start'}));
  ok(await p.$eval('#modal .gv-pop',x=>!x.hidden),`${suf}: a busca do campo abre sozinha`);
  await p.keyboard.type('área');await p.waitForTimeout(150);await shot(p,`1_busca_todas_${suf}.png`);
  await p.keyboard.press('Enter');await p.waitForTimeout(200);
  ok(await p.$eval('#fme-d-t',x=>x.value)==='terreno',`${suf}: escolher o campo preenche a Tabela`);
  await shot(p,`2_escolhido_${suf}.png`);
  await p.selectOption('#fme-d-t','tarefa');await p.waitForTimeout(250);await shot(p,`3_tabela_tarefa_${suf}.png`);
  await ctx.close()}
{const {ctx,p}=await abre(1440,1000,'claro');await p.evaluate(()=>history.replaceState(null,'','#/configuracoes/jornada'));await p.reload();await p.waitForTimeout(400);
  await clica(p,'[data-a=jn-etapa][data-v=estudos]');await p.waitForTimeout(150);await clica(p,'[data-a=jn-nova][data-e=estudos][data-s=""]');await p.waitForTimeout(250);
  ok(await p.$eval('#modal .gv-pop',x=>!x.hidden&&x.textContent.includes('Criar campo novo do terreno')),'Jornada: a busca abre e oferece Criar campo novo');
  await p.keyboard.type('ocup');await p.waitForTimeout(150);await shot(p,'4_jornada_d_claro.png');await ctx.close()}
await b.close();if(erros.length)console.log('erros:',erros);console.log(falhas.length||erros.length?falhas.length+' FALHA(S)':'TUDO OK');process.exit(falhas.length||erros.length?1:0)})();
