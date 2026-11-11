import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, mensagemErro } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { data as fd } from '../lib/format';
import { formatar } from '../lib/mascara';
import { Carregando, Dialogo, Erro, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { NovoCorretor } from '../components/Corretor';
import { norm } from '../components/Marcar';
import { Vivo } from '../ficha/edicao';

// Cadastro de corretores (pedido do Moises, 11/nov/2026). O protótipo não tinha esta tela (só a lista fixa, o corretor
// na oferta e a criação rápida): é tela nova. /corretores lista com busca e quantos terrenos e ofertas cada um tem;
// /corretores/<id> é a ficha, com os campos editados no lugar (app.salvar_corretor, com as regras do app.criar_corretor),
// Desativar (corretor não se apaga: some das listas de escolha e as ofertas ficam), os terrenos e ofertas onde ele aparece
// e o histórico das alterações (app.auditoria de corretores e pessoas). Dados da lista em app.v_corretores.

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface CorretorV {
  id: string; pessoa_id: string; nome: string; apelido: string | null; email: string | null; celular: string | null; cpf: string | null;
  rg: string | null; creci: string | null; imobiliaria: string | null; creci_juridico: string | null; cnpj: string | null; endereco: string | null;
  observacoes: string | null; ativo: boolean; criado_em: string; qtd_terrenos: number; qtd_ofertas: number; ultima_oferta: string | null;
}

const fmtM = (v: string | null | undefined, t: 'tel' | 'doc') => (v ? formatar(v, v.length, t)[0] : '');
const dig = (s: string) => s.replace(/\D/g, '');

function useLista() {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['corretores-v', empresa?.id], enabled: !!empresa,
    queryFn: async (): Promise<CorretorV[]> => {
      const { data, error } = await supabase.from('v_corretores').select('*').eq('empresa_id', empresa!.id);
      if (error) throw error;
      return ((data ?? []) as CorretorV[]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
  });
}

export default function Corretores() {
  const { id } = useParams();
  return id ? <FichaCorretor id={id} /> : <ListaCorretores />;
}

/* busca por nome, apelido, imobiliária, Creci, e-mail ou telefone, sem acento; cada palavra precisa aparecer */
function bate(c: CorretorV, q: string) {
  if (!q.trim()) return true;
  const hay = norm([c.nome, c.apelido, c.imobiliaria, c.creci, c.creci_juridico, c.email].filter(Boolean).join(' '));
  const nums = [c.celular, c.cpf, c.cnpj].filter(Boolean).join(' ');
  return norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w) || (dig(w).length >= 3 && nums.includes(dig(w))));
}

