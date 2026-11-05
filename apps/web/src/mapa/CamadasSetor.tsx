import { useEffect, useRef } from 'react';
import { Ic } from '../components/Moldura';
import { CAMADAS, DENS_MET, RENDA_MET, rgba, setLocal, type Camada, type Setores } from './setores';

// Marcação das camadas por setor, igual à do protótipo (tools/prototipo/proto_setores.js: rdBarraBotao, rdMenu,
// rdLegItem, rdLegendaHtml, dsLegendaHtml, rdBoxHtml, dsBoxHtml, setoresModal).

const num = (v: number, d = 0) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d });
const rdNum = (v: number, d: number) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const m2 = (v: number) => num(v, 2) + ' m²';
const RD_IC: Record<Camada, string> = { renda: 'rd-ic', dens: 'ds-ic' };
type F = { ate: number | null; rotulo: string; cor: string };

/** botão Camadas da barra do mapa, com a lista (uma camada ligada de cada vez) */
export function BotaoCamadas({ camada, aberto, abrir, escolher }: { camada: Camada | null; aberto: boolean; abrir: (v: boolean) => void; escolher: (c: Camada | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) abrir(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { abrir(false); e.preventDefault(); e.stopImmediatePropagation(); } };
    document.addEventListener('pointerdown', fora, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', esc, true); };
  }, [aberto, abrir]);
  const it = (v: Camada | null, ico: string, l: string) => (
    <button type="button" role="menuitemradio" aria-checked={camada === v} onClick={() => { abrir(false); escolher(v); }}><span className={ico} />{l}</button>
  );
  return (
    <div className="mp-cam" ref={ref}>
      <button type="button" className="mp-renda-b" aria-haspopup="menu" aria-expanded={aberto} aria-pressed={!!camada} title="Camadas por setor censitário (IBGE)" onClick={() => abrir(!aberto)}>
        {camada ? <span className={RD_IC[camada]} /> : <Ic n="layers" s={18} />}{camada ? CAMADAS[camada].curto : 'Camadas'}<span className="cam-seta"><Ic n="chev" s={16} /></span>
      </button>
      {aberto && (
        <div className="mp-cam-m" role="menu" aria-label="Camadas">
          {it('renda', 'rd-ic', 'Renda familiar')}{it('dens', 'ds-ic', 'Densidade demográfica')}{it(null, 'cam-off', 'Nenhuma')}
        </div>
      )}
    </div>
  );
}

/** itens das camadas na legenda do mapa */
export function ItensLegenda({ camada, alternar }: { camada: Camada | null; alternar: (c: Camada) => void }) {
  return (
    <>
      <button type="button" className="lg-i" aria-pressed={camada === 'renda'} onClick={() => alternar('renda')}><span className="lg-poi"><span className="rd-ic" /></span>Renda familiar (setores)</button>
      <button type="button" className="lg-i" aria-pressed={camada === 'dens'} onClick={() => alternar('dens')}><span className="lg-poi"><span className="ds-ic" /></span>Densidade demográfica (setores)</button>
    </>
  );
}

/** legenda das cores sobre o mapa: fechada, a escala numa linha; aberta, a lista das faixas */
export function LegendaSetor({ camada, aberta, alternar, carregado, erro, metodologia }: {
  camada: Camada; aberta: boolean; alternar: (v: boolean) => void; carregado: boolean; erro: boolean; metodologia: (m: Camada) => void;
}) {
  const dens = camada === 'dens', m = dens ? DENS_MET : RENDA_MET, fx: F[] = dens ? m.faixas.slice(1) : m.faixas;
  const marcas: Record<number, string> = dens ? { 2: '5', 3: '10', 5: '20', 7: '50', 8: '100' } : { 2: '3', 4: '5', 7: '8', 10: '13', 13: '22', 15: '30' };
  return (
    <details id="rd-leg" className="rd-leg" open={aberta} onToggle={(e) => alternar((e.target as HTMLDetailsElement).open)}>
      <summary>
        <span className="rd-leg-t">{dens ? 'Densidade demográfica' : 'Renda familiar estimada'}</span>
        <span className="rd-esc" aria-hidden="true">
          <span className="rd-esc-c">{fx.map((f, i) => <i key={i} style={{ background: f.cor }} />)}</span>
          <span className="rd-esc-m">{Object.entries(marcas).map(([k, v]) => <b key={k} style={{ left: `${(Number(k) / fx.length) * 100}%` }}>{v}</b>)}</span>
          <span className="rd-esc-u">{dens ? 'mil hab/km² · toque para ver as faixas' : 'mil R$ por mês · toque para ver as faixas'}</span>
        </span>
      </summary>
      <div className="rd-leg-l">
        {(m.faixas as F[]).map((f, i) => <div key={i} className="rd-li"><span className="rd-q" style={{ background: rgba(f.cor, Math.max(m.opacidade, 0.85)) }} />{f.rotulo}</div>)}
        {!dens && <div className="rd-li"><span className="rd-q rd-sem" />Sem dado do IBGE</div>}
        <div className="rd-leg-p">
          {dens ? <>Habitantes por km², bruta · Censo {m.censoAno} · </> : <>Mensal, valores de {m.pnadAnoAtual} · Censo {m.censoAno} · </>}
          <button className="linkbtn" onClick={() => metodologia(camada)}>Metodologia</button>
        </div>
        {!carregado && <div className="rd-leg-p">{erro ? 'Não foi possível carregar os setores.' : 'Carregando os setores do IBGE…'}</div>}
      </div>
    </details>
  );
}

