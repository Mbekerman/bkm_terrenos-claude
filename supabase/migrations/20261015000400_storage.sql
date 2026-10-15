-- =====================================================================
-- BKM Terrenos · 0004 · armazenamento de documentos
-- Bucket privado. Caminho: {empresa_id}/{processo_id}/{tipo}/{uuid}_{arquivo}
-- A primeira pasta decide quem pode ler e enviar.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 52428800)  -- 50 MB por arquivo
on conflict (id) do nothing;

create policy "documentos: membros leem"
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1]::uuid in (select app.minhas_empresas()));

create policy "documentos: membros enviam"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1]::uuid in (select app.minhas_empresas()));

-- Sem update nem delete: versões nunca são sobrescritas.