function ListaCorretores() {
  const { edita } = useSessao();
  const q = useLista(), navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const [sit, setSit] = useState<'ativos' | 'inativos' | 'todos'>('ativos');
  const [novo, setNovo] = useState(false);
  const todos = q.data ?? [];
  const inativos = todos.filter((c) => !c.ativo).length;
  const l = todos.filter((c) => (sit === 'todos' || (sit === 'ativos') === c.ativo) && bate(c, busca));
  return (
    <div className="forma cr-pag">
      <div className="page-h">
        <div><h1>Corretores</h1>{q.data && <div className="muted">{todos.length - inativos} ativos{inativos ? ` · ${inativos} inativos` : ''}</div>}</div>
        {edita && <button className="btn primary" onClick={() => setNovo(true)}><Ic n="add" s={18} />Novo corretor</button>}
      </div>
      <div className="cr-barra">
        <label className="search cr-busca" htmlFor="cr-q">
          <Ic n="search" s={20} />
          <input id="cr-q" type="search" placeholder="Buscar por nome, apelido, imobiliária, Creci, e-mail ou telefone" autoComplete="off" data-sem-enter
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Situação">
          {([['ativos', 'Ativos'], ['inativos', 'Inativos'], ['todos', 'Todos']] as const).map(([k, r]) => (
            <button key={k} type="button" aria-pressed={sit === k} onClick={() => setSit(k)}>{r}</button>
          ))}
        </div>
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !l.length ? (
        <div className="card"><div className="empty">{todos.length ? 'Nenhum corretor com essa busca.' : 'Nenhum corretor cadastrado. Eles entram ao registrar uma oferta ou pelo botão Novo corretor.'}</div></div>
      ) : (
        <div className="card cr-lista">
          {l.map((c) => (
            <Link key={c.id} to={`/corretores/${c.id}`} className={`cr-l${c.ativo ? '' : ' inativo'}`}>
              <span className="cr-av" aria-hidden="true">{(c.nome.trim()[0] ?? '?').toUpperCase()}</span>
              <span className="cr-t">
                <span className="cr-n">{c.nome}{c.apelido ? <span className="muted"> ({c.apelido})</span> : null}{!c.ativo && <span className="chip cr-chip">Inativo</span>}</span>
                <span className="cr-s">{[c.imobiliaria, c.creci ? `Creci ${c.creci}` : null, fmtM(c.celular, 'tel'), c.email].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              <span className="cr-c">
                <span>{c.qtd_terrenos} {c.qtd_terrenos === 1 ? 'terreno' : 'terrenos'} · {c.qtd_ofertas} {c.qtd_ofertas === 1 ? 'oferta' : 'ofertas'}</span>
                {c.ultima_oferta && <span className="cr-s">Última oferta em {fd(c.ultima_oferta)}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
      {novo && createPortal(<NovoCorretor fechar={() => setNovo(false)} criado={(cid) => { setNovo(false); navegar(`/corretores/${cid}`); }} />, document.body)}
    </div>
  );
}

/* campos da ficha: [chave em salvar_corretor, rótulo, coluna da view, máscara, largura toda] */
const CAMPOS: [string, string, keyof CorretorV, ('tel' | 'doc' | 'email' | 'area')?, boolean?][] = [
  ['nome', 'Nome *', 'nome'], ['apelido', 'Apelido', 'apelido'],
  ['email', 'E-mail *', 'email', 'email'], ['celular', 'Celular *', 'celular', 'tel'],
  ['cpf', 'CPF', 'cpf', 'doc'], ['rg', 'RG', 'rg'], ['creci', 'Creci', 'creci'],
  ['imobiliaria', 'Nome da imobiliária', 'imobiliaria'], ['creci_juridico', 'Creci jurídico', 'creci_juridico'], ['cnpj', 'CNPJ', 'cnpj', 'doc'],
  ['endereco', 'Endereço', 'endereco', undefined, true], ['observacoes', 'Observações', 'observacoes', 'area', true],
];
const ROTULO: Record<string, string> = {
  nome_razao_social: 'Nome', email: 'E-mail', telefone: 'Celular', cpf_cnpj: 'CPF', apelido: 'Apelido', rg: 'RG', creci: 'Creci',
  imobiliaria: 'Imobiliária', creci_juridico: 'Creci jurídico', cnpj_imobiliaria: 'CNPJ', endereco: 'Endereço', observacoes: 'Observações', ativo: 'Situação',
};

function FichaCorretor({ id }: { id: string }) {
  const { empresa, edita } = useSessao();
  const qc = useQueryClient(), toast = useToast();
  const q = useLista();
  const c = q.data?.find((x) => x.id === id);
  const [conf, setConf] = useState(false);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['corretores-v'] });
    qc.invalidateQueries({ queryKey: ['corretores'] });
    qc.invalidateQueries({ queryKey: ['corretor-hist', id] });
    qc.invalidateQueries({ queryKey: ['ficha-com'] });
  };
  async function salvar(k: string, v: string | boolean): Promise<boolean> {
    const { error } = await supabase.rpc('salvar_corretor', { p_corretor: id, p_dados: { [k]: v } });
    if (error) { toast(mensagemErro(error), true); return false; }
    recarregar();
    return true;
  }
  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} />;
  if (!c) return <div className="forma"><div className="card"><div className="empty">Corretor não encontrado. <Link to="/corretores">Voltar aos corretores</Link></div></div></div>;
  return (
    <div className="forma cr-pag">
      <div className="cr-trilha"><Link to="/corretores">Corretores</Link><Ic n="chev" s={16} /><span>{c.nome}</span></div>
      <div className="page-h">
        <div><h1>{c.nome}{c.apelido ? <span className="muted cr-ap"> ({c.apelido})</span> : null}{!c.ativo && <span className="chip cr-chip">Inativo</span>}</h1>
          <div className="muted">{[c.imobiliaria, `cadastrado em ${fd(c.criado_em)}`].filter(Boolean).join(' · ')}</div></div>
        {edita && (c.ativo
          ? <button className="btn" onClick={() => setConf(true)}>Desativar</button>
          : <button className="btn" onClick={async () => { if (await salvar('ativo', true)) toast(`${c.nome} voltou a aparecer na escolha do corretor.`); }}>Reativar</button>)}
      </div>
      <section className="card sec cr-sec">
        <div className="sec-h"><h2>Dados do corretor</h2></div>
        <div className="sec-b">
          <div className={`kvg${edita ? ' kvg-ed vivo' : ''}`}>
            {CAMPOS.map(([k, rot, col, t, full]) => {
              const bruto = (c[col] as string | null) ?? '';
              const ini = t === 'tel' || t === 'doc' ? fmtM(bruto, t) : bruto;
              if (!edita) return <div key={k} className={full ? 'full' : ''}><div className="k">{rot.replace(' *', '')}</div>{ini ? <div className="v">{ini}</div> : <div className="v ni">Não informado</div>}</div>;
              return (
                <Vivo key={k} ini={ini} gravar={(v) => salvar(k, v)}>
                  {(p) => <div className={`inl-c${full ? ' full' : ''}`}><label className="k" htmlFor={`cr-${k}`}>{rot}</label>
                    {t === 'area' ? <textarea id={`cr-${k}`} rows={2} placeholder="Não informado" {...p} />
                      : <input id={`cr-${k}`} placeholder="Não informado" autoComplete="off" {...p}
                        {...(t === 'tel' ? { inputMode: 'tel' as const, 'data-fmt': 'tel' } : t === 'doc' ? { inputMode: 'numeric' as const, 'data-fmt': 'doc' } : t === 'email' ? { type: 'email', inputMode: 'email' as const } : {})} />}
                  </div>}
                </Vivo>
              );
            })}
          </div>
        </div>
      </section>
      <Vinculos id={id} />
      <Historico c={c} empresa={empresa?.id} />
      {conf && (
        <Dialogo titulo={`Desativar ${c.nome}?`} onFechar={() => setConf(false)}
          rodape={<><button className="btn text" onClick={() => setConf(false)}>Cancelar</button>
            <button className="btn primary" onClick={async () => { setConf(false); if (await salvar('ativo', false)) toast(`${c.nome} desativado.`); }}>Desativar</button></>}>
          <p style={{ marginTop: 0 }}>Ele deixa de aparecer na escolha do corretor das ofertas. As ofertas e os terrenos em que ele já está continuam com ele, e dá para reativar quando quiser.</p>
        </Dialogo>
      )}
    </div>
  );
}

/* terrenos e ofertas do corretor: as ofertas em que ele está (oferta_corretores) e os terrenos onde consta
   (terreno_corretores, também pelas partes); terreno excluído não aparece (a RLS o esconde) */
function Vinculos({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['corretor-vinc', id],
    queryFn: async () => {
      const [oc, tc] = await Promise.all([
        supabase.from('oferta_corretores').select('oferta_id,ofertas(id,numero,data_oferta,status,vigente,corretor_id,terreno_id)').eq('corretor_id', id),
        supabase.from('terreno_corretores').select('terreno_id,principal').eq('corretor_id', id),
      ]);
      if (oc.error) throw oc.error;
      if (tc.error) throw tc.error;
      const ofs = ((oc.data ?? []) as R[]).map((x) => x.ofertas).filter(Boolean) as R[];
      const ids = [...new Set([...ofs.map((o) => o.terreno_id), ...((tc.data ?? []) as R[]).map((x) => x.terreno_id)])];
      const vt = ids.length ? await supabase.from('v_terrenos').select('id,codigo,nome,municipio,fase_nome,etapa_nome,processo_status').in('id', ids) : { data: [], error: null };
      if (vt.error) throw vt.error;
      return { ofs, tc: (tc.data ?? []) as R[], ts: (vt.data ?? []) as R[] };
    },
  });
  const linhas = useMemo(() => {
    if (!q.data) return [];
    return q.data.ts.map((t) => ({
      t, principal: !!q.data.tc.find((x) => x.terreno_id === t.id)?.principal,
      ofs: q.data.ofs.filter((o) => o.terreno_id === t.id).sort((a, b) => a.numero - b.numero),
    })).sort((a, b) => String(a.t.codigo).localeCompare(String(b.t.codigo)));
  }, [q.data]);
  return (
    <section className="card sec cr-sec">
      <div className="sec-h"><h2>Terrenos e ofertas{linhas.length ? <> <span className="h-n">{linhas.length}</span></> : null}</h2></div>
      <div className="sec-b">
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !linhas.length ? <div className="muted">Este corretor ainda não está em nenhum terreno.</div> : (
          <div className="tblwrap"><table className="mini-tbl cr-tbl"><thead><tr><th>Terreno</th><th>Funil</th><th>Ofertas</th></tr></thead><tbody>
            {linhas.map(({ t, principal, ofs }) => (
              <tr key={t.id}>
                <td><Link to={`/terrenos/${t.codigo}/comercial`}><span className="num">{t.codigo}</span> {t.nome}</Link>
                  <div className="cr-s">{[t.municipio, principal ? 'Corretor principal do terreno' : null].filter(Boolean).join(' · ')}</div></td>
                <td>{t.fase_nome ? [t.fase_nome, t.etapa_nome].filter(Boolean).join(' · ') : <span className="muted">Backlog</span>}</td>
                <td>{ofs.length ? ofs.map((o) => (
                  <div key={o.id} className="cr-of"><span className="num">{t.codigo}-{o.numero}</span> · {fd(o.data_oferta)}
                    {o.vigente ? <span className="chip good">Ativa</span> : o.status === 'aguardando' ? <span className="chip warn">Aguardando</span> : <span className="chip">Não ativa</span>}
                    {o.corretor_id !== id && <span className="cr-s"> · com outro corretor principal</span>}</div>
                )) : <span className="muted">Pela parte, sem oferta</span>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>
    </section>
  );
}

/* histórico: as alterações do corretor e da pessoa dele (nome, e-mail, celular, CPF), da mais recente à mais antiga */
function Historico({ c, empresa }: { c: CorretorV; empresa?: string }) {
  const q = useQuery({
    queryKey: ['corretor-hist', c.id], enabled: !!empresa,
    queryFn: async () => {
      const { data, error } = await supabase.from('auditoria').select('id,tabela,acao,antes,depois,user_id,em').eq('empresa_id', empresa!)
        .or(`and(tabela.eq.corretores,registro_id.eq.${c.id}),and(tabela.eq.pessoas,registro_id.eq.${c.pessoa_id})`)
        .order('em', { ascending: false }).order('id', { ascending: false }).limit(200);
      if (error) throw error;
      const au = (data ?? []) as R[];
      const uids = [...new Set(au.map((a) => a.user_id).filter(Boolean))];
      const us = uids.length ? await supabase.from('usuarios').select('user_id,nome,email').in('user_id', uids) : { data: [] };
      return au.map((a): R => ({ ...a, quem: ((us.data ?? []) as R[]).find((u) => u.user_id === a.user_id)?.nome ?? 'Sistema' }));
    },
  });
  const itens = (q.data ?? []).flatMap((a) => {
    if (a.acao === 'insert') return a.tabela === 'corretores' ? [{ a, txt: 'Corretor cadastrado' }] : [];
    if (a.acao !== 'update') return [];
    return Object.keys(ROTULO).filter((k) => k in (a.depois ?? {}) && JSON.stringify(a.antes?.[k]) !== JSON.stringify(a.depois?.[k])).map((k) => {
      if (k === 'ativo') return { a, txt: a.depois.ativo ? 'Reativado' : 'Desativado' };
      const f = (v: unknown) => (v == null || v === '' ? 'vazio' : k === 'telefone' ? fmtM(String(v), 'tel') : k === 'cpf_cnpj' || k === 'cnpj_imobiliaria' ? fmtM(String(v), 'doc') : String(v));
      return { a, txt: `${ROTULO[k]}: ${f(a.antes?.[k])} → ${f(a.depois?.[k])}` };
    });
  });
  return (
    <section className="card sec cr-sec">
      <div className="sec-h"><h2>Histórico</h2></div>
      <div className="sec-b">
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !itens.length
          ? <div className="muted">Nenhuma alteração registrada desde que o histórico do corretor começou a ser guardado.</div>
          : <ul className="cr-hist">{itens.map(({ a, txt }, i) => (
            <li key={`${a.id}-${i}`}><span>{txt}</span><span className="cr-s">{new Date(a.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {a.quem}</span></li>
          ))}</ul>}
      </div>
    </section>
  );
}
