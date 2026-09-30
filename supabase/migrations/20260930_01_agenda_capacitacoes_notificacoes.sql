-- =====================================================================
-- MOVER.IA — Etapa 4: agenda, capacitações e notificações
-- =====================================================================

-- ---------- Agenda ----------
alter table public.agendamento
  add column if not exists hora time,
  add column if not exists local text,
  add column if not exists criado_por uuid references public.usuario(id),
  add column if not exists criado_em timestamptz not null default now(),
  add column if not exists ciente_em timestamptz,
  add column if not exists concluido_em timestamptz;
alter table public.agendamento drop constraint if exists agendamento_status_chk;
alter table public.agendamento add constraint agendamento_status_chk check (status in ('pendente', 'concluido', 'cancelado'));

-- Motorista marca "estou ciente" (só isso — não edita o agendamento)
create or replace function public.confirmar_agendamento(p_id uuid)
returns void language sql volatile security definer set search_path = public as $$
  update agendamento set ciente_em = now()
  where id = p_id and transportadora_id = minha_transportadora() and ciente_em is null
    and (motorista_id = auth.uid() or veiculo_id in (select meus_veiculos()));
$$;

-- ---------- Capacitações ----------
alter table public.capacitacao
  add column if not exists instituicao text,
  add column if not exists carga_horaria numeric,
  add column if not exists observacao text,
  add column if not exists criado_em timestamptz not null default now();

-- Certificado fica no bucket "documentos"; o motorista abre o dele
drop policy if exists documentos_select on storage.objects;
create policy documentos_select on storage.objects for select
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = minha_transportadora()::text
         and (eh_gestao()
              or exists (select 1 from public.documento d where d.arquivo_url = objects.name)
              or exists (select 1 from public.capacitacao c where c.certificado_url = objects.name)));

