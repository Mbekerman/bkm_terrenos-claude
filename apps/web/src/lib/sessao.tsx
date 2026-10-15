import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Empresa, Membro } from './types';

interface Sessao {
  carregando: boolean;
  session: Session | null;
  /** Vínculo do usuário com a empresa ativa. */
  membro: Membro | null;
  empresa: Empresa | null;
  empresas: (Membro & { empresas: Empresa })[];
  trocarEmpresa: (id: string) => void;
  recarregar: () => Promise<void>;
  eGestor: boolean;
}

const Ctx = createContext<Sessao | null>(null);
const CHAVE = 'bkm-terrenos:empresa';

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authPronto, setAuthPronto] = useState(false);
  const [vinculos, setVinculos] = useState<(Membro & { empresas: Empresa })[] | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(() => {
    try { return localStorage.getItem(CHAVE); } catch { return null; }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthPronto(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  async function carregarVinculos(uid: string) {
    const { data, error } = await supabase
      .from('membros')
      .select('empresa_id,user_id,papel,nome, empresas(id,nome)')
      .eq('user_id', uid);
    if (error) { console.error(error); setVinculos([]); return; }
    setVinculos((data ?? []) as unknown as (Membro & { empresas: Empresa })[]);
  }

  useEffect(() => {
    if (session?.user) carregarVinculos(session.user.id);
    else setVinculos(null);
  }, [session?.user?.id]);

  const atual = vinculos?.find((v) => v.empresa_id === empresaId) ?? vinculos?.[0] ?? null;

  const valor: Sessao = {
    carregando: !authPronto || (!!session && vinculos === null),
    session,
    membro: atual,
    empresa: atual?.empresas ?? null,
    empresas: vinculos ?? [],
    eGestor: atual?.papel === 'gestor',
    trocarEmpresa: (id) => {
      setEmpresaId(id);
      try { localStorage.setItem(CHAVE, id); } catch { /* sem storage */ }
    },
    recarregar: async () => { if (session?.user) await carregarVinculos(session.user.id); },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao(): Sessao {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSessao fora do SessaoProvider');
  return v;
}
