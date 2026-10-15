import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { rpc, useAcao } from '../lib/api';
import { CARTORIOS, lerValor } from '../lib/format';
import { useSessao } from '../lib/sessao';
import { mensagemErro, supabase } from '../lib/supabase';
import { Dialogo, Icon, useToast } from './ui';

interface Duplicado { terreno_id: string; codigo: string; bairro: string; endereco: string; motivo: 'matricula' | 'matricula_outro_cartorio' | 'endereco' }

export default function NovaOferta({ onFechar }: { onFechar: () => void }) {
  const { empresa } = useSessao();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ mat: '', cri: '9º CRI', end: '', bairro: '', area: '', valor: '', origem: 'corretor', contato: '' });
  const [dup, setDup] = useState<Duplicado | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  // procura duplicata enquanto digita (com atraso para não consultar a cada tecla)
  useEffect(() => {
    if (!empresa) return;
    const mat = f.mat.replace(/\D/g, '');
    if (mat.length < 3 && f.end.trim().length < 6) { setDup(null); return; }
    const h = setTimeout(async () => {
      const { data } = await supabase.rpc('buscar_duplicados', {
        p_empresa: empresa.id, p_matricula: f.mat || null, p_cartorio: f.cri, p_endereco: f.end || null,
      });
      setDup(((data as Duplicado[] | null) ?? [])[0] ?? null);
    }, 350);
    return () => clearTimeout(h);
  }, [f.mat, f.cri, f.end, empresa]);

  const salvar = useAcao(async () =>
    rpc<{ terreno_id: string; terreno_novo: boolean }>('registrar_oferta', {
      p_empresa: empresa!.id,
      p_endereco: f.end,
      p_bairro: f.bairro,
      p_area_m2: lerValor(f.area) || null,
      p_valor: lerValor(f.valor),
      p_origem: f.origem,
      p_contato: f.contato || null,
      p_matricula: f.mat || null,
      p_cartorio: f.mat ? f.cri : null,
      p_terreno_id: dup?.motivo === 'matricula' ? dup.terreno_id : null,
    }),
  );

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!lerValor(f.valor)) { toast('Informe o valor pedido.', true); return; }
    try {
      const r = await salvar.mutateAsync(undefined);
      onFechar();
      nav(`/terrenos/${r.terreno_id}/${r.terreno_novo ? '' : 'ofertas'}`);
      toast(r.terreno_novo ? 'Terreno criado com a oferta.' : 'Oferta anexada ao terreno existente.');
    } catch (err) {
      toast(mensagemErro(err), true);
    }
  }

  const anexar = dup?.motivo === 'matricula';
  return (
    <Dialogo titulo="Nova oferta" sub="Só o essencial. O resto completa depois." onFechar={onFechar}
      rodape={<>
        <button className="btn text" onClick={onFechar}>Cancelar</button>
        <button className="btn primary" type="submit" form="f-oferta" aria-busy={salvar.isPending} disabled={salvar.isPending}>
          {anexar ? 'Anexar ao terreno' : 'Salvar oferta'}
        </button>
      </>}>
      <form id="f-oferta" onSubmit={enviar}>
        <div className="fields">
          <div className="field"><label htmlFor="of-m">Matrícula (opcional)</label>
            <input id="of-m" inputMode="numeric" value={f.mat} onChange={set('mat')} placeholder="Ex.: 184.552" /></div>
          <div className="field"><label htmlFor="of-c">Cartório</label>
            <select id="of-c" value={f.cri} onChange={set('cri')}>{CARTORIOS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field full"><label htmlFor="of-e">Endereço</label>
            <input id="of-e" value={f.end} onChange={set('end')} required={!anexar} placeholder="Rua, número" /></div>
          <div className="field"><label htmlFor="of-b">Bairro</label>
            <input id="of-b" value={f.bairro} onChange={set('bairro')} required={!anexar} placeholder="Ex.: Itaquera" /></div>
          <div className="field"><label htmlFor="of-a">Área (m²)</label>
            <input id="of-a" inputMode="numeric" value={f.area} onChange={set('area')} placeholder="3.120" /></div>
          <div className="field"><label htmlFor="of-v">Valor pedido (R$)</label>
            <input id="of-v" inputMode="numeric" value={f.valor} onChange={set('valor')} required placeholder="6.800.000" /></div>
          <div className="field"><label htmlFor="of-o">Origem</label>
            <select id="of-o" value={f.origem} onChange={set('origem')}>
              <option value="corretor">Corretor</option>
              <option value="proprietario">Proprietário direto</option>
              <option value="prospeccao">Prospecção própria</option>
            </select></div>
          <div className="field full"><label htmlFor="of-k">Corretor ou contato</label>
            <input id="of-k" value={f.contato} onChange={set('contato')} placeholder="Imobiliária · nome" /></div>
          <div className="field full" aria-live="polite">
            {dup && (anexar ? (
              <div className="banner blue"><Icon n="link" /><div>
                <div className="bt">Terreno já cadastrado: {dup.codigo} · {dup.bairro}</div>
                <div>Matrícula {f.mat} do {f.cri}. A oferta será anexada a esse terreno, sem criar duplicata.</div>
              </div></div>
            ) : (
              <div className="banner warn"><Icon n="warn" /><div>
                <div className="bt">Possível duplicidade com {dup.codigo} · {dup.bairro}</div>
                <div>{dup.motivo === 'matricula_outro_cartorio' ? 'Mesmo número de matrícula em outro cartório.' : `Endereço parecido: ${dup.endereco}.`} Confira antes de salvar.</div>
              </div></div>
            ))}
          </div>
        </div>
      </form>
    </Dialogo>
  );
}
