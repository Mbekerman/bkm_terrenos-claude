/* eslint-disable @typescript-eslint/no-explicit-any */
// Chamadas ao serviço do IPTU de São Paulo (services/iptu, por /iptu no mesmo endereço; o Caddy repassa).
import { supabase } from './supabase';

export type SituacaoIptu = { estado: 'na_fila' | 'consultando' | 'ok' | 'erro'; code?: string; error?: string };

export async function pedirIptu(rota: 'consultar' | 'notificacao' | 'fila' | 'situacao', corpo: object, espera = 200_000): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Entre de novo no sistema.');
  let r: Response;
  try {
    r = await fetch(`/iptu/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(espera) });
  } catch (e: any) {
    throw new Error(e?.name === 'TimeoutError' ? 'A Prefeitura não respondeu a tempo. Tente de novo.' : 'Não foi possível falar com o serviço do IPTU.');
  }
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(j?.error ?? (r.status === 502 ? 'O serviço do IPTU não está disponível neste ambiente.' : `O serviço do IPTU respondeu ${r.status}.`));
  }
  return r;
}

/** Põe os SQLs na fila do serviço, que consulta a Prefeitura em segundo plano e grava no banco (pedido do Moises,
 * 9/nov/2026): ao cadastrar o terreno e a cada SQL incluído. Fora de São Paulo o serviço ignora. Nunca falha para quem chama. */
export async function filaIptu(ids: string[]): Promise<void> {
  const l = [...new Set(ids)].slice(0, 60);
  if (!l.length) return;
  try { await pedirIptu('fila', { inscricao_ids: l }, 20_000); } catch (e) { console.warn('IPTU fila', e); }
}

export async function situacaoIptu(ids: string[]): Promise<Record<string, SituacaoIptu>> {
  if (!ids.length) return {};
  const r = await pedirIptu('situacao', { inscricao_ids: ids.slice(0, 60) }, 20_000);
  return r.json();
}
