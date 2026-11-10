import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fmtCep, metros } from '../lib/mascara';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { data as fd, diasEntre, hojeISO, m2, milhoes, somarDias, FORMA } from '../lib/format';
import { Ic } from '../components/Moldura';
import { abrirQuadro, OPT, pedirCampo, SECOES } from './edicao';
import { completude, ITEM_COMPLETUDE, TEMP, type Ficha as F, type R } from './dados';
import { Avanco, procsAvanco, useAvanco } from './Avanco';
import { useComercial } from './Comercial';

// Painel lateral da ficha, porte de tools/prototipo/proto_painel.js: coluna própria à direita (280 a 360 px; some quando
// não cabe), recolhível, com o quadro de avanço no topo e o seletor Logs / Ações. Logs: toda alteração do terreno, do
// mais recente ao mais antigo, com filtros de usuários (seleção múltipla) e de período (padrão últimos 30 dias, com
// calendário); clicar num log abre a aba e o quadro do que mudou e o acende. Primeira versão: sem olhinho nem lixeira.
// No banco, os logs vêm de app.auditoria (o texto se monta aqui, pelas colunas) e de processo_transicoes.

const CH = 'bkm-terrenos-painel';
export interface PN { aberto: boolean; aba: 'acoes' | 'tarefas' | 'logs'; users: string[]; per: { k: string; ini?: string; fim?: string } }
function lerPN(): PN {
  let x: Partial<PN> = {};
  try { x = JSON.parse(localStorage.getItem(CH) || 'null') ?? {}; } catch { /* sem navegador */ }
  return { aberto: x.aberto !== false, aba: x.aba === 'logs' || x.aba === 'tarefas' ? x.aba : 'acoes', users: Array.isArray(x.users) ? x.users : [], per: x.per && typeof x.per === 'object' ? x.per : { k: '30d' } };
}
let PN_ATUAL = lerPN();
const ouvintes = new Set<() => void>();
function mudarPN(p: Partial<PN>) {
  PN_ATUAL = { ...PN_ATUAL, ...p };
  try { localStorage.setItem(CH, JSON.stringify(PN_ATUAL)); } catch { /* sem navegador */ }
  ouvintes.forEach((f) => f());
}
/** estado do painel guardado no navegador, igual em toda ficha aberta */
export function usePN(): [PN, (p: Partial<PN>) => void] {
  const [, re] = useState(0);
  useEffect(() => { const f = () => re((x) => x + 1); ouvintes.add(f); return () => { ouvintes.delete(f); }; }, []);
  return [PN_ATUAL, mudarPN];
}

