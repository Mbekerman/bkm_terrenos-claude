import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useSessao } from './sessao';
import type {
  Atividade, Avanco, DocumentoLinha, Etapa, ItemChecklist, Membro, Oferta, ProcessoResumo,
  Proposta, Tarefa, Terreno, Transicao, Viabilidade,
} from './types';

/** Lança o erro do PostgREST para o React Query tratar. */
function d<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

export function useEtapas() {
  return useQuery({
    queryKey: ['etapas'],
    staleTime: Infinity,
    queryFn: async () =>
      d(await supabase.from('etapas_modelo').select('*').eq('tipo_processo', 'negociacao').order('ordem')) as Etapa[],
  });
}

export function useMembros() {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['membros', empresa?.id],
    enabled: !!empresa,
    queryFn: async () =>
      d(await supabase.from('membros').select('empresa_id,user_id,papel,nome').eq('empresa_id', empresa!.id).order('nome')) as Membro[],
  });
}

/** user_id → nome, para exibir responsáveis e autores. */
export function useNomes() {
  const { data } = useMembros();
  return (id: string | null | undefined) => data?.find((m) => m.user_id === id)?.nome ?? '—';
}

export function useProcessos() {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['processos', empresa?.id],
    enabled: !!empresa,
    queryFn: async () =>
      d(await supabase.from('v_processos').select('*').eq('empresa_id', empresa!.id).order('aberto_em', { ascending: false })) as ProcessoResumo[],
  });
}

/** Negociação mais recente de um terreno. */
export function useProcessoDoTerreno(terrenoId: string | undefined) {
  return useQuery({
    queryKey: ['processo-terreno', terrenoId],
    enabled: !!terrenoId,
    queryFn: async () =>
      d(await supabase.from('v_processos').select('*').eq('terreno_id', terrenoId!).order('aberto_em', { ascending: false }).limit(1).maybeSingle()) as ProcessoResumo | null,
  });
}

export function useTerreno(id: string | undefined) {
  return useQuery({
    queryKey: ['terreno', id],
    enabled: !!id,
    queryFn: async () =>
      d(await supabase
        .from('terrenos')
        .select('*, terreno_matriculas(id,numero,cartorio,area_m2), terreno_proprietarios(participacao_pct, pessoas(id,nome,tipo))')
        .eq('id', id!)
        .single()) as Terreno,
  });
}

export function useOfertas(terrenoId: string | undefined) {
  return useQuery({
    queryKey: ['ofertas', terrenoId],
    enabled: !!terrenoId,
    queryFn: async () =>
      d(await supabase.from('ofertas').select('*').eq('terreno_id', terrenoId!).order('recebida_em').order('criado_em')) as Oferta[],
  });
}

export function useOfertasRecentes(desde: string) {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['ofertas-recentes', empresa?.id, desde],
    enabled: !!empresa,
    queryFn: async () =>
      d(await supabase.from('ofertas').select('id,recebida_em').eq('empresa_id', empresa!.id).gte('recebida_em', desde)) as Pick<Oferta, 'id' | 'recebida_em'>[],
  });
}

export function useViabilidade(id: string | null | undefined) {
  return useQuery({
    queryKey: ['viabilidade', id],
    enabled: !!id,
    queryFn: async () => d(await supabase.from('viabilidades').select('*').eq('id', id!).single()) as Viabilidade,
  });
}

export function usePropostas(processoId: string | undefined) {
  return useQuery({
    queryKey: ['propostas', processoId],
    enabled: !!processoId,
    queryFn: async () =>
      d(await supabase.from('propostas').select('*').eq('processo_id', processoId!).order('versao', { ascending: false })) as Proposta[],
  });
}

export function useAtividades(processoId: string | undefined) {
  return useQuery({
    queryKey: ['atividades', processoId],
    enabled: !!processoId,
    queryFn: async () =>
      d(await supabase.from('atividades').select('*').eq('processo_id', processoId!).order('ocorreu_em', { ascending: false })) as Atividade[],
  });
}

export function useTarefas(processoId: string | undefined) {
  return useQuery({
    queryKey: ['tarefas', processoId],
    enabled: !!processoId,
    queryFn: async () =>
      d(await supabase.from('tarefas').select('*').eq('processo_id', processoId!).order('prazo')) as Tarefa[],
  });
}

export function useTarefasAbertas() {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['tarefas-abertas', empresa?.id],
    enabled: !!empresa,
    queryFn: async () =>
      d(await supabase.from('tarefas').select('*').eq('empresa_id', empresa!.id).is('concluida_em', null).order('prazo')) as Tarefa[],
  });
}

