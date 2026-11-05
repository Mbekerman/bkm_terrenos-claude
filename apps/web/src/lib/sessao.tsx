import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Empresa, Membro, Papel, Usuario } from './types';

interface Sessao {
  carregando: boolean;
  session: Session | null;
  /** Perfil (nome, foto e @) de quem está usando. */
  usuario: Usuario | null;
  /** Vínculo com a empresa: papel, administrador e superior. A BKM é a única empresa. */
  membro: Membro | null;
  empresa: Empresa | null;
  /** Erro ao ler o vínculo (sem conexão, esquema não exposto): diferente de "sem acesso". */
  erro: string | null;
  recarregar: () => Promise<void>;
  /** Gestor ou diretor: forçam avanço. */
  eGestor: boolean;
  /** Edita (analista para cima); leitura e básico só consultam. */
  edita: boolean;
}

export const NOME_PAPEL: Record<Papel, string> = {
  diretor: 'Diretor', gestor: 'Gestor', analista: 'Analista', leitura: 'Leitura', basico: 'Básico',
};

const Ctx = createContext<Sessao | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authPronto, setAuthPronto] = useState(false);
  const [dados, setDados] = useState<{ usuario: Usuario | null; membro: (Membro & { empresas: Empresa }) | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthPronto(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  async function carregar(uid: string) {
    setErro(null);
    const [u, m] = await Promise.all([
      supabase.from('usuarios').select('user_id,email,nome,foto_url,arroba').eq('user_id', uid).maybeSingle(),
      supabase.from('membros').select('empresa_id,user_id,papel,nome,administrador,superior_id, empresas(id,nome)')
        .eq('user_id', uid).order('criado_em').limit(1).maybeSingle(),
    ]);
    if (u.error || m.error) {
      console.error(u.error ?? m.error);
      setErro((u.error ?? m.error)!.message);
      setDados({ usuario: null, membro: null });
      return;
    }
    setDados({ usuario: u.data as Usuario | null, membro: m.data as unknown as (Membro & { empresas: Empresa }) | null });
  }

  useEffect(() => {
    if (session?.user) carregar(session.user.id);
    else setDados(null);
  }, [session?.user?.id]);

  const membro = dados?.membro ?? null;
  const valor: Sessao = {
    carregando: !authPronto || (!!session && dados === null),
    session,
    usuario: dados?.usuario ?? null,
    membro,
    empresa: membro?.empresas ?? null,
    erro,
    eGestor: membro?.papel === 'gestor' || membro?.papel === 'diretor',
    edita: membro?.papel === 'analista' || membro?.papel === 'gestor' || membro?.papel === 'diretor',
    recarregar: async () => { if (session?.user) await carregar(session.user.id); },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao(): Sessao {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSessao fora do SessaoProvider');
  return v;
}
