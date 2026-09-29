-- =====================================================================
-- MOVER.IA — Regras de acesso por papel (dentro da mesma transportadora)
--
-- Antes: as regras só separavam uma transportadora da outra. Dentro da
-- mesma empresa, qualquer login (inclusive motorista) conseguia ler e
-- alterar dados de todos (CPF/CNH de outros motoristas, jornadas etc.).
--
-- Agora:
--   • Gestão (admin_transportadora, gestor, admin_mover_ia): tudo da empresa.
--   • Motorista: só o que é dele (jornadas, checklists, abastecimentos,
--     viagens, perfil) + documentos dele, do conjunto que dirige e da
--     empresa. Frota e itens do checklist: só leitura.
--   • Mecânico: chamados de manutenção + leitura da frota. Sem documentos.
--
-- Também cria marcar_senha_trocada(): o motorista não tinha permissão de
-- gravar na tabela usuario, então o app nunca conseguia registrar a troca
-- da senha temporária (e pedia de novo a cada login).
-- =====================================================================

-- ---------- Funções auxiliares ----------
create or replace function public.eh_gestao()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select papel in ('admin_transportadora', 'gestor', 'admin_mover_ia') from usuario where id = auth.uid()),
    false);
$$;

-- Veículos dos conjuntos que o motorista logado dirige
create or replace function public.meus_veiculos()
returns setof uuid language sql stable security definer set search_path = public as $$
  select ci.veiculo_id
  from conjunto c join conjunto_item ci on ci.conjunto_id = c.id
  where c.motorista_id = auth.uid() and c.ativo;
$$;

-- Único jeito do usuário mexer no próprio cadastro: marcar que já trocou a
-- senha temporária (não dá pra ele trocar o próprio papel, por exemplo).
create or replace function public.marcar_senha_trocada()
returns void language sql volatile security definer set search_path = public as $$
  update usuario set senha_temporaria = false where id = auth.uid();
$$;

-- Ninguém sem login chama essas funções
revoke execute on function public.eh_gestao(), public.meus_veiculos(), public.marcar_senha_trocada(),
  public.meu_papel(), public.minha_transportadora() from public, anon;
grant execute on function public.eh_gestao(), public.meus_veiculos(), public.marcar_senha_trocada(),
  public.meu_papel(), public.minha_transportadora() to authenticated;

-- ---------- Remove as regras antigas (só por transportadora) ----------
drop policy if exists p_abastecimento on abastecimento;
drop policy if exists p_agendamento on agendamento;
drop policy if exists p_calendario_licenciamento on calendario_licenciamento;
drop policy if exists p_capacitacao on capacitacao;
drop policy if exists p_chamado_manutencao on chamado_manutencao;
drop policy if exists p_checklist on checklist;
drop policy if exists p_checklist_item_padrao on checklist_item_padrao;
drop policy if exists p_conjunto on conjunto;
drop policy if exists p_conjunto_item on conjunto_item;
drop policy if exists p_documento on documento;
drop policy if exists p_jornada on jornada;
drop policy if exists p_jornada_evento on jornada_evento;
drop policy if exists p_motorista_perfil on motorista_perfil;
drop policy if exists p_sincronizacao_log on sincronizacao_log;
drop policy if exists p_veiculo on veiculo;
drop policy if exists p_viagem on viagem;

-- ---------- Frota e cadastros de apoio: todos leem, gestão altera ----------
create policy veiculo_ler on veiculo for select using (transportadora_id = minha_transportadora());
create policy veiculo_gestao on veiculo for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

create policy conjunto_ler on conjunto for select using (transportadora_id = minha_transportadora());
create policy conjunto_gestao on conjunto for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

create policy conjunto_item_ler on conjunto_item for select
  using (conjunto_id in (select id from conjunto));
create policy conjunto_item_gestao on conjunto_item for all
  using (eh_gestao() and conjunto_id in (select id from conjunto))
  with check (eh_gestao() and conjunto_id in (select id from conjunto));

create policy checklist_item_padrao_ler on checklist_item_padrao for select using (transportadora_id = minha_transportadora());
create policy checklist_item_padrao_gestao on checklist_item_padrao for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

create policy calendario_licenciamento_ler on calendario_licenciamento for select using (transportadora_id = minha_transportadora());
create policy calendario_licenciamento_gestao on calendario_licenciamento for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

create policy sincronizacao_log_gestao on sincronizacao_log for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

-- ---------- Perfil do motorista (CPF, CNH): só ele mesmo e a gestão ----------
create policy motorista_perfil_ler on motorista_perfil for select
  using (usuario_id = auth.uid()
         or (eh_gestao() and usuario_id in (select id from usuario where transportadora_id = minha_transportadora())));
create policy motorista_perfil_gestao on motorista_perfil for all
  using (eh_gestao() and usuario_id in (select id from usuario where transportadora_id = minha_transportadora()))
  with check (eh_gestao() and usuario_id in (select id from usuario where transportadora_id = minha_transportadora()));