export function useTransicoes(processoId: string | undefined) {
  return useQuery({
    queryKey: ['transicoes', processoId],
    enabled: !!processoId,
    queryFn: async () =>
      d(await supabase.from('processo_transicoes').select('*').eq('processo_id', processoId!).order('em', { ascending: false })) as Transicao[],
  });
}

export interface EventoFeed { em: string; user_id: string | null; texto: string; processo_id: string; tipo: 'transicao' | 'atividade' }

export function useFeed() {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['feed', empresa?.id],
    enabled: !!empresa,
    queryFn: async () => {
      const [t, a] = await Promise.all([
        supabase.from('processo_transicoes').select('*').eq('empresa_id', empresa!.id).order('em', { ascending: false }).limit(10),
        supabase.from('atividades').select('*').eq('empresa_id', empresa!.id).order('ocorreu_em', { ascending: false }).limit(10),
      ]);
      const ts = d(t) as (Transicao & { processo_id: string })[];
      const as = d(a) as Atividade[];
      const ev: EventoFeed[] = [
        ...ts.map((x) => ({ em: x.em, user_id: x.user_id, processo_id: x.processo_id, tipo: 'transicao' as const, texto: textoTransicao(x) })),
        ...as.map((x) => ({ em: x.ocorreu_em, user_id: x.user_id, processo_id: x.processo_id, tipo: 'atividade' as const, texto: x.resumo })),
      ];
      return ev.sort((x, y) => y.em.localeCompare(x.em)).slice(0, 8);
    },
  });
}

export function textoTransicao(t: Pick<Transicao, 'evento' | 'para_etapa' | 'comentario' | 'forcado'>, nomeEtapa?: (c: string | null) => string): string {
  const n = nomeEtapa ?? ((c: string | null) => c ?? '');
  switch (t.evento) {
    case 'abertura': return 'Negociação aberta a partir da oferta';
    case 'avanco': return `Avançou para ${n(t.para_etapa)}${t.forcado ? ' sem checklist completo (forçado)' : ''}`;
    case 'ganho': return 'Negociação ganha';
    case 'perda': return `Encerrada como perdida${t.comentario ? ': ' + t.comentario : ''}`;
    case 'suspensao': return `Suspensa${t.comentario ? ': ' + t.comentario : ''}`;
    case 'retomada': return 'Negociação retomada';
  }
}

export function useChecklist(processoId: string | undefined) {
  return useQuery({
    queryKey: ['checklist', processoId],
    enabled: !!processoId,
    queryFn: async () =>
      d(await supabase.from('v_checklist').select('*').eq('processo_id', processoId!).order('ordem')) as ItemChecklist[],
  });
}

export function useAvanco(processoId: string | undefined) {
  return useQuery({
    queryKey: ['avanco', processoId],
    enabled: !!processoId,
    queryFn: async () => d(await supabase.rpc('checar_avanco', { p_processo: processoId })) as Avanco,
  });
}

export function useDocumentos() {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['documentos', empresa?.id],
    enabled: !!empresa,
    queryFn: async () =>
      d(await supabase.from('v_documentos').select('*').eq('empresa_id', empresa!.id)) as DocumentoLinha[],
  });
}

// ---------------------------------------------------------------------
// Ações. Toda ação invalida o cache inteiro: a base é pequena e assim
// nenhuma tela fica com número velho.
// ---------------------------------------------------------------------
export function useAcao<A, R = unknown>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export async function rpc<T = unknown>(nome: string, args: Record<string, unknown>): Promise<T> {
  return d(await supabase.rpc(nome, args)) as T;
}

export async function enviarDocumento(p: { empresaId: string; processoId: string; tipo: string; arquivo: File }) {
  const nomeLimpo = p.arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
  const caminho = `${p.empresaId}/${p.processoId}/${p.tipo}/${crypto.randomUUID()}_${nomeLimpo}`;
  const up = await supabase.storage.from('documentos').upload(caminho, p.arquivo, { upsert: false });
  if (up.error) throw up.error;
  return rpc('registrar_versao_documento', {
    p_processo: p.processoId, p_tipo: p.tipo, p_storage_path: caminho,
    p_nome_arquivo: p.arquivo.name, p_tamanho: p.arquivo.size,
  });
}

export async function abrirDocumento(caminho: string) {
  const r = await supabase.storage.from('documentos').createSignedUrl(caminho, 120);
  if (r.error) throw new Error(caminho.includes('/exemplo/') ? 'Documento de exemplo: não há arquivo real.' : r.error.message);
  window.open(r.data.signedUrl, '_blank', 'noopener');
}