/** quadro do setor tocado */
export function QuadroSetor({ d, i, camada, fechar, metodologia }: { d: Setores; i: number; camada: Camada; fechar: () => void; metodologia: (m: Camada) => void }) {
  const cd = d.cd[i];
  const topo = (
    <div className="cc-hd">
      <div className="cc-ti"><div className="cc-n">Setor censitário</div><div className="muted">{setLocal(d, i)}</div></div>
      <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar (Esc)" onClick={fechar}><Ic n="close" s={20} /></button>
    </div>
  );
  if (camada === 'dens') {
    const m = DENS_MET, f = d.dfaixa[i]!, a = d.area[i] / 1e6;
    return (
      <div id="rd-box"><div className="cc-box rd-box" role="dialog" aria-label={`Setor censitário ${cd}`}>
        {topo}
        {d.pop[i] > 0
          ? <div className="cc-k rd-k" style={{ borderLeftColor: m.faixas[f].cor }}><div className="faint">Densidade demográfica bruta</div><div className="cc-big">{num(Math.round(d.dens[i]!))} hab/km²</div><div className="faint">Faixa {m.faixas[f].rotulo} hab/km²</div></div>
          : <div className="cc-meta">Setor sem moradores no Censo {m.censoAno}.</div>}
        <dl className="rd-kv">
          <div><dt>Pessoas – Censo {m.censoAno}</dt><dd>{num(d.pop[i])}</dd></div>
          <div><dt>Domicílios ocupados</dt><dd>{num(d.dom[i])}</dd></div>
          <div><dt>Área do setor</dt><dd>{a < 0.1 ? m2(Math.round(d.area[i])) : num(a, 2) + ' km²'}</dd></div>
          <div><dt>Código do setor</dt><dd className="rd-cd">{cd}</dd></div>
        </dl>
        <div className="rd-nota">Pessoas ÷ área total do setor, com parques, vias e terrenos vazios. <button className="linkbtn" onClick={() => metodologia('dens')}>Metodologia</button></div>
      </div></div>
    );
  }
  const m = RENDA_MET, sit = d.sit[i], v = d.v4[i], at = d.rAt[i], f = d.faixa[i]!;
  const motivo = sit === 1 ? 'O IBGE não divulgou a renda deste setor (sigilo, poucos domicílios).' : sit === 3 ? 'Setor sem moradores no Censo 2022.' : 'O IBGE não divulgou a renda deste setor.';
  const dist = v != null && d.v6[i] != null && v > m.distorcidaRazao * d.v6[i]!;
  return (
    <div id="rd-box"><div className="cc-box rd-box" role="dialog" aria-label={`Setor censitário ${cd}`}>
      {topo}
      {v != null ? <>
        <div className="cc-k rd-k" style={{ borderLeftColor: m.faixas[f].cor }}><div className="faint">Renda familiar mensal estimada (valores de {m.pnadAnoAtual})</div><div className="cc-big">{brl(at)}</div><div className="faint">{m.faixas[f].rotulo}</div></div>
        <dl className="rd-kv">
          <div><dt>Renda do responsável – Censo {m.censoAno}</dt><dd>{brl(v)}</dd></div>
          <div><dt>Fator familiar</dt><dd>{rdNum(m.fatorFamiliar, 1)}×</dd></div>
          <div><dt>Atualização PNAD ({m.pnadAnoBase} → {m.pnadAnoAtual})</dt><dd>{rdNum(m.fatorPnad, 4)}×</dd></div>
          <div><dt>Código do setor</dt><dd className="rd-cd">{cd}</dd></div>
        </dl>
        {dist && <div className="rd-av">Média puxada por poucas rendas altas: a mediana do responsável é {brl(d.v6[i])}, menos de 1/{m.distorcidaRazao} da média.</div>}
        <div className="rd-nota">Renda familiar estimada, não observação direta do IBGE por setor. <button className="linkbtn" onClick={() => metodologia('renda')}>Metodologia</button></div>
      </> : <>
        <div className="cc-meta">{motivo}</div>
        <dl className="rd-kv"><div><dt>Código do setor</dt><dd className="rd-cd">{cd}</dd></div><div><dt>Pessoas</dt><dd>{num(d.pop[i])}</dd></div></dl>
      </>}
    </div></div>
  );
}

