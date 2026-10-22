-- Agendamento da integração com o Bsoft — APLICAR SÓ COM APROVAÇÃO DO THIAGO.
-- A cada 15 minutos chama a Edge Function para cada transportadora com a sincronização ligada
-- (o escritório liga/desliga na tela Integração). Só LÊ do Bsoft.
create or replace function public.disparar_sincronizacao_bsoft()
returns void language plpgsql volatile security definer set search_path = public as $$
declare t record;
begin
  for t in select transportadora_id from integracao_bsoft where ativo loop
    perform net.http_post(
      url := 'https://otllslhjbyjtktxyvezy.supabase.co/functions/v1/bsoft-sincronizar',
      body := jsonb_build_object('segredo', (select segredo from integracao_segredo where id = 1), 'acao', 'sincronizar', 'transportadora_id', t.transportadora_id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 120000
    );
  end loop;
end $$;
revoke all on function public.disparar_sincronizacao_bsoft() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'sincronizar-bsoft';
select cron.schedule('sincronizar-bsoft', '*/15 * * * *', 'select public.disparar_sincronizacao_bsoft()');
