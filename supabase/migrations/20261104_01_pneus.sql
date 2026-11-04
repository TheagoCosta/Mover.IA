-- Controle de pneus (pedido do Thiago, 04/11/2026).
-- Cada pneu tem um número de fogo (gravado no pneu) e um histórico de movimentos:
--   montagem (veículo + posição + km) → desmontagem (km) → recapagem (envio/retorno) → ... → sucata,
--   mais inspeções (sulco/pressão) e consertos (custo).
-- A situação atual do pneu (onde está, vida, km rodado, sulco, custo) é sempre recalculada do
-- histórico por pneu_recalcular — assim corrigir/desfazer um movimento acerta tudo sozinho.
-- vida: 0 = novo, 1 = 1ª recapagem, 2 = 2ª...
-- km: odômetro do veículo; na carreta/dolly é o do cavalo que está puxando.
-- Quem mexe: escritório (tudo) e mecânico (cadastra pneus e lança movimentos; não edita nem exclui).

-- quantidade de eixos de cada veículo (vazio = o app deduz pelo tipo/modelo)
alter table public.veiculo add column if not exists eixos smallint check (eixos is null or eixos between 1 and 9);

create or replace function public.eh_gestao_ou_mecanico() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('admin_transportadora', 'gestor', 'admin_mover_ia', 'mecanico') from usuario where id = auth.uid() and ativo), false);
$$;

create table if not exists public.pneu (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadora(id) on delete cascade,
  numero_fogo text not null check (length(numero_fogo) between 1 and 20),
  marca text not null check (length(marca) between 1 and 40),
  modelo text check (modelo is null or length(modelo) <= 60),
  medida text check (medida is null or length(medida) <= 30),
  aplicacao text check (aplicacao is null or aplicacao in ('direcional', 'tracao', 'livre')),
  dot text check (dot is null or length(dot) <= 10),
  data_compra date,
  valor_compra numeric check (valor_compra is null or (valor_compra >= 0 and valor_compra < 100000)),
  fornecedor text check (fornecedor is null or length(fornecedor) <= 80),
  nota_numero text check (nota_numero is null or length(nota_numero) <= 40),
  sulco_inicial_mm numeric check (sulco_inicial_mm is null or (sulco_inicial_mm >= 0 and sulco_inicial_mm <= 40)),
  vida_inicial smallint not null default 0 check (vida_inicial between 0 and 9),
  observacao text check (observacao is null or length(observacao) <= 300),
  -- situação atual (só pneu_recalcular escreve)
  status text not null default 'estoque' check (status in ('estoque', 'em_uso', 'recapagem', 'sucata')),
  vida smallint not null default 0,
  veiculo_id uuid references public.veiculo(id) on delete set null,
  posicao text,
  montado_em timestamptz,
  km_montagem numeric,
  km_rodado numeric not null default 0,          -- todas as montagens já encerradas, todas as vidas
  km_vida numeric not null default 0,            -- montagens encerradas na vida atual
  vidas_concluidas jsonb not null default '[]',  -- [{vida, km, fim: 'recapagem'|'sucata'}]
  sulco_vida_inicio numeric,                     -- sulco no começo da vida atual (novo ou recapado)
  sulco_atual_mm numeric,
  medido_em timestamptz,
  km_vida_medicao numeric,                       -- km rodado na vida atual quando o sulco foi medido
  custo_total numeric not null default 0,        -- compra + recapagens + consertos
  ultimo_mov_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint pneu_fogo_uk unique (transportadora_id, numero_fogo)
);
create unique index if not exists pneu_posicao_uk on public.pneu (veiculo_id, posicao) where status = 'em_uso';
create index if not exists pneu_transportadora_idx on public.pneu (transportadora_id, status);

