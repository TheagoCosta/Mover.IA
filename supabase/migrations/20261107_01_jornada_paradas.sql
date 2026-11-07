-- Jornada só por paradas (pedido do Thiago, 07/11): o motorista informa o início e o fim de cada
-- parada; fora delas ele está dirigindo. O dia fecha sozinho na parada "Repouso / pernoite" e abre
-- quando o repouso termina, então jornada.inicio e jornada.fim continuam existindo.
--
-- hora_informada: horário que o motorista corrigiu. Vale como horário do registro (criado_em, ou
--   inicio/fim da jornada), e registrado_em guarda quando ele realmente registrou.
-- categoria: trabalho (carga, descarga, fila, pátio: conta como jornada) ou descanso.
-- ticket_*: foto do ticket, guardada no evento de fim da parada. Sem o ticket a parada fica pendente
--   até ele enviar a foto ou dizer por que não tem (ticket_dispensa).

alter table public.jornada add column if not exists hora_informada timestamptz;

alter table public.jornada_evento
  add column if not exists hora_informada timestamptz,
  add column if not exists registrado_em timestamptz,
  add column if not exists categoria text,
  add column if not exists ticket_exigido boolean not null default false,
  add column if not exists ticket_url text,
  add column if not exists ticket_dispensa text;

alter table public.jornada_evento drop constraint if exists jornada_evento_categoria_check;
alter table public.jornada_evento add constraint jornada_evento_categoria_check
  check (categoria is null or categoria in ('trabalho', 'descanso'));

-- O horário informado não pode ser no futuro nem mais de 24 h antes do registro
create or replace function public.conferir_hora_informada(p_informada timestamptz, p_base timestamptz)
 returns void
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
begin
  if p_informada > p_base + interval '2 minutes' or p_informada < p_base - interval '24 hours' then
    raise exception 'O horário precisa estar nas últimas 24 horas.' using errcode = '42501';
  end if;
end $function$;

create or replace function public.trg_jornada_regras_motorista()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare v_ultimo timestamptz; v_base timestamptz; v_informada timestamptz;
begin
  if pode_tudo() then return new; end if;
  v_base := hora_do_registro(new.hora_celular);
  if tg_op = 'INSERT' then
    new.inicio := v_base;
    if new.hora_informada is not null then
      perform conferir_hora_informada(new.hora_informada, v_base);
      new.inicio := least(v_base, new.hora_informada);
    end if;
    new.recebido_em := recebido_sem_sinal(least(v_base, coalesce(new.hora_celular, v_base)));
    new.status := 'ativa'; new.fim := null;
    new.assinatura_base64 := null; new.assinado_em := null;
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'fim' - 'assinatura_base64' - 'assinado_em' - 'hora_celular' - 'recebido_em' - 'hora_informada')
     is distinct from (to_jsonb(old) - 'status' - 'fim' - 'assinatura_base64' - 'assinado_em' - 'hora_celular' - 'recebido_em' - 'hora_informada') then
    raise exception 'Você só pode registrar paradas.' using errcode = '42501';
  end if;
  if new.status not in ('ativa', 'pausada', 'encerrada') then
    raise exception 'Situação de jornada inválida.' using errcode = '42501';
  end if;
  if new.status = 'encerrada' then
    if old.status = 'encerrada' then
      new.fim := old.fim; new.assinatura_base64 := old.assinatura_base64; new.assinado_em := old.assinado_em;
      new.recebido_em := old.recebido_em; new.hora_informada := old.hora_informada;
      return new;
    end if;
    -- a hora informada no início da jornada não vale para o fim
    v_informada := case when new.hora_informada is distinct from old.hora_informada then new.hora_informada end;
    if v_informada is not null then perform conferir_hora_informada(v_informada, v_base); end if;
    select max(criado_em) into v_ultimo from jornada_evento where jornada_id = new.id;
    new.fim := greatest(least(v_base, coalesce(v_informada, v_base)), coalesce(v_ultimo, old.inicio));
    new.recebido_em := recebido_sem_sinal(least(v_base, coalesce(new.hora_celular, v_base)));
    new.assinado_em := case when new.assinatura_base64 is null then null else v_base end;
  else
    new.fim := null; new.assinatura_base64 := null; new.assinado_em := null;
    new.recebido_em := old.recebido_em; new.hora_informada := old.hora_informada;
  end if;
  return new;
