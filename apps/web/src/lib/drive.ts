// Pastas do terreno no Google Drive (pedido do Moises, 12/nov/2026): o serviço services/drive, por /drive no mesmo
// endereço (o Caddy repassa), cria uma pasta do terreno em cada pasta-modelo do Drive compartilhado e renomeia quando o
// nome muda (cidade, zona, bairro ou rua). Nunca falha para quem chama: sem o serviço no ambiente, só registra no console.
import { supabase } from './supabase';

const andando = new Map<string, Promise<void>>();

export function sincronizarDrive(terrenoId: string): Promise<void> {
  const ja = andando.get(terrenoId);
  if (ja) return ja;
  const p = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const r = await fetch('/drive/sincronizar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ terreno_id: terrenoId }), signal: AbortSignal.timeout(90_000) });
      if (!r.ok) console.warn('Drive', r.status, (await r.json().catch(() => null))?.error ?? '');
    } catch (e) { console.warn('Drive', e); }
    finally { andando.delete(terrenoId); }
  })();
  andando.set(terrenoId, p);
  return p;
}

/** depois do cadastro: espera a zona chegar do GeoSampa ou do GeoSanja (até 15 s) e cria as pastas */
export function pastasDoCadastro(terrenoId: string, zona: Promise<unknown> | null) {
  const limite = new Promise((ok) => setTimeout(ok, 15_000));
  void Promise.race([(zona ?? Promise.resolve()).catch(() => null), limite]).then(() => sincronizarDrive(terrenoId));
}
