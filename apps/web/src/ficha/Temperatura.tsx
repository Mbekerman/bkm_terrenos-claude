import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui';
import { TEMP, type Ficha as F } from './dados';

/** temperatura da negociação (uma só, a do terreno): clicar de novo no nível marcado volta a "não avaliada" */
export default function Temperatura({ f, pode }: { f: F; pode: boolean }) {
  const qc = useQueryClient(), toast = useToast();
  const [v, setV] = useState(f.temp ?? 0);
  useEffect(() => setV(f.temp ?? 0), [f.temp]);
  async function definir(n: number) {
    const antes = v;
    setV(n);
    const { error } = await supabase.rpc('definir_temperatura', { p_processo: f.negId, p_temperatura: n || null });
    if (error) { setV(antes); toast(error.message); return; }
    qc.invalidateQueries({ queryKey: ['ficha'] });
    qc.invalidateQueries({ queryKey: ['mapa'] });
  }
  return (
    <div className="temp" title="Temperatura da negociação">
      <span className="bars" role="radiogroup" aria-label="Temperatura da negociação">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} id={n === 1 ? 'temp-1' : undefined} type="button" role="radio" aria-checked={v === n} aria-label={`${n} · ${TEMP[n]}`} className={`${n <= v ? 'on' : ''} t${v}`}
            disabled={!pode} onClick={() => definir(n === v ? 0 : n)} />
        ))}
      </span>
      <span className="tl" style={{ color: v ? `var(--t${v})` : 'var(--texto-suave)' }}>{v ? `${v} · ${TEMP[v]}` : 'Não avaliada'}</span>
    </div>
  );
}

