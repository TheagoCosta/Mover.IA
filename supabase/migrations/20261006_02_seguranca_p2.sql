-- =====================================================================
-- MOVER.IA — Correções de segurança P2 (auditoria de 06/10/2026)
--   M1: limite de tentativas na senha do escritório (abastecimento interno)
--   M2: abastecimento só em veículo do conjunto do motorista; médias de
--       consumo e data calculadas pelo banco (o que vem do app é ignorado)
-- =====================================================================

-- ---------- M1: tentativas de confirmação com a senha do escritório ----------
create table if not exists public.tentativa_confirmacao (
  id bigint generated always as identity primary key,
  motorista_id uuid not null,
  confirmador_id uuid not null,
  sucesso boolean not null,
  criado_em timestamptz not null default now()
);
create index if not exists tentativa_confirmacao_idx on public.tentativa_confirmacao (criado_em desc);
alter table public.tentativa_confirmacao enable row level security;
revoke all on public.tentativa_confirmacao from anon, authenticated;
-- (sem políticas: só a função de servidor, com a chave de serviço, lê e grava)

-- Liberado se, nos últimos 15 minutos, o motorista errou menos de 5 vezes e
-- a senha daquela pessoa do escritório foi errada menos de 10 vezes (somando todos)
create or replace function public.confirmacao_liberada(p_motorista uuid, p_confirmador uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from tentativa_confirmacao
          where motorista_id = p_motorista and not sucesso and criado_em > now() - interval '15 minutes') < 5
     and (select count(*) from tentativa_confirmacao
          where confirmador_id = p_confirmador and not sucesso and criado_em > now() - interval '15 minutes') < 10;
$$;
revoke execute on function public.confirmacao_liberada(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirmacao_liberada(uuid, uuid) to service_role;

-- ---------- M2: abastecimento do motorista só em veículo do conjunto dele ----------
drop policy if exists abastecimento_registrar on public.abastecimento;
create policy abastecimento_registrar on public.abastecimento for insert
  with check (transportadora_id = minha_transportadora()
              and (eh_gestao()
                   or (motorista_id = auth.uid() and tipo = 'externo'
                       and confirmado_por is null and confirmado_em is null
                       and veiculo_id in (select meus_veiculos()))));

-- Médias de consumo calculadas pelo banco, para qualquer lançamento:
--   diesel: km rodados desde o abastecimento anterior do veículo ÷ litros
--   Arla:   km desde o último abastecimento COM Arla ÷ litros de Arla
-- Para o motorista, a data também é a do servidor.
create or replace function public.trg_abastecimento_calcular() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_km_ant numeric; v_km_arla numeric;
begin
  if not pode_tudo() then new.data := now(); end if;
  select km into v_km_ant from abastecimento
    where veiculo_id = new.veiculo_id and data < coalesce(new.data, now()) order by data desc limit 1;
  new.media_calculada := case when v_km_ant is not null and new.km > v_km_ant and new.litros > 0
                              then (new.km - v_km_ant) / new.litros end;
  new.media_arla_calculada := null;
  if coalesce(new.arla_litros, 0) > 0 then
    select km into v_km_arla from abastecimento
      where veiculo_id = new.veiculo_id and arla_litros > 0 and data < coalesce(new.data, now()) order by data desc limit 1;
    if v_km_arla is not null and new.km > v_km_arla then new.media_arla_calculada := (new.km - v_km_arla) / new.arla_litros; end if;
  end if;
  return new;
end $$;
drop trigger if exists abastecimento_calcular on public.abastecimento;
create trigger abastecimento_calcular before insert on public.abastecimento
  for each row execute function public.trg_abastecimento_calcular();
revoke execute on function public.trg_abastecimento_calcular() from public, anon, authenticated;
