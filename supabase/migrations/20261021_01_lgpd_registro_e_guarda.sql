-- LGPD — etapa 2
--  • registro_acesso: quem viu, cadastrou, alterou, apagou ou anonimizou documentos e dados
--    pessoais (para responder pedidos e investigar incidentes). Ninguém grava nem apaga direto.
--    Alterações são registradas por gatilhos no banco (não dependem do app); visualizações de
--    arquivo são registradas pelo app ao abrir (registrar_acesso_arquivo).
--  • Prazo de guarda: usuario.desligado_em (marcado sozinho ao desativar), anos de guarda por
--    transportadora (padrão 5), aviso semanal ao escritório e anonimizar_titular().

-- ---------- registro de acessos ----------
create table if not exists public.registro_acesso (
  id bigint generated always as identity primary key,
  transportadora_id uuid not null references public.transportadora(id) on delete cascade,
  usuario_id uuid references public.usuario(id) on delete set null,     -- quem fez (null = sistema)
  acao text not null check (acao in ('visualizou', 'cadastrou', 'alterou', 'excluiu', 'anonimizou')),
  alvo text not null check (length(alvo) <= 40),                         -- documento, capacitacao, dados_motorista, titular
  alvo_id uuid,
  titular_id uuid references public.usuario(id) on delete set null,     -- de quem é o dado, quando é de uma pessoa
  descricao text check (descricao is null or length(descricao) <= 300),
  criado_em timestamptz not null default now()
);
create index if not exists registro_acesso_tid_idx on public.registro_acesso (transportadora_id, criado_em desc);
create index if not exists registro_acesso_titular_idx on public.registro_acesso (titular_id, criado_em desc);
alter table public.registro_acesso enable row level security;
drop policy if exists registro_acesso_ler on public.registro_acesso;
create policy registro_acesso_ler on public.registro_acesso for select
  using (eh_gestao() and transportadora_id = minha_transportadora());
revoke insert, update, delete on public.registro_acesso from anon, authenticated;

