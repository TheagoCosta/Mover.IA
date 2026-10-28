-- Registro sem sinal (decisão do Thiago, 28/10/2026).
-- O app do motorista guarda no celular o que foi feito sem internet (jornada,
-- checklist, abastecimento em posto) e envia quando o sinal volta, mandando a
-- hora em que aconteceu (hora_celular). O banco só aceita essa hora se for das
-- últimas 12 horas e nunca no futuro; fora disso vale a hora do servidor, como
-- antes. Quando a hora usada é mais de 2 minutos antes da chegada, recebido_em
-- guarda quando chegou — o escritório vê "registrado sem sinal".
-- Sem hora_celular (com sinal) tudo continua pela hora do servidor.

alter table public.jornada        add column if not exists hora_celular timestamptz, add column if not exists recebido_em timestamptz;
alter table public.jornada_evento add column if not exists hora_celular timestamptz, add column if not exists recebido_em timestamptz;
alter table public.checklist      add column if not exists hora_celular timestamptz, add column if not exists recebido_em timestamptz;
alter table public.abastecimento  add column if not exists hora_celular timestamptz, add column if not exists recebido_em timestamptz;

create or replace function public.hora_do_registro(p_hora timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select case when p_hora is not null and p_hora >= now() - interval '12 hours' and p_hora <= now() + interval '2 minutes'
              then least(p_hora, now()) else now() end
$$;
-- quando chegou, se a hora usada foi do celular (mais de 2 min antes)
create or replace function public.recebido_sem_sinal(p_hora_usada timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select case when p_hora_usada < now() - interval '2 minutes' then now() end
$$;

create or replace function public.trg_jornada_regras_motorista()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ultimo timestamptz;
begin
  if pode_tudo() then return new; end if;
  if tg_op = 'INSERT' then
    new.inicio := hora_do_registro(new.hora_celular); new.recebido_em := recebido_sem_sinal(new.inicio);
    new.status := 'ativa'; new.fim := null;
    new.assinatura_base64 := null; new.assinado_em := null;
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'fim' - 'assinatura_base64' - 'assinado_em' - 'hora_celular' - 'recebido_em')
     is distinct from (to_jsonb(old) - 'status' - 'fim' - 'assinatura_base64' - 'assinado_em' - 'hora_celular' - 'recebido_em') then
    raise exception 'Você só pode registrar paradas e encerrar a jornada.' using errcode = '42501';
  end if;
  if new.status not in ('ativa', 'pausada', 'encerrada') then
    raise exception 'Situação de jornada inválida.' using errcode = '42501';
  end if;
  if new.status = 'encerrada' then
    if old.status = 'encerrada' then   -- reenvio do mesmo encerramento (sinal caiu na resposta): mantém o que já estava
      new.fim := old.fim; new.assinatura_base64 := old.assinatura_base64; new.assinado_em := old.assinado_em; new.recebido_em := old.recebido_em;
      return new;
    end if;
    select max(criado_em) into v_ultimo from jornada_evento where jornada_id = new.id;
    new.fim := greatest(hora_do_registro(new.hora_celular), coalesce(v_ultimo, old.inicio));
    new.recebido_em := recebido_sem_sinal(new.fim);
    new.assinado_em := case when new.assinatura_base64 is null then null else new.fim end;
  else
    new.fim := null; new.assinatura_base64 := null; new.assinado_em := null; new.recebido_em := old.recebido_em;
  end if;
  return new;
end $$;

create or replace function public.trg_jornada_evento_regras_motorista()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text; v_fim timestamptz; v_inicio timestamptz; v_ultimo timestamptz;
begin
  if pode_tudo() then return new; end if;
  if new.tipo not in ('inicio', 'pausa', 'retomada', 'fim') then
    raise exception 'Tipo de evento inválido.' using errcode = '42501';
  end if;
  select status, fim, inicio into v_status, v_fim, v_inicio from jornada where id = new.jornada_id;
  select max(criado_em) into v_ultimo from jornada_evento where jornada_id = new.jornada_id;
  -- nunca antes do início nem do último evento (relógio do celular adiantado/atrasado)
  new.criado_em := greatest(hora_do_registro(new.hora_celular), coalesce(v_ultimo, v_inicio, now()));
  if new.tipo = 'inicio' and v_inicio is not null then new.criado_em := v_inicio; end if;
  if new.tipo = 'fim' and v_fim is not null then new.criado_em := v_fim; end if;
  new.recebido_em := recebido_sem_sinal(new.criado_em);
  -- jornada encerrada só aceita o evento "fim" (uma vez); com sinal, até 10 min depois; guardado sem sinal, quando chegar
  if v_status = 'encerrada' and (new.tipo <> 'fim'
      or (v_fim < now() - interval '10 minutes' and new.hora_celular is null)
      or exists (select 1 from jornada_evento e where e.jornada_id = new.jornada_id and e.tipo = 'fim')) then
    raise exception 'Esta jornada já foi encerrada.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.trg_checklist_regras_motorista()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pode_tudo() then return new; end if;
  new.criado_em := hora_do_registro(new.hora_celular);
  new.recebido_em := recebido_sem_sinal(new.criado_em);
  new.assinado_em := case when new.assinatura_base64 is null then null else new.criado_em end;
  return new;
end $$;

create or replace function public.trg_abastecimento_calcular()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_km_ant numeric; v_km_arla numeric;
begin
  if not pode_tudo() then
    if tg_op = 'INSERT' then
      new.data := hora_do_registro(new.hora_celular);
      new.recebido_em := recebido_sem_sinal(new.data);
    else   -- recálculo em cadeia disparado por um lançamento do motorista: a data não muda
      new.data := old.data; new.recebido_em := old.recebido_em;
    end if;
  end if;
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

-- Abastecimento que chegou depois (sem sinal) pode ter outro lançamento do mesmo
-- veículo com data posterior: recalcula a média desse seguinte.
create or replace function public.trg_abastecimento_recalcular_apos_sem_sinal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.recebido_em is null then return null; end if;
  update abastecimento set litros = litros
   where id = (select id from abastecimento where veiculo_id = new.veiculo_id and data > new.data and id <> new.id order by data limit 1);
  return null;
end $$;
drop trigger if exists abastecimento_recalcular_apos_sem_sinal on public.abastecimento;
create trigger abastecimento_recalcular_apos_sem_sinal after insert on public.abastecimento
  for each row execute function trg_abastecimento_recalcular_apos_sem_sinal();
