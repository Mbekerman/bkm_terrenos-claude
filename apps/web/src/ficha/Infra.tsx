// Aba Infraestrutura, quadros Visita técnica e Viabilidades técnicas (porte de proto_infra.js › vtSecao, vtecSecao).
// Visita técnica: data da visita (terrenos.visita_tecnica_em, pela ficha) e os 8 itens ativos de app.itens_infraestrutura,
// cada um Não verificado, Sim, Parcial, Não ou Não se aplica, com observação (app.terreno_infraestrutura; o que não tem
// linha é "não verificado" pela view v_terreno_infraestrutura). Viabilidades técnicas: Energia, Água, Esgoto e Gás
// (app.terreno_viabilidades_tecnicas), com concessionária, datas do pedido, da emissão e a validade, e "Vencida" ou
// "Vence em" (30 dias). Tudo grava ao escolher ou ao sair do campo, como no protótipo.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { data as fd, hojeISO as hoje, somarDias as somaDias } from '../lib/format';
import type { Ficha, R } from './dados';
import { abrirQuadroJa, focar, Quadro, usePedido, Vivo, useSalvar } from './edicao';

const VT_OPC: [string, string, string][] = [['nao_verificado', 'Não verificado', ''], ['sim', 'Sim', 'good'], ['parcial', 'Parcial', 'warn'], ['nao', 'Não', 'crit'], ['nao_se_aplica', 'Não se aplica', '']];
const VTEC_S: [string, string, string][] = [['nao_solicitada', 'Não solicitada', ''], ['solicitada', 'Solicitada', 'blue'], ['viavel', 'Viável', 'good'], ['condicionada', 'Condicionada', 'warn'], ['nao_viavel', 'Não viável', 'crit']];
const CONC: Record<string, string> = { energia: 'Enel', agua: 'Sabesp', esgoto: 'Sabesp', gas: 'Comgás' };
const retorno = (s: string) => ['viavel', 'condicionada', 'nao_viavel'].includes(s);
/** vencida (viável ou condicionada com a validade passada) ou vencendo em até 30 dias */
export function vence(v: R): 'vencida' | 'vence' | null {
  if (!v.validade || !['viavel', 'condicionada'].includes(v.situacao)) return null;
  const h = hoje();
  return v.validade < h ? 'vencida' : v.validade <= somaDias(h, 30) ? 'vence' : null;
}

function useInfra(id: string) {
  return useQuery({
    queryKey: ['ficha-infra', id],
    queryFn: async () => {
      const [it, vt] = await Promise.all([
        supabase.from('v_terreno_infraestrutura').select('item,nome,ordem,disponibilidade,data_verificacao,observacoes').eq('terreno_id', id).order('ordem'),
        supabase.from('v_terreno_viabilidades_tecnicas').select('servico,nome,ordem,situacao,concessionaria,solicitada_em,emitida_em,validade,condicoes').eq('terreno_id', id).order('ordem'),
      ]);
      if (it.error) throw it.error;
      if (vt.error) throw vt.error;
      return { itens: it.data as R[], viabs: vt.data as R[] };
    },
  });
}

export function QuadrosInfra({ f }: { f: Ficha }) {
  const q = useInfra(f.id);
  if (q.isLoading) return <section className="sec"><div className="sec-b"><div className="faint">Carregando…</div></div></section>;
  if (q.error) return <section className="sec"><div className="sec-b"><div className="banner warn">Não deu para ler a infraestrutura: {(q.error as Error).message}</div></div></section>;
  return <><Visita f={f} itens={q.data!.itens} /><Viabilidades f={f} viabs={q.data!.viabs} /></>;
}

