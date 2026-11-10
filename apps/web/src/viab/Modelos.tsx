import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { brl } from './calc';
import { erroTxt } from './dados';

// Modelos de estudo (porte de tools/prototipo/proto_viab.js › vbNovoHtml, vbModeloHtml, viabSubmit, vbModeloResumo):
// "Salvar como modelo" guarda valores e bases do estudo (sem tipologias nem as condições do terreno) só para quem
// salvou ou, pelo administrador, para a empresa; Novo estudo pergunta o modelo. A leitura é só por
// app.modelos_viabilidade, que fora da diretoria tira Taxas e Despesas financeiras.

export interface Modelo {
  id: string; user_id: string | null; nome: string; padrao: boolean;
  dados: { custo_m2?: number | null; linhas?: { despesa: string; valor: number | null }[] };
}

export function useModelos(empresa: string | undefined) {
  return useQuery({
    queryKey: ['viab-modelos', empresa], enabled: !!empresa,
    queryFn: async (): Promise<Modelo[]> => {
      const { data, error } = await supabase.rpc('modelos_viabilidade', { p_empresa: empresa });
      if (error) throw error;
      return (data ?? []) as Modelo[];
    },
  });
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function resumo(m: Modelo) {
  const n = (m.dados.linhas ?? []).filter((l) => l.valor != null).length;
  return [m.dados.custo_m2 != null ? `obra ${brl(m.dados.custo_m2)}/m²` : '', `${n} ite${n === 1 ? 'm' : 'ns'} com valor`].filter(Boolean).join(' · ');
}

/** Novo estudo: nome e modelo (o padrão da empresa vem marcado; sem padrão, "Sem modelo") */
export function NovoEstudo({ nomeIni, modelos, onCriar, onFechar }: {
  nomeIni: string; modelos: Modelo[]; onCriar: (nome: string, modelo: string | null) => Promise<void>; onFechar: () => void;
}) {
  const { membro, empresa } = useSessao();
  const toast = useToast(), qc = useQueryClient();
  const adm = !!membro?.administrador;
  const padrao = modelos.find((m) => m.padrao) ?? null;
  const [nome, setNome] = useState(nomeIni);
  const [sel, setSel] = useState<string>(padrao?.id ?? '');
  const [grav, setGrav] = useState(false);
  const apagar = async (m: Modelo) => {
    if (!window.confirm(`Apagar o modelo "${m.nome}"?`)) return;
    const { error } = await supabase.rpc('apagar_modelo_viabilidade', { p_modelo: m.id });
    if (error) { toast(erroTxt(error), true); return; }
    if (sel === m.id) setSel('');
    await qc.invalidateQueries({ queryKey: ['viab-modelos', empresa?.id] });
    toast(`Modelo "${m.nome}" apagado.`);
  };
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); if (grav) return;
    setGrav(true);
    try { await onCriar(nome.trim() || nomeIni, sel || null); } finally { setGrav(false); }
  };
  const op = (id: string, titulo: string, info: string, del?: Modelo) => (
    <div className="vb-mod-r" key={id || 'sem'}>
      <label className="opt-radio"><input type="radio" name="modelo" value={id} checked={sel === id} onChange={() => setSel(id)} />
        <span><b>{titulo}</b><small>{info}</small></span></label>
      {del && <button type="button" className="iconbtn sm lixo" aria-label={`Apagar o modelo ${del.nome}`} title="Apagar" onClick={() => apagar(del)}><Ic n="lixo" s={18} /></button>}
    </div>
  );
  return (
    <Dialogo titulo="Novo estudo" sub="O estudo nasce com os valores e as bases de cálculo do modelo. As tipologias e as condições do terreno você preenche no estudo." onFechar={onFechar}
      rodape={<><button type="button" className="btn text" onClick={onFechar}>Cancelar</button><button className="btn primary" type="submit" form="f-vbn" disabled={grav}>Criar estudo</button></>}>
      <form id="f-vbn" onSubmit={enviar}><div className="fields">
        <div className="field full"><label htmlFor="vbn-n">Nome do estudo</label><input id="vbn-n" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <div className="field full"><span className="lbl" id="vbn-m">Modelo</span>
          <div className="vb-mods" role="radiogroup" aria-labelledby="vbn-m">
            {modelos.map((m) => op(m.id, m.nome, `${m.user_id ? 'Meu modelo' : m.padrao ? 'Padrão da empresa' : 'Da empresa'} · ${resumo(m)}`, m.user_id || adm ? m : undefined))}
            {op('', 'Sem modelo', 'Só a lista de itens da empresa, com os valores padrão dela')}
          </div></div>
      </div></form>
    </Dialogo>
  );
}