/** janela da metodologia (renda ou densidade) */
export function Metodologia({ camada, fechar }: { camada: Camada; fechar: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { fechar(); e.preventDefault(); e.stopImmediatePropagation(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [fechar]);
  const x = <button className="iconbtn" aria-label="Fechar" onClick={fechar}><Ic n="close" /></button>;
  let corpo: React.ReactNode;
  if (camada === 'dens') {
    const m = DENS_MET, f = m.faixas;
    corpo = <>
      <div className="dh"><h2>Metodologia da densidade</h2>{x}</div>
      <div className="rd-mt">
        <p>Densidade demográfica bruta de cada setor censitário: pessoas que moram no setor divididas pela área total dele, em habitantes por km².</p>
        <h3>Dado oficial (IBGE)</h3><p><b>{m.variavel}</b>: {m.variavelDescricao}. Área: {m.areaOrigem}.</p>
        <p className="rd-f">Densidade = {m.variavel} ÷ área do setor (km²)</p>
        <h3>Limites</h3>
        <ul>
          <li>É densidade bruta: a área inclui parques, vias, represas, galpões e terrenos vazios. Um setor com um parque dentro parece pouco denso mesmo com muita gente morando na borda.</li>
          <li>Setores muito pequenos de prédios ou de favela passam de 100 mil hab/km²; ficam todos na última faixa.</li>
          <li>Sem moradores é zero de verdade (o IBGE contou ninguém), em cinza, separado da primeira faixa.</li>
          <li>Faixas fixas, nunca quantis: o limite de cima entra na faixa (até {num(f[1].ate)} inclui {num(f[1].ate)}).</li>
        </ul>
        <p className="faint">{m.faixasOrigem} Versão {m.versao}.</p>
      </div>
    </>;
  } else {
    const m = RENDA_MET, c = m.fatorFamiliar * m.fatorPnad;
    corpo = <>
      <div className="dh"><h2>Metodologia da renda</h2>{x}</div>
      <div className="rd-mt">
        <p>Os valores apresentados são estimativas de renda familiar mensal. A base espacial e a renda do responsável são provenientes do Censo Demográfico {m.censoAno} do IBGE. A renda familiar foi estimada a partir da relação observada entre renda do responsável e renda domiciliar nos microdados do Censo. Os valores foram posteriormente atualizados pela evolução nominal da renda domiciliar per capita da PNAD Contínua para o Estado de São Paulo.</p>
        <h3>Dado oficial (IBGE)</h3><p><b>{m.variavelBase}</b>: {m.variavelBaseDescricao}, Censo {m.censoAno}. Não é renda familiar nem renda per capita. Geometria: malha oficial dos setores censitários de {m.censoAno}.</p>
        <h3>Transformação nossa</h3><p>Fator familiar <b>{rdNum(m.fatorFamiliar, 1)}×</b>. {m.fatorFamiliarOrigem}. É o mesmo para todos os setores; não é estatística do IBGE por setor.</p>
        <h3>Atualização</h3><p>Fator PNAD <b>{rdNum(m.fatorPnad, 6)}×</b> = R$ {num(m.pnadValorAtual)} ({m.pnadAnoAtual}) ÷ R$ {num(m.pnadValorBase)} ({m.pnadAnoBase}). {m.pnadFonte}. {m.pnadAnoAtual} é a média do ano, não o mês atual.</p>
        <p className="rd-f">Renda familiar estimada atual = {m.variavelBase} × {rdNum(m.fatorFamiliar, 1)} × {rdNum(m.fatorPnad, 6)} = {m.variavelBase} × {rdNum(c, 6)}</p>
        <h3>Limites</h3>
        <ul>
          <li>O fator é um só para a cidade inteira: em bairros onde mais gente da casa trabalha, a renda real fica acima da estimada; onde o responsável é quase a única renda, abaixo.</li>
          <li>No raio, a distribuição é dos domicílios pela faixa da média do setor: o IBGE não publica a distribuição dentro do setor.</li>
          <li>Setores em sigilo ou sem moradores ficam sem cor e fora da média, nunca como zero.</li>
          <li>Faixas: o limite de cima entra na faixa (até R$ 2.000 inclui R$ 2.000), depois de arredondar para reais.</li>
        </ul>
        <p className="faint">Metodologia versão {m.versao}.</p>
      </div>
    </>;
  }
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="dialog" role="dialog" aria-modal="true">
        {corpo}
        <div className="df"><button className="btn primary" onClick={fechar}>Fechar</button></div>
      </div>
    </div>
  );
}
