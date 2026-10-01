-- =====================================================================
-- MOVER.IA — Notificações no celular com a tela desligada (Web Push)
-- Cada aparelho que ativa os avisos vira uma linha em push_inscricao.
-- Toda notificação nova do sino dispara a Edge Function "enviar-push"
-- (via pg_net, depois do commit), que manda o aviso para os aparelhos.
-- =====================================================================

create extension if not exists pg_net;

-- Aparelhos inscritos (o app nunca lê/grava direto: só pelas funções abaixo)
create table if not exists public.push_inscricao (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuario(id) on delete cascade,
  transportadora_id uuid not null references public.transportadora(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now()
);
create index if not exists push_inscricao_usuario_idx on public.push_inscricao (usuario_id);
alter table public.push_inscricao enable row level security;
drop policy if exists push_inscricao_ler on public.push_inscricao;
create policy push_inscricao_ler on public.push_inscricao for select using (usuario_id = auth.uid());

-- Configuração: chaves VAPID (criadas pela Edge Function) e o segredo que
-- o gatilho usa para chamar a função. Sem acesso nenhum pelo app.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_publica text,
  vapid_privada jsonb,
  segredo text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict do nothing;

-- Chave pública (o navegador precisa dela para inscrever o aparelho)
create or replace function public.chave_publica_push()
returns text language sql stable security definer set search_path = public as $$
  select vapid_publica from push_config where id = 1 and minha_transportadora() is not null;
$$;

-- Liga este aparelho à pessoa logada (se o aparelho era de outra pessoa,
-- passa a ser desta — ex: celular compartilhado)
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or minha_transportadora() is null then raise exception 'Não autenticado.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception 'Inscrição inválida.'; end if;
  delete from push_inscricao where endpoint = p_endpoint;
  insert into push_inscricao (usuario_id, transportadora_id, endpoint, p256dh, auth, aparelho)
  values (auth.uid(), minha_transportadora(), p_endpoint, p_p256dh, p_auth, left(p_aparelho, 200));
end $$;

-- Ao sair da conta: este aparelho para de receber os avisos desta pessoa
create or replace function public.remover_push(p_endpoint text)
returns void language sql volatile security definer set search_path = public as $$
  delete from push_inscricao where endpoint = p_endpoint and usuario_id = auth.uid();
$$;

revoke execute on function public.chave_publica_push(), public.registrar_push(text, text, text, text), public.remover_push(text) from public, anon;
grant execute on function public.chave_publica_push(), public.registrar_push(text, text, text, text), public.remover_push(text) to authenticated;

-- Notificação nova → Edge Function envia para os aparelhos da pessoa
create or replace function public.trg_push_notificacao() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from push_inscricao where usuario_id = new.usuario_id) then
    perform net.http_post(
      url := 'https://otllslhjbyjtktxyvezy.supabase.co/functions/v1/enviar-push',
      body := jsonb_build_object('segredo', (select segredo from push_config where id = 1), 'notificacao_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end $$;
drop trigger if exists push_notificacao on public.notificacao;
create trigger push_notificacao after insert on public.notificacao for each row execute function public.trg_push_notificacao();
revoke execute on function public.trg_push_notificacao() from public, anon, authenticated;
