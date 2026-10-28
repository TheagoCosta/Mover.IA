-- Estoque dos tanques próprios (pedido do Thiago, 28/10/2026).
-- ChavesLog: diesel em dois tanques — 30.000 L (recebe as compras) e 15.000 L (alimenta a bomba;
-- quando acaba é completado com o de 30.000) — e Arla em um tanque de 5.000 L.
-- Saldo = última medição (régua) + entradas + transferências recebidas − transferências enviadas
--         − abastecimentos internos (diesel sai do tanque da bomba de diesel, Arla do tanque de Arla).
-- O cálculo fica no app (js/tanques.js); aqui só os cadastros e os movimentos.
create table if not exists public.tanque (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadora(id) on delete cascade,
  nome text not null check (length(nome) between 1 and 60),
  produto text not null check (produto in ('diesel', 'arla')),
  capacidade_l numeric not null check (capacidade_l > 0 and capacidade_l <= 1000000),
  abastece_bomba boolean not null default false,   -- os abastecimentos internos saem deste tanque
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
-- um só tanque de bomba por produto
create unique index if not exists tanque_bomba_uk on public.tanque (transportadora_id, produto) where abastece_bomba and ativo;

create table if not exists public.tanque_movimento (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadora(id) on delete cascade,
  tanque_id uuid not null references public.tanque(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'transferencia', 'medicao')),
  litros numeric not null check (litros >= 0 and litros <= 1000000),
  tanque_destino_id uuid references public.tanque(id) on delete cascade,
  data timestamptz not null default now(),
  preco_litro numeric check (preco_litro is null or (preco_litro > 0 and preco_litro < 100)),
  fornecedor text check (fornecedor is null or length(fornecedor) <= 80),
  nota_numero text check (nota_numero is null or length(nota_numero) <= 40),
  observacao text check (observacao is null or length(observacao) <= 300),
  criado_por uuid default auth.uid() references public.usuario(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint tanque_mov_transf_chk check ((tipo = 'transferencia') = (tanque_destino_id is not null) and tanque_destino_id is distinct from tanque_id),
  constraint tanque_mov_litros_chk check (tipo = 'medicao' or litros > 0)
);
create index if not exists tanque_movimento_tanque_idx on public.tanque_movimento (tanque_id, data);
create index if not exists tanque_movimento_destino_idx on public.tanque_movimento (tanque_destino_id, data) where tanque_destino_id is not null;

-- tanques do movimento precisam ser da mesma transportadora e do mesmo produto
create or replace function public.tanque_movimento_conferir() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_t tanque; v_d tanque;
begin
  select * into v_t from tanque where id = new.tanque_id;
  if v_t.id is null or v_t.transportadora_id <> new.transportadora_id then raise exception 'Tanque inválido'; end if;
  if new.tanque_destino_id is not null then
    select * into v_d from tanque where id = new.tanque_destino_id;
    if v_d.id is null or v_d.transportadora_id <> new.transportadora_id then raise exception 'Tanque de destino inválido'; end if;
    if v_d.produto <> v_t.produto then raise exception 'Só dá para transferir entre tanques do mesmo produto'; end if;
  end if;
  if new.tipo = 'medicao' and new.litros > v_t.capacidade_l * 1.05 then raise exception 'Medição maior que a capacidade do tanque'; end if;
  if tg_op = 'INSERT' then new.criado_por := auth.uid(); new.criado_em := now();
  else new.criado_por := old.criado_por; new.criado_em := old.criado_em; end if;
  return new;
end $$;
drop trigger if exists tanque_movimento_conferir on public.tanque_movimento;
create trigger tanque_movimento_conferir before insert or update on public.tanque_movimento
  for each row execute function public.tanque_movimento_conferir();

alter table public.tanque enable row level security;
alter table public.tanque_movimento enable row level security;
drop policy if exists tanque_gestao on public.tanque;
create policy tanque_gestao on public.tanque for all
  using (eh_gestao() and transportadora_id = minha_transportadora())
  with check (eh_gestao() and transportadora_id = minha_transportadora());
drop policy if exists tanque_movimento_gestao on public.tanque_movimento;
create policy tanque_movimento_gestao on public.tanque_movimento for all
  using (eh_gestao() and transportadora_id = minha_transportadora())
  with check (eh_gestao() and transportadora_id = minha_transportadora());
revoke all on public.tanque, public.tanque_movimento from anon;
grant select, insert, update, delete on public.tanque, public.tanque_movimento to authenticated;