end $function$;

create or replace function public.trg_jornada_evento_regras_motorista()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare v_status text; v_fim timestamptz; v_inicio timestamptz; v_ultimo timestamptz; v_base timestamptz; v_usada timestamptz;
begin
  if pode_tudo() then return new; end if;
  if new.tipo not in ('inicio', 'pausa', 'retomada', 'fim') then
    raise exception 'Tipo de evento inválido.' using errcode = '42501';
  end if;
  select status, fim, inicio into v_status, v_fim, v_inicio from jornada where id = new.jornada_id;
  select max(criado_em) into v_ultimo from jornada_evento where jornada_id = new.jornada_id;
  v_base := hora_do_registro(new.hora_celular);
  v_usada := v_base;
  if new.hora_informada is not null then
    perform conferir_hora_informada(new.hora_informada, v_base);
    if new.tipo in ('pausa', 'retomada') and new.hora_informada < coalesce(v_ultimo, v_inicio) then
      raise exception 'O horário não pode ser antes do último registro da jornada.' using errcode = '42501';
    end if;
    v_usada := least(v_base, new.hora_informada);
  end if;
  new.registrado_em := v_base;
  new.criado_em := greatest(v_usada, coalesce(v_ultimo, v_inicio, now()));
  if new.tipo = 'inicio' and v_inicio is not null then new.criado_em := v_inicio; end if;
  if new.tipo = 'fim' and v_fim is not null then new.criado_em := v_fim; end if;
  new.recebido_em := recebido_sem_sinal(least(v_base, coalesce(new.hora_celular, v_base)));
  if new.ticket_url is not null and new.ticket_url not like minha_transportadora()::text || '/jornada/' || auth.uid()::text || '/%' then
    raise exception 'Arquivo de ticket inválido.' using errcode = '42501';
  end if;
  if v_status = 'encerrada' and (new.tipo <> 'fim'
      or (v_fim < now() - interval '10 minutes' and new.hora_celular is null and new.hora_informada is null)
      or exists (select 1 from jornada_evento e where e.jornada_id = new.jornada_id and e.tipo = 'fim')) then
    raise exception 'Esta jornada já foi encerrada.' using errcode = '42501';
  end if;
  return new;
end $function$;

-- Foto do ticket: o motorista envia só para a pasta dele
drop policy if exists documentos_motorista_jornada on storage.objects;
create policy documentos_motorista_jornada on storage.objects for insert to authenticated with check (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = minha_transportadora()::text
  and meu_papel() = 'motorista'
  and (storage.foldername(name))[2] = 'jornada'
  and (storage.foldername(name))[3] = auth.uid()::text
  and storage.filename(name) like 'Ticket_%'
);

-- Ticket pendente: o motorista envia a foto depois, ou informa por que não tem
create or replace function public.anexar_ticket_parada(p_evento uuid, p_caminho text default null, p_dispensa text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_ok boolean;
begin
  p_caminho := nullif(btrim(p_caminho), ''); p_dispensa := nullif(btrim(p_dispensa), '');
  if (p_caminho is null) = (p_dispensa is null) then
    raise exception 'Envie a foto do ticket ou diga por que não tem.' using errcode = '22023';
  end if;
  if p_caminho is not null and p_caminho not like minha_transportadora()::text || '/jornada/' || auth.uid()::text || '/%' then
    raise exception 'Arquivo de ticket inválido.' using errcode = '42501';
  end if;
  select true into v_ok from jornada_evento e join jornada j on j.id = e.jornada_id
   where e.id = p_evento and j.motorista_id = auth.uid() and e.ticket_exigido
     and e.ticket_url is null and e.ticket_dispensa is null;
  if v_ok is null then raise exception 'Esta parada não tem ticket pendente.' using errcode = '42501'; end if;
  update jornada_evento set ticket_url = p_caminho, ticket_dispensa = left(p_dispensa, 300) where id = p_evento;
end $function$;

revoke all on function public.anexar_ticket_parada(uuid, text, text) from public, anon;
grant execute on function public.anexar_ticket_parada(uuid, text, text) to authenticated;
revoke all on function public.conferir_hora_informada(timestamptz, timestamptz) from public, anon;
grant execute on function public.conferir_hora_informada(timestamptz, timestamptz) to authenticated;
