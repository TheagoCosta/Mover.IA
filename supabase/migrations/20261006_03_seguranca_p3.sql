-- =====================================================================
-- MOVER.IA — Correções de segurança P3 (auditoria de 06/10/2026)
--   B2: motorista só conclui a viagem; motorista não altera chamado depois
--       de aberto; mecânico só mexe no andamento do reparo
--   B4: motorista deixa de ver dados (e-mail/telefone) dos outros motoristas
--   B5: registrar_push não "sequestra" aparelho de outra transportadora
--   (B3 — conferir "ativo" — está na Edge Function criar-motorista-automatico)
-- =====================================================================

-- ---------- B2: viagem — motorista só muda a situação para concluída ----------
create or replace function public.trg_viagem_regras_motorista() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pode_tudo() then return new; end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') or new.status <> 'concluida' then
    raise exception 'Você só pode finalizar a viagem; os dados dela são alterados pelo escritório.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists viagem_regras_motorista on public.viagem;
create trigger viagem_regras_motorista before update on public.viagem
  for each row execute function public.trg_viagem_regras_motorista();

-- ---------- B2: chamado de oficina ----------
-- o motorista não atualiza mais o chamado (fotos e vídeos ficam em chamado_midia)
drop policy if exists chamado_motorista_foto on public.chamado_manutencao;

-- mecânico: só o andamento do reparo (situação, observação, foto do reparo,
-- responsável = ele mesmo, datas); o resto é do escritório
create or replace function public.trg_chamado_regras_mecanico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pode_tudo() then return new; end if;
  if (to_jsonb(new) - 'status' - 'observacao_reparo' - 'foto_reparo_url' - 'responsavel_id' - 'atualizado_em' - 'concluido_em')
     is distinct from (to_jsonb(old) - 'status' - 'observacao_reparo' - 'foto_reparo_url' - 'responsavel_id' - 'atualizado_em' - 'concluido_em') then
    raise exception 'O mecânico só atualiza o andamento do reparo.' using errcode = '42501';
  end if;
  if new.responsavel_id is distinct from old.responsavel_id and new.responsavel_id is distinct from auth.uid() then
    raise exception 'O responsável pelo reparo só pode ser você.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists chamado_regras_mecanico on public.chamado_manutencao;
create trigger chamado_regras_mecanico before update on public.chamado_manutencao
  for each row execute function public.trg_chamado_regras_mecanico();

-- ---------- B4: quem vê o cadastro de quem ----------
--   gestão: todos da transportadora · todos: o próprio cadastro
--   mecânico: todos da transportadora (nomes no chamado e na frota)
--   motorista: escritório e mecânicos (quem confirma abastecimento, quem fez o reparo) — não os outros motoristas
drop policy if exists p_usuario on public.usuario;
drop policy if exists usuario_ler on public.usuario;
create policy usuario_ler on public.usuario for select
  using (id = auth.uid()
         or (transportadora_id = minha_transportadora()
             and (eh_gestao() or meu_papel() = 'mecanico'
                  or (meu_papel() = 'motorista' and papel in ('admin_transportadora', 'gestor', 'admin_mover_ia', 'mecanico')))));

-- ---------- B5: registrar_push ----------
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or minha_transportadora() is null then raise exception 'Não autenticado.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception 'Inscrição inválida.'; end if;
  -- aparelho já ligado a alguém de OUTRA transportadora: não reassocia
  if exists (select 1 from push_inscricao where endpoint = p_endpoint and transportadora_id <> minha_transportadora()) then
    raise exception 'Este aparelho está registrado em outra empresa.' using errcode = '42501';
  end if;
  -- mesma transportadora (ex: celular compartilhado): passa a ser da pessoa logada
  delete from push_inscricao where endpoint = p_endpoint;
  insert into push_inscricao (usuario_id, transportadora_id, endpoint, p256dh, auth, aparelho)
  values (auth.uid(), minha_transportadora(), p_endpoint, p_p256dh, p_auth, left(p_aparelho, 200));
end $$;
revoke execute on function public.registrar_push(text, text, text, text) from public, anon;
grant execute on function public.registrar_push(text, text, text, text) to authenticated;

revoke execute on function public.trg_viagem_regras_motorista(), public.trg_chamado_regras_mecanico() from public, anon, authenticated;
