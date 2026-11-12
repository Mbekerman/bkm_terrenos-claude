import { useEffect } from 'react';
import { useSessao } from '../lib/sessao';
import { sincronizarDrive } from '../lib/drive';
import type { Ficha } from './dados';

/* Pastas do terreno no Drive (pedido do Moises, 12/nov/2026): ao abrir a ficha (uma vez na sessão) e sempre que mudam
   cidade, zona, bairro ou rua, o serviço cria as pastas que faltam e renomeia as outras. Espera 3 s para juntar mudanças
   seguidas (a zona do GeoSampa costuma chegar logo depois do cartório). Só quem edita. */
const FEITOS = new Set<string>();
export default function DriveAuto({ f }: { f: Ficha }) {
  const { edita } = useSessao();
  const chave = [f.id, f.municipio, f.t.zona, f.t.bairro, f.t.logradouro].join('|');
  useEffect(() => {
    if (!edita || FEITOS.has(chave)) return;
    const h = setTimeout(() => { FEITOS.add(chave); void sincronizarDrive(f.id); }, 3000);
    return () => clearTimeout(h);
  }, [chave, edita, f.id]);
  return null;
}