-- ---------- Notificações ----------
create table if not exists public.notificacao (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadora(id),
  usuario_id uuid not null references public.usuario(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensagem text,
  destino text,            -- tela do app para abrir ao tocar (ex: 'oficina')
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists notificacao_usuario_idx on public.notificacao (usuario_id, criado_em desc);
alter table public.notificacao enable row level security;
drop policy if exists notificacao_ler on public.notificacao;
create policy notificacao_ler on public.notificacao for select using (usuario_id = auth.uid());
-- (ninguém insere/edita direto: só os gatilhos abaixo e a função de marcar como lida)

create or replace function public.marcar_notificacoes_lidas()
returns void language sql volatile security definer set search_path = public as $$
  update notificacao set lida_em = now() where usuario_id = auth.uid() and lida_em is null;
$$;

-- Cria a notificação para uma lista de pessoas (nunca para quem fez a ação)
create or replace function public.notificar(p_tid uuid, p_usuarios uuid[], p_tipo text, p_titulo text, p_mensagem text, p_destino text)
returns void language sql volatile security definer set search_path = public as $$
  insert into notificacao (transportadora_id, usuario_id, tipo, titulo, mensagem, destino)
  select p_tid, u, p_tipo, p_titulo, p_mensagem, p_destino
  from (select distinct unnest(p_usuarios) as u) x
  where u is not null and u is distinct from auth.uid()
    and exists (select 1 from usuario where id = u and ativo and transportadora_id = p_tid);
$$;

create or replace function public.ids_por_papel(p_tid uuid, p_papeis text[])
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from usuario where transportadora_id = p_tid and ativo and papel::text = any(p_papeis);
$$;

-- Novo chamado de oficina → escritório e mecânicos
create or replace function public.trg_notif_chamado_novo() returns trigger language plpgsql security definer set search_path = public as $$
declare v_placa text;
begin
  select placa into v_placa from veiculo where id = new.veiculo_id;
  perform notificar(new.transportadora_id, ids_por_papel(new.transportadora_id, array['admin_transportadora','gestor','mecanico']),
    'oficina', case when new.urgencia = 'alta' then 'Chamado URGENTE na oficina' else 'Novo chamado na oficina' end,
    coalesce(v_placa, 'Sem placa') || ' · ' || new.categoria || coalesce(' — ' || left(new.descricao, 80), ''), 'oficina');
  return new;
end $$;
drop trigger if exists notif_chamado_novo on public.chamado_manutencao;
create trigger notif_chamado_novo after insert on public.chamado_manutencao for each row execute function public.trg_notif_chamado_novo();

-- Andamento do chamado → motorista que abriu
create or replace function public.trg_notif_chamado_status() returns trigger language plpgsql security definer set search_path = public as $$
declare v_placa text;
begin
  if new.status is distinct from old.status and new.motorista_id is not null then
    select placa into v_placa from veiculo where id = new.veiculo_id;
    perform notificar(new.transportadora_id, array[new.motorista_id], 'oficina',
      case new.status when 'em_andamento' then 'Seu chamado está em reparo' when 'concluido' then 'Seu chamado foi concluído' else 'Seu chamado foi atualizado' end,
      coalesce(v_placa, '') || ' · ' || new.categoria || coalesce(' — ' || left(new.observacao_reparo, 80), ''), 'oficina');
  end if;
  return new;
end $$;
drop trigger if exists notif_chamado_status on public.chamado_manutencao;
create trigger notif_chamado_status after update of status on public.chamado_manutencao for each row execute function public.trg_notif_chamado_status();

-- Nova viagem → motorista
create or replace function public.trg_notif_viagem_nova() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.motorista_id is not null then
    perform notificar(new.transportadora_id, array[new.motorista_id], 'viagem', 'Nova viagem para você',
      coalesce(new.origem, '?') || ' → ' || coalesce(new.destino, '?'), 'tab:viagem');
  end if;
  return new;
end $$;
drop trigger if exists notif_viagem_nova on public.viagem;
create trigger notif_viagem_nova after insert on public.viagem for each row execute function public.trg_notif_viagem_nova();

-- Novo agendamento → motorista (o indicado ou o do conjunto do veículo)
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
      new.tipo || ' — ' || to_char(new.data_prevista, 'DD/MM') || coalesce(' às ' || to_char(new.hora, 'HH24:MI'), '') || coalesce(' · ' || v_placa, '') || coalesce(' · ' || new.local, ''), 'agendamentos');
  end if;
  return new;
end $$;
drop trigger if exists notif_agendamento_novo on public.agendamento;
create trigger notif_agendamento_novo after insert on public.agendamento for each row execute function public.trg_notif_agendamento_novo();

-- Checklist com irregularidade → escritório
create or replace function public.trg_notif_checklist_irregular() returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int; v_nome text;
begin
  select count(*) into v_n from jsonb_array_elements(coalesce(new.respostas, '[]'::jsonb)) e where e->>'resposta' = 'bad';
  if v_n > 0 then
    select nome into v_nome from usuario where id = new.motorista_id;
    perform notificar(new.transportadora_id, ids_por_papel(new.transportadora_id, array['admin_transportadora','gestor']),
      'checklist', 'Checklist com irregularidade', coalesce(v_nome, 'Motorista') || ' · ' || v_n || ' item(ns) não atende(m)', 'checklists');
  end if;
  return new;
end $$;
drop trigger if exists notif_checklist_irregular on public.checklist;
create trigger notif_checklist_irregular after insert on public.checklist for each row execute function public.trg_notif_checklist_irregular();

-- Nova capacitação → motorista
create or replace function public.trg_notif_capacitacao_nova() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notificar(new.transportadora_id, array[new.motorista_id], 'capacitacao', 'Capacitação registrada',
    new.tipo || coalesce(' — válida até ' || to_char(new.validade, 'DD/MM/YYYY'), ''), 'capacitacoes');
  return new;
end $$;
drop trigger if exists notif_capacitacao_nova on public.capacitacao;
create trigger notif_capacitacao_nova after insert on public.capacitacao for each row execute function public.trg_notif_capacitacao_nova();

-- Permissões das funções
revoke execute on function public.notificar(uuid, uuid[], text, text, text, text), public.ids_por_papel(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.confirmar_agendamento(uuid), public.marcar_notificacoes_lidas() from public, anon;
grant execute on function public.confirmar_agendamento(uuid), public.marcar_notificacoes_lidas() to authenticated;

-- Funções de gatilho não ficam disponíveis para chamada direta (os gatilhos continuam disparando)
revoke execute on function public.trg_notif_chamado_novo(), public.trg_notif_chamado_status(), public.trg_notif_viagem_nova(),
  public.trg_notif_agendamento_novo(), public.trg_notif_checklist_irregular(), public.trg_notif_capacitacao_nova()
  from public, anon, authenticated;
