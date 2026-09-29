-- =====================================================================
-- MOVER.IA — Cadastros e edição pelo painel do escritório (etapa 2)
--
-- • usuario: gestão pode editar SÓ nome e telefone de quem é da mesma
--   transportadora (papel, e-mail e ativo não — ativar/desativar passa pela
--   função de servidor gerenciar-usuario, que também bloqueia o login).
-- • transportadora: gestão edita os dados cadastrais (não CNPJ nem plano).
-- • Usuário desativado deixa de enxergar qualquer dado na hora: as funções
--   usadas por todas as regras de acesso passam a exigir ativo = true.
-- =====================================================================

create or replace function public.minha_transportadora()
returns uuid language sql stable security definer set search_path = public as $$
  select transportadora_id from usuario where id = auth.uid() and ativo;
$$;

create or replace function public.meu_papel()
returns papel_usuario language sql stable security definer set search_path = public as $$
  select papel from usuario where id = auth.uid() and ativo;
$$;

create or replace function public.eh_gestao()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select papel in ('admin_transportadora', 'gestor', 'admin_mover_ia') from usuario where id = auth.uid() and ativo),
    false);
$$;

-- usuario: edição de nome/telefone pela gestão
revoke update on public.usuario from authenticated, anon;
grant update (nome, telefone) on public.usuario to authenticated;
create policy usuario_gestao_editar on public.usuario for update
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

-- transportadora: edição dos dados cadastrais pela gestão
revoke update on public.transportadora from authenticated, anon;
grant update (razao_social, nome_fantasia, endereco, telefone, email, rntrc, ibama_registro) on public.transportadora to authenticated;
create policy transportadora_gestao_editar on public.transportadora for update
  using (id = minha_transportadora() and eh_gestao())
  with check (id = minha_transportadora() and eh_gestao());
