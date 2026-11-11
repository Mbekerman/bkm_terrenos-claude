import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from './ui';
import { Ic } from './Moldura';

// Menu ⋮ do terreno (pedido do Moises, 9/nov/2026): na ficha, ao lado do botão de tela cheia da gaveta e no cabeçalho da
// página; o mesmo componente entra no fim de cada linha da futura lista da seção Terrenos. Só aparece para diretor e
// administrador. Excluir (diretor ou administrador): some de todos os lugares e fica 180 dias guardado. Deletar (só o
// administrador): apaga tudo na hora, depois do aviso e do nome digitado. A permissão é conferida no banco
// (app.excluir_terreno, app.deletar_terreno); aqui só se esconde o que a pessoa não pode fazer.
// Na ficha, o menu também leva às abas Jornada e Histórico, antes de Excluir, para todos (pedido do Moises, 11/nov/2026);
// Histórico só onde o painel da direita não aparece (classe tab-hist), como era na barra das abas.

const ABAS_MENU: [string, string][] = [['jornada', 'Jornada'], ['historico', 'Histórico']];

export interface TerrenoMenu { id: string; codigo: string; nome: string }

const normal = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export default function MenuTerreno({ t, aoSair, className, aba, ir }: {
  t: TerrenoMenu;
  /** na ficha: a aba aberta e como ir a outra (Jornada e Histórico ficam neste menu) */
  aba?: string; ir?: (k: string) => void;
  /** depois de excluir ou deletar: fechar a gaveta ou sair da página */
  aoSair: () => void;
  className?: string;
}) {
  const { membro } = useSessao();
  const admin = !!membro?.administrador, diretor = membro?.papel === 'diretor';
  const [menu, setMenu] = useState(false);
  const [dlg, setDlg] = useState<'excluir' | 'deletar' | null>(null);
  const [grav, setGrav] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient(), toast = useToast();
  useEffect(() => {
    if (!menu) return;
    const fora = (ev: PointerEvent) => { if (!ref.current?.contains(ev.target as Node)) setMenu(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setMenu(false); ev.preventDefault(); } };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const apaga = admin || diretor;
  if (!apaga && !ir) return null;

  function abrir(k: 'excluir' | 'deletar') { setMenu(false); setDlg(k); }
  async function excluir() {
    setGrav(true);
    const { error } = await supabase.rpc('excluir_terreno', { p_terreno: t.id });
    setGrav(false);
    if (error) { toast(error.message, true); return; }
    setDlg(null);
    toast(admin ? `${t.codigo} excluído. Dá para restaurar em Terrenos excluídos, no menu do seu perfil.` : `${t.codigo} excluído. O administrador pode restaurar em até 180 dias.`);
    qc.invalidateQueries();
    aoSair();
  }
  return (
    <div className={`adv-mais mt-mais${menu ? ' aberto' : ''}${className ? ' ' + className : ''}`} ref={ref}>
      <button type="button" className={`iconbtn${aba && ABAS_MENU.some(([k]) => k === aba) ? ' atual' : ''}`} aria-haspopup="menu" aria-expanded={menu} aria-label="Mais ações do terreno" title="Mais ações" onClick={() => setMenu(!menu)}>
        <Ic n="mais" s={22} />
      </button>
      <div className="adv-menu" role="menu">
        {ir && ABAS_MENU.map(([k, l]) => (
          <button key={k} role="menuitemradio" aria-checked={k === aba} className={[k === aba ? 'atual' : '', k === 'historico' ? 'tab-hist' : ''].join(' ').trim() || undefined}
            onClick={() => { setMenu(false); if (k !== aba) ir(k); }}>{l}</button>))}
        {ir && apaga && <div className="mt-sep" role="separator" />}
        {apaga && <button role="menuitem" onClick={() => abrir('excluir')}><Ic n="lixo" s={18} />Excluir terreno</button>}
        {admin && <button role="menuitem" className="danger" onClick={() => abrir('deletar')}><Ic n="block" s={18} />Deletar de vez</button>}
      </div>
      {dlg === 'excluir' && createPortal(
        <Dialogo titulo={`Excluir ${t.codigo}?`} onFechar={() => setDlg(null)}
          rodape={<><button className="btn text" onClick={() => setDlg(null)}>Cancelar</button>
            <button className="btn primary" disabled={grav} onClick={excluir}>{grav ? 'Excluindo…' : 'Excluir'}</button></>}>
          <p><b>{t.nome}</b> some da lista, do mapa, do funil, da busca e das tarefas para todos.</p>
          <p className="muted">Fica guardado por 180 dias, e o administrador pode restaurar nesse prazo. Depois disso é apagado de vez.</p>
        </Dialogo>, document.body)}
      {dlg === 'deletar' && <DialogoDeletar t={t} fechar={() => setDlg(null)} feito={aoSair} />}
    </div>
  );
}

/** Deletar de vez (só o administrador): aviso de ação irreversível e o nome do terreno digitado. Também na lista de excluídos. */
export function DialogoDeletar({ t, fechar, feito }: { t: TerrenoMenu; fechar: () => void; feito: () => void }) {
  const [nome, setNome] = useState('');
  const [grav, setGrav] = useState(false);
  const qc = useQueryClient(), toast = useToast();
  const confere = normal(nome) === normal(t.nome);
  async function deletar() {
    if (!confere || grav) return;
    setGrav(true);
    const { error } = await supabase.rpc('deletar_terreno', { p_terreno: t.id, p_nome: nome });
    setGrav(false);
    if (error) { toast(error.message, true); return; }
    /* arquivos do storage e pastas do Drive não se apagam por aqui: ficam como pendência em app.terrenos_apagados para
       a função do servidor (o storage não tem política de delete para o usuário, de propósito) */
    fechar();
    toast(`${t.codigo} deletado de vez.`);
    qc.invalidateQueries();
    feito();
  }
  return createPortal(
    <Dialogo titulo={`Deletar ${t.codigo} de vez?`} onFechar={fechar}
      rodape={<><button className="btn text" onClick={fechar}>Cancelar</button>
        <button className="btn primary mt-perigo" disabled={!confere || grav} onClick={deletar}>{grav ? 'Deletando…' : 'Deletar de vez'}</button></>}>
      <div className="banner crit"><Ic n="warn" s={20} /><div><div className="bt">Esta ação não pode ser desfeita</div>
        <div>Apaga o terreno e tudo o que é dele: partes, matrículas e SQLs, negociação, ofertas, propostas, reuniões, estudos, documentos, tarefas e o histórico. Não vai para a lista de excluídos.</div></div></div>
      <form className="field" onSubmit={(e) => { e.preventDefault(); deletar(); }}>
        <label htmlFor="mt-nome">Para confirmar, digite o nome do terreno: <b>{t.nome}</b></label>
        <input id="mt-nome" autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} />
      </form>
    </Dialogo>, document.body);
}
