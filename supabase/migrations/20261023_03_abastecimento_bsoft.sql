-- Envio de abastecimentos ao Bsoft (botão "Enviar ao Bsoft" no escritório): guarda o que foi lançado lá
-- para não enviar duas vezes. Só a Edge Function bsoft-sincronizar (service role) preenche.
alter table public.abastecimento add column if not exists bsoft_ref text;
alter table public.abastecimento add column if not exists bsoft_enviado_em timestamptz;
do $$ begin
  alter table public.abastecimento add constraint abastecimento_bsoft_ref_chk check (bsoft_ref is null or length(bsoft_ref) <= 200);
exception when duplicate_object then null; end $$;