/** Salvar como modelo: com o nome de um modelo seu (ou da empresa, pelo administrador) que já existe, ele é atualizado */
export function SalvarModelo({ viab, dir, onFechar }: { viab: string; dir: boolean; onFechar: () => void }) {
  const { membro, empresa, usuario } = useSessao();
  const toast = useToast(), qc = useQueryClient();
  const adm = !!membro?.administrador;
  const ms = useModelos(empresa?.id).data ?? [];
  const [nome, setNome] = useState('');
  const [escopo, setEscopo] = useState<'meu' | 'empresa' | 'padrao'>('meu');
  const [grav, setGrav] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); if (grav) return;
    const n = nome.trim();
    if (!n) { toast('Dê um nome ao modelo.', true); return; }
    const emp = adm && escopo !== 'meu';
    const igual = ms.find((m) => (emp ? m.user_id == null : m.user_id === usuario?.user_id) && semAcento(m.nome) === semAcento(n));
    setGrav(true);
    try {
      const { data, error } = await supabase.rpc('salvar_modelo_viabilidade', { p_viab: viab, p_nome: n, p_da_empresa: emp, p_modelo: igual?.id ?? null });
      if (error) { toast(erroTxt(error), true); return; }
      if (emp && escopo === 'padrao') {
        const r = await supabase.rpc('marcar_modelo_padrao', { p_empresa: empresa!.id, p_modelo: data });
        if (r.error) { toast(erroTxt(r.error), true); return; }
      }
      await qc.invalidateQueries({ queryKey: ['viab-modelos', empresa?.id] });
      toast(`${igual ? 'Modelo atualizado:' : 'Modelo'} "${n}"${igual ? '' : ' salvo'}${emp ? ' para a empresa' : ''}${escopo === 'padrao' && emp ? ', padrão do estudo novo' : ''}.`);
      onFechar();
    } finally { setGrav(false); }
  };
  return (
    <Dialogo titulo="Salvar como modelo" onFechar={onFechar}
      sub={`Guarda os valores e as bases de cálculo deste estudo (custo de obras, dedução do VGV e os itens de cada seção) para usar ao criar um estudo novo. Tipologias, permuta, mínimo garantido e pagamentos do terreno ficam fora.${dir ? '' : ' Taxas e Despesas financeiras não entram: o estudo novo usa os valores da empresa.'}`}
      rodape={<><button type="button" className="btn text" onClick={onFechar}>Cancelar</button><button className="btn primary" type="submit" form="f-vbm" disabled={grav}>Salvar modelo</button></>}>
      <form id="f-vbm" onSubmit={enviar}><div className="fields">
        <div className="field full"><label htmlFor="vbm-n">Nome do modelo</label>
          <input id="vbm-n" required maxLength={60} placeholder="Ex.: MCMV Faixa 2 em São Paulo" value={nome} onChange={(e) => setNome(e.target.value)} />
          <div className="hint">Com o nome de um modelo seu que já existe, ele é atualizado.</div></div>
        {adm && <div className="field full"><span className="lbl" id="vbm-e">Para quem</span>
          <span className="vb-escopo" role="radiogroup" aria-labelledby="vbm-e">
            {([['meu', 'Só para mim'], ['empresa', 'Para a empresa'], ['padrao', 'Padrão da empresa']] as const).map(([k, l]) => (
              <label key={k} className="opt-radio"><input type="radio" name="escopo" value={k} checked={escopo === k} onChange={() => setEscopo(k)} />{l}</label>
            ))}
          </span></div>}
      </div></form>
    </Dialogo>
  );
}
