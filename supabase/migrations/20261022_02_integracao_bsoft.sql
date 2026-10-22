-- Integração com o Bsoft TMS (Bloco 5)
-- A Edge Function "bsoft-sincronizar" lê os MDF-e (manifestos) do Bsoft, cria a viagem no app do
-- motorista (achado pelo CPF ou pela placa do conjunto) e anexa os PDFs do DAMDFE e dos DACTE.
-- Credenciais do Bsoft: segredos da Edge Function (BSOFT_DOMINIO, BSOFT_USUARIO, BSOFT_SENHA),
-- cadastrados pelo Thiago no painel do Supabase — nunca no banco nem no código.
-- Só lê do Bsoft (a API não tem ambiente de testes: nada é gravado lá).

create table if not exists public.integracao_bsoft (
  transportadora_id uuid primary key references public.transportadora(id) on delete cascade,
  ativo boolean not null default false,                 -- sincronização automática ligada?
  dias_retroativos int not null default 3 check (dias_retroativos between 1 and 30),
  ultima_execucao timestamptz,
  ultimo_status text,                                   -- ok | erro | sem_credenciais
  ultimo_resumo jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.integracao_bsoft enable row level security;
drop policy if exists integracao_bsoft_ler on public.integracao_bsoft;
create policy integracao_bsoft_ler on public.integracao_bsoft for select using (eh_gestao() and transportadora_id = minha_transportadora());
revoke insert, update, delete on public.integracao_bsoft from anon, authenticated;

-- segredo que o agendamento (pg_cron) usa para chamar a função — tabela sem acesso pelo app
create table if not exists public.integracao_segredo (
  id int primary key default 1 check (id = 1),
  segredo text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.integracao_segredo enable row level security;
revoke all on public.integracao_segredo from anon, authenticated;
insert into public.integracao_segredo (id) values (1) on conflict do nothing;

-- liga a integração para a ChavesLog (desligada até o escritório conferir a prévia)
insert into public.integracao_bsoft (transportadora_id) values ('039cdb29-c23d-4b5c-8636-595a61a84737') on conflict do nothing;

-- ligar/desligar a sincronização automática (só o escritório)
create or replace function public.definir_sincronizacao_bsoft(p_ativo boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not eh_gestao() then raise exception 'Só o escritório altera a integração.'; end if;
  update integracao_bsoft set ativo = p_ativo, atualizado_em = now() where transportadora_id = minha_transportadora();
  if not found then raise exception 'Integração com o Bsoft não habilitada para esta transportadora — fale com a MOVER.IA.'; end if;
end $$;
revoke all on function public.definir_sincronizacao_bsoft(boolean) from public, anon;
grant execute on function public.definir_sincronizacao_bsoft(boolean) to authenticated;

-- ligação dos registros com o Bsoft (evita importar duas vezes)
alter table public.viagem add column if not exists bsoft_manifesto_id text;
create unique index if not exists viagem_bsoft_manifesto_uk on public.viagem (transportadora_id, bsoft_manifesto_id) where bsoft_manifesto_id is not null;
alter table public.documento add column if not exists bsoft_ref text;
create unique index if not exists documento_bsoft_ref_uk on public.documento (referente_id, bsoft_ref) where bsoft_ref is not null;

-- (o agendamento automático a cada 15 minutos fica em uma migração separada, aplicada
--  só depois que o Thiago aprovar: 20261022_03_agendamento_bsoft.sql)
