// Aba Infraestrutura: o quadro Relevo (proto_infra.js › tpSecao), com o perfil medido sozinho (topo/relevo.ts) e o botão
// Topográfico (proto_topo.js › topoBotao, topoModal): a janela mostra o plano, o andamento passo a passo, a prévia e os
// botões para baixar o PDF e o ZIP. Visita técnica e viabilidades técnicas em ficha/Infra.tsx.
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { data as fd } from '../lib/format';
import { GEO_BASE } from '../novo/geosampa';
import { chavePoly, ehSP, medirEGravar, useEstRelevo } from './relevo';
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
  const sp = ehSP(f.t.municipio_id, f.municipio);
  return (
    <>
      <Quadro aba="infra" id="relevo" primeiro titulo="Relevo"
        acoes={f.poly ? <button className="btn sm" onClick={() => setAberto(true)}><Ic n="doc" s={16} />Topográfico</button> : null}>
        <div className="sec-b"><Relevo f={f} sp={sp} /></div>
      </Quadro>
      <QuadrosInfra f={f} />
      {aberto ? <JanelaTopo f={f} sp={sp} fechar={() => setAberto(false)} /> : null}
    </>
  );
}

const TP_CFG0 = { plano: 5, inclinado: 10, leve: 13, mediano: 19, intenso: 24, agudo: 30, critico: 1.5 };
/** limites da classificação da empresa (Configurações › Topografia), para a frase da regra; sem linha, os padrões */
function useTopoCfg(empresa: string | null | undefined) {
  return useQuery({
    queryKey: ['topo-cfg', empresa], enabled: !!empresa, staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('topografia_config').select('plano_ate_pct,inclinado_ate_pct,leve_ate_pct,mediano_ate_pct,intenso_ate_pct,agudo_ate_pct,critico_terra_m3m2').eq('empresa_id', empresa!).maybeSingle();
      const d = data as Record<string, number | null> | null, v = (k: string, p: number) => (d?.[k] != null ? Number(d[k]) : p);
      return { plano: v('plano_ate_pct', 5), inclinado: v('inclinado_ate_pct', 10), leve: v('leve_ate_pct', 13), mediano: v('mediano_ate_pct', 19), intenso: v('intenso_ate_pct', 24), agudo: v('agudo_ate_pct', 30), critico: v('critico_terra_m3m2', 1.5) };
    },
  });
}

