/** Tela da primeira versão que ainda não foi portada do protótipo. */
export default function EmPorte({ titulo }: { titulo: string }) {
  return (
    <section className="m-pagina">
      <h1 className="m-titulo">{titulo}</h1>
      <div className="m-card m-vazio">
        Esta tela ainda está sendo portada do protótipo. Ordem: login, mapa, novo terreno, ficha e funil.
      </div>
    </section>
  );
}
