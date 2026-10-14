-- LGPD — etapa 1
--  • aceite_privacidade: quem leu a Política de Privacidade (versão, data e aparelho).
--    Não é "consentimento" (a base legal dos dados é contrato/obrigação legal):
--    é o registro de que a pessoa foi informada (transparência, art. 9º).
--  • solicitacao_titular: pedidos do titular (acesso, correção, exclusão, outro — art. 18).
--    O escritório da transportadora (controladora) recebe aviso e responde pelo app.
-- Ninguém grava direto nas tabelas: só pelas funções abaixo (que conferem quem é quem).

-- ---------- aceite da política ----------
create table if not exists public.aceite_privacidade (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadora(id) on delete cascade,
  usuario_id uuid not null references public.usuario(id) on delete cascade,
  versao text not null check (length(versao) between 1 and 20),
  aceito_em timestamptz not null default now(),
  aparelho text check (aparelho is null or length(aparelho) <= 300),
  unique (usuario_id, versao)
);
alter table public.aceite_privacidade enable row level security;
drop policy if exists aceite_privacidade_ler on public.aceite_privacidade;
create policy aceite_privacidade_ler on public.aceite_privacidade for select
  using (usuario_id = auth.uid() or (eh_gestao() and transportadora_id = minha_transportadora()));

create or replace function public.registrar_aceite_privacidade(p_versao text, p_aparelho text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_tid uuid;
begin
  select transportadora_id into v_tid from usuario where id = auth.uid() and ativo;
  if v_tid is null then raise exception 'Usuário não encontrado ou desativado.'; end if;
  if p_versao is null or length(p_versao) not between 1 and 20 then raise exception 'Versão inválida.'; end if;
  insert into aceite_privacidade (transportadora_id, usuario_id, versao, aparelho)
  values (v_tid, auth.uid(), p_versao, left(p_aparelho, 300))
  on conflict (usuario_id, versao) do nothing;
end $$;
revoke all on function public.registrar_aceite_privacidade(text, text) from public, anon;
grant execute on function public.registrar_aceite_privacidade(text, text) to authenticated;

revoke insert, update, delete on public.aceite_privacidade from anon, authenticated;

-- ---------- pedidos do titular ----------
create table if not exists public.solicitacao_titular (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadora(id) on delete cascade,
  usuario_id uuid not null references public.usuario(id) on delete cascade,
  tipo text not null check (tipo in ('acesso', 'correcao', 'exclusao', 'outro')),
  mensagem text not null check (length(mensagem) between 1 and 2000),
  status text not null default 'aberta' check (status in ('aberta', 'respondida')),
  resposta text check (resposta is null or length(resposta) <= 2000),
  criado_em timestamptz not null default now(),
  respondido_em timestamptz,
  respondido_por uuid references public.usuario(id) on delete set null
);
create index if not exists solicitacao_titular_tid_idx on public.solicitacao_titular (transportadora_id, criado_em desc);
alter table public.solicitacao_titular enable row level security;
drop policy if exists solicitacao_titular_ler on public.solicitacao_titular;
create policy solicitacao_titular_ler on public.solicitacao_titular for select
  using (usuario_id = auth.uid() or (eh_gestao() and transportadora_id = minha_transportadora()));

revoke insert, update, delete on public.solicitacao_titular from anon, authenticated;

create or replace function public.criar_solicitacao_titular(p_tipo text, p_mensagem text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_tid uuid; v_nome text; v_id uuid;
begin
  select transportadora_id, nome into v_tid, v_nome from usuario where id = auth.uid() and ativo;
  if v_tid is null then raise exception 'Usuário não encontrado ou desativado.'; end if;
  if p_tipo not in ('acesso', 'correcao', 'exclusao', 'outro') then raise exception 'Tipo de pedido inválido.'; end if;
  if p_mensagem is null or length(trim(p_mensagem)) = 0 or length(p_mensagem) > 2000 then raise exception 'Escreva o pedido (até 2000 caracteres).'; end if;
  -- no máximo 10 pedidos por dia por pessoa (evita abuso)
  if (select count(*) from solicitacao_titular where usuario_id = auth.uid() and criado_em > now() - interval '1 day') >= 10 then
    raise exception 'Limite de pedidos por dia atingido. Tente amanhã ou fale com o escritório.';
  end if;
  insert into solicitacao_titular (transportadora_id, usuario_id, tipo, mensagem)
  values (v_tid, auth.uid(), p_tipo, trim(p_mensagem)) returning id into v_id;
  perform notificar(v_tid, ids_por_papel(v_tid, array['admin_transportadora', 'gestor']), 'privacidade',
    'Pedido sobre dados pessoais (LGPD)',
    coalesce(v_nome, 'Um usuário') || ' · ' || case p_tipo when 'acesso' then 'acesso aos dados' when 'correcao' then 'correção de dados'
      when 'exclusao' then 'exclusão de dados' else 'outro assunto' end || ' — responda em Privacidade', 'privacidade');
  return v_id;
end $$;
revoke all on function public.criar_solicitacao_titular(text, text) from public, anon;
grant execute on function public.criar_solicitacao_titular(text, text) to authenticated;

create or replace function public.responder_solicitacao_titular(p_id uuid, p_resposta text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_s solicitacao_titular;
begin
  if not eh_gestao() then raise exception 'Só o escritório responde pedidos de dados pessoais.'; end if;
  select * into v_s from solicitacao_titular where id = p_id and transportadora_id = minha_transportadora();
  if v_s.id is null then raise exception 'Pedido não encontrado.'; end if;
  if p_resposta is null or length(trim(p_resposta)) = 0 or length(p_resposta) > 2000 then raise exception 'Escreva a resposta (até 2000 caracteres).'; end if;
  update solicitacao_titular set status = 'respondida', resposta = trim(p_resposta), respondido_em = now(), respondido_por = auth.uid()
  where id = p_id;
  perform notificar(v_s.transportadora_id, array[v_s.usuario_id], 'privacidade', 'Seu pedido sobre dados pessoais foi respondido',
    left(trim(p_resposta), 120), 'privacidade');
end $$;
revoke all on function public.responder_solicitacao_titular(uuid, text) from public, anon;
grant execute on function public.responder_solicitacao_titular(uuid, text) to authenticated;
