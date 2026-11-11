import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, mensagemErro } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from './ui';
import { Ic } from './Moldura';
import { nota, norm } from './Marcar';

// Corretor da oferta (pedido do Moises, 10/nov/2026): escolher um dos cadastrados ou "Novo corretor", com nome,
// e-mail e celular obrigatórios e apelido, CPF, RG, Creci, imobiliária, Creci jurídico, CNPJ e endereço opcionais
// (app.criar_corretor). O cadastro completo de corretores, com base própria, fica para depois.

export interface CorretorOp { id: string; nome: string; apelido: string | null; imobiliaria: string | null; ativo: boolean; email: string | null }

export function useCorretores() {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['corretores', empresa?.id], enabled: !!empresa,
    queryFn: async (): Promise<CorretorOp[]> => {
      const { data, error } = await supabase.from('corretores').select('id,apelido,imobiliaria,ativo,pessoas(nome_razao_social,email)').eq('empresa_id', empresa!.id);
      if (error) throw error;
      return ((data ?? []) as unknown as { id: string; apelido: string | null; imobiliaria: string | null; ativo: boolean; pessoas: { nome_razao_social: string; email: string | null } | null }[])
        .map((c) => ({ id: c.id, apelido: c.apelido, imobiliaria: c.imobiliaria, ativo: c.ativo, nome: c.pessoas?.nome_razao_social ?? '—', email: c.pessoas?.email ?? null }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

const NOVO = '__novo__';
type ItemCor = { k: string; rot: string; sub?: string };
const rotulo = (c: CorretorOp) => c.nome + (c.apelido ? ` (${c.apelido})` : '');
/** corretor escolhido por busca (pedido do Moises, 10/nov/2026): digitar filtra pela busca aproximada (nome, apelido ou
    imobiliária, sem acento, letras na ordem, quem começa com o digitado primeiro); a seta abre todos em ordem alfabética;
    "+ Novo corretor..." no fim. Setas e Enter escolhem, Esc fecha, sair sem escolher volta o que estava. */
export function EscolherCorretor({ id, value, onChange, vazio = 'Sem corretor / direto' }: { id: string; value: string; onChange: (v: string) => void; vazio?: string }) {
  const q = useCorretores(), { edita } = useSessao();
  const [novo, setNovo] = useState(false);
  const [txt, setTxt] = useState<string | null>(null);  // null = mostra o escolhido
  const [aberto, setAberto] = useState(false);
  const [i, setI] = useState(0);
  const inp = useRef<HTMLInputElement>(null), caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const todos = (q.data ?? []).filter((c) => c.ativo !== false || c.id === value);
  const atual = todos.find((c) => c.id === value);
  const busca = (txt ?? '').trim();
  const achados = busca
    ? todos.map((c) => ({ c, n: [nota(c.nome, '', norm(busca).replace(/\s+/g, '')), c.apelido ? nota(c.apelido, '', norm(busca).replace(/\s+/g, '')) : null, c.imobiliaria && norm(c.imobiliaria).includes(norm(busca)) ? 2.5 : null].filter((x): x is number => x != null) }))
      .filter((r) => r.n.length).sort((a, b) => Math.min(...a.n) - Math.min(...b.n) || a.c.nome.localeCompare(b.c.nome)).map((r) => r.c)
    : todos;
  const itens: ItemCor[] = [
    ...(busca ? [] : [{ k: '', rot: vazio }]),
    ...achados.map((c) => ({ k: c.id, rot: rotulo(c), sub: c.imobiliaria ?? undefined })),
    ...(edita ? [{ k: NOVO, rot: '+ Novo corretor...' }] : []),
  ];
  useEffect(() => { setI(0); }, [txt, aberto]);
  useEffect(() => {
    if (!aberto) return;
    const r = () => { const b = caixa.current?.getBoundingClientRect(); if (b) setPos({ left: b.left, top: b.bottom + 4, width: b.width }); };
    r(); window.addEventListener('scroll', r, true); window.addEventListener('resize', r);
    return () => { window.removeEventListener('scroll', r, true); window.removeEventListener('resize', r); };
  }, [aberto]);
  useEffect(() => { document.getElementById(`${id}-o${i}`)?.scrollIntoView({ block: 'nearest' }); }, [i, id]);
  const fechar = () => { setAberto(false); setTxt(null); };
  const escolher = (k: string) => { fechar(); if (k === NOVO) setNovo(true); else if (k !== value) onChange(k); };
  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!aberto) setAberto(true); else setI((i + 1) % itens.length); }
    else if (e.key === 'ArrowUp' && aberto) { e.preventDefault(); setI((i - 1 + itens.length) % itens.length); }
    else if (e.key === 'Enter' && aberto) { e.preventDefault(); if (itens[i]) escolher(itens[i].k); }
    else if (e.key === 'Escape' && aberto) { e.preventDefault(); e.stopPropagation(); fechar(); }
  };
  return <>
    <div ref={caixa} className={`cor-cb${aberto ? ' ab' : ''}`}>
      <input ref={inp} id={id} role="combobox" aria-expanded={aberto} aria-controls={id + '-l'} aria-autocomplete="list" autoComplete="off" data-sem-enter
        aria-activedescendant={aberto && itens.length ? `${id}-o${i}` : undefined}
        value={txt ?? (atual ? rotulo(atual) : '')} placeholder={txt != null ? 'Digite o nome' : vazio}
        onChange={(e) => { setTxt(e.target.value); setAberto(true); }} onKeyDown={tecla}
        onFocus={(e) => { setTxt(''); e.currentTarget.select(); }} onBlur={fechar} />
      <button type="button" className="cor-seta" tabIndex={-1} aria-label="Ver todos os corretores"
        onMouseDown={(e) => { e.preventDefault(); if (aberto) fechar(); else { inp.current?.focus(); setTxt(''); setAberto(true); } }}><Ic n="chev" s={18} /></button>
    </div>
    {aberto && pos && createPortal(
      <div className="mn-pop cor-pop" role="listbox" id={id + '-l'} aria-label="Corretores" style={{ left: pos.left, top: pos.top, width: pos.width }}>
        {itens.map((x, j) => (
          <div key={x.k || '_'} id={`${id}-o${j}`} role="option" aria-selected={j === i} className={`mn-i${x.k === value && x.k ? ' atual' : ''}${x.k === NOVO ? ' cor-novo' : ''}${x.k === '' ? ' faint' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); escolher(x.k); }} onMouseEnter={() => setI(j)}>
            <span className="mn-n">{x.rot}</span>{x.sub && <span className="mn-a">{x.sub}</span>}
          </div>
        ))}
        {busca && !achados.length && <div className="mn-i faint">Nenhum corretor com esse nome</div>}
      </div>, document.body)}
    {novo && createPortal(<NovoCorretor fechar={() => setNovo(false)} criado={(c) => { setNovo(false); onChange(c); }} />, document.body)}
  </>;
}

export function NovoCorretor({ fechar, criado }: { fechar: () => void; criado: (id: string) => void }) {
  const { empresa } = useSessao(), toast = useToast(), qc = useQueryClient();
  const [v, setV] = useState<Record<string, string>>({ nome: '', apelido: '', email: '', celular: '', cpf: '', rg: '', creci: '', imobiliaria: '', creci_juridico: '', cnpj: '', endereco: '' });
  const [grav, setGrav] = useState(false);
  /* nome ou e-mail igual ao de um corretor já cadastrado: só avisa, não recusa (pedido do Moises, 11/nov/2026;
     o CPF repetido o banco recusa) */
  const lista = useCorretores().data ?? [];
  const nn = norm(v.nome.trim()).replace(/\s+/g, ' '), ee = v.email.trim().toLowerCase();
  const iguais = lista.filter((c) => (nn && norm(c.nome).replace(/\s+/g, ' ') === nn) || (ee && c.email === ee));
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
      </div>
      {iguais.length > 0 && <div className="hint cr-igual" role="status">Já existe {iguais.length > 1 ? 'corretor' : 'um corretor'} com {iguais.some((c) => ee && c.email === ee) ? 'esse nome ou e-mail' : 'esse nome'}: {iguais.map((c) => c.nome + (c.imobiliaria ? ` (${c.imobiliaria})` : '') + (c.ativo ? '' : ', inativo')).join('; ')}. Confira antes de cadastrar outro.</div>}
      </form>
    </Dialogo>
  );
}
