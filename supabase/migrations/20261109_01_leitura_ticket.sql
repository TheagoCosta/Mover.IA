-- Leitura do ticket pelo Claude (pedido do Thiago, 09/11): a função ler-ticket lê os horários da foto
-- e compara com a parada. O que não bater ou não der para ler fica para o escritório revisar.
--
-- ticket_leitura: lendo | ok | divergente | ilegivel (nulo = ainda não leu)
-- ticket_leitura_dados: horários lidos e diferenças em minutos. Nunca guarda CPF nem nome.
-- ticket_revisado_*: quem do escritório revisou e quando.

alter table public.jornada_evento
  add column if not exists ticket_leitura text,
  add column if not exists ticket_leitura_dados jsonb,
  add column if not exists ticket_lido_em timestamptz,
  add column if not exists ticket_revisado_em timestamptz,
  add column if not exists ticket_revisado_por uuid references public.usuario(id) on delete set null;

alter table public.jornada_evento drop constraint if exists jornada_evento_ticket_leitura_check;
alter table public.jornada_evento add constraint jornada_evento_ticket_leitura_check
  check (ticket_leitura is null or ticket_leitura in ('lendo', 'ok', 'divergente', 'ilegivel'));

-- Igual à versão de 20261107_01; a diferença é o motorista não poder gravar o resultado da leitura.
create or replace function public.trg_jornada_evento_regras_motorista()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare v_status text; v_fim timestamptz; v_inicio timestamptz; v_ultimo timestamptz; v_base timestamptz; v_usada timestamptz; v_por_parada boolean;
begin
  if pode_tudo() then return new; end if;
  new.ticket_leitura := null; new.ticket_leitura_dados := null; new.ticket_lido_em := null;
  new.ticket_revisado_em := null; new.ticket_revisado_por := null;
  if new.tipo not in ('inicio', 'pausa', 'retomada', 'fim') then
    raise exception 'Tipo de evento inválido.' using errcode = '42501';
  end if;
  select status, fim, inicio, fechada_por_parada into v_status, v_fim, v_inicio, v_por_parada from jornada where id = new.jornada_id;
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
      or (v_fim < now() - interval '10 minutes' and new.hora_celular is null and new.hora_informada is null and not v_por_parada)
      or exists (select 1 from jornada_evento e where e.jornada_id = new.jornada_id and e.tipo = 'fim')) then
    raise exception 'Esta jornada já foi encerrada.' using errcode = '42501';
  end if;
  return new;
end $function$;
