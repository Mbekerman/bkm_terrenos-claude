// Menção com @ e e-mail das notificações: lista dos colegas ao digitar @, aviso no sino que leva ao item,
// e-mail pelo padrão do tipo ou pela escolha da pessoa, Configurações › Notificações com a coluna E-mail.
const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_mencao',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');const O=TMP+'t_mencao/';
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch();const erros=[];
async function abre(w,h,tema){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5,hasTouch:w<700,isMobile:w<700});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();if(t)localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(300);return {p,ctx}}
const papel=async(p,r)=>{await p.evaluate(r=>{document.querySelector('[data-a=perfil-menu]').click();document.querySelector(`[data-a=role][data-v=${r}]`).click()},r);await p.waitForTimeout(150)};
const nav=async(p,r)=>{await p.evaluate(r=>document.querySelector(`[data-a=nav][data-r=${r}]`).click(),r);await p.waitForTimeout(200)};
const txt=(p,s)=>p.evaluate(s=>[...document.querySelectorAll(s)].filter(x=>x.offsetParent).map(x=>x.textContent.trim().replace(/\s+/g,' ')).join(' | '),s);
const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
for(const [w,h,tema,nome] of [[1440,900,null,'desk'],[390,844,'escuro','cel']]){
  let {p,ctx}=await abre(w,h,tema);
  // Moisés (diretor) abre uma tarefa e escreve @ana na descrição
  await nav(p,'tarefas');await p.evaluate(()=>document.querySelector('[data-a=tk-abrir]').click());await p.waitForTimeout(250);
  await p.click('#tm-d');await p.keyboard.press('End');await p.keyboard.type(' Fala com @an');await p.waitForTimeout(150);
  await p.screenshot({path:O+nome+'_1_lista.png'});
  ok(await p.evaluate(()=>!document.getElementById('mn-pop').hidden),nome+': digitar @ abre a lista dos colegas');
  ok((await txt(p,'.mn-i')).includes('Ana Prado'),nome+': a lista filtra pelo que foi digitado');
  await p.keyboard.press('Enter');await p.waitForTimeout(100);
  ok((await p.inputValue('#tm-d')).includes('@ana.prado '),nome+': Enter põe o @ no texto');
  ok(await p.evaluate(()=>document.querySelector('.dialog')!==null),nome+': Enter na lista não grava o formulário');
  await p.keyboard.type('e @');await p.waitForTimeout(100);
  ok(!(await txt(p,'.mn-i')).includes('Moisés')&&(await txt(p,'.mn-i')).includes('Rafael'),nome+': quem escreve não aparece na lista');
  await p.keyboard.press('Escape');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>document.querySelector('.dialog')!==null&&document.getElementById('mn-pop').hidden),nome+': Esc fecha só a lista');
  const tituloT=await p.inputValue('#tm-t');
  await p.evaluate(()=>document.querySelector('button[form=f-tk]').click());await p.waitForTimeout(250);
  let S=await st(p);const n=S.notifs.find(x=>x.tipo==='mencao');
  ok(n&&n.para==='Ana Prado'&&n.txt.includes('mencionou você na tarefa'),nome+': Ana é avisada da menção');
  ok(n&&n.email===true,nome+': menção vai também por e-mail pelo padrão');
  ok(!S.notifs.some(x=>x.tipo==='mencao'&&x.para==='Moisés'),nome+': quem escreve não se avisa');
  // salvar de novo não repete o aviso
  await p.evaluate(()=>document.querySelector('[data-a=tk-abrir]').click());await p.waitForTimeout(200);
  await p.evaluate(()=>document.querySelector('button[form=f-tk]').click());await p.waitForTimeout(200);
  S=await st(p);ok(S.notifs.filter(x=>x.tipo==='mencao').length===1,nome+': salvar sem @ novo não avisa de novo');
  // Ana desliga o e-mail de menção
  await papel(p,'Gestor');
  await p.evaluate(()=>document.querySelector('[data-a=perfil-menu]').click());await p.waitForTimeout(100);
  ok((await txt(p,'.perfil-eu')).includes('@ana.prado'),nome+': o menu do avatar mostra o @');
  await p.evaluate(()=>document.querySelector('[data-a=mn-prefs]').click());await p.waitForTimeout(200);await p.screenshot({path:O+nome+'_2_prefs.png'});
  ok((await txt(p,'.mnp-r')).includes('Mencionado com @'),nome+': preferências listam os tipos');
  await p.click('[data-mn-email=mencao]');await p.waitForTimeout(100);await p.evaluate(()=>document.querySelector('.dialog [data-a=close]').click());
  S=await st(p);ok(S.prefsNotif['Ana Prado'].mencao===false,nome+': escolha guardada por pessoa');
  // sino da Ana leva à tarefa
  await p.evaluate(()=>document.querySelector('[data-a=sino]').click());await p.waitForTimeout(150);await p.screenshot({path:O+nome+'_3_sino.png'});
  ok((await txt(p,'.sino-i')).includes('e-mail'),nome+': o sino mostra que foi por e-mail');
  await p.evaluate(()=>[...document.querySelectorAll('.sino-i')].find(x=>x.textContent.includes('mencionou')).click());await p.waitForTimeout(1300);
  await p.screenshot({path:O+nome+'_4_item.png'});
  ok(await p.evaluate(t=>{const el=document.querySelector('.task.pisca');return !!el&&el.textContent.includes(t)},tituloT),nome+': o aviso abre a ficha na tarefa e acende');
  ok((await txt(p,'.task .mencao')).includes('@ana.prado'),nome+': o @ aparece destacado na tarefa');
  // Rafael menciona Ana numa reunião: só no sino
  await papel(p,'Analista');
  await p.evaluate(()=>{const S=JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')),t=S.terrenos.find(x=>x.neg&&x.neg.status==='ativo');
    const b=document.createElement('button');b.dataset.a='abrir';b.dataset.id=t.id;b.dataset.tab='negociacao';document.body.appendChild(b);b.click();b.remove()});await p.waitForTimeout(400);
  const temReu=await p.evaluate(()=>!!document.querySelector('[data-a=reu-form]'));
  if(temReu){await p.evaluate(()=>document.querySelector('[data-a=reu-form]').click());await p.waitForTimeout(150);
    await p.fill('#ru-r','Vendedor pediu prazo.');await p.click('#ru-n');await p.keyboard.type('@ana');await p.waitForTimeout(100);await p.keyboard.press('Tab');await p.keyboard.type('liga amanhã');
    await p.evaluate(()=>document.querySelector('form[data-form=reuniao]').requestSubmit());await p.waitForTimeout(250);
    S=await st(p);const r=S.notifs.find(x=>x.tipo==='mencao'&&x.txt.includes('reunião'));
    ok(r&&r.para==='Ana Prado'&&r.email===false,nome+': menção na reunião respeita o e-mail desligado');
  }else ok(false,nome+': ficha sem botão de reunião');
  if(w>900){await papel(p,'Diretor');await p.evaluate(()=>{document.querySelector('[data-a=sino]').click()});await p.waitForTimeout(100);
    await p.evaluate(()=>document.querySelector('[data-cfg=notif]').click());await p.waitForTimeout(250);await p.screenshot({path:O+nome+'_5_config.png'});
    ok((await txt(p,'.cfg-hd.cfg-nt')).includes('E-mail'),nome+': Configurações › Notificações tem a coluna E-mail')}
  await ctx.close()}
ok(!erros.length,'sem erro de script'+(erros.length?': '+erros.join(' / '):''));
await b.close();if(falhas.length){console.log(falhas.length+' falha(s)');process.exit(1)}console.log('tudo ok')})();
