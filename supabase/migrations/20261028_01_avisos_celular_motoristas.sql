-- Escritório vê quais motoristas já ligaram os avisos no celular (push).
-- push_inscricao não tem políticas (ninguém lê direto); esta função devolve só
-- quantos aparelhos cada pessoa tem e quando ligou — nunca o endereço do aparelho.
create or replace function public.avisos_celular_usuarios()
returns table (usuario_id uuid, aparelhos int, desde timestamptz)
language sql stable security definer set search_path = public as $$
  select p.usuario_id, count(*)::int, min(p.criado_em)
  from push_inscricao p
  where eh_gestao() and p.transportadora_id = minha_transportadora()
  group by p.usuario_id
$$;
revoke execute on function public.avisos_celular_usuarios() from public, anon;
grant execute on function public.avisos_celular_usuarios() to authenticated;
