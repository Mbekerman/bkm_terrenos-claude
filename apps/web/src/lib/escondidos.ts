import { supabase } from './supabase';

/** Terrenos escondidos porque a tratativa ativa do imóvel é a de outro terreno (pedido do Moises, 10/nov/2026): não aparecem
 *  no mapa (app.v_mapa já os tira), no funil nem nas listas. Banco sem a coluna (antes do SQL de 10/nov): nenhum. */
export async function escondidos(emp: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('terrenos').select('id').eq('empresa_id', emp).not('em_espera_de', 'is', null);
  if (error) { if (error.code === '42703' || /em_espera_de/.test(error.message)) return new Set(); throw error; }
  return new Set((data ?? []).map((x) => x.id as string));
}
