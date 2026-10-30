// Automações (bloco 5a): regras do quadro e da empresa, editor Quando/Se/Faça, execução ao mover, ação de regra não dispara outra,
// etiqueta posta à mão dispara, desligar, execuções, Configurações, Leitura só vê, celular; prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_auto')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const est=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===v)){const o=[...el.options].find(o=>o.textContent.includes(v));if(o)v=o.value}el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const preenche=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);el.value=v},[sel,v]);
const envia=(p,sel)=>p.evaluate(s=>{const f=document.querySelector(s);if(!f)throw new Error('não achei '+s);f.requestSubmit()},sel);
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
const ficha=(p,id)=>p.evaluate(id=>{const a=document.createElement('button');a.dataset.a='abrir';a.dataset.id=id;a.dataset.tab='tarefas';document.body.appendChild(a);a.click();a.remove()},id);
const toast=p=>p.evaluate(()=>document.querySelector('.toast')?.textContent||'');
const tar=(s,i,tit)=>s.terrenos[i].tarefas.find(k=>k.titulo===tit);
const addD=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
const abreCartao=async(p,tit)=>{await clica(p,'.tk',tit);await p.waitForTimeout(250)};
const fecha=async p=>{await clica(p,'#modal [data-a=close]');await p.waitForTimeout(150)};
const lista=(s,i,k)=>s.terrenos[i].listas.find(l=>l.id===k.lista);
const kOf=(s,id)=>{for(const t of s.terrenos)for(const k of (t.tarefas||[]))if(k.id===id)return {t,k};return {}};
const execs=(s,aid)=>(s.autoExec||[]).filter(x=>!aid||x.aid===aid);
const regra=(s,nome)=>(s.automacoes||[]).find(r=>r.nome===nome);
const moveCartao=async(p,tit,nomeLista)=>{await abreCartao(p,tit);await muda(p,'#modal [data-tkc=lista]',nomeLista);await p.waitForTimeout(250);await fecha(p)};
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0];
ok(s.auDia&&regra(s,'Aguardando retorno avisa o gestor')&&regra(s,'Urgente sobe a prioridade'),'exemplos: regra do quadro, regras da empresa e a rotina do dia já rodou');
await ficha(p,t0.id);await p.waitForTimeout(400);
await clica(p,'[data-a=au-abrir]');await p.waitForTimeout(200);
ok(await p.$$eval('#modal .au-r',x=>x.length)>=3,'Automações mostra as regras do quadro e as da empresa');
ok((await p.$eval('#modal',x=>x.textContent)).includes('Quando o cartão entrar em Aguardando retorno: avisar gestor do responsável; adiar o prazo em 3 dias.'),'cada regra aparece numa frase');
await p.screenshot({path:O+'1_regras.png'});
// nova regra pelo editor
await clica(p,'#modal [data-a=au-nova]');await p.waitForTimeout(200);
await preenche(p,'#au-nome','Fazendo com prioridade alta');await p.evaluate(()=>{const el=document.querySelector('#au-nome');el.dispatchEvent(new Event('input',{bubbles:true}))});
await muda(p,'#modal [data-au=gLista]','Fazendo');await p.waitForTimeout(120);
await muda(p,'#modal [data-au-add=conds]','prioridade');await p.waitForTimeout(120);
await muda(p,'#modal [data-au-add=acoes]','etiqueta');await p.waitForTimeout(120);
const prev=await p.$eval('#modal .au-prev',x=>x.textContent);
ok(prev.includes('Quando o cartão entrar em Fazendo, se prioridade alta: avisar responsável; pôr a etiqueta Urgente.'),'o resumo acompanha o que se monta');
await p.screenshot({path:O+'2_editor.png'});
await envia(p,'[data-form=au-salvar]');await p.waitForTimeout(250);
s=await est(p);const nova=regra(s,'Fazendo com prioridade alta');
ok(nova&&nova.tid===t0.id&&nova.dono==='Moisés'&&nova.conds[0].v[0]==='alta','a regra é do quadro, com dono');
await fecha(p);
// cartão aberto, de prioridade alta, fora de Fazendo
const L=t0.listas,fz=L.find(l=>l.nome==='Fazendo');
const urg0=s.etiquetas.find(e=>e.nome==='Urgente');
let k=t0.tarefas.find(x=>t0.tarefas.filter(y=>y.titulo===x.titulo).length===1&&!x.feita&&!x.arq&&!x.modelo&&x.lista!==fz.id&&!x.aprov.length&&!x.etq.includes(urg0.id)&&L.find(l=>l.id===x.lista).tipo==='aberta');
await abreCartao(p,k.titulo);await muda(p,'#modal [data-tkc=prio]','alta');await p.waitForTimeout(150);await fecha(p);
const nUrg=execs(s,regra(s,'Urgente sobe a prioridade').id).length;
await moveCartao(p,k.titulo,'Fazendo');
s=await est(p);let kk=kOf(s,k.id).k;const urg=s.etiquetas.find(e=>e.nome==='Urgente');
ok(kk.etq.includes(urg.id)&&execs(s,nova.id).length===1&&execs(s,nova.id)[0].res==='ok','ao entrar em Fazendo, a regra põe a etiqueta e registra a execução');
ok(execs(s,regra(s,'Urgente sobe a prioridade').id).length===nUrg,'a etiqueta posta pela regra não dispara a regra da empresa');
// etiqueta posta à mão dispara a regra da empresa
const k2=s.terrenos[0].tarefas.find(x=>s.terrenos[0].tarefas.filter(y=>y.titulo===x.titulo).length===1&&!x.feita&&!x.arq&&!x.modelo&&x.id!==k.id&&!x.etq.includes(urg.id));
await abreCartao(p,k2.titulo);await muda(p,'#modal [data-tkc=prio]','baixa');await p.waitForTimeout(120);
await clica(p,'#modal [data-a=tkc-pop][data-v=etq]');await p.waitForTimeout(120);await clica(p,`#modal [data-a=tkc-etq][data-v="${urg.id}"]`);await p.waitForTimeout(200);
s=await est(p);ok(kOf(s,k2.id).k.prio==='alta','a etiqueta Urgente posta à mão sobe a prioridade (regra da empresa)');
await fecha(p);
// regra que avisa o gestor: entra em Aguardando retorno
const ag=regra(s,'Aguardando retorno avisa o gestor'),k3=s.terrenos[0].tarefas.find(x=>!x.feita&&!x.arq&&!x.modelo&&s.terrenos[0].tarefas.filter(y=>y.titulo===x.titulo).length===1&&(x.vis||'publico')==='publico'&&L.find(l=>l.id===x.lista).tipo==='aberta'&&x.lista!==L.find(l=>l.nome==='Aguardando retorno').id);
if(k3){const pz=k3.prazo;await abreCartao(p,k3.titulo);await muda(p,'#modal [data-tkc=resp]','Rafael Souza');await p.waitForTimeout(150);await fecha(p);await moveCartao(p,k3.titulo,'Aguardando retorno');s=await est(p);const kx=kOf(s,k3.id).k;
  ok(s.notifs.some(n=>n.para==='Ana Prado'&&n.tipo==='automacao'&&n.txt==='Aguardando retorno: '+k3.titulo),'avisa o gestor do responsável');
  ok(kx.prazo===addD(pz||kx.prazo,pz?3:0),'adia o prazo em 3 dias')}else ok(false,'achei um cartão do Rafael');
