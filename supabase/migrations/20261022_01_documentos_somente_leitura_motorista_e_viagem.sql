-- Documentos (22/10, pedido do Thiago):
--  • Motorista só VÊ, baixa e compartilha documentos — anexar/trocar arquivo passa a ser só do escritório.
--  • Documentos de VIAGEM (CT-e, MDF-e, NF-e...): referente_a = 'viagem'; o motorista vê os das viagens dele.

alter table public.documento drop constraint if exists documento_referente_a_check;
alter table public.documento add constraint documento_referente_a_check check (referente_a in ('motorista', 'veiculo', 'empresa', 'viagem'));

-- motorista não altera mais documentos
drop policy if exists documento_motorista_anexar on public.documento;

drop policy if exists documento_ler on public.documento;
create policy documento_ler on public.documento for select using (
  transportadora_id = minha_transportadora() and meu_papel() <> 'mecanico'::papel_usuario and (
    eh_gestao()
    or referente_a = 'empresa'
    or (referente_a = 'motorista' and referente_id = auth.uid())
    or (referente_a = 'veiculo' and referente_id in (select meus_veiculos()))
    or (referente_a = 'viagem' and referente_id in (select v.id from viagem v where v.motorista_id = auth.uid()))
  ));

-- arquivos: só o escritório envia ou troca (ver/baixar continua pela regra de leitura)
drop policy if exists documentos_insert on storage.objects;
create policy documentos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = minha_transportadora()::text and eh_gestao());
drop policy if exists documentos_update on storage.objects;
create policy documentos_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = minha_transportadora()::text and eh_gestao());

-- registro de acessos: descrição para documentos de viagem
create or replace function public.descricao_referente_documento(p_ref text, p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case p_ref
    when 'motorista' then (select nome from usuario where id = p_id)
    when 'veiculo' then (select placa from veiculo where id = p_id)
    when 'viagem' then (select 'viagem ' || coalesce(origem, '?') || ' → ' || coalesce(destino, '?') from viagem where id = p_id)
    else 'empresa' end;
$$;
revoke all on function public.descricao_referente_documento(text, uuid) from public, anon, authenticated;

create or replace function public.trg_registro_documento() returns trigger language plpgsql security definer set search_path = public as $$
declare r documento; v_acao text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'UPDATE' and new.tipo is not distinct from old.tipo and new.numero is not distinct from old.numero
     and new.validade is not distinct from old.validade and new.arquivo_url is not distinct from old.arquivo_url then return new; end if;
  v_acao := case tg_op when 'INSERT' then 'cadastrou' when 'UPDATE' then 'alterou' else 'excluiu' end;
  insert into registro_acesso (transportadora_id, usuario_id, acao, alvo, alvo_id, titular_id, descricao)
  values (r.transportadora_id, auth.uid(), v_acao, 'documento', r.id, case when r.referente_a = 'motorista' then r.referente_id end,
          left(r.tipo || coalesce(' — ' || descricao_referente_documento(r.referente_a, r.referente_id), '')
               || case when tg_op = 'UPDATE' and new.arquivo_url is distinct from old.arquivo_url then ' (arquivo trocado)' else '' end, 300));
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function public.registrar_acesso_arquivo(p_alvo text, p_id uuid)
returns void language plpgsql volatile security invoker set search_path = public as $$
declare v_tid uuid; v_titular uuid; v_desc text;
begin
  -- (roda com as permissões de quem abriu: só registra o que a pessoa enxerga)
  if p_alvo = 'documento' then
    select d.transportadora_id, case when d.referente_a = 'motorista' then d.referente_id end,
           d.tipo || coalesce(' — ' || case d.referente_a
             when 'motorista' then (select nome from usuario where id = d.referente_id)
             when 'veiculo' then (select placa from veiculo where id = d.referente_id)
             when 'viagem' then (select 'viagem ' || coalesce(origem, '?') || ' → ' || coalesce(destino, '?') from viagem where id = d.referente_id)
             else 'empresa' end, '')
      into v_tid, v_titular, v_desc from documento d where d.id = p_id;
  elsif p_alvo = 'capacitacao' then
    select c.transportadora_id, c.motorista_id, 'Certificado: ' || c.tipo || coalesce(' — ' || (select nome from usuario where id = c.motorista_id), '')
      into v_tid, v_titular, v_desc from capacitacao c where c.id = p_id;
  else return;
  end if;
  if v_tid is null then return; end if;
  perform gravar_registro_acesso(v_tid, 'visualizou', p_alvo, p_id, v_titular, v_desc);
end $$;
