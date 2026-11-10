/** Tela da primeira versão que ainda não foi portada do protótipo (classes do protótipo). */
export default function EmPorte({ titulo }: { titulo: string }) {
  return (
    <div className="forma">
      <div className="page-h"><div><h1>{titulo}</h1></div></div>
      <section className="card"><div className="empty">Esta tela ainda está sendo portada do protótipo.</div></section>
    </div>
  );
}
