// Aba Infraestrutura, por enquanto só o quadro Relevo com o perfil e o botão Topográfico (proto_topo.js › topoBotao,
// topoModal): a janela mostra o plano, o andamento passo a passo, a prévia e os botões para baixar o PDF e o ZIP.
// Visita técnica e viabilidades técnicas em ficha/Infra.tsx; a medição automática do perfil entra depois.
import { useState } from 'react';
import { useSessao } from '../lib/sessao';
import { Dialogo } from '../components/ui';
import { Ic } from '../components/Moldura';
import { Quadro } from '../ficha/edicao';
import { TP_N, type Ficha } from '../ficha/dados';
import { QuadrosInfra } from '../ficha/Infra';
import { gerarTopografico, TOPO_FOLGA, type Resultado } from './gerar';

const num = (v: number, d = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
/** resultado da sessão por terreno, para reabrir a janela sem gerar de novo */
const FEITOS: Record<string, Resultado> = {};

export default function AbaInfra({ f }: { f: Ficha }) {
  const [aberto, setAberto] = useState(false);
  const sp = f.t.municipio_id === '3550308' || /^são paulo$/i.test(f.municipio ?? '');
  const tp = f.topo;
  return (
    <>
      <Quadro aba="infra" id="relevo" primeiro titulo="Relevo"
        acoes={f.poly ? <button className="btn sm" onClick={() => setAberto(true)}><Ic n="doc" s={16} />Topográfico</button> : null}>
        <div className="sec-b"><dl className="kvl">
          <div className="kv"><dt>Perfil topográfico</dt><dd>{tp ? <span className={`tp-chip tp-${tp.perfil}`}>{tp.perfil === 'inclinado' && tp.decl != null ? `Inclinado · ${num(tp.decl, 1)}%` : TP_N[tp.perfil] ?? tp.perfil}</span> : <span className="ni">Não medido</span>}</dd></div>
          {tp?.desnivel != null ? <div className="kv"><dt>Desnível</dt><dd>{num(tp.desnivel, 1)} m</dd></div> : null}
        </dl>
          <div className="hint" style={{ marginTop: 12 }}>
            {sp ? 'Em São Paulo o topográfico usa o laser da prefeitura e entra numa próxima entrega.' : f.poly ? 'O botão Topográfico gera a planta preliminar com as curvas de nível do Google sobre a imagem de satélite.' : 'Desenhe a poligonal do terreno para gerar o topográfico.'}
          </div>
        </div>
      </Quadro>
      <QuadrosInfra f={f} />
      {aberto ? <JanelaTopo f={f} sp={sp} fechar={() => setAberto(false)} /> : null}
    </>
  );
}

type Est = 'andando' | 'feito' | 'erro';
function JanelaTopo({ f, sp, fechar }: { f: Ficha; sp: boolean; fechar: () => void }) {
  const { usuario, membro, empresa } = useSessao() as any;
  const [passos, setPassos] = useState<[string, Est, string?][]>([]);
  const [em, setEm] = useState(false), [erro, setErro] = useState<string | null>(null), [R, setR] = useState<Resultado | null>(FEITOS[f.id] ?? null);
  async function gerar() {
    setEm(true); setErro(null); setR(null); setPassos([]);
    const passo = (t: string) => setPassos((ps) => [...ps.map((p) => (p[1] === 'andando' ? [p[0], 'feito', p[2]] as [string, Est, string?] : p)), [t, 'andando']]);
    const av = (t: string) => setPassos((ps) => ps.map((p, i) => (i === ps.length - 1 ? [p[0], p[1], t] : p)));
    try {
      const r = await gerarTopografico({ id: f.id, codigo: f.codigo, nome: f.nome, municipio: f.municipio, uf: f.uf, municipioId: f.t.municipio_id ?? null, poly: f.poly, empresa: empresa?.id ?? null },
        usuario?.nome ?? membro?.nome ?? 'BKM', passo, av);
      FEITOS[f.id] = r; setR(r);
      setPassos((ps) => ps.map((p) => [p[0], 'feito', p[2]]));
    } catch (e: any) {
      console.error(e);
      setErro(e?.message ?? String(e));
      setPassos((ps) => ps.map((p) => (p[1] === 'andando' ? [p[0], 'erro', p[2]] : p)));
    } finally { setEm(false); }
  }
  const baixar = (k: 'pdf' | 'zip') => {
    if (!R) return;
    const url = URL.createObjectURL(R[k]), a = document.createElement('a');
    a.href = url; a.download = R.nome + '.' + k; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const S = R?.resumo;
  const rodape = em ? null : S
    ? <><button className="btn text" onClick={gerar}>Gerar de novo</button><button className="btn" onClick={() => baixar('zip')}>DXF + imagem (.zip)</button><button className="btn primary" onClick={() => baixar('pdf')}>PDF</button></>
    : sp ? <button className="btn" onClick={fechar}>Fechar</button>
    : <button className="btn primary" onClick={gerar}>{erro ? 'Tentar de novo' : 'Gerar topográfico'}</button>;
  return (
    <Dialogo titulo="Topográfico preliminar" sub={f.nome} onFechar={() => { if (!em) fechar(); }} rodape={rodape}>
      {passos.length && (em || erro) ? (
        <ol className="topo-passos">{passos.map(([p, st, det], i) => (
          <li key={i} className={st}>{st === 'andando' ? <span className="spin" aria-hidden="true" /> : <Ic n={st === 'erro' ? 'warn' : 'check'} s={16} />}
            <span>{p}{det ? <span className="faint"> · {det}</span> : null}</span></li>))}</ol>
      ) : null}
      {erro ? <div className="banner warn"><Ic n="warn" /><div>O topográfico não saiu: {erro}</div></div> : null}
      {S && R && !em ? (
        <>
          <img className="topo-previa" src={R.previa} alt="Prévia do topográfico" />
          <dl className="kvl topo-kv">
            <div className="kv"><dt>Contorno</dt><dd>{S.contorno}</dd></div>
            <div className="kv"><dt>Cotas no terreno</dt><dd>{num(S.min, 1)} a {num(S.max, 1)} m · desnível {num(S.max - S.min, 1)} m{S.dec != null ? ` · declividade média ${num(S.dec, 1)}%` : ''}</dd></div>
            <div className="kv"><dt>Fonte das cotas</dt><dd>{S.cotas}</dd></div>
            <div className="kv"><dt>Curvas</dt><dd>{S.curvas}</dd></div>
            <div className="kv"><dt>Folha</dt><dd>{S.papel} · escala 1:{num(S.escala)}</dd></div>
            <div className="kv"><dt>Imagem</dt><dd>{S.imagem}</dd></div>
            {S.erros.length ? <div className="kv"><dt>Não responderam</dt><dd>{S.erros.join(', ')}</dd></div> : null}
          </dl>
          <div className="hint">Os pontos do Google não são guardados: o DXF leva só as curvas, com a cota. O ZIP traz o DXF, a imagem referenciada e o PDF; no AutoCAD, Salvar como DWG. Os arquivos não ficam guardados no sistema enquanto a aba Documentos não existe: baixe-os agora.</div>
        </>
      ) : null}
      {!em && !S && !erro ? (
        sp ? <div className="hint">Em São Paulo as cotas vêm sempre do laser de 2020 da prefeitura, nunca do Google. Essa parte entra numa próxima entrega.</div>
          : <ul className="topo-plano">
            <li>Contorno pelos lotes da prefeitura quando todas as inscrições têm o lote (São José dos Campos, pelo GeoSanja); senão, a poligonal desenhada.</li>
            <li>Levantamento até {TOPO_FOLGA} m em volta do contorno.</li>
            <li>Cotas do Google, um ponto a cada 5 m (a origem do Google tem 9,5 m; erro típico de 3 a 4 m), com curvas de 1 em 1 m e mestra de 5 em 5 m.</li>
            <li>Por trás, a imagem de satélite do Google com os nomes das ruas, para reconhecer as ruas e a vizinhança.</li>
            <li>Sai um PDF A3 e um ZIP com o DXF, a imagem e o PDF.</li>
          </ul>
      ) : null}
    </Dialogo>
  );
}
