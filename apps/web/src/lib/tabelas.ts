/* Tabelas que não cabem no quadro viram lista empilhada em vez de rolar para o lado
   (ajustaTabelas do protótipo, proto_painel.js): cada célula ganha o rótulo da coluna
   (data-l) e o .tblwrap ganha a classe "empilha", que o CSS do protótipo já trata. */
function ajustar() {
  document.querySelectorAll<HTMLElement>('.tblwrap,.dt-wrap').forEach((w) => {
    const t = w.querySelector('table');
    if (!t) return;
    const cab = [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
    t.querySelectorAll('tbody tr').forEach((tr) => {
      let i = 0;
      [...tr.children].forEach((td) => { if (!td.hasAttribute('data-l')) td.setAttribute('data-l', cab[i] || ''); i += (td as HTMLTableCellElement).colSpan || 1; });
    });
    vistos.observe(w); // aparece ou muda de largura: mede de novo
    if (!w.offsetParent) return; // escondida (quadro fechado): mede quando aparecer
    // mede sem a classe (empilhada, a tabela sempre cabe) e só troca se mudou
    const tinha = w.classList.contains('empilha');
    if (tinha) w.classList.remove('empilha');
    const nao = !w.classList.contains('rola') && t.scrollWidth > w.clientWidth + 1;
    if (nao || tinha) w.classList.toggle('empilha', nao);
  });
}
let pend = 0;
const agendar = () => { cancelAnimationFrame(pend); pend = requestAnimationFrame(ajustar); };
const vistos = new ResizeObserver(agendar);
let instalado = false;
export function instalarTabelas() {
  if (instalado) return;
  instalado = true;
  new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', agendar);
  agendar();
}