create table if not exists public.pneu_movimento (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadora(id) on delete cascade,
  pneu_id uuid not null references public.pneu(id) on delete cascade,
  tipo text not null check (tipo in ('montagem', 'desmontagem', 'inspecao', 'envio_recapagem', 'retorno_recapagem', 'conserto', 'sucata')),
  data timestamptz not null default now(),
  veiculo_id uuid references public.veiculo(id) on delete set null,
  posicao text check (posicao is null or posicao ~ '^([1-9](E|D|EE|EI|DI|DE)|EST[12])$'),
  km numeric check (km is null or (km >= 0 and km < 10000000)),
  sulco_mm numeric check (sulco_mm is null or (sulco_mm >= 0 and sulco_mm <= 40)),
  pressao_psi numeric check (pressao_psi is null or (pressao_psi > 0 and pressao_psi <= 200)),
  valor numeric check (valor is null or (valor >= 0 and valor < 100000)),
  fornecedor text check (fornecedor is null or length(fornecedor) <= 80),
  banda text check (banda is null or length(banda) <= 60),
  motivo text check (motivo is null or length(motivo) <= 80),
  observacao text check (observacao is null or length(observacao) <= 300),
  criado_por uuid default auth.uid() references public.usuario(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint pneu_mov_montagem_chk check (tipo <> 'montagem' or (veiculo_id is not null and posicao is not null))
);
create index if not exists pneu_movimento_pneu_idx on public.pneu_movimento (pneu_id, data, criado_em);
create index if not exists pneu_movimento_transp_idx on public.pneu_movimento (transportadora_id, data);

-- Refaz a situação do pneu a partir do histórico
create or replace function public.pneu_recalcular(p_pneu uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p pneu; m record;
  v_status text := 'estoque'; v_vida smallint; v_veic uuid; v_pos text; v_mont timestamptz; v_kmm numeric;
  v_kmr numeric := 0; v_kmv numeric := 0; v_vidas jsonb := '[]'; v_sulco_ini numeric; v_sulco numeric; v_medido timestamptz;
  v_km_med numeric; v_custo numeric; v_ultimo timestamptz; v_trecho numeric;
begin
  select * into p from pneu where id = p_pneu;
  if p.id is null then return; end if;
  v_vida := p.vida_inicial; v_sulco_ini := p.sulco_inicial_mm; v_sulco := p.sulco_inicial_mm; v_custo := coalesce(p.valor_compra, 0);
  v_km_med := case when p.sulco_inicial_mm is not null then 0 end;
  for m in select * from pneu_movimento where pneu_id = p_pneu order by data, criado_em loop
    v_trecho := case when v_kmm is not null and m.km is not null and m.km >= v_kmm then m.km - v_kmm end;
    if m.tipo = 'montagem' then
      v_status := 'em_uso'; v_veic := m.veiculo_id; v_pos := m.posicao; v_mont := m.data; v_kmm := m.km;
    elsif m.tipo = 'desmontagem' then
      v_kmr := v_kmr + coalesce(v_trecho, 0); v_kmv := v_kmv + coalesce(v_trecho, 0);
      v_status := 'estoque'; v_veic := null; v_pos := null; v_mont := null; v_kmm := null;
    elsif m.tipo = 'envio_recapagem' then
      v_status := 'recapagem';
    elsif m.tipo = 'retorno_recapagem' then
      v_vidas := v_vidas || jsonb_build_object('vida', v_vida, 'km', v_kmv, 'fim', 'recapagem');
      v_status := 'estoque'; v_vida := v_vida + 1; v_kmv := 0;
      v_sulco_ini := m.sulco_mm; v_km_med := case when m.sulco_mm is not null then 0 end;
    elsif m.tipo = 'sucata' then
      v_vidas := v_vidas || jsonb_build_object('vida', v_vida, 'km', v_kmv, 'fim', 'sucata');
      v_status := 'sucata';
    end if;
    if m.sulco_mm is not null and m.tipo <> 'retorno_recapagem' then
      v_sulco := m.sulco_mm; v_medido := m.data;
      -- km da vida atual no momento da medição (montado: soma o trecho até o km informado)
      v_km_med := case when m.tipo = 'inspecao' and v_kmm is not null then case when v_trecho is not null then v_kmv + v_trecho end else v_kmv end;
    elsif m.tipo = 'retorno_recapagem' and m.sulco_mm is not null then
      v_sulco := m.sulco_mm; v_medido := m.data;
    end if;
    v_custo := v_custo + coalesce(m.valor, 0);
    v_ultimo := m.data;
  end loop;
  perform set_config('moveria.pneu_recalculo', '1', true);
  update pneu set status = v_status, vida = v_vida, veiculo_id = v_veic, posicao = v_pos, montado_em = v_mont, km_montagem = v_kmm,
    km_rodado = v_kmr, km_vida = v_kmv, vidas_concluidas = v_vidas, sulco_vida_inicio = v_sulco_ini, sulco_atual_mm = v_sulco,
    medido_em = v_medido, km_vida_medicao = v_km_med, custo_total = v_custo, ultimo_mov_em = v_ultimo
  where id = p_pneu;
  perform set_config('moveria.pneu_recalculo', '', true);
end $$;
revoke all on function public.pneu_recalcular(uuid) from public, anon, authenticated;

-- Cadastro/edição do pneu: a situação atual não pode ser mexida direto
create or replace function public.pneu_conferir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('moveria.pneu_recalculo', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'estoque'; new.vida := new.vida_inicial; new.veiculo_id := null; new.posicao := null; new.montado_em := null;
    new.km_montagem := null; new.km_rodado := 0; new.km_vida := 0; new.vidas_concluidas := '[]';
    new.sulco_vida_inicio := new.sulco_inicial_mm; new.sulco_atual_mm := new.sulco_inicial_mm; new.medido_em := null;
    new.km_vida_medicao := case when new.sulco_inicial_mm is not null then 0 end;
    new.custo_total := coalesce(new.valor_compra, 0); new.ultimo_mov_em := null; new.criado_em := now();
  else
    new.transportadora_id := old.transportadora_id; new.criado_em := old.criado_em;
    new.status := old.status; new.vida := old.vida; new.posicao := old.posicao;
    new.veiculo_id := case when new.veiculo_id is null then null else old.veiculo_id end;   -- veículo excluído do cadastro
    new.montado_em := old.montado_em; new.km_montagem := old.km_montagem; new.km_rodado := old.km_rodado; new.km_vida := old.km_vida;
    new.vidas_concluidas := old.vidas_concluidas; new.sulco_vida_inicio := old.sulco_vida_inicio; new.sulco_atual_mm := old.sulco_atual_mm;
    new.medido_em := old.medido_em; new.km_vida_medicao := old.km_vida_medicao; new.custo_total := old.custo_total; new.ultimo_mov_em := old.ultimo_mov_em;
  end if;
  new.numero_fogo := upper(trim(new.numero_fogo)); new.marca := trim(new.marca);
  return new;
end $$;
drop trigger if exists pneu_conferir on public.pneu;
create trigger pneu_conferir before insert or update on public.pneu for each row execute function public.pneu_conferir();

-- mudou compra, sulco inicial ou vida inicial: refaz a situação
create or replace function public.pneu_apos_editar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('moveria.pneu_recalculo', true) = '1' then return null; end if;
  if (new.valor_compra, new.sulco_inicial_mm, new.vida_inicial) is distinct from (old.valor_compra, old.sulco_inicial_mm, old.vida_inicial) then
    perform pneu_recalcular(new.id);
  end if;
  return null;
end $$;
drop trigger if exists pneu_apos_editar on public.pneu;
create trigger pneu_apos_editar after update on public.pneu for each row execute function public.pneu_apos_editar();

-- Confere cada movimento contra a situação atual do pneu
create or replace function public.pneu_movimento_conferir() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pneu; v veiculo; v_ultimo timestamptz; v_ocupado text;
begin
  if tg_op = 'DELETE' then
    -- pneu (ou transportadora) sendo excluído inteiro, ou operação do sistema: apaga o histórico junto
    if auth.uid() is null or not exists (select 1 from pneu where id = old.pneu_id) then return old; end if;
    if exists (select 1 from pneu_movimento where pneu_id = old.pneu_id and (data, criado_em) > (old.data, old.criado_em)) then
      raise exception 'Só dá para desfazer o último movimento do pneu.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    -- corrigir só os detalhes; tipo, pneu, data, veículo e posição não mudam (para isso, desfaça o movimento)
    -- (veículo excluído do cadastro: o banco limpa o veiculo_id sozinho)
    if (new.pneu_id, new.tipo, new.data, new.posicao, new.transportadora_id) is distinct from
       (old.pneu_id, old.tipo, old.data, old.posicao, old.transportadora_id)
       or (new.veiculo_id is not null and new.veiculo_id is distinct from old.veiculo_id) then
      raise exception 'Para mudar tipo, data, veículo ou posição, desfaça o movimento e lance de novo.';
    end if;
    new.criado_por := old.criado_por; new.criado_em := old.criado_em;
    return new;
  end if;

  select * into p from pneu where id = new.pneu_id for update;
  if p.id is null or p.transportadora_id <> new.transportadora_id then raise exception 'Pneu inválido.'; end if;
  new.criado_por := auth.uid(); new.criado_em := now();
  if new.data > now() + interval '5 minutes' then raise exception 'A data não pode ser no futuro.'; end if;
  select max(data) into v_ultimo from pneu_movimento where pneu_id = new.pneu_id;
  if v_ultimo is not null and new.data < v_ultimo then
    raise exception 'A data não pode ser antes do último movimento deste pneu (%).', to_char(v_ultimo at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;
  if p.status = 'sucata' then raise exception 'Este pneu já foi para a sucata.'; end if;

  if new.tipo = 'montagem' then
    if p.status <> 'estoque' then raise exception 'O pneu % não está no estoque (está %).', p.numero_fogo, case p.status when 'em_uso' then 'montado' else 'na recapagem' end; end if;
    select * into v from veiculo where id = new.veiculo_id;
    if v.id is null or v.transportadora_id <> new.transportadora_id then raise exception 'Veículo inválido.'; end if;
    select numero_fogo into v_ocupado from pneu where veiculo_id = new.veiculo_id and posicao = new.posicao and status = 'em_uso';
    if v_ocupado is not null then raise exception 'Essa posição já tem o pneu %. Retire ele antes.', v_ocupado; end if;
  elsif new.tipo = 'desmontagem' then
    if p.status <> 'em_uso' then raise exception 'O pneu % não está montado.', p.numero_fogo; end if;
    new.veiculo_id := p.veiculo_id; new.posicao := p.posicao;
    if new.km is not null and p.km_montagem is not null and new.km < p.km_montagem then
      raise exception 'O km (%) é menor que o da montagem (%).', new.km, p.km_montagem;
    end if;
  elsif new.tipo = 'inspecao' then
    new.veiculo_id := p.veiculo_id; new.posicao := p.posicao;
    if new.sulco_mm is null and new.pressao_psi is null then raise exception 'Informe o sulco ou a pressão.'; end if;
    if new.km is not null and p.km_montagem is not null and new.km < p.km_montagem then
      raise exception 'O km (%) é menor que o da montagem (%).', new.km, p.km_montagem;
    end if;
  elsif new.tipo = 'envio_recapagem' then
    if p.status <> 'estoque' then raise exception 'Retire o pneu do veículo antes de mandar para a recapagem.'; end if;
    new.veiculo_id := null; new.posicao := null;
  elsif new.tipo = 'retorno_recapagem' then
    if p.status <> 'recapagem' then raise exception 'O pneu % não está na recapagem.', p.numero_fogo; end if;
    new.veiculo_id := null; new.posicao := null;
  elsif new.tipo = 'sucata' then
    if p.status = 'em_uso' then raise exception 'Retire o pneu do veículo antes de mandar para a sucata.'; end if;
    new.veiculo_id := null; new.posicao := null;
  elsif new.tipo = 'conserto' then
    new.veiculo_id := p.veiculo_id; new.posicao := p.posicao;
  end if;
  return new;
end $$;
drop trigger if exists pneu_movimento_conferir on public.pneu_movimento;
create trigger pneu_movimento_conferir before insert or update or delete on public.pneu_movimento
  for each row execute function public.pneu_movimento_conferir();

create or replace function public.pneu_movimento_recalcular() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pneu_recalcular(case when tg_op = 'DELETE' then old.pneu_id else new.pneu_id end);
  return null;
end $$;
drop trigger if exists pneu_movimento_recalcular on public.pneu_movimento;
create trigger pneu_movimento_recalcular after insert or update or delete on public.pneu_movimento
  for each row execute function public.pneu_movimento_recalcular();

-- km atual de cada veículo (último abastecimento com km; carreta/dolly usa o cavalo do conjunto).
-- O mecânico não vê os abastecimentos, por isso a função.
create or replace function public.km_atual_veiculos()
returns table (veiculo_id uuid, km numeric, data timestamptz, placa_cavalo text)
language sql stable security definer set search_path = public as $$
  with ult as (
    select distinct on (a.veiculo_id) a.veiculo_id, a.km, a.data from abastecimento a
    where a.transportadora_id = minha_transportadora() and a.km > 0
    order by a.veiculo_id, a.data desc)
  select v.id, coalesce(u.km, uc.km), coalesce(u.data, uc.data), case when u.km is null then cav.placa end
  from veiculo v
  left join ult u on u.veiculo_id = v.id
  left join lateral (
    select ci2.veiculo_id cid from conjunto_item ci
    join conjunto c on c.id = ci.conjunto_id and c.ativo
    join conjunto_item ci2 on ci2.conjunto_id = c.id
    join veiculo v2 on v2.id = ci2.veiculo_id and v2.tipo = 'cavalo'
    where ci.veiculo_id = v.id and v.tipo <> 'cavalo' limit 1) cj on true
  left join veiculo cav on cav.id = cj.cid
  left join ult uc on uc.veiculo_id = cj.cid
  where v.transportadora_id = minha_transportadora() and eh_gestao_ou_mecanico();
$$;
revoke all on function public.km_atual_veiculos() from public, anon;
grant execute on function public.km_atual_veiculos() to authenticated;

alter table public.pneu enable row level security;
alter table public.pneu_movimento enable row level security;
drop policy if exists pneu_ver on public.pneu;
create policy pneu_ver on public.pneu for select using (eh_gestao_ou_mecanico() and transportadora_id = minha_transportadora());
drop policy if exists pneu_cadastrar on public.pneu;
create policy pneu_cadastrar on public.pneu for insert with check (eh_gestao_ou_mecanico() and transportadora_id = minha_transportadora());
drop policy if exists pneu_editar on public.pneu;
create policy pneu_editar on public.pneu for update using (eh_gestao() and transportadora_id = minha_transportadora()) with check (eh_gestao() and transportadora_id = minha_transportadora());
drop policy if exists pneu_excluir on public.pneu;
create policy pneu_excluir on public.pneu for delete using (eh_gestao() and transportadora_id = minha_transportadora());
drop policy if exists pneu_mov_ver on public.pneu_movimento;
create policy pneu_mov_ver on public.pneu_movimento for select using (eh_gestao_ou_mecanico() and transportadora_id = minha_transportadora());
drop policy if exists pneu_mov_lancar on public.pneu_movimento;
create policy pneu_mov_lancar on public.pneu_movimento for insert with check (eh_gestao_ou_mecanico() and transportadora_id = minha_transportadora());
drop policy if exists pneu_mov_editar on public.pneu_movimento;
create policy pneu_mov_editar on public.pneu_movimento for update using (eh_gestao() and transportadora_id = minha_transportadora()) with check (eh_gestao() and transportadora_id = minha_transportadora());
drop policy if exists pneu_mov_excluir on public.pneu_movimento;
create policy pneu_mov_excluir on public.pneu_movimento for delete using (eh_gestao() and transportadora_id = minha_transportadora());
revoke all on public.pneu, public.pneu_movimento from anon;
grant select, insert, update, delete on public.pneu, public.pneu_movimento to authenticated;

-- funções internas não ficam expostas na API (gatilhos rodam sem precisar dessa permissão)
revoke all on function public.eh_gestao_ou_mecanico() from public, anon;
grant execute on function public.eh_gestao_ou_mecanico() to authenticated;
revoke all on function public.pneu_conferir(), public.pneu_apos_editar(), public.pneu_movimento_conferir(), public.pneu_movimento_recalcular() from public, anon, authenticated;