// desligar
await clica(p,'[data-a=au-abrir]');await p.waitForTimeout(200);
await p.evaluate(id=>{const el=document.querySelector(`[data-au-liga="${id}"]`);el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}))},nova.id);await p.waitForTimeout(150);
ok(!regra(await est(p),'Fazendo com prioridade alta').ativa,'o botão desliga a regra');
ok(!(await p.$(`#modal .au-r [data-a=au-apagar]`))||!(await p.evaluate(id=>[...document.querySelectorAll('[data-a=au-apagar]')].some(b=>b.dataset.v===id),nova.id)),'regra que já rodou não tem Apagar');
await clica(p,`#modal [data-a=au-exec][data-v="${nova.id}"]`);await p.waitForTimeout(200);
ok((await p.$$eval('#modal .au-exr',x=>x.length))===1&&(await p.$eval('#modal .au-exr',x=>x.textContent)).includes('pôs a etiqueta Urgente'),'as execuções mostram o cartão, o que foi feito e quem disparou');
await p.screenshot({path:O+'3_execucoes.png'});
await clica(p,'#modal [data-a=au-voltar]');await p.waitForTimeout(150);await fecha(p);
// Configurações › Tarefas
await p.evaluate(()=>{location.hash='#/configuracoes/tarefas'});await p.waitForTimeout(400);
ok((await p.textContent('body')).includes('Automações da empresa'),'Configurações › Tarefas lista as automações da empresa');
await p.evaluate(()=>[...document.querySelectorAll('.sec h2')].find(h=>h.textContent==='Automações da empresa').scrollIntoView());await p.waitForTimeout(100);
await p.screenshot({path:O+'4_config.png'});
// Leitura só vê
await papel(p,'Leitura');await p.waitForTimeout(200);await ficha(p,t0.id);await p.waitForTimeout(300);await clica(p,'[data-a=au-abrir]');await p.waitForTimeout(200);
ok(!(await p.$('#modal [data-a=au-nova]'))&&!(await p.$('#modal [data-au-liga]'))&&(await p.$$eval('#modal .au-r',x=>x.length))>=4,'Leitura vê as regras, sem criar nem desligar');
await ctx.close()}
{const {ctx,p}=await abre(390,844,'escuro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await clica(p,'[data-a=au-abrir]');await p.waitForTimeout(200);await clica(p,'#modal [data-a=au-nova]');await p.waitForTimeout(200);
await muda(p,'#modal [data-au-add=conds]','campo');await p.waitForTimeout(120);await muda(p,'#modal [data-au-add=acoes]','checklist');await p.waitForTimeout(120);
ok(await p.evaluate(()=>{const d=document.querySelector('#modal .dialog');return d.scrollWidth<=d.clientWidth+1}),'celular: o editor cabe sem rolagem lateral');
await p.screenshot({path:O+'5_celular.png',fullPage:false});await ctx.close()}
ok(!erros.length,'sem erro de página'+(erros.length?': '+erros.join(' | '):''));
await b.close();process.exit(falhas.length?1:0)})();
