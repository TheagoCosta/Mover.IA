-- Ticket de descarga: o motorista só finaliza a viagem depois de enviar a foto/PDF do ticket.
-- É o único arquivo que o motorista pode anexar (o resto continua só do escritório).

-- 1) registro do documento: só "Ticket de descarga", só da própria viagem em andamento, só na pasta dela
drop policy if exists documento_motorista_ticket on public.documento;
create policy documento_motorista_ticket on public.documento for insert with check (
  transportadora_id = minha_transportadora()
  and meu_papel() = 'motorista'
  and referente_a = 'viagem'
  and tipo = 'Ticket de descarga'
  and referente_id in (select v.id from viagem v where v.motorista_id = auth.uid() and v.status = 'em_andamento')
  and arquivo_url like (minha_transportadora()::text || '/viagem/' || referente_id::text || '/Ticket_de_descarga%')
);

-- 2) arquivo no Storage: mesma regra, pela pasta {transportadora}/viagem/{viagem}/Ticket_de_descarga...
drop policy if exists documentos_motorista_ticket on storage.objects;
create policy documentos_motorista_ticket on storage.objects for insert to authenticated with check (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = minha_transportadora()::text
  and meu_papel() = 'motorista'
  and (storage.foldername(name))[2] = 'viagem'
  and (storage.foldername(name))[3] in (select v.id::text from viagem v where v.motorista_id = auth.uid() and v.status = 'em_andamento')
  and storage.filename(name) like 'Ticket_de_descarga%'
);

-- 3) finalizar sem ticket: bloqueado para o motorista (o escritório e a integração continuam podendo concluir)
create or replace function public.trg_viagem_regras_motorista()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if pode_tudo() then return new; end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') or new.status <> 'concluida' then
    raise exception 'Você só pode finalizar a viagem; os dados dela são alterados pelo escritório.' using errcode = '42501';
  end if;
  if old.status <> 'concluida' and not exists (
    select 1 from documento d where d.referente_a = 'viagem' and d.referente_id = new.id and d.tipo = 'Ticket de descarga'
  ) then
    raise exception 'Envie a foto do ticket de descarga antes de finalizar a viagem.' using errcode = 'P0001';
  end if;
  return new;
end $function$;
