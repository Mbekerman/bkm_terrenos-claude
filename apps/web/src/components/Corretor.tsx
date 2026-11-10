import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, mensagemErro } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from './ui';

// Corretor da oferta (pedido do Moises, 10/nov/2026): escolher um dos cadastrados ou "Novo corretor", com nome,
// e-mail e celular obrigatórios e apelido, CPF, RG, Creci, imobiliária, Creci jurídico, CNPJ e endereço opcionais
// (app.criar_corretor). O cadastro completo de corretores, com base própria, fica para depois.

export interface CorretorOp { id: string; nome: string; apelido: string | null; imobiliaria: string | null; ativo: boolean }

export function useCorretores() {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['corretores', empresa?.id], enabled: !!empresa,
    queryFn: async (): Promise<CorretorOp[]> => {
      const { data, error } = await supabase.from('corretores').select('id,apelido,imobiliaria,ativo,pessoas(nome_razao_social)').eq('empresa_id', empresa!.id);
      if (error) throw error;
      return ((data ?? []) as unknown as { id: string; apelido: string | null; imobiliaria: string | null; ativo: boolean; pessoas: { nome_razao_social: string } | null }[])
        .map((c) => ({ id: c.id, apelido: c.apelido, imobiliaria: c.imobiliaria, ativo: c.ativo, nome: c.pessoas?.nome_razao_social ?? '—' }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

const NOVO = '__novo__';
/** seletor do corretor, com "Novo corretor..." no fim da lista */
export function EscolherCorretor({ id, value, onChange, vazio = 'Sem corretor / direto' }: { id: string; value: string; onChange: (v: string) => void; vazio?: string }) {
  const q = useCorretores(), { edita } = useSessao();
  const [novo, setNovo] = useState(false);
  return <>
    <select id={id} value={value} onChange={(e) => (e.target.value === NOVO ? setNovo(true) : onChange(e.target.value))}>
      <option value="">{vazio}</option>
      {(q.data ?? []).filter((c) => c.ativo !== false || c.id === value).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.apelido ? ` (${c.apelido})` : ''}{c.imobiliaria ? ' · ' + c.imobiliaria : ''}</option>)}
      {edita && <option value={NOVO}>+ Novo corretor...</option>}
    </select>
    {novo && createPortal(<NovoCorretor fechar={() => setNovo(false)} criado={(c) => { setNovo(false); onChange(c); }} />, document.body)}
  </>;
}

export function NovoCorretor({ fechar, criado }: { fechar: () => void; criado: (id: string) => void }) {
  const { empresa } = useSessao(), toast = useToast(), qc = useQueryClient();
  const [v, setV] = useState<Record<string, string>>({ nome: '', apelido: '', email: '', celular: '', cpf: '', rg: '', creci: '', imobiliaria: '', creci_juridico: '', cnpj: '', endereco: '' });
  const [grav, setGrav] = useState(false);
  const m = (k: string) => (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value }));
  async function enviar(ev: FormEvent) {
    ev.preventDefault(); ev.stopPropagation();
    if (grav) return;
    setGrav(true);
    const { data, error } = await supabase.rpc('criar_corretor', { p_empresa: empresa!.id, p_dados: v });
    setGrav(false);
    if (error) { toast(mensagemErro(error), true); return; }
    await qc.invalidateQueries({ queryKey: ['corretores'] });
    qc.invalidateQueries({ queryKey: ['ficha-com'] });
    toast(`${v.nome.trim()} cadastrado.`);
    criado(data as string);
  }
  const campo = (k: string, rot: string, extra: Record<string, unknown> = {}, full = false) => (
    <div className={`field${full ? ' full' : ''}`}><label htmlFor={`nc-${k}`}>{rot}</label><input id={`nc-${k}`} value={v[k]} onChange={m(k)} {...extra} /></div>
  );
  return (
    <Dialogo titulo="Novo corretor" onFechar={fechar}
      rodape={<><button className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" type="submit" form="f-ncor" disabled={grav}>{grav ? 'Cadastrando...' : 'Cadastrar corretor'}</button></>}>
      <form id="f-ncor" onSubmit={enviar}><div className="fields">
        {campo('nome', 'Nome *', { required: true, autoComplete: 'off' })}
        {campo('apelido', 'Apelido', { autoComplete: 'off' })}
        {campo('email', 'E-mail *', { required: true, type: 'email', inputMode: 'email' })}
        {campo('celular', 'Celular *', { required: true, inputMode: 'tel', 'data-fmt': 'tel', placeholder: '(11) 98765-4321' })}
        {campo('cpf', 'CPF', { inputMode: 'numeric', 'data-fmt': 'doc' })}
        {campo('rg', 'RG')}
        {campo('creci', 'Creci')}
        {campo('imobiliaria', 'Nome da imobiliária')}
        {campo('creci_juridico', 'Creci jurídico')}
        {campo('cnpj', 'CNPJ', { inputMode: 'numeric', 'data-fmt': 'doc' })}
        {campo('endereco', 'Endereço', {}, true)}
      </div></form>
    </Dialogo>
  );
}
