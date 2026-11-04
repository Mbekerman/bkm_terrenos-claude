// Formulário da tarefa, máscaras e criação rápida (decisões do Moisés, 1/nov/2026): montar e responder, formas por tipo,
// chave de três estados com Limpar resposta, máscaras (campo do terreno, campo personalizado, só no cartão), criação rápida; prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_form')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);if(el.type==='checkbox'||el.type==='radio')el.checked=v;else el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const digita=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},[sel,v]);
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
const escolhe=async(p,v,id='#fme-d')=>{await p.click(id);await p.waitForTimeout(80);await p.click(`[data-gvv="${v}"]`);await p.waitForTimeout(120)};
const toast=p=>p.evaluate(()=>document.querySelector('.toast')?.textContent||'');
const X=(p,f,arg)=>p.evaluate(([f,a])=>window.BKM_TESTE.escopo(f,a),[f.toString(),arg===undefined?null:arg]);
const est=p=>p.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('bkm-terrenos-v'))||'null')));
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
const cartao=(p)=>X(p,()=>{const t=S.terrenos[0];go('terreno',{id:t.id});UI.tkSel={tid:t.id,kid:S.fmExemploK};UI.tkAba='geral';UI.modal='tarefa';renderModal()});
{const {ctx,p}=await abre(1440,2300,'claro');
await cartao(p);await p.waitForTimeout(300);
ok(await p.$eval('#modal .fm',x=>x.textContent.includes('Formulário')&&x.textContent.includes('Qual a posição do terreno na quadra?')),'o cartão tem o bloco Formulário com as perguntas');
const fm=async(n)=>{const st=await p.addStyleTag({content:'#modal *:not(.fm-seg):not(.fm-modo):not(.fm-prog):not(.fm-tg):not(.fm-pvg){max-height:none!important;overflow:visible!important}#modal .dialog{height:auto!important}'});await p.waitForTimeout(50);const el=await p.$('#modal .fm');await el.screenshot({path:O+n});await st.evaluate(x=>x.remove())};
await p.evaluate(()=>document.querySelector('#modal .fm').scrollIntoView());await fm('1_responder.png');
const K=()=>X(p,()=>{const t=S.terrenos[0],k=t.tarefas.find(x=>x.id===S.fmExemploK);return {k,t:{ocupacao:t.ocupacao,posicao:t.posicao,aLev:t.aLev,referencia:t.referencia}}});
const item=async(perg)=>(await K()).k.itens.find(i=>i.pergunta===perg);
// chave de três estados
const ich=await item('O proprietário aceita receber a equipe de novo?');
ok(await p.$eval(`#fma-${ich.id} .fm-tg`,x=>x.classList.contains('mid'))&&await p.$eval(`#fma-${ich.id}`,x=>x.textContent.includes('Não informado')),'a chave começa no meio, em "não informado"');
await clica(p,`#fma-${ich.id} .fm-tg.mid button:last-child`);await p.waitForTimeout(150);
ok((await item('O proprietário aceita receber a equipe de novo?')).resposta===true,'tocar no lado direito responde Sim');
await clica(p,`#fma-${ich.id} .fm-tg`);await p.waitForTimeout(150);
ok((await item('O proprietário aceita receber a equipe de novo?')).resposta===false,'depois, o toque alterna (Não), sem passar pelo vazio');
await clica(p,`#fma-${ich.id} [data-a=fm-menu]`);await p.waitForTimeout(100);
ok(await p.$eval(`#fma-${ich.id} .fm-menu`,x=>x.textContent.includes('Limpar resposta')),'o menu ⋮ da pergunta tem Limpar resposta');
await clica(p,`#fma-${ich.id} [data-a=fm-limpa]`);await p.waitForTimeout(150);
ok((await item('O proprietário aceita receber a equipe de novo?')).resposta===undefined&&await p.$eval(`#fma-${ich.id} .fm-tg`,x=>x.classList.contains('mid')),'Limpar resposta volta a chave ao meio');
// máscara de telefone (só no cartão)
const itel=await item('Telefone do zelador');
await digita(p,`#fm-${itel.id}`,'11987654321');ok(await p.$eval(`#fm-${itel.id}`,x=>x.value)==='(11) 98765-4321','o telefone se formata enquanto digita');
await muda(p,`#fm-${itel.id}`,'(11) 98765-4321');await p.waitForTimeout(150);
ok((await item('Telefone do zelador')).resposta==='11987654321','o telefone é guardado só com os dígitos');
await muda(p,`#fm-${itel.id}`,'(11) 8765');await p.waitForTimeout(150);
ok((await toast(p)).includes('Telefone inválido')&&(await item('Telefone do zelador')).resposta==='11987654321','telefone incompleto é recusado e a resposta anterior fica');
// chips gravam no terreno
const ioc=await item('Como está a ocupação hoje?');
await clica(p,`#fma-${ioc.id} .fm-chips button`,'Vazio');await p.waitForTimeout(150);
ok((await K()).t.ocupacao==='vazio','a pergunta em chips grava no próprio terreno (Ocupação)');
// botões de opção
const itp=await item('Qual a posição do terreno na quadra?');
await muda(p,`#fma-${itp.id} input[value=esquina]`,true);await p.waitForTimeout(150);
ok((await K()).t.posicao==='esquina','a pergunta em botões de opção grava no terreno');
// montar
await clica(p,'[data-a=fm-modo][data-v=montar]');await p.waitForTimeout(150);
ok((await p.$$('#modal .fm-row')).length===6,'Montar mostra as 6 perguntas para editar e ordenar');
await clica(p,'[data-a=fm-nova]');await p.waitForTimeout(150);
ok(await p.$eval('#modal .gv-pop',x=>!x.hidden&&x.textContent.includes('Topografia')===false&&x.textContent.includes('Só no cartão')&&x.textContent.includes('Tarefa')&&x.textContent.includes('Terreno')),'Nova pergunta já abre a busca do campo, em todas as tabelas (sem os que já estão no formulário)');
// Grava em: Sistema travado, Tabela e Campo (3/nov/2026)
ok(await p.$eval('#fme-d-s',x=>x.disabled&&x.value==='BKM Terrenos'),'Sistema vem com BKM Terrenos e não muda');
ok(await p.$eval('#fme-d-t',x=>x.value===''&&[...x.options].map(o=>o.text).join('|')==='Todas as tabelas|Terreno|Negociação|Oferta de referência|Proposta vigente|Calculados|Tarefa'),'Tabela começa em Todas as tabelas e lista as tabelas');
await p.keyboard.type('valor');await p.waitForTimeout(120);
const gq=await p.$$eval('#modal .gv-pop .it-popg',x=>x.map(y=>y.textContent));
ok(gq.length>=2,'a busca procura em todas as tabelas e agrupa o resultado por tabela: '+gq.join(', '));
await p.fill('#fme-d','área documental');await p.waitForTimeout(120);await p.keyboard.press('Enter');await p.waitForTimeout(150);
ok(await p.$eval('#fme-d-t',x=>x.value==='terreno')&&await p.$eval('#fme-d',x=>x.value==='Área documental'),'escolher o campo pela busca preenche a Tabela sozinha');
await muda(p,'#fme-d-t','negociacao');await p.waitForTimeout(150);
ok(await p.$eval('#fme-d',x=>x.value===''&&x.placeholder.includes('Negociação')),'trocar a Tabela tira o campo de outra tabela e a busca passa a ser só nela');
ok(await p.$eval('#modal .gv-pop',x=>!x.hidden&&[...x.querySelectorAll('.it-popg')].every(g=>g.textContent==='Negociação')),'com a Tabela escolhida, a lista só traz os campos dela');
await p.fill('#fme-d','área documental');await p.waitForTimeout(120);
ok(await p.$eval('#modal .gv-pop',x=>x.textContent.includes('Nenhum campo')&&x.textContent.includes('Buscar em todas as tabelas')),'sem resultado na tabela, oferece buscar em todas');
await p.click('[data-gvtodas]');await p.waitForTimeout(120);
ok(await p.$eval('#fme-d-t',x=>x.value==='')&&await p.$eval('#modal .gv-pop',x=>x.textContent.includes('Área documental')),'Buscar em todas as tabelas volta a Tabela para Todas');
await p.keyboard.press('Escape');await p.waitForTimeout(100);
await p.evaluate(()=>document.querySelector('#modal .fm-ed').scrollIntoView({block:'start'}));await p.focus('#fme-d');await p.keyboard.type('pre');await p.waitForTimeout(150);await fm('0_grava_em.png');
await p.keyboard.press('Escape');
await escolhe(p,'terreno.necessidade_demolicao');await p.waitForTimeout(150);
const fs1=await p.$$eval('#modal .fm-fo b',x=>x.map(y=>y.textContent));
ok(fs1.join('|')==='Lista suspensa|Botões de opção|Chips|Segmentado','lista de 3 opções: menu, botões de opção, chips e segmentado (sem a chave)');
await digita(p,'#fme-p','Precisa demolir alguma construção?');await clica(p,'[data-a=fm-forma][data-v=segmentado]');await p.waitForTimeout(100);
await p.evaluate(()=>document.querySelector('#modal .fm-ed').scrollIntoView({block:'center'}));await fm('2_montar_pergunta.png');
await clica(p,'[data-a=fm-salva]');await p.waitForTimeout(150);
ok((await item('Precisa demolir alguma construção?'))?.forma==='segmentado','a pergunta nova guarda o texto e a forma escolhida');
// só no cartão, lista de duas opções: entra a chave
await clica(p,'[data-a=fm-nova]');await p.waitForTimeout(100);await escolhe(p,'cartao');await p.waitForTimeout(100);
await digita(p,'#fme-p','Muro de divisa');await muda(p,'#fme-t','lista');await p.waitForTimeout(100);await digita(p,'#fme-o','Bom\nRuim');await p.waitForTimeout(150);
const fs2=await p.$$eval('#modal .fm-fo b',x=>x.map(y=>y.textContent));
ok(fs2.includes('Chave liga/desliga')&&fs2.includes('Segmentado'),'lista de duas opções aceita também a chave');
await clica(p,'[data-a=fm-forma][data-v=chave]');await clica(p,'[data-a=fm-salva]');await p.waitForTimeout(150);
ok((await item('Muro de divisa'))?.opcoes?.join()==='Bom,Ruim','pergunta só no cartão de lista guarda as opções');
await clica(p,'[data-a=fm-nova]');await p.waitForTimeout(100);await escolhe(p,'cartao');await p.waitForTimeout(100);await muda(p,'#fme-t','cpf');await p.waitForTimeout(100);
ok(await p.$eval('#modal .fm-ed',x=>x.textContent.includes('Máscara CPF: uma linha'))&&!(await p.$('#modal .fm-fo')),'máscara só no cartão tem uma forma só (uma linha formatada)');
await clica(p,'[data-a=fm-salva]');await p.waitForTimeout(100);ok((await toast(p)).includes('Escreva a pergunta'),'pergunta só no cartão precisa do texto');
await digita(p,'#fme-p','CPF do proprietário');await clica(p,'[data-a=fm-salva]');await p.waitForTimeout(150);
// ordem
const n1=(await K()).k.itens.length;await clica(p,`[data-a=fm-sobe][data-v="${(await item('CPF do proprietário')).id}"]`);await p.waitForTimeout(150);
ok((await K()).k.itens[n1-2].pergunta==='CPF do proprietário','Subir muda a ordem do formulário');
await fm('3_montar.png');
await clica(p,'[data-a=fm-modo][data-v=responder]');await p.waitForTimeout(150);
const icpf=await item('CPF do proprietário');
await muda(p,`#fm-${icpf.id}`,'529.982.247-24');await p.waitForTimeout(150);ok((await toast(p)).includes('CPF inválido'),'CPF com dígito errado é recusado');
await muda(p,`#fm-${icpf.id}`,'529.982.247-25');await p.waitForTimeout(150);
ok((await item('CPF do proprietário')).resposta==='52998224725'&&await p.$eval(`#fm-${icpf.id}`,x=>x.value)==='529.982.247-25','CPF válido é guardado só com os dígitos e mostrado com a máscara');
const imu=await item('Muro de divisa');await clica(p,`#fma-${imu.id} .fm-tg.mid button:first-child`);await p.waitForTimeout(150);
ok((await item('Muro de divisa')).resposta==='Bom','na chave de lista, o lado esquerdo é a primeira opção');
await p.evaluate(()=>document.querySelector('#modal .fm').scrollIntoView());await fm('4_respondido.png');
// regra da aba Configuração vale para a pergunta (o nome é o texto da pergunta)
ok(await X(p,()=>{const t=S.terrenos[0],k=t.tarefas.find(x=>x.id===S.fmExemploK);const i=k.itens.find(x=>x.pergunta==='Observações da visita');i.regra='bloqueia';return itBranco(t,k).some(b=>b.nome==='Observações da visita'&&b.tipo==='pergunta')}),'pergunta só no cartão em branco com regra entra no que falta para concluir');
// campo personalizado com máscara
await X(p,()=>{cpoCampos().push({id:'cpf1',nome:'CPF do vendedor',tipo:'texto',formato:'cpf',ordem:9,frente:false,ativo:true});save();render()});
await clica(p,'[data-a=fm-modo][data-v=montar]');await p.waitForTimeout(100);await clica(p,'[data-a=fm-nova]');await p.waitForTimeout(100);await escolhe(p,'c:cpf1');await clica(p,'[data-a=fm-salva]');await p.waitForTimeout(100);
await clica(p,'[data-a=fm-modo][data-v=responder]');await p.waitForTimeout(150);const icv=(await K()).k.itens.find(i=>i.campo==='cpf1');
ok(await p.$eval(`#fm-${icv.id}`,x=>x.dataset.mask==='cpf'),'campo personalizado com máscara entra no formulário com a máscara do campo');
await muda(p,`#fm-${icv.id}`,'123.456.789-00');await p.waitForTimeout(150);ok((await toast(p)).includes('CPF inválido'),'o campo personalizado recusa CPF inválido');
await muda(p,`#fm-${icv.id}`,'52998224725');await p.waitForTimeout(150);ok((await K()).k.campos.cpf1==='52998224725','o campo personalizado guarda o CPF só com os dígitos');
// Leitura só vê
await papel(p,'Leitura');await cartao(p);await p.waitForTimeout(200);
ok(!(await p.$('#modal [data-a=fm-modo]'))&&!(await p.$('#modal .fm-in'))&&await p.$eval('#modal .fm',x=>x.textContent.includes('529.982.247-25')),'Leitura vê as respostas, sem montar nem responder');
await papel(p,'Diretor');
// Configurações › Campos: máscara do campo de texto
await X(p,()=>{UI.modal=null;renderModal();history.replaceState(null,'','#/configuracoes/campos');go('config',{});});await p.evaluate(()=>history.replaceState(null,'','#/configuracoes/campos'));await p.reload();await p.waitForTimeout(400);
ok(await p.$('[data-itcfg=formato][data-v="terreno.referencia_localizacao"]')!==null&&await p.$eval('.it-tab',x=>x.textContent.includes('Moeda')&&x.textContent.includes('CEP')),'Configurações › Campos tem a coluna Máscara: escolha nos textos, fixa em moeda e CEP');
await X(p,()=>{S.terrenos[1].referencia='perto da padaria';save()});
await muda(p,'[data-itcfg=formato][data-v="terreno.referencia_localizacao"]','telefone');await p.waitForTimeout(150);
ok((await toast(p)).includes('fora dessa máscara')&&!(await X(p,()=>itDef('terreno.referencia_localizacao').formato)),'máscara não liga com terreno fora dela');
await X(p,()=>{S.terrenos.forEach(t=>t.referencia=null);save()});
await muda(p,'[data-itcfg=formato][data-v="terreno.referencia_localizacao"]','telefone');await p.waitForTimeout(150);
ok(await X(p,()=>itDef('terreno.referencia_localizacao').formato)==='telefone','o administrador dá a máscara de telefone ao campo de texto');
await p.screenshot({path:O+'5_cfg_campos.png'});
// criação rápida
await X(p,()=>{const t=S.terrenos[0];go('terreno',{id:t.id});UI.tkSel={tid:t.id,lista:'Fazer'};UI.modal='tarefa';renderModal()});await p.waitForTimeout(200);
ok(await p.$('#f-tkr')!==null&&!(await p.$('#f-tkr #tm-l'))&&!(await p.$('#tr-ter')),'Nova tarefa abre a janela curta; dentro da ficha o terreno já vem');
await clica(p,'[data-a=fm-desc]');await p.waitForTimeout(100);ok(await p.$('#tr-d')!==null,'"Adicionar descrição" abre a descrição');
const pad=await X(p,()=>{const a=etAtual(S.terrenos[0]);return a&&{et:a.f+'|'+a.p.etapa,sub:a.p.sub||''}});
ok(pad&&await p.$eval('#tr-et',x=>x.value)===pad.et&&await p.$eval('#tr-sub',x=>x.value)===pad.sub,'etapa e subetapa vêm com as atuais do terreno: '+JSON.stringify(pad));
const outra=await p.$eval('#tr-et',(x,v)=>[...x.options].map(o=>o.value).find(o=>o&&o!==v),pad.et);
await muda(p,'#tr-et',outra);await p.waitForTimeout(80);
const subs=await p.$$eval('#tr-sub option',xs=>xs.map(o=>o.value));const sub2=subs.find(Boolean);
ok(await p.$eval('#tr-sub',x=>x.value)===''&&!!sub2,'trocar a etapa refaz a lista das subetapas');
await muda(p,'#tr-sub',sub2);await clica(p,'[data-a=fm-prz][data-v="1"]');
ok(await p.$eval('#tr-p',x=>x.value)===await X(p,()=>addD(HOJE,1)),'"1 dia" põe o prazo');
await clica(p,'[data-a=fm-prz][data-v=m1]');ok(await p.$eval('#tr-p',x=>x.value)===await X(p,()=>fmMaisMes(HOJE))&&await X(p,()=>fmMaisMes('2026-01-31')==='2026-02-28'&&fmMaisMes('2026-12-15')==='2027-01-15'),'"1 mês" põe o mesmo dia do mês seguinte (ou o último)');
ok(!(await p.$('[data-a=fm-prz][data-v="0"]')),'sem o atalho Hoje');
await clica(p,'[data-a=fm-prz][data-v="1"]');
ok(await p.$eval('#tr-r',x=>x.value)==='Moisés'&&await p.$eval('#tr-r-q',x=>x.value)==='@moises','o responsável vem com você, como @');
await p.click('#tr-r-q');await p.keyboard.press('Control+A');await p.keyboard.type('@rfsz');await p.waitForTimeout(80);
ok(await p.$$eval('#rp-pop [data-rpo]',xs=>xs.length>=1&&xs[0].textContent.includes('Rafael Souza')),'busca aproximada: "@rfsz" acha Rafael Souza');ok(await p.$eval('#tr-r-q',x=>x.value.startsWith('@')),'o campo começa sempre com @');
await (await p.$('#modal .dialog')).screenshot({path:O+'6b_responsavel.png'});
await p.keyboard.type('XYZ');await p.waitForTimeout(60);ok(await p.$eval('#rp-pop',x=>!x.hidden&&x.textContent.includes('Ninguém')),'sem ninguém, a lista diz');
for(let i=0;i<3;i++)await p.keyboard.press('Backspace');await p.keyboard.press('ArrowDown');await p.keyboard.press('ArrowUp');await p.keyboard.press('Enter');await p.waitForTimeout(80);
ok(await p.$eval('#tr-r',x=>x.value)==='Rafael Souza'&&await p.$eval('#tr-r-q',x=>x.value)==='@rafael.souza'&&!!(await p.$('#f-tkr')),'Enter escolhe na lista sem criar a tarefa');
await p.click('#tr-r-q');await p.keyboard.press('Control+A');await p.keyboard.type('@ana');await p.waitForTimeout(60);await p.click('#tr-t');await p.waitForTimeout(80);
ok(await p.$eval('#tr-r',x=>x.value)==='Rafael Souza'&&await p.$eval('#tr-r-q',x=>x.value)==='@rafael.souza','sair sem escolher volta o que estava');
await p.fill('#tr-t','Pedir planta do vizinho');await p.fill('#tr-d','Para conferir a divisa do fundo');await muda(p,'#f-tkr input[name=vis][value=publico]',true);
await p.screenshot({path:O+'6_rapida.png'});
await p.press('#tr-t','Enter');await p.waitForTimeout(250);
const nk=await X(p,()=>{const k=S.terrenos[0].tarefas.find(x=>x.titulo==='Pedir planta do vizinho');return k&&{resp:k.resp,prazo:k.prazo,desc:k.desc,lista:tkLista(S.terrenos[0],k).nome,codigo:k.codigo,et:k.fase+'|'+k.etapa,sub:k.sub}});
ok(nk&&nk.resp==='Rafael Souza'&&nk.prazo===await X(p,()=>addD(HOJE,1))&&nk.desc==='Para conferir a divisa do fundo'&&nk.lista==='Fazer','Enter cria com o responsável escolhido, o prazo, na lista pedida e com a descrição');
ok(nk.et===outra&&nk.sub===sub2,'a tarefa fica na etapa e na subetapa escolhidas');
ok(!(await p.$('#modal .dialog'))&&(await toast(p)).includes(nk.codigo+' criada'),'a janela fecha e o aviso traz o código com Abrir');
await clica(p,'.toast-ac');await p.waitForTimeout(200);ok(await p.$eval('.tkm-trilha',(x,c)=>x.textContent.includes(c),nk.codigo),'Abrir abre o cartão criado');
ok(await p.$eval('#tkc-sub',(x,v)=>x.value===v,sub2),'o cartão mostra a subetapa num seletor');
await muda(p,'#tkc-sub','');await p.waitForTimeout(100);ok(await X(p,()=>S.terrenos[0].tarefas.find(x=>x.titulo==='Pedir planta do vizinho').sub)===null,'no cartão, a subetapa troca ou sai');
await X(p,()=>{UI.modal=null;renderModal();UI.tkSel={tid:null,lista:null};UI.modal='tarefa';renderModal()});await p.waitForTimeout(150);
ok(await p.$('#tr-ter')!==null&&await p.$eval('#tr-et',x=>x.disabled),'fora da ficha, a janela curta pede o terreno (a etapa espera por ele)');
const t1=await X(p,()=>{const t=S.terrenos.find(x=>etAtual(x));const a=etAtual(t);return {id:t.id,et:a.f+'|'+a.p.etapa,sub:a.p.sub||''}});
await muda(p,'#tr-ter',t1.id);await p.waitForTimeout(80);
ok(await p.$eval('#tr-et',(x,v)=>!x.disabled&&x.value===v,t1.et)&&await p.$eval('#tr-sub',x=>x.value)===t1.sub,'escolhido o terreno, vêm a etapa e a subetapa atuais dele');
await clica(p,'[data-a=fm-prz][data-v="7"]');await p.fill('#tr-r-q','');await p.click('#tr-t');await p.waitForTimeout(60);
await p.fill('#tr-t','Revisar contrato');await clica(p,'[data-a=fm-mais]');await p.waitForTimeout(200);
ok(await p.$eval('#tm-t',x=>x.value)==='Revisar contrato'&&await p.$('#tm-l')!==null,'Mais opções abre a janela completa com o que já foi digitado');
ok(await p.$eval('#tm-p',x=>x.value)===await X(p,()=>addD(HOJE,7))&&await p.$eval('#tm-et',(x,v)=>x.value===v,t1.et)&&await p.$eval('#tm-sub',(x,v)=>x.value===v,t1.sub),'e leva o prazo, a etapa e a subetapa');
ok(await p.$eval('#tm-r',x=>x.value)==='','e o responsável (aqui, sem responsável)');
await ctx.close()}
// @ em todo seletor de pessoa (1/nov): no cartão, solicitante/responsável viram campo de @ e o + de pessoas abre o campo
{const {ctx,p}=await abre(1440,1000,'claro');
await X(p,()=>{const t=S.terrenos[0];go('terreno',{id:t.id});UI.tkSel={tid:t.id,kid:S.fmExemploK};UI.tkAba='pessoas';UI.modal='tarefa';renderModal()});await p.waitForTimeout(300);
ok(await p.$$eval('#modal input.rp-q',xs=>xs.length>=2&&xs.every(x=>x.value.startsWith('@'))),'no cartão, solicitante e responsável são campos de @');
const alvo=await p.$('#modal .rp-alvo');ok(!!alvo,'o + de pessoas abre o campo de @');
await alvo.click();await p.keyboard.type('cam');await p.waitForTimeout(100);await p.keyboard.press('Enter');await p.waitForTimeout(200);
ok(await X(p,()=>{const k=S.terrenos[0].tarefas.find(x=>x.id===S.fmExemploK);return JSON.stringify(k)}).then(j=>j.includes('Camila Torres')),'escolher no campo flutuante inclui a pessoa');
ok(!(await p.$('#tk-resp + .rp-w')),'filtros continuam como lista');
await ctx.close()}
// celular e escuro
{const {ctx,p}=await abre(390,844,'claro');await cartao(p);await p.waitForTimeout(300);await p.evaluate(()=>document.querySelector('#modal .fm').scrollIntoView());await p.screenshot({path:O+'7_celular.png'});
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=390&&[...document.querySelectorAll('#modal .fm *')].every(x=>x.getBoundingClientRect().right<=392)),'no celular o formulário cabe na largura');
await X(p,()=>{UI.modal=null;renderModal();const t=S.terrenos[0];UI.tkSel={tid:t.id,lista:'Fazer'};UI.modal='tarefa';renderModal()});await p.waitForTimeout(200);await p.screenshot({path:O+'8_rapida_celular.png'});await ctx.close()}
{const {ctx,p}=await abre(1440,2300,'escuro');await cartao(p);await p.waitForTimeout(300);const st=await p.addStyleTag({content:'#modal *:not(.fm-seg):not(.fm-modo):not(.fm-prog):not(.fm-tg){max-height:none!important;overflow:visible!important}'});const el=await p.$('#modal .fm');await el.screenshot({path:O+'9_escuro.png'});await ctx.close()}
ok(!erros.length,'sem erro de script'+(erros.length?': '+erros.slice(0,3).join(' | '):''));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