-- ---------- Jornada: motorista só as dele ----------
create policy jornada_ver_e_editar on jornada for all
  using (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()))
  with check (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()));

-- Eventos seguem a jornada (a subconsulta já respeita a regra acima);
-- apagar evento, só a gestão.
create policy jornada_evento_ler on jornada_evento for select using (jornada_id in (select id from jornada));
create policy jornada_evento_criar on jornada_evento for insert with check (jornada_id in (select id from jornada));
create policy jornada_evento_gestao on jornada_evento for all
  using (eh_gestao() and jornada_id in (select id from jornada))
  with check (eh_gestao() and jornada_id in (select id from jornada));

-- ---------- Checklist: motorista envia e vê os dele ----------
create policy checklist_ver_e_enviar on checklist for all
  using (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()))
  with check (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()));

-- ---------- Abastecimento: motorista registra os dele; lê os dele e os dos
-- veículos que dirige (o cálculo da média usa o abastecimento anterior do
-- mesmo veículo, que pode ter sido feito por outro motorista) ----------
create policy abastecimento_ler on abastecimento for select
  using (transportadora_id = minha_transportadora()
         and (eh_gestao() or motorista_id = auth.uid() or veiculo_id in (select meus_veiculos())));
create policy abastecimento_registrar on abastecimento for insert
  with check (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()));
create policy abastecimento_gestao on abastecimento for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

-- ---------- Viagem: escritório cria; motorista vê e finaliza a dele ----------
create policy viagem_ler_e_finalizar on viagem for select
  using (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()));
create policy viagem_motorista_atualizar on viagem for update
  using (transportadora_id = minha_transportadora() and motorista_id = auth.uid())
  with check (transportadora_id = minha_transportadora() and motorista_id = auth.uid());
create policy viagem_gestao on viagem for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

-- ---------- Documentos: motorista vê/anexa os dele, do conjunto e da empresa ----------
create policy documento_ler on documento for select
  using (transportadora_id = minha_transportadora() and meu_papel() <> 'mecanico'
         and (eh_gestao()
              or referente_a = 'empresa'
              or (referente_a = 'motorista' and referente_id = auth.uid())
              or (referente_a = 'veiculo' and referente_id in (select meus_veiculos()))));
create policy documento_motorista_anexar on documento for update
  using (transportadora_id = minha_transportadora() and meu_papel() = 'motorista'
         and ((referente_a = 'motorista' and referente_id = auth.uid())
              or (referente_a = 'veiculo' and referente_id in (select meus_veiculos()))))
  with check (transportadora_id = minha_transportadora() and meu_papel() = 'motorista'
         and ((referente_a = 'motorista' and referente_id = auth.uid())
              or (referente_a = 'veiculo' and referente_id in (select meus_veiculos()))));
create policy documento_gestao on documento for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

-- ---------- Oficina: motorista abre e acompanha os dele; mecânico e gestão tudo ----------
create policy chamado_ler on chamado_manutencao for select
  using (transportadora_id = minha_transportadora()
         and (eh_gestao() or meu_papel() = 'mecanico' or motorista_id = auth.uid()));
create policy chamado_abrir on chamado_manutencao for insert
  with check (transportadora_id = minha_transportadora()
              and (eh_gestao() or meu_papel() = 'mecanico' or motorista_id = auth.uid()));
create policy chamado_atender on chamado_manutencao for update
  using (transportadora_id = minha_transportadora() and (eh_gestao() or meu_papel() = 'mecanico'))
  with check (transportadora_id = minha_transportadora() and (eh_gestao() or meu_papel() = 'mecanico'));
create policy chamado_gestao on chamado_manutencao for delete
  using (transportadora_id = minha_transportadora() and eh_gestao());

-- ---------- Capacitações e agendamentos: motorista vê os dele; gestão altera ----------
create policy capacitacao_ler on capacitacao for select
  using (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()));
create policy capacitacao_gestao on capacitacao for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

create policy agendamento_ler on agendamento for select
  using (transportadora_id = minha_transportadora()
         and (eh_gestao() or motorista_id = auth.uid() or veiculo_id in (select meus_veiculos())));
create policy agendamento_gestao on agendamento for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

-- ---------- Arquivos (Storage): só abre o arquivo de um documento que a
-- pessoa já pode ver pela regra de documentos acima ----------
drop policy if exists documentos_select on storage.objects;
drop policy if exists documentos_update on storage.objects;
drop policy if exists documentos_delete on storage.objects;

create policy documentos_select on storage.objects for select
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = minha_transportadora()::text
         and (eh_gestao() or exists (select 1 from public.documento d where d.arquivo_url = objects.name)));
create policy documentos_update on storage.objects for update
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = minha_transportadora()::text
         and (eh_gestao() or exists (select 1 from public.documento d where d.arquivo_url = objects.name)));
create policy documentos_delete on storage.objects for delete
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = minha_transportadora()::text
         and eh_gestao());
-- (documentos_insert continua igual: qualquer login envia para a pasta da
--  própria transportadora; o vínculo com o documento é controlado acima.)