/* ---------- datas locais (o banco guarda em UTC) ---------- */
const dLoc = (s: string) => { const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hLoc = (s: string) => { const d = new Date(s); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const completo = (s: string) => { const d = new Date(s); return `${fd(dLoc(s))} · ${d.toLocaleTimeString('pt-BR')},${String(d.getMilliseconds()).padStart(3, '0')}`; };

/* ---------- texto dos logs ---------- */
export interface Log {
  id: string; em: string; user: string | null; txt: string; det?: string[]; aba?: string; q?: string; topo?: string;
  /** consequência automática de outra ação (auditoria.automatico) */
  auto?: boolean;
  /** as consequências automáticas recolhidas dentro desta ação (ou do grupo "Atualização automática") */
  filhos?: Log[];
  /** grupo de consequências sem ação da pessoa logo antes (não conta como ação) */
  grupo?: boolean;
  /** inclusões ou exclusões seguidas do mesmo tipo (vários SQLs de uma vez) viram uma linha só: [chave, plural, item] */
  junta?: [string, string, string];
}
type Ctx = { f: F; nomes: Map<string, string>; partes: Map<string, string>; procs: Map<string, R>; sp: boolean; lotes: Map<string, string>; reus: Map<string, string>; pessoas: Map<string, string> };

const curto = (v: unknown) => { const s = String(v); return s.length > 60 ? s.slice(0, 57) + '…' : s; };
const NI = new Set(['nao_informado', 'nao_informada', 'nao_avaliada']);
/* campos da ficha: [rótulo, tipo, opções, quadro] */
const CAMPO: Record<string, [string, string, string | null, string]> = {};
for (const [sec, s] of Object.entries(SECOES)) for (const [k, l, tipo, opt] of s.campos) CAMPO[k] = [l, tipo, opt, sec];
Object.assign(CAMPO, {
  area_documental_m2: ['Área documental', 'm2', null, 'areas'], area_cadastral_m2: ['Área cadastral', 'm2', null, 'areas'], area_levantamento_m2: ['Área de levantamento', 'm2', null, 'areas'],
  fonte_area_adotada: ['Fonte da área adotada', 'sel', 'fonteArea', 'areas'], testada_principal_m: ['Testada', 'm', null, 'areas'],
});
const SEM_LOG = new Set(['latitude', 'longitude', 'precisao_localizacao', 'municipio_id', 'temperatura_em']);

function valTxt(k: string, v: unknown, c: Ctx): string {
  if (v == null || v === '') return 'não informado';
  const [, tipo, opt] = CAMPO[k] ?? [];
  if (tipo === 'sel' && opt && OPT[opt]) return NI.has(String(v)) ? 'não informado' : OPT[opt][String(v)] ?? String(v);
  if (tipo === 'user') return c.nomes.get(String(v)) ?? 'outra pessoa';
  if (tipo === 'm2') return m2(Number(v));
  if (tipo === 'm') return metros(v) + ' m';
  if (tipo === 'date') return fd(String(v));
  if (tipo === 'cep') return fmtCep(v);
  if (tipo === 'eixo') return 'alterado';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return curto(v);
}

/** chaves que mudaram, sem as técnicas */
const TEC = new Set(['id', 'empresa_id', 'terreno_id', 'atualizado_em', 'atualizado_por', 'criado_em', 'criado_por', 'versao', 'numero_norm', 'inscricao_norm', 'poligono', 'poligono_geojson', 'removida_em']);
function mudou(a: R | null, b: R | null): string[] {
  const A = a ?? {}, B = b ?? {};
  return Object.keys({ ...A, ...B }).filter((k) => !TEC.has(k) && JSON.stringify(A[k] ?? null) !== JSON.stringify(B[k] ?? null));
}
const ROT: Record<string, string> = {
  numero: 'número', cartorio: 'cartório', area_registrada_m2: 'área', data_certidao: 'data da certidão', parte_id: 'parte', area_cadastral_m2: 'área cadastral', cib: 'CIB',
  zona_fiscal: 'zona fiscal', endereco_prefeitura: 'endereço', origem: 'origem', nome: 'nome', pessoa_nome: 'pessoa principal', telefone: 'telefone', email: 'e-mail',
  documento: 'CPF/CNPJ', observacoes: 'observação', valor_pedido: 'valor', forma_pagamento_pedida: 'forma de pagamento', observacao_pagamento: 'condições', aceita_permuta: 'aceita permuta',
  comissao_pct: 'comissão', comissao_valor: 'comissão', corretor_id: 'corretor', validade: 'validade', status: 'status', data_oferta: 'data', forma_pagamento: 'condição', area_m2: 'área',
  concessionaria: 'concessionária', solicitada_em: 'data do pedido', emitida_em: 'data da emissão', condicoes: 'condições', situacao: 'situação',
  inicio: 'data', link: 'link da reunião', pauta: 'pauta', resumo: 'o que foi tratado', encaminhamentos: 'encaminhamentos', modalidade: 'modalidade', local: 'local', duracao_min: 'duração',
};
const lista = (ks: string[]) => [...new Set(ks.map((k) => ROT[k] ?? k.replace(/_/g, ' ')))].join(', ');
const PROP_ST: Record<string, string> = { rascunho: 'Rascunho', apresentada: 'Apresentada', em_analise: 'Em análise', aceita: 'Aceita', recusada: 'Recusada', expirada: 'Expirada', retirada: 'Retirada', substituida: 'Substituída' };
const VT_DISP: Record<string, string> = { nao_verificado: 'Não verificado', sim: 'Sim', parcial: 'Parcial', nao: 'Não', nao_se_aplica: 'Não se aplica' };
const VT_ITEM: Record<string, string> = { energia: 'Energia', agua: 'Água', esgoto: 'Esgoto', drenagem: 'Drenagem', gas: 'Gás canalizado', asfalto: 'Asfalto', iluminacao: 'Iluminação pública', calcada: 'Calçada' };
const VT_SIT: Record<string, string> = { nao_solicitada: 'Não solicitada', solicitada: 'Solicitada', viavel: 'Viável', condicionada: 'Condicionada', nao_viavel: 'Não viável' };

function txtAud(a: R, c: Ctx): Omit<Log, 'id' | 'em' | 'user'> | null {
  const d = a.depois as R | null, x = a.antes as R | null, o = (d ?? x)!, ins = a.acao === 'insert', del = a.acao === 'delete';
  switch (a.tabela) {
    case 'terrenos': {
      if (ins) return { txt: 'Terreno cadastrado', det: [o.nome].filter(Boolean), aba: 'terreno', q: 'ident' };
      if (del) return { txt: 'Terreno excluído' };
      const linhas: string[] = [], secs = new Set<string>();
      let q0: string | undefined, topoComp = false;
      const polyMudou = JSON.stringify(x?.poligono_geojson ?? null) !== JSON.stringify(d?.poligono_geojson ?? null);
      if (polyMudou) {
        linhas.push(!d?.poligono_geojson ? 'Poligonal removida' : !x?.poligono_geojson ? 'Poligonal desenhada'
          : `Ajuste na poligonal${x?.area_poligonal_m2 && d?.area_poligonal_m2 ? `: ${m2(x.area_poligonal_m2)} → ${m2(d.area_poligonal_m2)}` : ''}`);
        secs.add('areas'); q0 = 'areas';
      }
      const ks = mudou(x, d).filter((k) => !SEM_LOG.has(k));
      /* a temperatura é do terreno desde 9/nov/2026 e anda sozinha (app.definir_temperatura): log próprio, que acende o topo */
      if (ks.length === 1 && ks[0] === 'temperatura' && !polyMudou) {
        const tv = (v: unknown) => (v ? `${v} · ${TEMP[Number(v)] ?? v}` : 'não avaliada');
        return { txt: `Temperatura: ${tv(x?.temperatura)} → ${tv(d?.temperatura)}`, topo: '.fi-temp' };
      }
      for (const k of mudou(x, d)) {
        if (SEM_LOG.has(k)) continue;
        if (k === 'area_adotada_m2') {
          continue;
        }
        if (k === 'historico_uso') { linhas.push('Histórico de uso alterado'); secs.add('histuso'); q0 ??= 'histuso'; continue; }
        /* data da visita técnica: mora na aba Infraestrutura (ficha/Infra.tsx) */
        if (k === 'visita_tecnica_em') { linhas.push(`Data da visita técnica: ${x?.[k] ? fd(x[k]) : '—'} → ${d?.[k] ? fd(d[k]) : '—'}`); secs.add('visita'); q0 ??= 'visita'; continue; }
        /* itens descartados do "Falta preencher" (10/nov/2026): o log diz quais saíram e quais voltaram a ser pedidos */
        if (k === 'completude_dispensada') {
          const av = new Set((x?.[k] as string[] | null) ?? []), dv = new Set((d?.[k] as string[] | null) ?? []);
          const nome = (i: string) => ITEM_COMPLETUDE[i] ?? i;
          const sai = [...dv].filter((i) => !av.has(i)).map(nome), volta = [...av].filter((i) => !dv.has(i)).map(nome);
          if (sai.length) linhas.push(`Descartado do Falta preencher: ${sai.join(', ')}`);
          if (volta.length) linhas.push(`Voltou ao Falta preencher: ${volta.join(', ')}`);
          topoComp = true;
          continue;
        }
        const cp = CAMPO[k];
        if (!cp) continue;
        if (k === 'municipio_id') continue;
        linhas.push(`${cp[0]}: ${valTxt(k, x?.[k], c)} → ${valTxt(k, d?.[k], c)}`);
        secs.add(cp[3]); q0 ??= cp[3];
      }
      if (!linhas.length) return null;
      if (topoComp && !secs.size) return { txt: linhas.length === 1 ? linhas[0] : 'Falta preencher alterado', det: linhas.length > 1 ? linhas : undefined, topo: '.fi-comp-b' };
      const s1 = secs.size === 1 ? [...secs][0] : null;
      const txt = linhas.length === 1 ? linhas[0] : s1 && SECOES[s1] ? `${SECOES[s1].titulo} editado` : s1 === 'areas' ? 'Áreas e dimensões editadas' : 'Ficha editada';
      return { txt, det: linhas.length > 1 ? linhas : undefined, aba: s1 === 'visita' ? 'infra' : 'terreno', q: q0 };
    }
    case 'matriculas':
      return { txt: ins ? `Matrícula adicionada: ${o.numero}` : del ? `Matrícula removida: ${o.numero}` : `Matrícula alterada (${o.numero}): ${lista(mudou(x, d))}`,
        det: ins ? [o.cartorio, o.area_registrada_m2 != null ? 'Área: ' + m2(o.area_registrada_m2) : null].filter(Boolean) : undefined, aba: 'terreno', q: 'lotes',
        junta: del ? ['mat-', 'Matrículas removidas', o.numero] : undefined };
    case 'inscricoes_municipais': {
      const r = c.sp ? 'SQL' : 'Inscrição imobiliária', g = c.sp ? 'o' : 'a';
      const ks = mudou(x, d).filter((k) => k !== 'municipio_id');
      if (!ins && !del && !ks.length) return null;
      const pl = c.sp ? 'SQLs' : 'Inscrições imobiliárias', gp = c.sp ? 'os' : 'as';
      return { txt: ins ? `${r} adicionad${g}: ${o.inscricao}` : del ? `${r} removid${g}: ${o.inscricao}` : `${r} alterad${g} (${o.inscricao}): ${lista(ks)}`, aba: 'terreno', q: 'lotes',
        junta: ins ? ['insc+', `${pl} adicionad${gp}`, o.inscricao] : del ? ['insc-', `${pl} removid${gp}`, o.inscricao] : undefined };
    }
    case 'matricula_partes':
    case 'inscricao_partes': {
      const l = c.lotes.get(o.matricula_id ?? o.inscricao_id) ?? (a.tabela === 'matricula_partes' ? 'Matrícula' : c.sp ? 'SQL' : 'Inscrição'), n = (id: string) => c.partes.get(id) ?? 'parte';
      const pc = (v: unknown) => (v == null ? 'sem percentual' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
      if (ins) return { txt: `${l} na parte ${n(o.parte_id)}`, aba: 'terreno', q: 'lotes' };
      if (del) return { txt: `${l} saiu da parte ${n(o.parte_id)}`, aba: 'terreno', q: 'lotes' };
      if (x?.parte_id !== d?.parte_id) return { txt: `${l}: da parte ${n(x?.parte_id)} para ${n(d?.parte_id)}`, aba: 'terreno', q: 'lotes' };
      if (x?.percentual !== d?.percentual) return { txt: `${l} na parte ${n(o.parte_id)}: ${pc(x?.percentual)} → ${pc(d?.percentual)}`, aba: 'terreno', q: 'lotes' };
      return null;
    }
    case 'terreno_partes': {
      if (!ins && !del && d?.ativa === false && x?.ativa !== false) return { txt: `Parte excluída: ${o.nome}`, det: d?.motivo_remocao ? [d.motivo_remocao] : undefined, aba: 'terreno', q: 'partes-cad' };
      const ks = mudou(x, d).filter((k) => !['ativa', 'motivo_remocao', 'essencial'].includes(k));
      if (!ins && !del && !ks.length) return null;
      return { txt: ins ? `Parte adicionada: ${o.nome}` : del ? `Parte removida: ${o.nome}` : `Parte alterada (${o.nome}): ${lista(ks)}`, aba: 'terreno', q: 'partes-cad' };
    }
    case 'terreno_pessoas': {
      const p = OPT.papel[o.papel] ?? 'Pessoa';
      return { txt: ins ? `${p} adicionado` : del ? `${p} removido` : `${p} alterado: ${lista(mudou(x, d))}`, aba: 'terreno', q: 'partes-cad' };
    }
    case 'confrontacoes':
      return { txt: ins ? `Confrontação adicionada: ${o.tipo ?? ''}` : del ? `Confrontação removida: ${o.tipo ?? ''}` : 'Confrontação alterada', aba: 'terreno' };
    case 'ofertas': {
      if (ins) return { txt: `Oferta registrada: ${milhoes(o.valor_pedido)}`, det: [o.forma_pagamento_pedida && FORMA[o.forma_pagamento_pedida] ? 'Forma: ' + FORMA[o.forma_pagamento_pedida] : null].filter(Boolean) as string[], aba: 'comercial', q: 'ofertas' };
      if (del) return { txt: `Oferta removida: ${milhoes(o.valor_pedido)}`, aba: 'comercial', q: 'ofertas' };
      const ks = mudou(x, d);
      if (!ks.length) return null;
      const det = ks.filter((k) => k === 'valor_pedido').map(() => `Valor: ${milhoes(x?.valor_pedido)} → ${milhoes(d?.valor_pedido)}`);
      return { txt: `Oferta alterada (${milhoes(o.valor_pedido)}): ${lista(ks)}`, det: det.length ? det : undefined, aba: 'comercial', q: 'cond' };
    }
    case 'oferta_partes': {
      const n = c.partes.get(o.parte_id) ?? 'parte';
      return { txt: del ? `Valor da parte removido: ${n}` : `Valor da parte (${n}): ${milhoes(o.valor_pedido)}`, aba: 'comercial', q: 'cond' };
    }
    case 'propostas': {
      if (del) return { txt: `Proposta v${o.versao} excluída (${o.origem === 'bkm' ? 'BKM' : 'vendedor'}): ${milhoes(o.valor_total)}`, aba: 'comercial', q: 'propostas' };
      if (ins) return { txt: `Proposta v${o.versao} registrada (${o.origem === 'bkm' ? 'BKM' : 'vendedor'}): ${milhoes(o.valor_total)}`, det: [o.condicoes_pagamento].filter(Boolean), aba: 'comercial', q: 'propostas' };
      if (x?.status !== d?.status) return { txt: `Proposta v${o.versao}: ${PROP_ST[d?.status] ?? d?.status}`, aba: 'comercial', q: 'propostas' };
      const ks = mudou(x, d);
      return ks.length ? { txt: `Proposta v${o.versao} alterada: ${lista(ks)}`, aba: 'comercial', q: 'propostas' } : null;
    }
    case 'reunioes': {
      const dt = o.inicio ? `${fd(dLoc(o.inicio))} ${hLoc(o.inicio)}` : '';
      if (ins) return { txt: o.status === 'realizada' ? `Reunião registrada (${dt})` : `Reunião agendada para ${dt}`, det: [o.pauta].filter(Boolean), aba: 'comercial', q: 'reunioes' };
      if (del) return { txt: `Reunião removida (${dt})`, aba: 'comercial', q: 'reunioes' };
      if (x?.status !== d?.status) return { txt: d?.status === 'realizada' ? `Reunião realizada (${dt})` : d?.status === 'cancelada' ? `Reunião cancelada (${dt})` : `Reunião (${dt}): ${d?.status}`, aba: 'comercial', q: 'reunioes' };
      const ks = mudou(x, d).filter((k) => !['na_agenda', 'gerar_meet'].includes(k));
      return ks.length ? { txt: `Reunião alterada (${dt}): ${lista(ks)}`, aba: 'comercial', q: 'reunioes' } : null;
    }
    case 'reuniao_participantes': {
      // quem entrou ou saiu da reunião (os incluídos junto com a reunião vão no log dela, em useLogs)
      const quem = o.user_id ? c.nomes.get(o.user_id) ?? 'colega' : o.pessoa_id ? c.pessoas.get(o.pessoa_id) ?? 'pessoa' : o.nome ?? '—';
      const dt = c.reus.get(o.reuniao_id) ?? '';
      if (ins) return { txt: `Participante incluído na reunião${dt ? ` de ${dt}` : ''}: ${quem}`, aba: 'comercial', q: 'reunioes' };
      if (del) return { txt: `Participante tirado da reunião${dt ? ` de ${dt}` : ''}: ${quem}`, aba: 'comercial', q: 'reunioes' };
      return null;
    }
    case 'documentos': return ins ? { txt: `Documento enviado: ${o.nome ?? o.tipo_documento}`, aba: 'documentos' } : null;
    case 'analises_urbanisticas': return ins ? { txt: `Análise urbanística registrada${o.fonte ? ` (${o.fonte})` : ''}`, aba: 'terreno', q: 'indices' } : null;
    case 'terreno_infraestrutura': {
      const nome = VT_ITEM[o.item] ?? o.item;
      if (del) return null;
      if ((x?.disponibilidade ?? 'nao_verificado') !== d?.disponibilidade) return { txt: `Visita técnica · ${nome}: ${VT_DISP[x?.disponibilidade] ?? 'Não verificado'} → ${VT_DISP[d?.disponibilidade] ?? d?.disponibilidade}`, aba: 'infra', q: 'visita' };
      if ((x?.observacoes ?? null) !== (d?.observacoes ?? null)) return { txt: `Visita técnica · ${nome}: observação alterada`, det: d?.observacoes ? [d.observacoes] : undefined, aba: 'infra', q: 'visita' };
      return null;
    }
    case 'terreno_viabilidades_tecnicas':
      return x?.situacao !== d?.situacao ? { txt: `Viabilidade técnica · ${VT_ITEM[o.servico] ?? o.servico}: ${VT_SIT[x?.situacao] ?? 'Não solicitada'} → ${VT_SIT[d?.situacao] ?? d?.situacao}`, aba: 'infra', q: 'vtec' }
        : mudou(x, d).length ? { txt: `Viabilidade técnica · ${VT_ITEM[o.servico] ?? o.servico}: ${lista(mudou(x, d))}`, aba: 'infra', q: 'vtec' } : null;
    case 'estudos_massa': {
      if (ins) return { txt: `Estudo de massa pedido: ${o.nome ?? ''}`, aba: 'massa' };
      if (del) return { txt: `Estudo de massa apagado: ${o.nome ?? ''}`, aba: 'massa' };
      if (!x || !d) return null;
      /* salvar_estudo_massa grava em dois passos (os dados, depois os totais das tipologias): o que não mudou nada não entra */
      const mud = Object.keys(d).filter((k) => !['atualizado_em', 'eficiencia_pct', 'entregue_em'].includes(k) && JSON.stringify(d[k]) !== JSON.stringify(x[k]));
      if (!mud.length) return null;
      if (mud.every((k) => k === 'area_privativa_m2' || k === 'unidades')) return { txt: `${d.nome}: tipologias atualizadas`, aba: 'massa' };
      if (x.situacao !== 'entregue' && d.situacao === 'entregue') return { txt: `${d.nome} entregue`, aba: 'massa' };
      if (!x.valido && d.valido) return { txt: `${d.nome} é o estudo de massa válido`, aba: 'massa' };
      if (x.valido && !d.valido) return null; // a troca do válido aparece pelo novo válido
      if (x.nome !== d.nome) return { txt: `Estudo de massa renomeado: ${x.nome} → ${d.nome}`, aba: 'massa' };
      if (x.arquiteto_id !== d.arquiteto_id) return { txt: `${d.nome}: arquiteto ${c.nomes.get(d.arquiteto_id) ?? 'trocado'}`, aba: 'massa' };
      if (x.briefing !== d.briefing || x.prazo !== d.prazo) return { txt: `${d.nome}: pedido alterado`, aba: 'massa' };
      if (x.observacoes !== d.observacoes) return { txt: `${d.nome}: observações alteradas`, aba: 'massa' };
      return { txt: `${d.nome}: dados do arquiteto atualizados`, aba: 'massa' };
    }
    default: return null;
  }
}

const NIV: Record<string, string> = { gestor: 'gestor', diretor: 'diretor' };
function txtAprov(a: R, c: Ctx, destNome: (p: R, tipo: string, d: string) => string): Omit<Log, 'id' | 'em' | 'user'> | null {
  const o = (a.depois ?? a.antes) as R, p = c.procs.get(o.processo_id);
  const dest = p ? destNome(p, o.destino_tipo, o.destino) : o.destino;
  if (a.acao === 'insert') return { txt: `Pedido de aprovação: ${dest} (${NIV[o.nivel] ?? o.nivel})`, topo: '.tl-topo' };
  if (a.antes?.status === a.depois?.status) return null;
  const st = a.depois?.status;
  if (st === 'aprovado') return { txt: `Aprovado: ${dest} (${NIV[o.nivel] ?? o.nivel})`, det: o.comentario ? [o.comentario] : undefined, topo: '.tl-topo' };
  if (st === 'recusado') return { txt: `Recusado: ${dest}`, det: o.comentario ? [o.comentario] : undefined, topo: '.tl-topo' };
  if (st === 'cancelado' && a.depois?.decidido_por) return { txt: `Pedido de aprovação cancelado: ${dest}`, topo: '.tl-topo' };
  return null;
}

async function carregarLogs(empresa: string, f: F) {
  const [pr, of, pt, ru] = await Promise.all([
    supabase.from('processos').select('id,fase,parte_id').eq('terreno_id', f.id),
    supabase.from('ofertas').select('id').eq('terreno_id', f.id),
    supabase.from('terreno_partes').select('id,nome').eq('terreno_id', f.id),
    supabase.from('reunioes').select('id,inicio').eq('terreno_id', f.id),
  ]);
  for (const x of [pr, of, pt, ru]) if (x.error) throw x.error;
  const procs = pr.data as R[], pids = procs.map((p) => p.id), oids = (of.data as R[]).map((o) => o.id), rids = (ru.data as R[]).map((r) => r.id);
  const ors = [`registro_id.eq.${f.id}`, `depois->>terreno_id.eq.${f.id}`, `antes->>terreno_id.eq.${f.id}`];
  if (pids.length) ors.push(`depois->>processo_id.in.(${pids})`, `antes->>processo_id.in.(${pids})`);
  if (oids.length) ors.push(`depois->>oferta_id.in.(${oids})`, `antes->>oferta_id.in.(${oids})`);
  if (rids.length) ors.push(`depois->>reuniao_id.in.(${rids})`, `antes->>reuniao_id.in.(${rids})`);
  const lerAud = (cols: string) => supabase.from('auditoria').select(cols).eq('empresa_id', empresa)
    .not('tabela', 'in', '(processos,terreno_entorno,terreno_entorno_buscas,consultas_lote,consultas_area,tarefas_etapa,terreno_pontos_excluidos,terreno_valores)')
    .or(ors.join(',')).order('em', { ascending: false }).order('id', { ascending: false }).limit(1000);
  const COLS = 'id,tabela,registro_id,acao,antes,depois,user_id,em';
  const [au0, tr] = await Promise.all([
    lerAud(COLS + ',automatico'),
    pids.length
      ? supabase.from('processo_transicoes').select('id,processo_id,evento,de_etapa,para_etapa,de_subetapa,para_subetapa,forcado,comentario,user_id,em').in('processo_id', pids).order('em', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  /* banco ainda sem a coluna automatico (antes do SQL de 9/nov): lê sem ela, e tudo aparece como antes */
  const au = au0.error?.code === '42703' ? await lerAud(COLS) : au0;
  if (au.error) throw au.error;
  if (tr.error) throw tr.error;
  const parts = (au.data as R[]).filter((a) => a.tabela === 'reuniao_participantes').map((a) => (a.depois ?? a.antes) as R);
  const uids = [...new Set([...(au.data as R[]), ...(tr.data as R[])].map((x) => x.user_id).concat(parts.map((p) => p.user_id)).filter(Boolean)), f.t.responsavel_id].filter(Boolean);
  const peids = [...new Set(parts.map((p) => p.pessoa_id).filter(Boolean))];
  const [us, pe] = await Promise.all([
    uids.length ? supabase.from('usuarios').select('user_id,nome,email,foto_url').in('user_id', uids) : Promise.resolve({ data: [], error: null }),
    peids.length ? supabase.from('pessoas').select('id,nome_razao_social').in('id', peids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (us.error) throw us.error;
  if (pe.error) throw pe.error;
  return { aud: au.data as R[], trans: tr.data as R[], procs, partes: pt.data as R[], users: us.data as R[], reus: ru.data as R[], pessoas: pe.data as R[] };
}

/* Consequências automáticas (pedido do Moises, 9/nov/2026): cada uma fica recolhida dentro da última ação da mesma
 * pessoa, se veio até JANELA_AUTO depois dela; sem ação antes (a medição das frentes ao abrir a ficha, por exemplo), as
 * seguidas da mesma pessoa viram um grupo "Atualização automática", que não conta como ação. O banco não liga a
 * consequência à ação: liga-se aqui pela pessoa e pelo tempo. Recebe e devolve do mais recente ao mais antigo. */
const JANELA_AUTO = 30 * 60 * 1000, JANELA_JUNTA = 2 * 60 * 1000;
export function agrupar(desc: Log[]): Log[] {
  const ult = new Map<string, Log>(), out: Log[] = [];
  for (let i = desc.length - 1; i >= 0; i--) {
    const h = desc[i], u = h.user ?? '', p = ult.get(u);
    if (!h.auto) {
      /* a mesma inclusão seguida (os SQLs marcados de uma vez no mapa): uma linha só, com a lista */
      if (h.junta && p && !p.grupo && !p.filhos?.length && p.junta?.[0] === h.junta[0] && +new Date(h.em) - +new Date(p.em) <= JANELA_JUNTA) {
        const itens = [...(p.det?.length && p.txt.startsWith(h.junta[1]) ? p.det : [p.junta[2]]), h.junta[2]];
        Object.assign(p, { txt: `${h.junta[1]} (${itens.length})`, det: itens, em: h.em });
        continue;
      }
      const x = { ...h }; out.push(x); ult.set(u, x); continue;
    }
    const ref = p ? (p.grupo ? p.filhos![0].em : p.em) : null;
    if (p && ref && +new Date(h.em) - +new Date(ref) <= JANELA_AUTO) { (p.filhos ??= []).unshift(h); continue; }
    const g: Log = { id: 'g' + h.id, em: h.em, user: h.user, txt: 'Atualização automática', auto: true, grupo: true, filhos: [h] };
    out.push(g); ult.set(u, g);
  }
  return out.reverse();
}

export function useLogs(f: F) {
  const { empresa } = useSessao();
  const q = useQuery({ queryKey: ['ficha-logs', f.id, f.versao], enabled: !!empresa, queryFn: () => carregarLogs(empresa!.id, f) });
  const logs = useMemo<Log[]>(() => {
    if (!q.data) return [];
    const { aud, trans, procs, partes, users, reus, pessoas } = q.data;
    const nomes = new Map(users.map((u) => [u.user_id as string, (u.nome || u.email) as string]));
    const ctx: Ctx = { f, nomes, partes: new Map(partes.map((p) => [p.id, p.nome])), procs: new Map(procs.map((p) => [p.id, p])), sp: !f.municipio || /^São Paulo$/i.test(f.municipio), lotes: new Map(),
      reus: new Map(reus.map((r) => [r.id as string, `${fd(dLoc(r.inicio))} ${hLoc(r.inicio)}`])), pessoas: new Map(pessoas.map((p) => [p.id as string, p.nome_razao_social as string])) };
    /* participantes gravados junto com a reunião (até 15 s depois, pela mesma pessoa) entram no log da reunião, não um por um */
    const reuIns = new Map(aud.filter((a) => a.tabela === 'reunioes' && a.acao === 'insert').map((a) => [a.registro_id as string, a]));
    const naCriacao = new Map<string, string[]>(), pular = new Set<string>();
    for (const a of aud) {
      if (a.tabela !== 'reuniao_participantes' || a.acao !== 'insert') continue;
      const r = reuIns.get(a.depois?.reuniao_id);
      if (!r || r.user_id !== a.user_id || Math.abs(+new Date(a.em) - +new Date(r.em)) > 15000) continue;
      const o = a.depois as R;
      const quem = o.user_id ? ctx.nomes.get(o.user_id) ?? 'colega' : o.pessoa_id ? ctx.pessoas.get(o.pessoa_id) ?? 'pessoa' : o.nome ?? '—';
      naCriacao.set(o.reuniao_id, [...(naCriacao.get(o.reuniao_id) ?? []), quem]);
      pular.add(a.id);
    }
    /* o número de cada matrícula e SQL, tirado dos próprios logs, para os logs das etiquetas nas partes */
    for (const a of aud) if (a.tabela === 'matriculas' || a.tabela === 'inscricoes_municipais') { const o = a.depois ?? a.antes ?? {}; ctx.lotes.set(a.registro_id, a.tabela === 'matriculas' ? `Matrícula ${o.numero}` : `${ctx.sp ? 'SQL' : 'Inscrição'} ${o.inscricao}`); }
    const faseN = (k: string) => f.fases.find((x) => x.k === k);
    const etN = (fs: string, k: string | null) => (k ? f.etapasPorFase[fs]?.find((e) => e.k === k)?.nome ?? k : '');
    const subN = (fs: string, e: string | null, k: string | null) => (k ? f.etapasPorFase[fs]?.find((x) => x.k === e)?.subs.find((s) => s.k === k)?.nome ?? k : '');
    const destNome = (p: R, tipo: string, d: string) => (tipo === 'etapa' ? etN(p.fase, d) : tipo === 'subetapa' ? f.etapasPorFase[p.fase]?.flatMap((e) => e.subs).find((s) => s.k === d)?.nome ?? d
      : ({ concluido: faseN(p.fase)?.entrada ? 'Comprado' : 'Concluído', stand_by: 'Stand By', perdido: 'Perdido', descartado: 'Descartado' } as R)[d] ?? d);
    const out: Log[] = [];
    const vistos = new Set<string>();
    for (const a of aud) {
      let t: Omit<Log, 'id' | 'em' | 'user'> | null;
      if (a.tabela === 'aprovacoes') {
        const o = (a.depois ?? a.antes) as R, k = `${o.pedido_id}:${a.acao}:${a.depois?.status}`;
        if (vistos.has(k) && a.depois?.status !== 'aprovado') continue;
        vistos.add(k);
        t = txtAprov(a, ctx, destNome);
      } else if (pular.has(a.id)) continue;
      else {
        t = txtAud(a, ctx);
        const ps = a.tabela === 'reunioes' && a.acao === 'insert' ? naCriacao.get(a.registro_id) : null;
        if (t && ps?.length) t = { ...t, det: [...(t.det ?? []), 'Participantes: ' + ps.join(', ')] };
      }
      if (t) out.push({ id: 'a' + a.id, em: a.em, user: a.user_id ? nomes.get(a.user_id) ?? 'Sistema' : 'Sistema', ...t, auto: a.automatico === true });
    }
    const TEMPN = (s: string) => s.replace(/\d/g, (n) => TEMP[+n] || n);
    for (const x of trans) {
      const p = ctx.procs.get(x.processo_id) as R, fs = faseN(p?.fase), pre = (p?.parte_id ? `${ctx.partes.get(p.parte_id) ?? 'Parte'} · ` : '') + (fs && !fs.entrada ? `${fs.nome} · ` : '');
      const det = [x.forcado && x.comentario ? 'Sem os requisitos: ' + x.comentario : x.comentario && x.evento !== 'temperatura' ? x.comentario : null].filter(Boolean) as string[];
      const st = (s: string) => `${pre}Status: ${s}`;
      const txt = ({
        abertura: fs?.entrada ? `${pre}Negociação aberta` : `${pre}Fase aberta`,
        avanco: `${pre}Etapa: ${etN(p?.fase, x.para_etapa)}${x.para_subetapa ? ' · ' + subN(p?.fase, x.para_etapa, x.para_subetapa) : ''}`,
        retorno: `${pre}Voltou para ${etN(p?.fase, x.para_etapa)}`,
        subetapa: `${pre}Subetapa: ${subN(p?.fase, x.para_etapa, x.para_subetapa)}`,
        conclusao: st(fs?.entrada ? 'Comprado' : 'Concluído'), descarte: st('Descartado'), perda: st('Perdido'), stand_by: st('Stand By'), retomada: `${pre}Retomada`,
        temperatura: `Temperatura: ${TEMPN(x.comentario ?? '')}`,
      } as Record<string, string>)[x.evento] ?? x.evento;
      out.push({ id: 't' + x.id, em: x.em, user: x.user_id ? nomes.get(x.user_id) ?? 'Sistema' : 'Sistema', txt, det: det.length ? det : undefined, topo: x.evento === 'temperatura' ? '.fi-temp' : '.tl-topo' });
    }
    return agrupar(out.sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0)));
  }, [q.data, f]);
  const fotos = useMemo(() => new Map((q.data?.users ?? []).map((u) => [(u.nome || u.email) as string, u.foto_url as string | null])), [q.data]);
  return { logs, fotos, carregando: q.isLoading, erro: q.error };
}

/* ---------- avatar com foto ---------- */
function Av({ nome, foto, cls = 'sm' }: { nome: string; foto?: string | null; cls?: string }) {
  const ini = nome.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className={`avatar ${cls}`} style={{ background: `var(--av${(h % 4) + 1})`, overflow: 'hidden', padding: foto ? 0 : undefined }} title={nome}>
      {foto ? <img src={foto} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : ini}
    </span>
  );
}

/* ---------- período ---------- */
const PER_OPC: [string, string][] = [['tudo', 'Todo o período'], ['hoje', 'Hoje'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['30d', 'Últimos 30 dias'], ['ano', 'Este ano']];
const PER_CURTO: Record<string, string> = { tudo: 'Tudo', hoje: 'Hoje', semana: 'Semana', mes: 'Mês', '30d': '30 dias', ano: 'Ano' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function faixa(P: PN['per']): [string, string] | null {
  const h = hojeISO(), dt = new Date();
  switch (P.k) {
    case 'hoje': return [h, h];
    case 'semana': return [somarDias(h, -dt.getDay()), h];
    case 'mes': return [h.slice(0, 8) + '01', h];
    case '30d': return [somarDias(h, -29), h];
    case 'ano': return [h.slice(0, 5) + '01-01', h];
    case 'custom': return P.ini ? [P.ini, P.fim || P.ini] : null;
    default: return null;
  }
}
const fdc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MES3[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`; };
function perRot(P: PN['per']) { if (P.k === 'custom' && P.ini) { const f = P.fim || P.ini; return f === P.ini ? fdc(P.ini) : `${fdc(P.ini)} – ${fdc(f)}`; } return (PER_OPC.find((x) => x[0] === P.k) ?? PER_OPC[0])[1]; }
const diaRot = (d: string) => { const x = diasEntre(d, hojeISO()); return x === 0 ? 'Hoje' : x === 1 ? 'Ontem' : fd(d); };
const CHEV = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
const CAL_IC = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
const AUTO_IC = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4" /></svg>;
const SETA = (d: number) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>;

function Calendario({ ini0, fim0, aplicar, cancelar }: { ini0?: string; fim0?: string; aplicar: (i: string, f: string) => void; cancelar: () => void }) {
  const h = hojeISO();
  const [mes, setMes] = useState((ini0 || h).slice(0, 7));
  const [ini, setIni] = useState<string | null>(ini0 ?? null), [fim, setFim] = useState<string | null>(fim0 ?? null);
  const [y, m] = mes.split('-').map(Number), pri = new Date(y, m - 1, 1).getDay(), nd = new Date(y, m, 0).getDate();
  const ant = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`, prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const dia = (s: string) => { if (!ini || fim) { setIni(s); setFim(null); } else if (s < ini) { setFim(ini); setIni(s); } else setFim(s); };
  return (
    <div className="pn-cal" role="dialog" aria-label="Escolher período">
      <div className="pn-ct">Selecione o período</div>
      <div className="pn-cr"><span className={ini ? '' : 'vazio'}>{ini ? fdc(ini) : 'Início'}</span> – <span className={fim ? '' : 'vazio'}>{fim ? fdc(fim) : 'Término'}</span></div>
      <div className="pn-cn"><button className="iconbtn" aria-label="Mês anterior" onClick={() => setMes(ant)}>{SETA(-1)}</button>
        <span className="pn-cm">{MESES[m - 1]} de {y}</span>
        <button className="iconbtn" aria-label="Próximo mês" disabled={prox > h.slice(0, 7)} onClick={() => setMes(prox)}>{SETA(1)}</button></div>
      <div className="pn-cw">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x, i) => <span key={i}>{x}</span>)}</div>
      <div className="pn-cg">
        {Array.from({ length: pri }, (_, i) => <span key={'v' + i} />)}
        {Array.from({ length: nd }, (_, i) => {
          const d = i + 1, s = `${mes}-${String(d).padStart(2, '0')}`, eI = ini === s, eF = !!fim && fim === s, dentro = !!ini && !!fim && s > ini && s < fim;
          return (
            <span key={s} className={`pn-cd${dentro ? ' meio' : ''}${eI && fim && fim !== ini ? ' ini' : ''}${eF && fim !== ini ? ' fim' : ''}`}>
              <button disabled={s > h} className={`${eI || eF ? 'sel' : ''}${s === h ? ' hoje' : ''}`} aria-pressed={eI || eF} aria-label={`${d} de ${MESES[m - 1]}`} onClick={() => dia(s)}>{d}</button>
            </span>
          );
        })}
      </div>
      <div className="pn-cf"><button className="btn text sm" onClick={cancelar}>Cancelar</button><button className="btn text sm" disabled={!ini} onClick={() => ini && aplicar(ini, fim || ini)}>Aplicar</button></div>
    </div>
  );
}

/** ir ao que o log mudou: a aba, o quadro aberto e aceso */
function mostrarLog(h: Log, irAba: (k: string) => void) {
  if (h.aba) { if (h.q) abrirQuadro(h.aba, h.q); irAba(h.aba); window.dispatchEvent(new Event('ficha-quadro')); }
  setTimeout(() => {
    const el = h.topo ? document.querySelector<HTMLElement>(h.topo) : h.q ? document.getElementById(`sec-${h.q}`) : document.querySelector<HTMLElement>('.fi-aba .sec');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.querySelectorAll('.pisca').forEach((x) => x.classList.remove('pisca'));
    let feito = false;
    const acende = () => { if (feito) return; feito = true; void el.offsetWidth; el.classList.add('pisca'); setTimeout(() => el.classList.remove('pisca'), 4200); };
    if ('onscrollend' in window) { window.addEventListener('scrollend', acende, { once: true }); setTimeout(acende, 900); } else setTimeout(acende, 500);
  }, 80);
}

function Logs({ f, pn, set, irAba }: { f: F; pn: PN; set: (p: Partial<PN>) => void; irAba: (k: string) => void }) {
  const { logs, fotos, carregando, erro } = useLogs(f);
  const [menu, setMenu] = useState<'user' | 'per' | null>(null), [cal, setCal] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const alternar = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fora = (ev: PointerEvent) => { if (!(ev.target as HTMLElement).closest?.('.pn-dd')) { setMenu(null); setCal(false); } };
    const esc = (ev: KeyboardEvent) => { if (ev.key !== 'Escape') return; if (cal) setCal(false); else setMenu(null); };
    document.addEventListener('pointerdown', fora, true); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', esc); };
  }, [menu, cal]);
  if (carregando) return <div className="empty">Carregando…</div>;
  if (erro) return <div className="empty">Não foi possível ler os logs.</div>;
  if (!logs.length) return <div className="empty">Nenhum registro.</div>;
  const fx = faixa(pn.per), noPer = fx ? logs.filter((h) => { const d = dLoc(h.em); return d >= fx[0] && d <= fx[1]; }) : logs;
  const tot = new Map<string, number>(), cont = new Map<string, number>();
  /* as contagens são das ações; o grupo "Atualização automática" aparece, mas não conta */
  logs.forEach((h) => tot.set(h.user ?? '', (tot.get(h.user ?? '') ?? 0) + (h.grupo ? 0 : 1)));
  noPer.forEach((h) => cont.set(h.user ?? '', (cont.get(h.user ?? '') ?? 0) + (h.grupo ? 0 : 1)));
  const nPer = noPer.filter((h) => !h.grupo).length;
  const users = [...tot.keys()].sort((a, b) => (cont.get(b) ?? 0) - (cont.get(a) ?? 0) || tot.get(b)! - tot.get(a)! || a.localeCompare(b));
  const us = pn.users.filter((x) => users.includes(x));
  const H = us.length ? noPer.filter((h) => us.includes(h.user ?? '')) : noPer;
  const nSel = us.reduce((a, x) => a + (cont.get(x) ?? 0), 0);
  const rot = !us.length ? `Todos os usuários (${nPer})` : us.length === 1 ? `${us[0]} (${nSel})` : us.length === 2 ? `${us.map((x) => x.split(' ')[0]).join(', ')} (${nSel})` : `${us.length} usuários (${nSel})`;
  const rotC = !us.length ? 'Usuários' : us.length === 1 ? us[0].split(' ')[0] : `${us.length} usuários`;
  const perAtivo = !!fx && pn.per.k !== '30d';
  const ck = <span className="pn-ck" aria-hidden="true" />;
  let dia = '';
  const linhas: ReactNode[] = [];
  for (const h of H) {
    const d = dLoc(h.em);
    if (d !== dia) { dia = d; linhas.push(<div key={'d' + d} className="pn-dia">{diaRot(d)}</div>); }
    const ir = (x: Log) => { setSel(x.id); setTimeout(() => setSel((s) => (s === x.id ? null : s)), 4000); mostrarLog(x, irAba); };
    const nf = h.filhos?.length ?? 0, ab = abertos.has(h.id);
    /* o grupo sem ação abre e fecha no clique; a ação vai ao que mudou, e a seta abre as consequências */
    const clique = () => (h.grupo ? alternar(h.id) : ir(h));
    const fios = nf > 0 && (
      <button className={`pn-auto-b${ab ? ' aberto' : ''}`} aria-expanded={ab} onClick={(e) => { e.stopPropagation(); alternar(h.id); }}>
        {CHEV}{nf} {nf > 1 ? 'atualizações automáticas' : 'atualização automática'}</button>
    );
    linhas.push(
      <div key={h.id} className={`pn-log${h.grupo ? ' pn-log-auto' : ''}${sel === h.id ? ' pn-log-sel' : ''}`} tabIndex={0} role="button"
        aria-label={h.grupo ? `${h.txt}: ${ab ? 'recolher' : 'mostrar'} ${nf}` : `${h.txt}: mostrar na ficha`} aria-expanded={h.grupo ? ab : undefined}
        onClick={clique} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); clique(); } }}>
        {h.grupo ? <span className="avatar sm pn-av-auto" aria-hidden="true">{AUTO_IC}</span> : <Av nome={h.user ?? 'Sistema'} foto={fotos.get(h.user ?? '')} />}
        <div className="pn-lc"><div className="pn-lt">{h.txt}</div>{h.det && h.det.length > 0 && <ul className="pn-det">{h.det.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          <div className="pn-lm" title={completo(h.em)}>{h.user ?? 'Sistema'} · {hLoc(h.em)}</div>
          {fios}
          {ab && nf > 0 && (
            <div className="pn-auto">
              {h.filhos!.map((x) => (
                <div key={x.id} className={`pn-auto-l${sel === x.id ? ' pn-log-sel' : ''}`} tabIndex={0} role="button" aria-label={`${x.txt}: mostrar na ficha`}
                  onClick={(e) => { e.stopPropagation(); ir(x); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); ir(x); } }}>
                  <div className="pn-lt">{x.txt}</div>{x.det && x.det.length > 0 && <ul className="pn-det">{x.det.map((y, i) => <li key={i}>{y}</li>)}</ul>}
                  <div className="pn-lm" title={completo(x.em)}>{hLoc(x.em)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>,
    );
  }
  return (
    <div ref={raiz}>
      <div className="pn-filtros">
        <div className={`pn-dd${menu === 'user' ? ' aberto' : ''}`}>
          <button className={`pn-dd-b${us.length ? ' ativo' : ''}`} aria-haspopup="menu" aria-expanded={menu === 'user'} aria-label={`Filtrar por usuário: ${rot}`} onClick={() => setMenu(menu === 'user' ? null : 'user')}><span className="pn-dd-t">{rotC}</span>{CHEV}</button>
          <div className="pn-menu" role="menu" aria-label="Usuários">
            <button role="menuitemcheckbox" aria-checked={!us.length} onClick={() => set({ users: [] })}>{ck}<span className="pn-mn">Todos os usuários</span><span className="n">{nPer}</span></button>
            <div className="pn-msep" />
            {users.map((x) => (
              <button key={x} role="menuitemcheckbox" aria-checked={us.includes(x)} className={cont.get(x) ? '' : 'zero'} onClick={() => set({ users: us.includes(x) ? us.filter((y) => y !== x) : [...us, x] })}>
                {ck}<Av nome={x} foto={fotos.get(x)} cls="xs" /><span className="pn-mn">{x}</span><span className="n">{cont.get(x) ?? 0}</span></button>
            ))}
          </div>
        </div>
        <div className={`pn-dd${menu === 'per' ? ' aberto' : ''}`}>
          <button className={`pn-dd-b${perAtivo ? ' ativo' : ''}`} aria-haspopup="menu" aria-expanded={menu === 'per'} aria-label={`Filtrar por período: ${perRot(pn.per)}`} onClick={() => { setCal(false); setMenu(menu === 'per' ? null : 'per'); }}>
            {CAL_IC}<span className="pn-dd-t">{pn.per.k === 'custom' ? perRot(pn.per) : PER_CURTO[pn.per.k] ?? perRot(pn.per)}</span>{CHEV}</button>
          <div className={`pn-menu${cal ? ' cal' : ''}`} role="menu" aria-label="Período">
            {cal
              ? <Calendario ini0={pn.per.k === 'custom' ? pn.per.ini : undefined} fim0={pn.per.k === 'custom' ? pn.per.fim : undefined} cancelar={() => setCal(false)}
                  aplicar={(i, fm) => { set({ per: { k: 'custom', ini: i, fim: fm } }); setCal(false); setMenu(null); }} />
              : <div className="pn-menu-l">
                  {PER_OPC.map(([k, l]) => <button key={k} role="menuitemradio" aria-checked={pn.per.k === k} onClick={() => { set({ per: { k } }); setMenu(null); }}><span className="pn-mn">{l}</span></button>)}
                  <div className="pn-msep" />
                  <button role="menuitemradio" aria-checked={pn.per.k === 'custom'} onClick={() => setCal(true)}>{CAL_IC}<span className="pn-mn">Personalizado{pn.per.k === 'custom' && pn.per.ini ? <> <span className="n">{perRot(pn.per)}</span></> : '…'}</span></button>
                </div>}
          </div>
        </div>
      </div>
      {H.length ? linhas : <div className="empty">Nenhum registro {us.length ? 'destes usuários ' : ''}neste período.</div>}
    </div>
  );
}

/* ---------- ações: próximas ações da negociação (proto_painel.js › proximasAcoes; tarefas entram com o porte das tarefas) ---------- */
interface Acao { sev: string; i: 'pause' | 'check' | 'clock' | 'warn' | 'fwd' | 'money' | 'edit'; txt: string; fix?: [string, () => void] }
function useAcoes(f: F, irAba: (k: string) => void): Acao[] {
  const procs = procsAvanco(f), neg = procs.find((p) => f.fases.find((x) => x.k === p.fase)?.entrada) ?? procs[0];
  const adv = useAvanco(f, neg ?? { id: '', fase: '', etapa: '', sub: null, status: '', desde: null, encerrado: null });
  const com = useComercial(f).data;
  const L: Acao[] = [];
  const d = neg ? adv.data : undefined;
  if (d?.p.status === 'stand_by') L.push({ sev: 'warn', i: 'pause', txt: `Negociação em Stand By. Retomar em ${fd(d.p.retomar_em)}` });
  if (d?.p.status === 'ativo') {
    const r = d.r, ped = r.pedido;
    if (ped) L.push({ sev: 'warn', i: 'check', txt: ped.posso_decidir ? `Aprovar: ${ped.destino_nome ?? ped.destino} (pedido por ${d.niveis[0]?.pedido_por_nome ?? ped.pedido_por ?? '—'})` : `Aguardando o ${ped.aguardando} aprovar ${ped.destino_nome ?? ped.destino}` });
    const sub = d.subs.find((s) => s.etapa === d.p.etapa_atual && s.codigo === d.p.subetapa_atual);
    const dias = d.p.subetapa_desde ? diasEntre(dLoc(d.p.subetapa_desde), hojeISO()) : null;
    if (sub?.prazo_dias != null && dias != null && dias > sub.prazo_dias) L.push({ sev: 'warn', i: 'clock', txt: `${sub.nome} há ${dias} dias (prazo de ${sub.prazo_dias})` });
    r.itens.filter((x) => !x.ok && x.tipo !== 'aprovacao_pendente').forEach((x) => L.push({ sev: 'warn', i: 'fwd', txt: x.texto }));
    if (r.ok && !ped) L.push({ sev: 'good', i: 'fwd', txt: `Pronto para ${r.proxima_tipo === 'status' ? 'concluir como Comprado' : 'avançar para ' + (r.proxima_nome ?? '')}${(r.aprovacoes ?? []).length ? ' (pede aprovação)' : ''}` });
    const lp = com?.props.slice().sort((a, b) => b.versao - a.versao)[0];
    if (lp && ['apresentada', 'em_analise'].includes(lp.status)) L.push({ sev: 'warn', i: 'money', txt: lp.origem === 'bkm' ? `Cobrar resposta da proposta v${lp.versao} (enviada em ${fd(lp.data_apresentacao)})` : `Responder à proposta v${lp.versao} do vendedor (${milhoes(lp.valor_total)})`, fix: ['Ver propostas', () => { abrirQuadro('comercial', 'propostas'); irAba('comercial'); }] });
    if (!f.temp) L.push({ sev: 'warn', i: 'warn', txt: 'Avaliar a temperatura do terreno' });
    const agora = new Date().toISOString();
    const pr = com?.reus.filter((x) => x.status !== 'realizada' && x.status !== 'cancelada' && x.inicio && x.inicio >= agora).sort((a, b) => (a.inicio < b.inicio ? -1 : 1))[0];
    if (pr) L.push({ sev: '', i: 'clock', txt: `Reunião ${fd(dLoc(pr.inicio))} às ${hLoc(pr.inicio)}${pr.pauta ? ' · ' + pr.pauta : ''}`, fix: ['Ver', () => { abrirQuadro('comercial', 'reunioes'); irAba('comercial'); }] });
  }
  const c = completude(f);
  if (c.faltam.length) {
    const [, aba, sec, campo] = c.faltam[0];
    L.push({ sev: '', i: 'edit', txt: `Completar a ficha (${c.pct}%): ${c.faltam.slice(0, 3).map((x) => x[0]).join(', ')}${c.faltam.length > 3 ? '…' : ''}`, fix: ['Completar', () => { irAba(aba); if (sec) pedirCampo({ sec, campo }); }] });
  }
  if (!neg) L.push({ sev: '', i: 'fwd', txt: 'Terreno sem negociação. Registre uma oferta para abrir a negociação.' });
  return L;
}

// Tarefas abertas do terreno (o quadro do terreno no esquema fluxo), da mais urgente
// à sem prazo, como no protótipo. O cartão abre quando as tarefas forem portadas.
export interface Tar { id: string; codigo: string; titulo: string; prazo: string | null; prioridade: string; lista: string; resp: string | null }
function useTarefas(f: F) {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['ficha-tarefas', f.id],
    enabled: !!empresa,
    queryFn: async (): Promise<Tar[]> => {
      const fl = supabase.schema('fluxo');
      const q = await fl.from('quadros').select('id').eq('objeto_tipo', 'terreno').eq('objeto_id', f.id);
      if (q.error) throw q.error;
      const qids = (q.data ?? []).map((x: { id: string }) => x.id);
      if (!qids.length) return [];
      const t = await fl.from('tarefas').select('id,codigo,titulo,prazo,prioridade,lista_id,responsavel_id')
        .in('quadro_id', qids).is('concluida_em', null).is('arquivada_em', null).eq('modelo', false);
      if (t.error) throw t.error;
      const ts = (t.data ?? []) as { id: string; codigo: string; titulo: string; prazo: string | null; prioridade: string; lista_id: string; responsavel_id: string | null }[];
      const lids = [...new Set(ts.map((x) => x.lista_id))], uids = [...new Set(ts.map((x) => x.responsavel_id).filter(Boolean))] as string[];
      const [ls, us] = await Promise.all([
        lids.length ? fl.from('listas').select('id,nome').in('id', lids) : Promise.resolve({ data: [], error: null }),
        uids.length ? supabase.from('usuarios').select('user_id,nome,email').in('user_id', uids) : Promise.resolve({ data: [], error: null }),
      ]);
      const ln = new Map(((ls.data ?? []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome]));
      const un = new Map(((us.data ?? []) as { user_id: string; nome: string | null; email: string | null }[]).map((x) => [x.user_id, x.nome || x.email || null]));
      return ts.map((x) => ({ id: x.id, codigo: x.codigo, titulo: x.titulo, prazo: x.prazo, prioridade: x.prioridade, lista: ln.get(x.lista_id) ?? '', resp: x.responsavel_id ? un.get(x.responsavel_id) ?? null : null }))
        .sort((a, b) => String(a.prazo ?? '9').localeCompare(String(b.prazo ?? '9')));
    },
  });
}

function Tarefas({ q }: { q: ReturnType<typeof useTarefas> }) {
  const K = q.data ?? [], hoje = hojeISO();
  return (
    <div className="pn-grupo"><div className="pn-gt">Tarefas em aberto <span className="n">{K.length}</span></div>
      {q.isLoading ? <div className="empty">Carregando…</div> : q.error ? <div className="empty">Não foi possível ler as tarefas.</div> : K.length ? K.map((k) => {
        const late = !!k.prazo && k.prazo < hoje;
        return (
          <div key={k.id} className="pn-tar">
            <div className="pn-tc"><span className="pn-tt">{k.titulo}{k.prioridade === 'alta' && <> <span className="chip warn" style={{ height: 20 }}>Alta</span></>}</span>
              <span className={`pn-tm ${late ? 'late' : ''}`}>{k.resp || 'Sem responsável'} · {k.prazo ? (late ? 'atrasada desde ' : 'prazo ') + fd(k.prazo) : 'sem prazo'}{k.lista ? ' · ' + k.lista : ''}</span></div>
          </div>
        );
      }) : <div className="empty">Nenhuma tarefa aberta.</div>}
    </div>
  );
}

const PN_IC = {
  logs: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  tarefas: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M8 12.2l2.7 2.6L16 9.5" /></svg>,
  acoes: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" /><path d="M3.5 6l1.2 1.2L6.8 5M3.5 12l1.2 1.2 2.1-2.2M3.5 18l1.2 1.2 2.1-2.2" /></svg>,
  fechar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 6l6 6-6 6M5 6l6 6-6 6" /></svg>,
  abrir: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 6l-6 6 6 6M19 6l-6 6 6 6" /></svg>,
};

/** os quadros de avanço (um por fase aberta), no painel ou na página */
export function Avancos({ f, irAba }: { f: F; irAba: (k: string) => void }) {
  return <>{procsAvanco(f).map((p) => <Avanco key={p.id} f={f} proc={p} irAba={irAba} />)}</>;
}

export default function Painel({ f, irAba }: { f: F; irAba: (k: string) => void }) {
  const [pn, set] = usePN();
  const { logs } = useLogs(f);
  const acoes = useAcoes(f, irAba);
  const tq = useTarefas(f);
  const nL = logs.filter((h) => !h.grupo).length, nA = acoes.length, nT = tq.data?.length ?? 0;
  const b = useRef<HTMLDivElement>(null);
  if (!pn.aberto) return (
    <aside className="pn pn-min" aria-label="Ações, tarefas e logs">
      <button className="pn-rb" title="Expandir painel" aria-label="Expandir painel" onClick={() => set({ aberto: true })}>{PN_IC.abrir}</button>
      <button className="pn-rb" title="Ações" aria-label={`Ações, ${nA} pendências`} onClick={() => set({ aba: 'acoes', aberto: true })}>{PN_IC.acoes}<span className="pn-badge">{nA}</span></button>
      <button className="pn-rb" title="Tarefas" aria-label={`Tarefas, ${nT} em aberto`} onClick={() => set({ aba: 'tarefas', aberto: true })}>{PN_IC.tarefas}<span className="pn-badge">{nT}</span></button>
      <button className="pn-rb" title="Logs" aria-label={`Logs, ${nL} registros`} onClick={() => set({ aba: 'logs', aberto: true })}>{PN_IC.logs}<span className="pn-badge">{nL}</span></button>
    </aside>
  );
  return (
    <aside className="pn" aria-label="Ações, tarefas e logs">
      {procsAvanco(f).length > 0 && <div className="pn-adv"><Avancos f={f} irAba={irAba} /></div>}
      <div className="pn-h">
        <div className="seg" role="tablist" aria-label="Painel">
          {([['acoes', 'Ações', nA], ['tarefas', 'Tarefas', nT], ['logs', 'Logs', nL]] as const).map(([k, l, q]) => (
            <button key={k} role="tab" aria-pressed={pn.aba === k} aria-selected={pn.aba === k} onClick={() => set({ aba: k })}>{l} <span className="pn-q">{q}</span></button>
          ))}
        </div>
        <button className="iconbtn" title="Recolher painel" aria-label="Recolher painel" onClick={() => set({ aberto: false })}>{PN_IC.fechar}</button>
      </div>
      <div className="pn-b" ref={b}>
        {pn.aba === 'logs' ? <Logs f={f} pn={pn} set={set} irAba={irAba} /> : pn.aba === 'tarefas' ? <Tarefas q={tq} /> : (
          <div className="pn-grupo"><div className="pn-gt">Próximas ações <span className="n">{acoes.length}</span></div>
            {acoes.length ? acoes.map((x, i) => (
              <div key={i} className={`pn-acao ${x.sev}`}><span className="pn-ai"><Ic n={x.i} s={16} /></span>
                <div className="pn-ac"><div>{x.txt}</div>{x.fix && <button className="linkbtn" onClick={x.fix[1]}>{x.fix[0]}</button>}</div></div>
            )) : <div className="empty">Nada pendente.</div>}
          </div>
        )}
      </div>
    </aside>
  );
}
