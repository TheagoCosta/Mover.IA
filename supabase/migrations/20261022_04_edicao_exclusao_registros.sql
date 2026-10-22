-- Escritório corrige/exclui abastecimentos, jornadas, checklists e chamados de oficina (22/10).
-- (as permissões de gestão já existiam no banco; aqui: média recalculada ao editar/excluir
--  abastecimento e registro de acessos de toda correção/exclusão feita pelo escritório)

-- média do abastecimento: recalcula também ao editar km/litros/Arla/data/veículo
drop trigger if exists abastecimento_calcular on public.abastecimento;
create trigger abastecimento_calcular before insert or update of km, litros, arla_litros, data, veiculo_id
  on public.abastecimento for each row execute function public.trg_abastecimento_calcular();

-- a média do abastecimento SEGUINTE do mesmo veículo depende deste: recalcula ao editar/excluir
create or replace function public.trg_abastecimento_recalcular_proximo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.km is not distinct from old.km and new.data is not distinct from old.data
     and new.veiculo_id is not distinct from old.veiculo_id and new.arla_litros is not distinct from old.arla_litros then
    return null;
  end if;
  -- o seguinte da posição antiga
  update abastecimento set litros = litros
   where id = (select id from abastecimento where veiculo_id = old.veiculo_id and data > old.data and id <> old.id order by data limit 1);
  -- e o seguinte da posição nova (mudou data ou veículo)
  if tg_op = 'UPDATE' and (new.veiculo_id is distinct from old.veiculo_id or new.data is distinct from old.data) then
    update abastecimento set litros = litros
     where id = (select id from abastecimento where veiculo_id = new.veiculo_id and data > new.data and id <> new.id order by data limit 1);
  end if;
  return null;
end $$;
drop trigger if exists abastecimento_recalcular_proximo on public.abastecimento;
create trigger abastecimento_recalcular_proximo after update or delete on public.abastecimento
  for each row execute function public.trg_abastecimento_recalcular_proximo();

-- registro de acessos: correções e exclusões feitas pelo escritório
create or replace function public.trg_registro_operacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_desc text; v_tid uuid; v_titular uuid;
begin
  if auth.uid() is null or not eh_gestao() then return null; end if;   -- só correções do escritório
  -- recálculo automático da média (nada mudou além dela) não é correção de ninguém
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'media_calculada' - 'media_arla_calculada') = (to_jsonb(old) - 'media_calculada' - 'media_arla_calculada') then return null; end if;
  r := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_tid := (r->>'transportadora_id')::uuid;
  v_titular := nullif(r->>'motorista_id', '')::uuid;
  v_desc := case tg_table_name
    when 'abastecimento' then 'Abastecimento de ' || to_char((r->>'data')::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      || coalesce(' — ' || (select placa from veiculo where id = (r->>'veiculo_id')::uuid), '')
    when 'jornada' then 'Jornada de ' || to_char((r->>'inicio')::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    when 'checklist' then 'Checklist de ' || to_char((r->>'criado_em')::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    when 'chamado_manutencao' then 'Chamado de oficina: ' || coalesce(r->>'categoria', '') || coalesce(' — ' || (select placa from veiculo where id = (r->>'veiculo_id')::uuid), '')
    else tg_table_name end
    || coalesce(' — ' || (select nome from usuario where id = v_titular), '');
  insert into registro_acesso (transportadora_id, usuario_id, acao, alvo, alvo_id, titular_id, descricao)
  values (v_tid, auth.uid(), case tg_op when 'DELETE' then 'excluiu' else 'alterou' end, tg_table_name, (r->>'id')::uuid, v_titular, left(v_desc, 300));
  return null;
end $$;

drop trigger if exists registro_operacao on public.abastecimento;
create trigger registro_operacao after update or delete on public.abastecimento for each row execute function public.trg_registro_operacao();
drop trigger if exists registro_operacao on public.jornada;
create trigger registro_operacao after update or delete on public.jornada for each row execute function public.trg_registro_operacao();
drop trigger if exists registro_operacao on public.checklist;
create trigger registro_operacao after delete on public.checklist for each row execute function public.trg_registro_operacao();
drop trigger if exists registro_operacao on public.chamado_manutencao;
create trigger registro_operacao after update or delete on public.chamado_manutencao for each row execute function public.trg_registro_operacao();
