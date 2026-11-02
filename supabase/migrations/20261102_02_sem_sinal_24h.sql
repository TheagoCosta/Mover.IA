-- Registro sem sinal: vale a hora do celular até 24 h antes (antes eram 12 h).
-- Fora disso vale a hora em que chegou, mas o registro passa a ficar marcado
-- "sem sinal" também nesse caso (antes ficava sem marca e com a hora de chegada),
-- e o escritório vê a hora que o celular marcou (hora_celular).

create or replace function public.hora_do_registro(p_hora timestamp with time zone)
 returns timestamp with time zone
 language sql
 stable
 set search_path to 'public'
as $function$
  select case when p_hora is not null and p_hora >= now() - interval '24 hours' and p_hora <= now() + interval '2 minutes'
              then least(p_hora, now()) else now() end
$function$;

-- Marca "sem sinal" olhando também a hora do celular (troca só esse trecho nos gatilhos)
do $$
declare d text; trocas text[][] := array[
  ['trg_abastecimento_calcular', 'recebido_sem_sinal(new.data)', 'recebido_sem_sinal(least(new.data, coalesce(new.hora_celular, new.data)))'],
  ['trg_checklist_regras_motorista', 'recebido_sem_sinal(new.criado_em)', 'recebido_sem_sinal(least(new.criado_em, coalesce(new.hora_celular, new.criado_em)))'],
  ['trg_jornada_evento_regras_motorista', 'recebido_sem_sinal(new.criado_em)', 'recebido_sem_sinal(least(new.criado_em, coalesce(new.hora_celular, new.criado_em)))'],
  ['trg_jornada_regras_motorista', 'recebido_sem_sinal(new.inicio)', 'recebido_sem_sinal(least(new.inicio, coalesce(new.hora_celular, new.inicio)))'],
  ['trg_jornada_regras_motorista', 'recebido_sem_sinal(new.fim)', 'recebido_sem_sinal(least(new.fim, coalesce(new.hora_celular, new.fim)))']];
  i int;
begin
  for i in 1..array_length(trocas, 1) loop
    d := pg_get_functiondef(('public.' || trocas[i][1])::regproc);
    if position(trocas[i][3] in d) > 0 then continue; end if;   -- já aplicado
    if position(trocas[i][2] in d) = 0 then raise exception 'Trecho não encontrado em %: %', trocas[i][1], trocas[i][2]; end if;
    execute replace(d, trocas[i][2], trocas[i][3]);
  end loop;
end $$;
