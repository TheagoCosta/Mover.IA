-- =====================================================================
-- MOVER.IA — Tela Início do motorista numa consulta só
-- Antes: ~12 consultas em 5 rodadas (sessão → usuário → conjunto →
-- checklist/jornada → resto). No iPhone cada ida ao servidor demora ~0,5 s,
-- e a tela levava ~3 s. Agora vem tudo de uma vez.
-- SECURITY INVOKER: roda com as permissões de quem chama — as regras de
-- acesso (RLS) de cada tabela continuam valendo normalmente.
-- =====================================================================
create or replace function public.inicio_motorista()
returns jsonb language sql stable security invoker set search_path = public as $$
  with conj as (
    select c.id,
      coalesce((select jsonb_agg(jsonb_build_object('ordem', ci.ordem, 'veiculo_id', ci.veiculo_id,
                                                    'veiculo', jsonb_build_object('placa', v.placa, 'tipo', v.tipo)) order by ci.ordem)
                from conjunto_item ci join veiculo v on v.id = ci.veiculo_id where ci.conjunto_id = c.id), '[]'::jsonb) as itens
    from conjunto c where c.motorista_id = auth.uid() and c.ativo
    order by c.criado_em desc limit 1
  ),
  veics as (select (jsonb_array_elements(itens) ->> 'veiculo_id')::uuid as id from conj),
  jorn as (
    select j.id, j.inicio, j.status from jornada j
    where j.motorista_id = auth.uid() and j.status <> 'encerrada'
    order by j.inicio desc limit 1
  )
  select jsonb_build_object(
    'conjunto', (select jsonb_build_object('id', id, 'conjunto_item', itens) from conj),
    'ultimo_checklist', (select jsonb_build_object('id', k.id, 'criado_em', k.criado_em) from checklist k
                         where k.motorista_id = auth.uid() order by k.criado_em desc limit 1),
    'jornada', (select jsonb_build_object('id', j.id, 'inicio', j.inicio, 'status', j.status,
                  'jornada_evento', coalesce((select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'motivo', e.motivo, 'observacao', e.observacao, 'criado_em', e.criado_em))
                                              from jornada_evento e where e.jornada_id = j.id), '[]'::jsonb))
                from jorn j),
    'viagem', (select to_jsonb(x) from (select id, origem, destino, cte_numero, mdfe_numero, status, criado_em from viagem
                where motorista_id = auth.uid() and status = 'em_andamento' order by criado_em desc limit 1) x),
    'docs_motorista', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'status', d.status, 'validade', d.validade))
                                from documento d where d.referente_a = 'motorista' and d.referente_id = auth.uid()), '[]'::jsonb),
    'docs_veiculo', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'status', d.status, 'validade', d.validade, 'referente_id', d.referente_id))
                              from documento d where d.referente_a = 'veiculo' and d.referente_id in (select id from veics)), '[]'::jsonb),
    'capacitacoes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'validade', c.validade))
                              from capacitacao c where c.motorista_id = auth.uid() and c.validade is not null), '[]'::jsonb),
    'media', (select a.media_calculada from abastecimento a where a.motorista_id = auth.uid() and a.media_calculada is not null order by a.data desc limit 1),
    'chamados_abertos', (select count(*) from chamado_manutencao ch where ch.motorista_id = auth.uid() and ch.status <> 'concluido'),
    'nao_lidas', (select count(*) from notificacao n where n.usuario_id = auth.uid() and n.lida_em is null),
    'agendamentos', coalesce((select jsonb_agg(to_jsonb(ag) order by ag.data_prevista, ag.hora nulls first) from (
        select a.id, a.tipo, a.data_prevista, a.data_fim, a.hora, a.local, a.status, a.observacao, a.ciente_em, a.concluido_em, a.motorista_id, a.veiculo_id,
               case when m.id is null then null else jsonb_build_object('nome', m.nome) end as motorista,
               case when v.id is null then null else jsonb_build_object('placa', v.placa) end as veiculo
        from agendamento a left join usuario m on m.id = a.motorista_id left join veiculo v on v.id = a.veiculo_id
        where a.status = 'pendente' and (a.motorista_id = auth.uid() or a.veiculo_id in (select id from veics))) ag), '[]'::jsonb)
  );
$$;

revoke execute on function public.inicio_motorista() from public, anon;
grant execute on function public.inicio_motorista() to authenticated;
