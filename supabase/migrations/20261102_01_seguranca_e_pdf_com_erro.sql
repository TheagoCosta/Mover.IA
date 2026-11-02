-- Revisão de 02/11/2026 (verificador de segurança do Supabase):
-- 1) funções de gatilho não podem ser chamadas pela API (o gatilho continua funcionando normalmente)
do $$ declare f record; begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;
-- 2) gravar_registro_acesso só é usada por outras funções do banco, nunca pelo app
revoke execute on function public.gravar_registro_acesso(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;
-- 3) caminho de busca fixo (padrão das outras funções)
alter function public.trg_usuario_desligamento() set search_path = public;
-- 4) PDFs que o Bsoft recusou: guarda o erro para tentar de novo só a cada 6 h (função bsoft-sincronizar)
alter table public.integracao_bsoft add column if not exists pdf_falhas jsonb not null default '{}'::jsonb;
