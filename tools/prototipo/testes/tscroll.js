const TMP=require('path').join(__dirname,'..','saida')+'/';
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');
(async()=>{const b=await chromium.launch();const achados=new Map();
for(const w of [1920,1440,1366,1280,1180,1024,900,820,768,390])for(const mm of [false,true])for(const nome of ['Barão','Itapura','Cupecê','Raimundo']){
const ctx=await b.newContext({viewport:{width:w,height:900}});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();await p.goto('file:///x/a.html');await p.evaluate(mm=>{localStorage.clear();if(mm)localStorage.setItem('bkm-terrenos-menu','min')},mm);await p.reload();await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(100);
const ok=await p.evaluate(n=>{const a=[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes(n));if(a){a.click();return true}return false},nome);if(!ok){await ctx.close();continue}
await p.waitForTimeout(250);
for(const k of ['geral','cadastro','comercial','negociacao','fases','tarefas','urbanismo','documentos','historico']){const h=await p.$(`#bl-${k} .bl-h[aria-expanded=false]`);if(h&&await h.isVisible()){await h.click();await p.waitForTimeout(60)}}
await p.waitForTimeout(200);
const r=await p.evaluate(()=>{const out=[];document.querySelectorAll('#main *').forEach(e=>{const c=getComputedStyle(e);if(e.scrollWidth>e.clientWidth+1&&e.offsetParent&&(['auto','scroll'].includes(c.overflowX)||e.matches('.tblwrap,.dt-wrap'))){const sec=e.closest('.sec')?.querySelector('h2')?.textContent?.trim()||e.closest('.bl')?.id||'';out.push((e.className.toString().split(' ')[0]||e.tagName)+' @ '+sec+' ('+e.scrollWidth+'>'+e.clientWidth+')')}});
  return {itens:out,pagina:document.documentElement.scrollWidth>innerWidth}});
r.itens.forEach(x=>{const key=x.replace(/ \(.*/,'');if(!achados.has(key))achados.set(key,[]);achados.get(key).push(w+(mm?'m':'')+' '+nome+' '+x.match(/\(.*\)/)[0])});
if(r.pagina){const key='PÁGINA';if(!achados.has(key))achados.set(key,[]);achados.get(key).push(w+(mm?'m':'')+' '+nome)}
await ctx.close()}
for(const [k,v] of achados)console.log(k,'→',v.length,'casos; ex:',v.slice(0,4).join(' | '));
console.log('total tipos',achados.size);await b.close()})();
