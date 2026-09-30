-- =====================================================================
-- MOVER.IA — Aviso diário de vencimentos no sino
-- Todo dia às 7h (Brasília) o banco confere documentos e capacitações e
-- cria notificações nos marcos: faltam 30, 15, 7, 3 e 1 dia, vence hoje,
-- e depois de vencido 1 vez por semana (1, 8, 15... dias após) por 2 meses.
-- Motorista: um aviso por item (documentos dele, dos veículos do conjunto
-- e capacitações dele). Escritório (admin/gestor): um resumo por dia.
-- =====================================================================

create extension if not exists pg_cron;

-- Registro de execução: garante no máximo uma rodada por dia
create table if not exists public.aviso_diario_execucao (
  dia date primary key,
  itens int,
  criado_em timestamptz not null default now()
);
alter table public.aviso_diario_execucao enable row level security;
-- (sem políticas: ninguém do app lê ou grava; só a função abaixo)

create or replace function public.aviso_diario_vencimentos(p_hoje date default (now() at time zone 'America/Sao_Paulo')::date)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_n int;
  v_total int := 0;
begin
  insert into aviso_diario_execucao (dia) values (p_hoje) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return 0; end if;  -- já rodou hoje

  drop table if exists _venc;
  create temp table _venc on commit drop as
  with itens as (
    select d.transportadora_id, 'documento'::text as origem, d.referente_a, d.tipo, d.validade,
      case d.referente_a when 'empresa' then 'Empresa' when 'motorista' then u.nome when 'veiculo' then v.placa end as rotulo,
      case d.referente_a
        when 'motorista' then array[d.referente_id]
        when 'veiculo' then (select array_agg(distinct c.motorista_id) from conjunto c join conjunto_item ci on ci.conjunto_id = c.id
                             where ci.veiculo_id = d.referente_id and c.ativo and c.motorista_id is not null)
        else '{}'::uuid[] end as motoristas,
      case d.referente_a when 'veiculo' then 'documentosConjunto' else 'documentosMotorista' end as destino
    from documento d
    left join usuario u on d.referente_a = 'motorista' and u.id = d.referente_id
    left join veiculo v on d.referente_a = 'veiculo' and v.id = d.referente_id
    where d.validade is not null and coalesce(u.ativo, true) and coalesce(v.ativo, true)
    union all
    select c.transportadora_id, 'capacitacao', 'motorista', c.tipo, c.validade, u.nome, array[c.motorista_id], 'capacitacoes'
    from capacitacao c join usuario u on u.id = c.motorista_id
    where c.validade is not null and u.ativo
  )
  select i.*, i.validade - p_hoje as dias,
    case when i.validade - p_hoje < 0 then 'venceu em ' || to_char(i.validade, 'DD/MM/YYYY')
         when i.validade - p_hoje = 0 then 'vence hoje'
         when i.validade - p_hoje = 1 then 'vence amanhã'
         else 'vence em ' || (i.validade - p_hoje) || ' dias' end as situacao
  from itens i
  where (i.validade - p_hoje) in (30, 15, 7, 3, 1, 0)
     or ((p_hoje - i.validade) between 1 and 60 and (p_hoje - i.validade) % 7 = 1);  -- vencido: semanal por 2 meses

  -- Motoristas: um aviso por item
  for r in select * from _venc where coalesce(array_length(motoristas, 1), 0) > 0 loop
    perform notificar(r.transportadora_id, r.motoristas, 'vencimento',
      case when r.dias < 0 then case r.origem when 'capacitacao' then 'Capacitação vencida' else 'Documento vencido' end
           else case r.origem when 'capacitacao' then 'Capacitação ' else 'Documento ' end || r.situacao end,
      r.tipo || case when r.referente_a = 'veiculo' then ' · ' || coalesce(r.rotulo, '') else '' end
        || case when r.dias < 0 then ' · venceu em ' else ' · validade ' end || to_char(r.validade, 'DD/MM/YYYY'),
      r.destino);
  end loop;

  -- Escritório: um resumo por transportadora
  for r in
    select transportadora_id, count(*) as n, bool_and(origem = 'capacitacao') as so_capacitacao,
      string_agg(tipo || ' — ' || coalesce(rotulo, '?') || ' (' || situacao || ')', '; ' order by dias) filter (where ordem <= 4) as lista
    from (select *, row_number() over (partition by transportadora_id order by dias) as ordem from _venc) x
    group by transportadora_id
  loop
    perform notificar(r.transportadora_id, ids_por_papel(r.transportadora_id, array['admin_transportadora','gestor']), 'vencimento',
      case when r.n = 1 then '1 vencimento precisa de atenção' else r.n || ' vencimentos precisam de atenção' end,
      r.lista || case when r.n > 4 then '; e mais ' || (r.n - 4) else '' end,
      case when r.so_capacitacao then 'capacitacoes' else 'documentos' end);
    v_total := v_total + r.n;
  end loop;

  update aviso_diario_execucao set itens = v_total where dia = p_hoje;
  return v_total;
end $$;

revoke execute on function public.aviso_diario_vencimentos(date) from public, anon, authenticated;

-- Agenda: todo dia às 10:00 UTC = 7:00 em Brasília
select cron.schedule('aviso-diario-vencimentos', '0 10 * * *', $$select public.aviso_diario_vencimentos()$$);
