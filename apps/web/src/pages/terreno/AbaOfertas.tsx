import { data, ORIGEM, reais } from '../../lib/format';
import type { Oferta } from '../../lib/types';
import { Icon } from '../../components/ui';

export default function AbaOfertas({ area, ofertas }: { area: number | null; ofertas: Oferta[] }) {
  return (
    <>
      {ofertas.length > 1 && (
        <div className="banner blue" style={{ marginBottom: 16 }}><Icon n="layers" /><div>
          <div className="bt">{ofertas.length} ofertas para o mesmo terreno</div>
          <div>A primeira oferta registrada fica marcada. Ajuda a resolver disputa de comissão entre corretores.</div>
        </div></div>
      )}
      <section className="card"><div className="tl">
        {ofertas.map((o, i) => (
          <div key={o.id} className="tli">
            <span className={`ai ${i === 0 ? 'good' : 'blue'}`}><Icon n="money" s={16} /></span>
            <div>
              <div className="tx"><b className="num">{reais(o.valor_pedido)}</b> · {ORIGEM[o.origem]}{o.contato ? ` · ${o.contato}` : ''}</div>
              <div className="ts">
                {o.valor_pedido && area ? `${reais(Math.round(o.valor_pedido / area))}/m²` : ''}
                {i === 0 && ofertas.length > 1 && <> · <b style={{ color: 'var(--good)' }}>primeira oferta</b></>}
              </div>
            </div>
            <span className="when">{data(o.recebida_em)}</span>
          </div>
        ))}
      </div></section>
    </>
  );
}