/** quadro Relevo (proto_infra.js › tpSecao): a faixa com o perfil, os números da medição, a escala dos 7 perfis e a regra */
function Relevo({ f, sp }: { f: Ficha; sp: boolean }) {
  const { edita } = useSessao(), qc = useQueryClient(), est = useEstRelevo(f.id);
  const t = f.t as Record<string, any>, C = useTopoCfg(t.empresa_id).data ?? TP_CFG0;
  const medir = () => medirEGravar({ id: f.id, poly: f.poly, sp }, qc);
  if (!f.poly) return <div className="muted">Sem poligonal. A classificação sai sozinha quando a poligonal for desenhada.</div>;
  if (est.em) return <div className="tp-medindo"><span className="tp-gira" aria-hidden="true" />Medindo o relevo pelas cotas {sp ? 'do laser 2020 da prefeitura' : 'do Google'}...</div>;
  const perfil = t.topo_perfil as string | null;
  if (!perfil && est.erro) return (
    <div className="banner warn"><Ic n="warn" /><div style={{ flex: 1 }}>Não deu para medir o relevo: {est.erro}
      {!est.local && edita ? <> <button className="linkbtn" onClick={medir}>Tentar de novo</button></> : null}</div></div>
  );
  if (!perfil) return <div className="muted">{edita ? 'Ainda não medido.' : 'Ainda não medido. Quem edita a ficha mede ao abri-la.'}</div>;
  const decl = t.topo_declividade_pct != null ? Number(t.topo_declividade_pct) : null, incl = t.topo_inclinacao_pct != null ? Number(t.topo_inclinacao_pct) : null;
  const terra = t.topo_terra_m3m2 != null ? Number(t.topo_terra_m3m2) : null, desn = t.topo_desnivel_m != null ? Number(t.topo_desnivel_m) : null;
  const laser = t.topo_fonte === 'laser';
  const nome = perfil === 'inclinado' && decl != null ? `Inclinado · ${num(decl, 1)}%` : TP_N[perfil] ?? perfil;
  const lin = (k: string, v: ReactNode, x?: ReactNode) => <div className="kv"><dt>{k}</dt><dd>{v}{x ? <span className="kv-2">{x}</span> : null}</dd></div>;
  /* os pontos e as cotas mínima e máxima só existem na medição desta sessão (o banco guarda o desnível) */
  const daSessao = est.chave === chavePoly(f.poly) && est.pontos != null;
  return (
    <>
      <div className={`tp-faixa tp-${perfil}`}><div className="tp-n">{nome}</div>
        <div className="tp-s">{!laser && perfil !== 'acidentado_critico' ? 'Acidentado não avaliado: com as cotas do Google o erro é de 1 a 4 m. Precisa do levantamento.' : `Medido em ${fd(String(t.topo_calculado_em ?? '').slice(0, 10))}`}</div></div>
      <dl className="kvl tp-kv">
        {decl != null ? lin('Declividade média', num(decl, 1) + '%', 'média da inclinação em cada ponto; decide o perfil') : null}
        {incl != null ? lin('Inclinação do plano', num(incl, 1) + '%', 'plano que melhor se ajusta às cotas') : null}
        {lin('Terra mexida até o plano', terra != null ? num(terra, 2) + ' m³/m²' : <span className="faint">não avaliada</span>, terra != null ? 'corte + aterro ÷ área' : '')}
        {desn != null ? lin('Desnível', num(desn, 1) + ' m', daSessao ? `cotas de ${num(est.min!, 1)} a ${num(est.max!, 1)} m` : '') : null}
        {lin('Cotas', laser ? 'Laser 2020 da Prefeitura de São Paulo' : 'Google (grade de 5 m)', daSessao ? num(est.pontos!) + ' pontos dentro da poligonal' : '')}
      </dl>
      <div className="tp-escala" role="list" aria-label="Perfis">{Object.entries(TP_N).map(([k, l]) => <span role="listitem" key={k} className={`tp-e tp-${k}${k === perfil ? ' on' : ''}`}>{l}</span>)}</div>
      <p className="tp-regra">Pela declividade média: Plano até {num(C.plano)}%, Inclinado até {num(C.inclinado)}%, Leve até {num(C.leve)}%, Mediano até {num(C.mediano)}%, Intenso até {num(C.intenso)}%, Agudo até {num(C.agudo)}%; acima, ou com terra mexida acima de {num(C.critico, 2)} m³/m², Crítico. Triagem: não substitui o levantamento planialtimétrico.
        {edita && (!sp || GEO_BASE) ? <> <button className="linkbtn" onClick={medir}>Medir de novo</button></> : null}</p>
      {est.erro && est.chave === chavePoly(f.poly) ? <div className="banner warn" style={{ marginTop: 12 }}><Ic n="warn" /><div>A nova medição falhou: {est.erro}</div></div> : null}
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
    : sp && !GEO_BASE ? <button className="btn" onClick={fechar}>Fechar</button>
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
            <div className="kv"><dt>Área levantada</dt><dd>{S.levantado}</dd></div>
            <div className="kv"><dt>Cotas no terreno</dt><dd>{num(S.min, 1)} a {num(S.max, 1)} m · desnível {num(S.max - S.min, 1)} m{S.dec != null ? ` · declividade média ${num(S.dec, 1)}%` : ''}</dd></div>
            <div className="kv"><dt>Fonte das cotas</dt><dd>{S.cotas}</dd></div>
            <div className="kv"><dt>Curvas</dt><dd>{S.curvas}</dd></div>
            <div className="kv"><dt>Folha</dt><dd>{S.papel} · escala 1:{num(S.escala)}{S.papel !== 'A3' ? ' (para plotter)' : ''}</dd></div>
            <div className="kv"><dt>Imagem</dt><dd>{S.imagem}</dd></div>
            {S.erros.length ? <div className="kv"><dt>Não responderam</dt><dd>{S.erros.join(', ')}</dd></div> : null}
          </dl>
          <div className="hint">{/^Google/.test(S.cotas) ? 'Os pontos do Google não são guardados: o DXF leva só as curvas, com a cota. ' : 'O DXF leva as curvas e a malha de pontos cotados do laser. '}O ZIP traz o DXF, a imagem referenciada e o PDF; no AutoCAD, Salvar como DWG. Os arquivos não ficam guardados no sistema enquanto a aba Documentos não existe: baixe-os agora.</div>
        </>
      ) : null}
      {!em && !S && !erro ? (
        sp ? <>
          <ul className="topo-plano">
            <li>Contorno pelos lotes da prefeitura quando todos os SQLs têm o lote no GeoSampa; senão, a poligonal desenhada.</li>
            <li>Com SQL, levantamento até {TOPO_FOLGA} m em volta do contorno. Sem SQL, a quadra inteira (o quarteirão entre as ruas) que a poligonal ocupa, mais os {TOPO_FOLGA} m, com todos os lotes numerados pelo SQL; a folha cresce (A2, A1 ou A0) para manter a escala do terreno.</li>
            <li>Cotas do laser de 2020 da Prefeitura de São Paulo (erro típico de 0,1 a 0,2 m na forma do terreno), com curvas de 1 em 1 m e mestra de 5 em 5 m. Se a prefeitura não responder, tente de novo: em São Paulo o Google não é usado.</li>
            <li>Por trás, a imagem de satélite do Google com os nomes das ruas (se o Google falhar, a ortofoto 2023/2024 da prefeitura), e do GeoSampa as calçadas com a largura, os eixos com a largura da via, as quadras, os lotes, os córregos e os melhoramentos viários.</li>
            <li>Sai um PDF e um ZIP com o DXF (com a malha de pontos cotados), a imagem e o PDF.</li>
          </ul>
          {!GEO_BASE ? <div className="hint">O laser e o GeoSampa só respondem na versão publicada.</div> : null}
        </>
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
