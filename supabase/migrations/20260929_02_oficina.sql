-- =====================================================================
-- MOVER.IA — Oficina / Manutenção (etapa 3)
--
-- • chamado_manutencao: registra quem atendeu (responsavel_id), quando
--   concluiu (concluido_em) e quem abriu (aberto_por). motorista_id deixa
--   de ser obrigatório, pra o escritório poder abrir chamado de um veículo
--   sem motorista (ex: oficina terceirizada, relato por telefone).
-- • Bucket privado "oficina" para as fotos (do problema e do reparo).
--   Motorista vê só as fotos dos chamados dele; mecânico e gestão veem
--   todas da transportadora. Caminho: <transportadora_id>/<chamado>/<arquivo>
-- =====================================================================

alter table public.chamado_manutencao
  add column if not exists responsavel_id uuid references public.usuario(id),
  add column if not exists aberto_por uuid references public.usuario(id),
  add column if not exists concluido_em timestamptz;
alter table public.chamado_manutencao alter column motorista_id drop not null;

-- Motorista só pode abrir chamado em nome dele mesmo (ou gestão/mecânico em nome de qualquer um)
drop policy if exists chamado_abrir on public.chamado_manutencao;
create policy chamado_abrir on public.chamado_manutencao for insert
  with check (transportadora_id = minha_transportadora()
              and (eh_gestao() or meu_papel() = 'mecanico'
                   or (meu_papel() = 'motorista' and motorista_id = auth.uid())));

-- Motorista pode anexar a foto do problema no chamado que ele acabou de abrir
-- (só enquanto ainda está "aberto" e só no que é dele)
create policy chamado_motorista_foto on public.chamado_manutencao for update
  using (transportadora_id = minha_transportadora() and meu_papel() = 'motorista'
         and motorista_id = auth.uid() and status = 'aberto')
  with check (transportadora_id = minha_transportadora() and meu_papel() = 'motorista'
              and motorista_id = auth.uid() and status = 'aberto');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oficina', 'oficina', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy oficina_enviar on storage.objects for insert
  with check (bucket_id = 'oficina' and (storage.foldername(name))[1] = minha_transportadora()::text);
create policy oficina_ver on storage.objects for select
  using (bucket_id = 'oficina'
         and (storage.foldername(name))[1] = minha_transportadora()::text
         and (eh_gestao() or meu_papel() = 'mecanico'
              or exists (select 1 from public.chamado_manutencao c
                         where c.foto_url = objects.name or c.foto_reparo_url = objects.name)));
create policy oficina_apagar on storage.objects for delete
  using (bucket_id = 'oficina' and (storage.foldername(name))[1] = minha_transportadora()::text and eh_gestao());
