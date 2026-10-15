import { useRef, useState } from 'react';
import { abrirDocumento, enviarDocumento, rpc, useAcao, useEtapas } from '../../lib/api';
import { data } from '../../lib/format';
import { diasParaVencer, JANELA_ALERTA } from '../../lib/regras';
import { useSessao } from '../../lib/sessao';
import { mensagemErro } from '../../lib/supabase';
import type { ItemChecklist, ProcessoResumo } from '../../lib/types';
import { ChipDoc, Icon, useToast } from '../../components/ui';

export default function AbaDocumentos({ p, itens }: { p: ProcessoResumo; itens: ItemChecklist[] }) {
  const toast = useToast();
  const { empresa } = useSessao();
  const etapas = useEtapas().data ?? [];
  const input = useRef<HTMLInputElement>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const podeEditar = p.status === 'ativo' || p.status === 'suspensa';

  const enviar = useAcao(({ tipo, arquivo }: { tipo: string; arquivo: File }) =>
    enviarDocumento({ empresaId: empresa!.id, processoId: p.id, tipo, arquivo }));
  const revisar = useAcao(({ id, ok }: { id: string; ok: boolean }) => rpc('revisar_documento', { p_documento: id, p_aprovado: ok }));

  const grupos = [...new Set(itens.map((i) => i.etapa))];
  const algumAtivo = itens.some((i) => i.ativo);

  return (
    <>
      <input ref={input} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.dwg,.zip"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = '';
          if (!arquivo || !alvo) return;
          if (arquivo.size > 50 * 1024 * 1024) { toast('Arquivo maior que 50 MB.', true); return; }
          enviar.mutate({ tipo: alvo, arquivo }, {
            onSuccess: () => toast(`${arquivo.name} enviado. Falta validar.`),
            onError: (er) => toast(mensagemErro(er), true),
          });
        }} />
      {!algumAtivo && (
        <div className="banner blue" style={{ marginBottom: 16 }}><Icon n="doc" />
          <div>O checklist passa a valer na etapa Diligência. Você já pode enviar documentos antes disso.</div></div>
      )}
      {grupos.map((g) => {
        const doGrupo = itens.filter((i) => i.etapa === g);
        const ativo = doGrupo[0]?.ativo;
        const obrig = doGrupo.filter((i) => i.obrigatorio);
        const ok = obrig.filter((i) => i.situacao === 'validado').length;
        const nomeEtapa = etapas.find((e) => e.codigo === g)?.nome ?? g;
        return (
          <section key={g} className="card chk-group" style={{ marginBottom: 16 }}>
            <div className="chk-gh"><span className="gt">Exigidos para sair de {nomeEtapa}</span>
              {ativo ? <span className="progress"><span className="bar"><span style={{ width: `${obrig.length ? (ok / obrig.length) * 100 : 0}%` }} /></span>{ok} de {obrig.length} obrigatórios</span>
                : <span className="chip">Etapa futura</span>}
            </div>
            {doGrupo.map((i) => {
              const n = diasParaVencer(i.valido_ate);
              const sub = i.nome_arquivo
                ? `${i.nome_arquivo} · v${i.versao_atual} · emitido ${data(i.emitido_em)}${i.valido_ate ? ` · ${i.situacao === 'vencido' ? 'venceu' : 'vence'} ${data(i.valido_ate)}${i.situacao !== 'vencido' && n != null && n <= JANELA_ALERTA ? ` (${n} dias)` : ''}` : ''}`
                : `Validade: ${i.validade_dias ? `${i.validade_dias} dias da emissão` : 'não vence'}`;
              const enviando = enviar.isPending && alvo === i.tipo_documento;
              return (
                <div key={i.tipo_documento} className={`doc ${ativo ? '' : 'future'}`}>
                  <span className="di"><Icon n="doc" s={18} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="dn">{i.tipo_nome} {!i.obrigatorio && <span className="opt">opcional</span>}</div>
                    <div className="ds">{sub}</div>
                  </div>
                  <div className="da">
                    <ChipDoc s={i.situacao} />
                    {i.storage_path && (
                      <button className="btn sm text" onClick={() => abrirDocumento(i.storage_path!).catch((e) => toast(mensagemErro(e), true))}>
                        <Icon n="open" s={16} />Abrir</button>
                    )}
                    {podeEditar && i.situacao === 'recebido' && i.documento_id && (
                      <>
                        <button className="btn sm" disabled={revisar.isPending}
                          onClick={() => revisar.mutate({ id: i.documento_id!, ok: true }, { onSuccess: () => toast('Documento validado.'), onError: (e) => toast(mensagemErro(e), true) })}>
                          <Icon n="check" s={16} />Validar</button>
                        <button className="btn sm text danger" disabled={revisar.isPending}
                          onClick={() => revisar.mutate({ id: i.documento_id!, ok: false }, { onSuccess: () => toast('Documento rejeitado. Peça nova versão.'), onError: (e) => toast(mensagemErro(e), true) })}>
                          Rejeitar</button>
                      </>
                    )}
                    {podeEditar && (
                      <button className={`btn sm ${['pendente', 'vencido', 'rejeitado'].includes(i.situacao) ? '' : 'text'}`} disabled={enviando} aria-busy={enviando}
                        onClick={() => { setAlvo(i.tipo_documento); input.current?.click(); }}>
                        <Icon n="upload" s={16} />{enviando ? 'Enviando…' : i.nome_arquivo ? 'Nova versão' : 'Enviar'}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
      <div className="faint" style={{ fontSize: 12 }}>Prazos de validade configuráveis por tipo de documento. Arquivos em armazenamento privado; versões anteriores nunca são apagadas.</div>
    </>
  );
}