function Visita({ f, itens }: { f: Ficha; itens: R[] }) {
  const { edita } = useSessao(), toast = useToast(), qc = useQueryClient(), salvar = useSalvar(f);
  const visita = ((f.t as R).visita_tecnica_em as string | null) ?? '';
  const nv = itens.filter((i) => i.disponibilidade === 'nao_verificado').length;
  /* "Visita técnica" do Falta preencher: abre o quadro e vai ao primeiro item não verificado */
  usePedido(['visita'], () => { abrirQuadroJa('infra', 'visita'); const i = itens.find((x) => x.disponibilidade === 'nao_verificado'); focar(i ? `vt-s-${i.item}` : 'vt-dt'); });
  const recarregar = () => { qc.invalidateQueries({ queryKey: ['ficha-infra', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); qc.invalidateQueries({ queryKey: ['ficha-logs'] }); };
  const gravar = async (i: R, mud: R) => {
    const d = mud.disponibilidade ?? i.disponibilidade;
    const linha = {
      terreno_id: f.id, item: i.item, empresa_id: (f.t as R).empresa_id, disponibilidade: d,
      observacoes: 'observacoes' in mud ? mud.observacoes : i.observacoes ?? null,
      /* o banco pede a data da verificação em todo item verificado: a da visita, senão hoje */
      data_verificacao: d === 'nao_verificado' ? null : i.data_verificacao ?? (visita || hoje()),
    };
    const { error } = await supabase.from('terreno_infraestrutura').upsert(linha, { onConflict: 'terreno_id,item' });
    if (error) { toast(error.message, true); return false; }
    /* o primeiro item verificado marca a visita em hoje, como no protótipo */
    if (d !== 'nao_verificado' && !visita) await salvar({ visita_tecnica_em: hoje() });
    else toast('Salvo.');
    recarregar();
    return true;
  };
  return (
    <Quadro aba="infra" id="visita" titulo={<>Visita técnica{nv ? <span className="faint" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>{nv} não verificado{nv > 1 ? 's' : ''}</span> : null}</>}>
      <div className="sec-b vt-b">
        <div className="field vt-data"><label htmlFor="vt-dt">Data da visita</label>
          <Vivo ini={visita} imediato gravar={(v) => salvar({ visita_tecnica_em: v || null })}>
            {(p) => <input id="vt-dt" type="date" {...p} disabled={!edita} />}
          </Vivo>
        </div>
        <div className="vt-l">{itens.map((i) => {
          const o = VT_OPC.find((x) => x[0] === i.disponibilidade) ?? VT_OPC[0];
          return (
            <div className="vt-r" id={`vt-${i.item}`} key={i.item}>
              <span className="vt-n">{i.nome}</span>
              <select id={`vt-s-${i.item}`} className={`chip chip-sel ${o[2]}`} aria-label={i.nome} value={i.disponibilidade} disabled={!edita}
                onChange={(e) => gravar(i, { disponibilidade: e.target.value })}>
                {VT_OPC.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
              <Vivo ini={i.observacoes ?? ''} gravar={(v) => gravar(i, { observacoes: v.trim() || null })}>
                {(p) => <input className="vt-obs" {...p} placeholder={edita ? 'Observação' : ''} aria-label={`Observação sobre ${i.nome}`} disabled={!edita} />}
              </Vivo>
            </div>
          );
        })}</div>
      </div>
    </Quadro>
  );
}

function Viabilidades({ f, viabs }: { f: Ficha; viabs: R[] }) {
  const { edita } = useSessao(), toast = useToast(), qc = useQueryClient();
  const venc = viabs.filter((v) => vence(v) === 'vencida').length;
  const gravar = async (v: R, campo: string, valor: string | null) => {
    const n: R = { ...v, [campo]: valor };
    if (campo === 'situacao') {
      if (retorno(n.situacao) && !n.emitida_em) n.emitida_em = hoje();
      if (n.situacao !== 'nao_solicitada' && !n.solicitada_em) n.solicitada_em = n.situacao === 'solicitada' ? hoje() : null;
      if (!retorno(n.situacao)) { n.emitida_em = null; n.validade = null; }
    }
    if (campo === 'validade' && n.validade && n.emitida_em && n.validade < n.emitida_em) { toast('A validade não pode ser antes da emissão.', true); return false; }
    if (campo === 'emitida_em' && retorno(n.situacao) && !n.emitida_em) { toast('Retorno da concessionária precisa da data de emissão.', true); return false; }
    const linha = {
      terreno_id: f.id, servico: v.servico, empresa_id: (f.t as R).empresa_id, situacao: n.situacao, concessionaria: n.concessionaria ?? null,
      solicitada_em: n.solicitada_em ?? null, emitida_em: n.emitida_em ?? null, validade: n.validade ?? null, condicoes: n.condicoes ?? null,
    };
    const { error } = await supabase.from('terreno_viabilidades_tecnicas').upsert(linha, { onConflict: 'terreno_id,servico' });
    if (error) { toast(error.message, true); return false; }
    toast('Salvo.');
    qc.invalidateQueries({ queryKey: ['ficha-infra', f.id] });
    qc.invalidateQueries({ queryKey: ['ficha-logs'] });
    return true;
  };
  const d = !edita;
  return (
    <Quadro aba="infra" id="vtec" titulo={<>Viabilidades técnicas{venc ? <span className="chip crit" style={{ marginLeft: 8 }}>{venc} vencida{venc > 1 ? 's' : ''}</span> : null}</>}>
      <div className="sec-b"><div className="vtec-l">{viabs.map((v) => {
        const o = VTEC_S.find((x) => x[0] === v.situacao) ?? VTEC_S[0], vv = vence(v), k = v.servico;
        const campo = (c: string, rot: string, tipo: 'text' | 'date', extra: R = {}) => (
          <div className={`field${c === 'condicoes' ? ' full' : ''}`}><label htmlFor={`vc-${k}-${c}`}>{rot}</label>
            <Vivo ini={v[c] ?? ''} imediato={tipo === 'date'} gravar={(x) => gravar(v, c, x.trim() || null)}>
              {(p) => <input id={`vc-${k}-${c}`} type={tipo} {...p} disabled={d} {...extra} />}
            </Vivo>
          </div>
        );
        return (
          <div className="vtec-r" id={`vtec-${k}`} key={k}>
            <div className="vtec-h">
              <span className="vt-n">{v.nome}</span>
              <select className={`chip chip-sel ${o[2]}`} aria-label={`Situação da viabilidade de ${v.nome}`} value={v.situacao} disabled={d}
                onChange={(e) => gravar(v, 'situacao', e.target.value)}>
                {VTEC_S.map(([s, n]) => <option key={s} value={s}>{n}</option>)}
              </select>
              {vv === 'vencida' ? <span className="chip crit">Vencida em {fd(v.validade)}</span> : vv === 'vence' ? <span className="chip warn">Vence em {fd(v.validade)}</span> : null}
            </div>
            {v.situacao === 'nao_solicitada' ? null : (
              <div className="vtec-c">
                {campo('concessionaria', 'Concessionária', 'text', { placeholder: CONC[k] ?? '' })}
                {campo('solicitada_em', 'Pedida em', 'date')}
                {retorno(v.situacao) ? <>{campo('emitida_em', 'Emitida em', 'date')}{campo('validade', 'Validade', 'date', { min: v.emitida_em ?? undefined })}</> : null}
                {v.situacao === 'solicitada' ? null : <div className="field full"><label htmlFor={`vc-${k}-condicoes`}>{v.situacao === 'condicionada' ? 'Condições' : 'Observação'}</label>
                  <Vivo ini={v.condicoes ?? ''} gravar={(x) => gravar(v, 'condicoes', x.trim() || null)}>
                    {(p) => <input id={`vc-${k}-condicoes`} {...p} disabled={d} placeholder={v.situacao === 'condicionada' ? 'O que a concessionária exige para atender' : ''} />}
                  </Vivo></div>}
              </div>
            )}
          </div>
        );
      })}</div></div>
    </Quadro>
  );
}
