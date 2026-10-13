-- Despertador: função mínima chamada a cada 2 dias pelo GitHub Actions
-- (.github/workflows/despertador-supabase.yml) para o plano gratuito do Supabase
-- não pausar o projeto por falta de uso. Não lê nem devolve nenhum dado — só "1".
create or replace function public.manter_ativo()
returns integer
language sql
stable
set search_path = ''
as $$ select 1 $$;

revoke all on function public.manter_ativo() from public;
grant execute on function public.manter_ativo() to anon, authenticated;
