-- =====================================================================
-- MOVER.IA — Agenda com período (vários dias), agenda do mecânico e
-- várias fotos/vídeos por chamado da oficina
-- =====================================================================

-- ---------- Agenda: compromisso de vários dias (ex: folga sexta → segunda) ----------
alter table public.agendamento add column if not exists data_fim date;
alter table public.agendamento drop constraint if exists agendamento_periodo_chk;
alter table public.agendamento add constraint agendamento_periodo_chk check (data_fim is null or data_fim >= data_prevista);

-- Mecânico vê os agendamentos de VEÍCULOS (revisão, troca de óleo...) —
-- exames, folgas e outros compromissos pessoais dos motoristas continuam fora (LGPD)
drop policy if exists agendamento_ler on public.agendamento;
create policy agendamento_ler on public.agendamento for select
  using (transportadora_id = minha_transportadora()
         and (eh_gestao() or motorista_id = auth.uid() or veiculo_id in (select meus_veiculos())
              or (meu_papel() = 'mecanico' and veiculo_id is not null and motorista_id is null)));

-- Aviso de agendamento novo mostra o período
create or replace function public.trg_notif_agendamento_novo() returns trigger language plpgsql security definer set search_path = public as $$
declare v_mot uuid := new.motorista_id; v_placa text;
begin
  if v_mot is null and new.veiculo_id is not null then
    select c.motorista_id into v_mot from conjunto c join conjunto_item ci on ci.conjunto_id = c.id
      where ci.veiculo_id = new.veiculo_id and c.ativo limit 1;
  end if;
  select placa into v_placa from veiculo where id = new.veiculo_id;
  if v_mot is not null then
    perform notificar(new.transportadora_id, array[v_mot], 'agenda', 'Novo agendamento',
      new.tipo || ' — ' || to_char(new.data_prevista, 'DD/MM')
        || case when new.data_fim is not null and new.data_fim > new.data_prevista then ' a ' || to_char(new.data_fim, 'DD/MM') else '' end
        || coalesce(' às ' || to_char(new.hora, 'HH24:MI'), '') || coalesce(' · ' || v_placa, '') || coalesce(' · ' || new.local, ''), 'agendamentos');
  end if;
  return new;
end $$;
revoke execute on function public.trg_notif_agendamento_novo() from public, anon, authenticated;

-- ---------- Oficina: várias fotos e vídeos por chamado ----------
create table if not exists public.chamado_midia (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadora(id),
  chamado_id uuid not null references public.chamado_manutencao(id) on delete cascade,
  momento text not null check (momento in ('problema', 'reparo')),
  tipo text not null check (tipo in ('foto', 'video')),
  caminho text not null,
  enviado_por uuid references public.usuario(id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists chamado_midia_chamado_idx on public.chamado_midia (chamado_id);
alter table public.chamado_midia enable row level security;

-- vê as mídias de quem vê o chamado (a regra do chamado vale dentro do exists)
drop policy if exists chamado_midia_ler on public.chamado_midia;
create policy chamado_midia_ler on public.chamado_midia for select
  using (transportadora_id = minha_transportadora()
         and exists (select 1 from public.chamado_manutencao c where c.id = chamado_id));

-- envia: escritório e mecânico em qualquer chamado; motorista só no chamado
-- dele, ainda aberto, e só como foto/vídeo do problema
drop policy if exists chamado_midia_enviar on public.chamado_midia;
create policy chamado_midia_enviar on public.chamado_midia for insert
  with check (transportadora_id = minha_transportadora() and enviado_por = auth.uid()
              and exists (select 1 from public.chamado_manutencao c where c.id = chamado_id and c.transportadora_id = minha_transportadora()
                          and (eh_gestao() or meu_papel() = 'mecanico'
                               or (meu_papel() = 'motorista' and c.motorista_id = auth.uid() and c.status = 'aberto' and momento = 'problema'))));

drop policy if exists chamado_midia_apagar on public.chamado_midia;
create policy chamado_midia_apagar on public.chamado_midia for delete
  using (transportadora_id = minha_transportadora() and eh_gestao());

-- Bucket "oficina": aceita vídeo e até 50 MB por arquivo (limite do plano grátis)
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif',
                                  'video/mp4','video/quicktime','video/webm','video/3gpp','video/x-m4v']
 where id = 'oficina';

-- quem vê o chamado vê também os arquivos das mídias dele
drop policy if exists oficina_ver on storage.objects;
create policy oficina_ver on storage.objects for select
  using (bucket_id = 'oficina'
         and (storage.foldername(name))[1] = minha_transportadora()::text
         and (eh_gestao() or meu_papel() = 'mecanico'
              or exists (select 1 from public.chamado_manutencao c where c.foto_url = objects.name or c.foto_reparo_url = objects.name)
              or exists (select 1 from public.chamado_midia m where m.caminho = objects.name)));
