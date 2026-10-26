// Tipos escritos à mão a partir das migrations. Quando o projeto Supabase
// estiver ligado, trocar por `npm run gen:types` (ver README).

export type Papel = 'gestor' | 'analista';
export type StatusProcesso = 'ativo' | 'ganha' | 'perdida' | 'stand_by';
export type SituacaoDoc = 'pendente' | 'recebido' | 'validado' | 'vencido' | 'rejeitado';
export type SituacaoProposta = 'em_analise' | 'contraproposta' | 'aceita' | 'recusada';
export type Origem = 'corretor' | 'proprietario' | 'prospeccao';
export type FormaPagamento = 'dinheiro' | 'permuta_fisica' | 'permuta_financeira' | 'misto';
export type TipoAtividade = 'ligacao' | 'visita' | 'reuniao' | 'email' | 'nota';

export interface Membro {
  empresa_id: string;
  user_id: string;
  papel: Papel;
  nome: string;
}

export interface Empresa {
  id: string;
  nome: string;
}

export interface Etapa {
  tipo_processo: string;
  codigo: string;
  nome: string;
  ordem: number;
  sla_dias: number | null;
  exige_gestor: boolean;
}

export interface ProcessoResumo {
  id: string;
  empresa_id: string;
  codigo: string;
  tipo: string;
  terreno_id: string;
  etapa_atual: string;
  etapa_desde: string;
  status: StatusProcesso;
  responsavel_id: string | null;
  viabilidade_id: string | null;
  motivo_encerramento: string | null;
  detalhe_encerramento: string | null;
  retomar_em: string | null;
  aberto_em: string;
  encerrado_em: string | null;
  etapa_nome: string;
  etapa_ordem: number;
  terreno_codigo: string;
  endereco: string;
  bairro: string;
  cidade: string;
  area_m2: number | null;
  zoneamento: string | null;
  responsavel_nome: string | null;
  margem_minima_pct: number | null;
  vgv: number | null;
  margem_pct: number | null;
  ultima_proposta_valor: number | null;
  ultima_proposta_situacao: SituacaoProposta | null;
  ultima_proposta_versao: number | null;
  ultimo_valor_pedido: number | null;
  qtd_ofertas: number;
  valor_referencia: number | null;
  abaixo_margem_min: boolean | null;
  tarefas_atrasadas: number;
  docs_vencidos: number;
  dias_na_etapa: number;
}

export interface Terreno {
  id: string;
  empresa_id: string;
  codigo: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  area_m2: number | null;
  frente_m: number | null;
  zoneamento: string | null;
  terreno_matriculas: { id: string; numero: string; cartorio: string; area_m2: number | null }[];
  terreno_proprietarios: { participacao_pct: number; pessoas: { id: string; nome: string; tipo: 'PF' | 'PJ' } }[];
}

export interface Oferta {
  id: string;
  terreno_id: string;
  origem: Origem;
  contato: string | null;
  recebida_em: string;
  valor_pedido: number | null;
  criado_em: string;
}

export interface Viabilidade {
  id: string;
  nome: string;
  vgv: number | null;
  margem_pct: number | null;
  calculado_em: string;
}

export interface Proposta {
  id: string;
  processo_id: string;
  versao: number;
  autor: 'nos' | 'proprietario';
  valor_total: number;
  forma: FormaPagamento;
  permuta_pct: number;
  condicoes: string | null;
  situacao: SituacaoProposta;
  criado_em: string;
  criado_por: string | null;
}

export interface Atividade {
  id: string;
  processo_id: string;
  tipo: TipoAtividade;
  ocorreu_em: string;
  resumo: string;
  user_id: string | null;
}

export interface Tarefa {
  id: string;
  processo_id: string;
  titulo: string;
  responsavel_id: string | null;
  prazo: string;
  concluida_em: string | null;
}

export interface Transicao {
  id: string;
  evento: 'abertura' | 'avanco' | 'perda' | 'stand_by' | 'retomada' | 'ganho';
  de_etapa: string | null;
  para_etapa: string | null;
  forcado: boolean;
  comentario: string | null;
  user_id: string | null;
  em: string;
}

export interface ItemChecklist {
  processo_id: string;
  etapa: string;
  tipo_documento: string;
  obrigatorio: boolean;
  ordem: number;
  tipo_nome: string;
  validade_dias: number | null;
  ativo: boolean;
  documento_id: string | null;
  emitido_em: string | null;
  valido_ate: string | null;
  versao_atual: number | null;
  nome_arquivo: string | null;
  storage_path: string | null;
  situacao: SituacaoDoc;
}

export interface DocumentoLinha {
  id: string;
  processo_id: string;
  tipo_documento: string;
  tipo_nome: string;
  emitido_em: string | null;
  valido_ate: string | null;
  situacao_efetiva: SituacaoDoc;
  versao_atual: number | null;
  nome_arquivo: string | null;
  storage_path: string | null;
}

export interface ItemAvanco {
  ok: boolean;
  tipo: 'viabilidade' | 'documento' | 'proposta' | 'gestor';
  texto: string;
  tipo_documento?: string;
  bloqueio_gestor: boolean;
}

export interface Avanco {
  proxima: string | null;
  proxima_nome?: string;
  ok: boolean;
  pode_forcar: boolean;
  itens: ItemAvanco[];
}
