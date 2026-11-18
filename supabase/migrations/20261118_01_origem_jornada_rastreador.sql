-- Origem da jornada pelo rastreador (pedido do Thiago, 18/11). O escritório importa o relatório de
-- posições do rastreador no navegador; o app grava só a Origem de cada jornada (não o trajeto).
--
-- local_conhecido: garagem, pátios, terminais... Jornada que começa dentro do raio sai com o nome dele.
-- jornada.origem: origem da jornada (1ª linha do relatório).
-- jornada_evento.origem: quando uma parada de descanso de 11 h ou mais quebra a jornada em duas linhas
--   (dividirPorDescanso, js/relatorio-jornada.js), a origem da linha seguinte fica no registro de volta.
-- Só a gestão grava a origem: o motorista não escolhe de onde saiu.

create table if not exists public.local_conhecido (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null default minha_transportadora() references public.transportadora(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  raio_m integer not null default 500 check (raio_m between 50 and 20000),
  criado_em timestamptz not null default now()
);
create index if not exists local_conhecido_transportadora_idx on public.local_conhecido (transportadora_id);

alter table public.local_conhecido enable row level security;
drop policy if exists local_conhecido_ver on public.local_conhecido;
create policy local_conhecido_ver on public.local_conhecido for select using (eh_gestao() and transportadora_id = minha_transportadora());
drop policy if exists local_conhecido_cadastrar on public.local_conhecido;
create policy local_conhecido_cadastrar on public.local_conhecido for insert with check (eh_gestao() and transportadora_id = minha_transportadora());
drop policy if exists local_conhecido_editar on public.local_conhecido;
create policy local_conhecido_editar on public.local_conhecido for update using (eh_gestao() and transportadora_id = minha_transportadora()) with check (eh_gestao() and transportadora_id = minha_transportadora());
drop policy if exists local_conhecido_excluir on public.local_conhecido;
create policy local_conhecido_excluir on public.local_conhecido for delete using (eh_gestao() and transportadora_id = minha_transportadora());
revoke all on public.local_conhecido from anon;
grant select, insert, update, delete on public.local_conhecido to authenticated;

alter table public.jornada add column if not exists origem text;
alter table public.jornada_evento add column if not exists origem text;
alter table public.jornada drop constraint if exists jornada_origem_tamanho;
alter table public.jornada add constraint jornada_origem_tamanho check (origem is null or length(origem) <= 60);
alter table public.jornada_evento drop constraint if exists jornada_evento_origem_tamanho;
alter table public.jornada_evento add constraint jornada_evento_origem_tamanho check (origem is null or length(origem) <= 60);

-- motorista não grava origem (a gestão grava pelo rastreador ou à mão)
create or replace function public.trg_origem_so_gestao()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if pode_tudo() then return new; end if;
  if tg_op = 'INSERT' then new.origem := null; else new.origem := old.origem; end if;
  return new;
end $function$;
revoke all on function public.trg_origem_so_gestao() from public, anon;

drop trigger if exists jornada_origem_so_gestao on public.jornada;
create trigger jornada_origem_so_gestao before insert or update on public.jornada
  for each row execute function public.trg_origem_so_gestao();
drop trigger if exists jornada_evento_origem_so_gestao on public.jornada_evento;
create trigger jornada_evento_origem_so_gestao before insert or update on public.jornada_evento
  for each row execute function public.trg_origem_so_gestao();
