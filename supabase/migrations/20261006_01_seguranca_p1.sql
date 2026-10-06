-- =====================================================================
-- MOVER.IA — Correções de segurança P1 (auditoria de 06/10/2026)
--   A1: assinatura só aceita imagem PNG em base64 (bloqueia XSS armazenado)
--   A2: motorista não altera nem apaga jornada/checklist depois de gravados;
--       horários (início, fim, eventos, envio) sempre pelo relógio do servidor
--   A3: motorista só altera arquivo e QR Code dos documentos (validade, tipo,
--       número e status ficam com o escritório)
-- Gestão (admin/gestor) e o servidor (service role) continuam livres.
-- =====================================================================

-- Quem é "livre" nas regras abaixo: gestão ou chamada do próprio servidor (sem usuário)
create or replace function public.pode_tudo() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is null or eh_gestao();
$$;
revoke execute on function public.pode_tudo() from public, anon;
grant execute on function public.pode_tudo() to authenticated;

-- ---------- A1: formato da assinatura ----------
alter table public.jornada drop constraint if exists jornada_assinatura_formato_chk;
alter table public.jornada add constraint jornada_assinatura_formato_chk
  check (assinatura_base64 is null or assinatura_base64 ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$');
alter table public.checklist drop constraint if exists checklist_assinatura_formato_chk;
alter table public.checklist add constraint checklist_assinatura_formato_chk
  check (assinatura_base64 is null or assinatura_base64 ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$');

-- ---------- A2: jornada ----------
drop policy if exists jornada_ver_e_editar on public.jornada;
drop policy if exists jornada_ler on public.jornada;
drop policy if exists jornada_gestao on public.jornada;
drop policy if exists jornada_motorista_iniciar on public.jornada;
drop policy if exists jornada_motorista_atualizar on public.jornada;
create policy jornada_ler on public.jornada for select
  using (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()));
create policy jornada_gestao on public.jornada for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());
create policy jornada_motorista_iniciar on public.jornada for insert
  with check (transportadora_id = minha_transportadora() and motorista_id = auth.uid());
-- só enquanto a jornada está aberta; depois de encerrada ninguém além da gestão mexe
create policy jornada_motorista_atualizar on public.jornada for update
  using (transportadora_id = minha_transportadora() and motorista_id = auth.uid() and status <> 'encerrada')
  with check (transportadora_id = minha_transportadora() and motorista_id = auth.uid());
-- (sem política de DELETE para o motorista: ele não apaga jornada)

create or replace function public.trg_jornada_regras_motorista() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pode_tudo() then return new; end if;
  if tg_op = 'INSERT' then
    new.inicio := now(); new.status := 'ativa'; new.fim := null;
    new.assinatura_base64 := null; new.assinado_em := null;
    return new;
  end if;
  -- UPDATE: só status, fim e assinatura podem mudar
  if (to_jsonb(new) - 'status' - 'fim' - 'assinatura_base64' - 'assinado_em')
     is distinct from (to_jsonb(old) - 'status' - 'fim' - 'assinatura_base64' - 'assinado_em') then
    raise exception 'Você só pode registrar paradas e encerrar a jornada.' using errcode = '42501';
  end if;
  if new.status not in ('ativa', 'pausada', 'encerrada') then
    raise exception 'Situação de jornada inválida.' using errcode = '42501';
  end if;
  if new.status = 'encerrada' then
    new.fim := now(); new.assinado_em := case when new.assinatura_base64 is null then null else now() end;
  else
    new.fim := null; new.assinatura_base64 := null; new.assinado_em := null;
  end if;
  return new;
end $$;
drop trigger if exists jornada_regras_motorista on public.jornada;
create trigger jornada_regras_motorista before insert or update on public.jornada
  for each row execute function public.trg_jornada_regras_motorista();

-- ---------- A2: eventos da jornada ----------
create or replace function public.trg_jornada_evento_regras_motorista() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text; v_fim timestamptz;
begin
  if pode_tudo() then return new; end if;
  new.criado_em := now();   -- horário do evento sempre pelo servidor
  if new.tipo not in ('inicio', 'pausa', 'retomada', 'fim') then
    raise exception 'Tipo de evento inválido.' using errcode = '42501';
  end if;
  select status, fim into v_status, v_fim from jornada where id = new.jornada_id;
  -- jornada encerrada: só o evento "fim", logo depois de encerrar, e uma vez só
  if v_status = 'encerrada' and (new.tipo <> 'fim' or v_fim < now() - interval '10 minutes'
      or exists (select 1 from jornada_evento e where e.jornada_id = new.jornada_id and e.tipo = 'fim')) then
    raise exception 'Esta jornada já foi encerrada.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists jornada_evento_regras_motorista on public.jornada_evento;
create trigger jornada_evento_regras_motorista before insert on public.jornada_evento
  for each row execute function public.trg_jornada_evento_regras_motorista();

-- ---------- A2: checklist (motorista envia e lê; não altera nem apaga) ----------
drop policy if exists checklist_ver_e_enviar on public.checklist;
drop policy if exists checklist_ler on public.checklist;
drop policy if exists checklist_enviar on public.checklist;
drop policy if exists checklist_gestao on public.checklist;
create policy checklist_ler on public.checklist for select
  using (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()));
create policy checklist_enviar on public.checklist for insert
  with check (transportadora_id = minha_transportadora() and (eh_gestao() or motorista_id = auth.uid()));
create policy checklist_gestao on public.checklist for all
  using (transportadora_id = minha_transportadora() and eh_gestao())
  with check (transportadora_id = minha_transportadora() and eh_gestao());

create or replace function public.trg_checklist_regras_motorista() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pode_tudo() then return new; end if;
  new.criado_em := now();
  new.assinado_em := case when new.assinatura_base64 is null then null else now() end;
  return new;
end $$;
drop trigger if exists checklist_regras_motorista on public.checklist;
create trigger checklist_regras_motorista before insert on public.checklist
  for each row execute function public.trg_checklist_regras_motorista();

-- ---------- A3: documentos ----------
create or replace function public.trg_documento_regras_motorista() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pode_tudo() then return new; end if;
  if (to_jsonb(new) - 'arquivo_url' - 'qr_conteudo') is distinct from (to_jsonb(old) - 'arquivo_url' - 'qr_conteudo') then
    raise exception 'Você pode anexar o arquivo e ler o QR Code; os dados do documento são alterados pelo escritório.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists documento_regras_motorista on public.documento;
create trigger documento_regras_motorista before update on public.documento
  for each row execute function public.trg_documento_regras_motorista();

revoke execute on function public.trg_jornada_regras_motorista(), public.trg_jornada_evento_regras_motorista(),
  public.trg_checklist_regras_motorista(), public.trg_documento_regras_motorista() from public, anon, authenticated;
