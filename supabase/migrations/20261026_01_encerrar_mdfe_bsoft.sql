-- Encerramento ("baixa") do MDF-e no Bsoft quando o motorista finaliza a viagem com o ticket de descarga.
-- Liga/desliga pelo escritório (Integração). Desligado por padrão: o encerramento vai para a SEFAZ e não se desfaz.

alter table public.integracao_bsoft add column if not exists encerrar_mdfe boolean not null default false;
alter table public.viagem add column if not exists bsoft_encerrado_em timestamptz;
alter table public.viagem add column if not exists bsoft_encerramento_erro text;
do $$ begin
  alter table public.viagem add constraint viagem_bsoft_encerramento_erro_chk check (bsoft_encerramento_erro is null or length(bsoft_encerramento_erro) <= 500);
exception when duplicate_object then null; end $$;

-- escritório liga/desliga o encerramento automático
create or replace function public.definir_encerramento_mdfe(p_ligar boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not eh_gestao() then raise exception 'Só o escritório altera a integração.'; end if;
  update integracao_bsoft set encerrar_mdfe = p_ligar, atualizado_em = now() where transportadora_id = minha_transportadora();
  if not found then raise exception 'Integração com o Bsoft não habilitada para esta transportadora — fale com a MOVER.IA.'; end if;
end $function$;
revoke all on function public.definir_encerramento_mdfe(boolean) from public, anon;
grant execute on function public.definir_encerramento_mdfe(boolean) to authenticated;

-- viagem do Bsoft concluída com ticket de descarga → pede o encerramento à função bsoft-sincronizar
create or replace function public.trg_viagem_encerrar_mdfe()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.status = 'concluida' and old.status <> 'concluida' and new.bsoft_manifesto_id is not null and new.bsoft_encerrado_em is null
     and exists (select 1 from integracao_bsoft i where i.transportadora_id = new.transportadora_id and i.encerrar_mdfe)
     and exists (select 1 from documento d where d.referente_a = 'viagem' and d.referente_id = new.id and d.tipo = 'Ticket de descarga') then
    perform net.http_post(
      url := 'https://otllslhjbyjtktxyvezy.supabase.co/functions/v1/bsoft-sincronizar',
      body := jsonb_build_object('segredo', (select segredo from integracao_segredo where id = 1), 'acao', 'encerrar_mdfe',
                                 'transportadora_id', new.transportadora_id, 'viagem_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 60000
    );
  end if;
  return null;
end $function$;
drop trigger if exists viagem_encerrar_mdfe on public.viagem;
create trigger viagem_encerrar_mdfe after update of status on public.viagem for each row execute function public.trg_viagem_encerrar_mdfe();
