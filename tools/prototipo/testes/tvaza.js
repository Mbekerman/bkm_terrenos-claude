const TMP=require('path').join(__dirname,'..','saida')+'/';
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');
(async()=>{const b=await chromium.launch();const ach=new Map();
for(const w of (process.env.W||'1920,1600,1536,1440,1366,1280,1180,1100,1024,960,900,820,768,390').split(',').map(Number))for(const mm of [false,true])for(const nome of ['Barão','Cupecê']){
const ctx=await b.newContext({viewport:{width:w,height:900}});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();await p.goto('file:///x/a.html');await p.evaluate(mm=>{localStorage.clear();if(mm)localStorage.setItem('bkm-terrenos-menu','min')},mm);await p.reload();await p.waitForTimeout(250);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(100);
await p.evaluate(n=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes(n)).click(),nome);await p.waitForTimeout(250);
for(const k of ['cadastro','comercial','negociacao','tarefas','urbanismo','documentos','historico']){const h=await p.$(`#bl-${k} .bl-h[aria-expanded=false]`);if(h&&await h.isVisible()){await h.click();await p.waitForTimeout(40)}}
await p.waitForTimeout(250);
const r=await p.evaluate(()=>{const out=[];
  document.querySelectorAll('#main .sec, #main .pn, #main .kv').forEach(box=>{if(!box.offsetParent)return;const B=box.getBoundingClientRect();
    box.querySelectorAll('*').forEach(e=>{if(!e.offsetParent&&getComputedStyle(e).position!=='fixed')return;if(e.closest('.leaflet-container,.mini-mapa,.v-menu,.pn-menu'))return;const q=e.getBoundingClientRect();if(!q.width||!q.height)return;
      if(q.right>B.right+1.5||q.left<B.left-1.5){const t=(box.querySelector('h2')?.textContent||box.className.toString().split(' ')[0]).trim().slice(0,28);out.push(t+' ⟶ '+(e.tagName.toLowerCase()+'.'+(e.className.toString().split(' ')[0]||'')).slice(0,30)+' +'+Math.round(Math.max(q.right-B.right,B.left-q.left)))}})});
  return {itens:[...new Set(out)],pagina:document.documentElement.scrollWidth>innerWidth}});
r.itens.forEach(x=>{const k=x.replace(/ \+\d+$/,'');if(!ach.has(k))ach.set(k,[]);ach.get(k).push(w+(mm?'m':'')+' '+nome+' '+x.match(/\+\d+$/)[0])});
if(r.pagina){if(!ach.has('PÁGINA'))ach.set('PÁGINA',[]);ach.get('PÁGINA').push(w+(mm?'m':''))}
await ctx.close()}
for(const [k,v] of ach)console.log(k,'→',v.length,'| ex:',v.slice(0,5).join(', '));console.log('total',ach.size);await b.close()})();
