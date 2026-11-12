/* Versão nova no ar com a página aberta: os arquivos do app têm o hash no nome
   (assets/laz-perf-XXXX.js) e cada publicação no Cloud Run só leva os da versão
   nova. Quem estava com a página aberta pede um pedaço carregado sob demanda
   (laser do topográfico, JSZip, planta do loteamento...) que não existe mais e o
   import falha ("Failed to fetch dynamically imported module").
   Saída: ao falhar o carregamento, recarregar a página uma vez, que traz a versão
   nova (o index.html vai sem cache). Se a falha se repete logo depois da recarga
   (rede fora, arquivo de fato quebrado), não recarrega de novo: o erro segue para
   quem chamou, como antes. */

const CHAVE = 'bkm-terrenos-recarga-versao';
const JANELA_MS = 30_000;

function recarregouAgora(): boolean {
  try {
    const t = Number(sessionStorage.getItem(CHAVE) || 0);
    return Date.now() - t < JANELA_MS;
  } catch {
    return false;
  }
}

/** Recarrega a página uma vez; devolve false se acabou de recarregar (não repete). */
export function recarregarVersaoNova(): boolean {
  if (recarregouAgora()) return false;
  try {
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    /* sem sessionStorage: recarrega mesmo assim, uma vez por página */
  }
  window.location.reload();
  return true;
}

export function instalarVersaoNova() {
  // o Vite avisa por este evento quando um import() da página publicada falha
  // (sem preventDefault: o erro segue para quem chamou, que fica parado até a
  // recarga; engolir o erro faria o import devolver undefined)
  window.addEventListener('vite:preloadError', () => {
    recarregarVersaoNova();
  });
}