-- grava uma linha; quem está logado só grava na própria transportadora e em nome próprio
create or replace function public.gravar_registro_acesso(p_tid uuid, p_acao text, p_alvo text, p_alvo_id uuid, p_titular uuid, p_descricao text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is not null and p_tid is distinct from minha_transportadora() then return; end if;
  insert into registro_acesso (transportadora_id, usuario_id, acao, alvo, alvo_id, titular_id, descricao)
  values (p_tid, auth.uid(), p_acao, p_alvo, p_alvo_id, p_titular, left(p_descricao, 300));
end $$;
revoke all on function public.gravar_registro_acesso(uuid, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.gravar_registro_acesso(uuid, text, text, uuid, uuid, text) to authenticated;

-- chamada pelo app ao abrir um arquivo. Roda com as permissões de quem chama: só registra
-- se a pessoa realmente enxerga o documento/capacitação.
create or replace function public.registrar_acesso_arquivo(p_alvo text, p_id uuid)
returns void language plpgsql volatile security invoker set search_path = public as $$
declare v_tid uuid; v_titular uuid; v_desc text;
begin
  if p_alvo = 'documento' then
    select d.transportadora_id, case when d.referente_a = 'motorista' then d.referente_id end,
           d.tipo || coalesce(' — ' || case d.referente_a when 'motorista' then (select nome from usuario where id = d.referente_id)
                                                          when 'veiculo' then (select placa from veiculo where id = d.referente_id) else 'empresa' end, '')
      into v_tid, v_titular, v_desc from documento d where d.id = p_id;
  elsif p_alvo = 'capacitacao' then
    select c.transportadora_id, c.motorista_id, 'Certificado: ' || c.tipo || coalesce(' — ' || (select nome from usuario where id = c.motorista_id), '')
      into v_tid, v_titular, v_desc from capacitacao c where c.id = p_id;
  else return;
  end if;
  if v_tid is null then return; end if;
  perform gravar_registro_acesso(v_tid, 'visualizou', p_alvo, p_id, v_titular, v_desc);
end $$;
revoke all on function public.registrar_acesso_arquivo(text, uuid) from public, anon;
grant execute on function public.registrar_acesso_arquivo(text, uuid) to authenticated;

-- gatilhos: cadastro / alteração / exclusão
create or replace function public.trg_registro_documento() returns trigger language plpgsql security definer set search_path = public as $$
declare r documento; v_acao text; v_quem text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'UPDATE' and new.tipo is not distinct from old.tipo and new.numero is not distinct from old.numero
     and new.validade is not distinct from old.validade and new.arquivo_url is not distinct from old.arquivo_url then return new; end if;
  v_acao := case tg_op when 'INSERT' then 'cadastrou' when 'UPDATE' then 'alterou' else 'excluiu' end;
  v_quem := case r.referente_a when 'motorista' then (select nome from usuario where id = r.referente_id)
                               when 'veiculo' then (select placa from veiculo where id = r.referente_id) else 'empresa' end;
  insert into registro_acesso (transportadora_id, usuario_id, acao, alvo, alvo_id, titular_id, descricao)
  values (r.transportadora_id, auth.uid(), v_acao, 'documento', r.id, case when r.referente_a = 'motorista' then r.referente_id end,
          left(r.tipo || coalesce(' — ' || v_quem, '') || case when tg_op = 'UPDATE' and new.arquivo_url is distinct from old.arquivo_url then ' (arquivo trocado)' else '' end, 300));
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists registro_documento on public.documento;
create trigger registro_documento after insert or update or delete on public.documento for each row execute function public.trg_registro_documento();

create or replace function public.trg_registro_capacitacao() returns trigger language plpgsql security definer set search_path = public as $$
declare r capacitacao;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'UPDATE' and new.tipo is not distinct from old.tipo and new.validade is not distinct from old.validade
     and new.certificado_url is not distinct from old.certificado_url and new.data_realizacao is not distinct from old.data_realizacao then return new; end if;
  insert into registro_acesso (transportadora_id, usuario_id, acao, alvo, alvo_id, titular_id, descricao)
  values (r.transportadora_id, auth.uid(), case tg_op when 'INSERT' then 'cadastrou' when 'UPDATE' then 'alterou' else 'excluiu' end,
          'capacitacao', r.id, r.motorista_id, left(r.tipo || coalesce(' — ' || (select nome from usuario where id = r.motorista_id), ''), 300));
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists registro_capacitacao on public.capacitacao;
create trigger registro_capacitacao after insert or update or delete on public.capacitacao for each row execute function public.trg_registro_capacitacao();

-- CPF, CNH, categoria e validades de saúde do motorista
create or replace function public.trg_registro_motorista_perfil() returns trigger language plpgsql security definer set search_path = public as $$
declare v_campos text[] := '{}'; v_tid uuid; v_nome text;
begin
  if tg_op = 'UPDATE' then
    if new.cpf is distinct from old.cpf then v_campos := v_campos || 'CPF'::text; end if;
    if new.cnh is distinct from old.cnh then v_campos := v_campos || 'nº da CNH'::text; end if;
    if new.categoria_cnh is distinct from old.categoria_cnh then v_campos := v_campos || 'categoria da CNH'::text; end if;
    if new.cnh_validade is distinct from old.cnh_validade then v_campos := v_campos || 'validade da CNH'::text; end if;
    if new.toxicologico_validade is distinct from old.toxicologico_validade then v_campos := v_campos || 'validade do toxicológico'::text; end if;
    if new.aso_validade is distinct from old.aso_validade then v_campos := v_campos || 'validade do ASO'::text; end if;
    if array_length(v_campos, 1) is null then return new; end if;
  end if;
  select transportadora_id, nome into v_tid, v_nome from usuario where id = new.usuario_id;
  if v_tid is null then return new; end if;
  insert into registro_acesso (transportadora_id, usuario_id, acao, alvo, alvo_id, titular_id, descricao)
  values (v_tid, auth.uid(), case tg_op when 'INSERT' then 'cadastrou' else 'alterou' end, 'dados_motorista', new.usuario_id, new.usuario_id,
          left(case when tg_op = 'INSERT' then 'Cadastro do motorista' else 'Alterou ' || array_to_string(v_campos, ', ') end || coalesce(' — ' || v_nome, ''), 300));
  return new;
end $$;
drop trigger if exists registro_motorista_perfil on public.motorista_perfil;
create trigger registro_motorista_perfil after insert or update on public.motorista_perfil for each row execute function public.trg_registro_motorista_perfil();

-- ---------- prazo de guarda ----------
alter table public.usuario add column if not exists desligado_em timestamptz;
alter table public.usuario add column if not exists anonimizado_em timestamptz;
alter table public.transportadora add column if not exists anos_guarda_dados int not null default 5;
do $$ begin
  alter table public.transportadora add constraint transportadora_anos_guarda_chk check (anos_guarda_dados between 1 and 30);
exception when duplicate_object then null; end $$;

-- desativou → marca a data; reativou → limpa
create or replace function public.trg_usuario_desligamento() returns trigger language plpgsql as $$
begin
  if old.ativo and not new.ativo then new.desligado_em := now();
  elsif not old.ativo and new.ativo then new.desligado_em := null;
  end if;
  return new;
end $$;
drop trigger if exists usuario_desligamento on public.usuario;
create trigger usuario_desligamento before update of ativo on public.usuario for each row execute function public.trg_usuario_desligamento();
update public.usuario set desligado_em = now() where not ativo and desligado_em is null;

-- apaga/anonimiza os dados pessoais de quem já saiu. Os arquivos (documentos e
-- certificados) são apagados pelo app antes, pelo armazenamento. Mantém o que
-- não identifica a pessoa (horários de jornada, abastecimentos, chamados) para
-- as estatísticas da frota, agora ligados a "Titular anonimizado".
create or replace function public.anonimizar_titular(p_usuario uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare u usuario; v_email text;
begin
  if not eh_gestao() then raise exception 'Só o escritório pode anonimizar dados.'; end if;
  select * into u from usuario where id = p_usuario and transportadora_id = minha_transportadora();
  if u.id is null then raise exception 'Pessoa não encontrada.'; end if;
  if u.id = auth.uid() then raise exception 'Você não pode anonimizar o próprio cadastro.'; end if;
  if u.ativo then raise exception 'Desative o acesso da pessoa antes de anonimizar.'; end if;
  if u.anonimizado_em is not null then raise exception 'Esta pessoa já foi anonimizada.'; end if;
  if u.papel in ('admin_transportadora', 'admin_mover_ia') then raise exception 'Administradores não podem ser anonimizados por aqui — fale com a MOVER.IA.'; end if;

  v_email := 'anonimizado-' || left(replace(u.id::text, '-', ''), 12) || '@moveria.invalid';
  delete from documento where referente_a = 'motorista' and referente_id = u.id;
  delete from capacitacao where motorista_id = u.id;
  update motorista_perfil set cpf = null, cnh = null, categoria_cnh = null, cnh_validade = null, toxicologico_validade = null, aso_validade = null where usuario_id = u.id;
  update jornada set assinatura_base64 = null where motorista_id = u.id and assinatura_base64 is not null;
  update checklist set assinatura_base64 = null where motorista_id = u.id and assinatura_base64 is not null;
  update jornada_evento set observacao = null where observacao is not null and jornada_id in (select id from jornada where motorista_id = u.id);
  delete from notificacao where usuario_id = u.id;
  delete from push_inscricao where usuario_id = u.id;
  update aceite_privacidade set aparelho = null where usuario_id = u.id;
  update solicitacao_titular set mensagem = '[anonimizado]', resposta = case when resposta is null then null else '[anonimizado]' end where usuario_id = u.id;
  update conjunto set motorista_id = null where motorista_id = u.id;
  update usuario set nome = 'Titular anonimizado', telefone = null, email = v_email, anonimizado_em = now() where id = u.id;
  -- login: troca o e-mail, bloqueia e encerra as sessões
  update auth.users set email = v_email, phone = null, raw_user_meta_data = '{}'::jsonb, banned_until = '2999-12-31', updated_at = now() where id = u.id;
  update auth.identities set identity_data = jsonb_build_object('sub', u.id::text, 'email', v_email), updated_at = now() where user_id = u.id;
  delete from auth.sessions where user_id = u.id;
  -- o nome também sai das descrições do registro de acessos
  update registro_acesso set descricao = replace(descricao, u.nome, 'Titular anonimizado') where titular_id = u.id and descricao like '%' || u.nome || '%';
  insert into registro_acesso (transportadora_id, usuario_id, acao, alvo, alvo_id, titular_id, descricao)
  values (u.transportadora_id, auth.uid(), 'anonimizou', 'titular', u.id, u.id,
          'Dados pessoais anonimizados (' || case u.papel when 'motorista' then 'ex-motorista' when 'mecanico' then 'ex-mecânico' else 'ex-usuário do escritório' end ||
          ', desligado em ' || coalesce(to_char(u.desligado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), '?') || ')');
end $$;
revoke all on function public.anonimizar_titular(uuid) from public, anon;
grant execute on function public.anonimizar_titular(uuid) to authenticated;

-- aviso semanal: quem passou do prazo de guarda → escritório. Também limpa registros de
-- acesso com mais de 5 anos.
create or replace function public.aviso_prazo_guarda()
returns void language plpgsql volatile security definer set search_path = public as $$
declare t record;
begin
  for t in
    select u.transportadora_id tid, count(*) n
    from usuario u join transportadora tr on tr.id = u.transportadora_id
    where not u.ativo and u.anonimizado_em is null and u.desligado_em is not null
      and u.desligado_em < now() - make_interval(years => tr.anos_guarda_dados)
    group by 1
  loop
    perform notificar(t.tid, ids_por_papel(t.tid, array['admin_transportadora', 'gestor']), 'privacidade',
      'Dados de ex-colaboradores passaram do prazo de guarda',
      t.n || case when t.n = 1 then ' pessoa desligada passou' else ' pessoas desligadas passaram' end || ' do prazo de guarda — revise em Privacidade e anonimize.', 'privacidade');
  end loop;
  delete from registro_acesso where criado_em < now() - interval '5 years';
end $$;
revoke all on function public.aviso_prazo_guarda() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'aviso-prazo-guarda';
select cron.schedule('aviso-prazo-guarda', '30 10 * * 1', 'select public.aviso_prazo_guarda()');   -- segundas, 07:30 de Brasília
