-- Pneus: km carregado × vazio, eixo que levanta (12h) e estepe (pedido do Thiago, 04/11/2026).
--   • Carregado = viagem em andamento (do MDF-e até o motorista finalizar com o ticket de descarga).
--     A viagem passa a guardar quando foi concluída (concluida_em).
--   • Os km de cada trecho vêm do odômetro dos abastecimentos do cavalo (interpolado entre um
--     abastecimento e o próximo). Carreta/dolly usa o cavalo do conjunto atual.
--   • Eixo que levanta ("12h"): vazio ele fica suspenso, então os pneus dele só contam km carregado.
--     Os outros eixos ("24h") contam tudo. Quais eixos levantam fica em veiculo.eixos_levantam.
--   • Estepe não roda: montado na posição de estepe o pneu não soma km.

-- ---------- viagem: quando foi concluída ----------
alter table public.viagem add column if not exists concluida_em timestamptz;
-- viagens já concluídas: a hora do ticket de descarga, quando tem
update public.viagem g set concluida_em = t.criado_em
from (select referente_id, min(criado_em) criado_em from public.documento where referente_a = 'viagem' and tipo = 'Ticket de descarga' group by 1) t
where t.referente_id = g.id and g.status = 'concluida' and g.concluida_em is null;

-- roda depois de viagem_regras_motorista (ordem alfabética), que já impede o motorista de mandar essa coluna
create or replace function public.trg_viagem_concluida_em() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'concluida' then new.concluida_em := null;
  elsif tg_op = 'UPDATE' and old.status <> 'concluida' then new.concluida_em := now();
  elsif tg_op = 'UPDATE' and not pode_tudo() then new.concluida_em := old.concluida_em;
  end if;
  return new;
end $$;
drop trigger if exists viagem_zz_concluida_em on public.viagem;
create trigger viagem_zz_concluida_em before insert or update on public.viagem for each row execute function public.trg_viagem_concluida_em();
revoke all on function public.trg_viagem_concluida_em() from public, anon, authenticated;

-- ---------- eixos que levantam ----------
alter table public.veiculo add column if not exists eixos_levantam smallint[] not null default '{}'
  check (eixos_levantam <@ array[1,2,3,4,5,6,7,8,9]::smallint[]);

create index if not exists abastecimento_veiculo_data_idx on public.abastecimento (veiculo_id, data) where km > 0;
create index if not exists viagem_veiculo_idx on public.viagem (veiculo_id, criado_em);

-- odômetro do veículo num momento (interpola entre o abastecimento anterior e o seguinte)
create or replace function public.km_no_momento(p_veiculo uuid, p_t timestamptz) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare a record; b record;
begin
  select km, data into a from abastecimento where veiculo_id = p_veiculo and km > 0 and data <= p_t order by data desc limit 1;
  select km, data into b from abastecimento where veiculo_id = p_veiculo and km > 0 and data > p_t order by data limit 1;
  if a.km is not null and b.km is not null and b.km >= a.km and b.data > a.data then
    return a.km + (b.km - a.km) * extract(epoch from p_t - a.data) / extract(epoch from b.data - a.data);
  end if;
  return coalesce(a.km, b.km);
end $$;
revoke all on function public.km_no_momento(uuid, timestamptz) from public, anon, authenticated;

-- cavalo que puxa o veículo (ele mesmo, se for cavalo)
create or replace function public.cavalo_do_veiculo(p_veiculo uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when v.tipo = 'cavalo' then v.id else (
    select ci2.veiculo_id from conjunto_item ci
    join conjunto c on c.id = ci.conjunto_id and c.ativo
    join conjunto_item ci2 on ci2.conjunto_id = c.id
    join veiculo v2 on v2.id = ci2.veiculo_id and v2.tipo = 'cavalo'
    where ci.veiculo_id = v.id limit 1) end
  from veiculo v where v.id = p_veiculo;
$$;
revoke all on function public.cavalo_do_veiculo(uuid) from public, anon, authenticated;

-- km carregado, vazio e suspenso (eixo que levanta, vazio) de cada pneu, em todas as montagens
-- e só na vida atual (desde a última recapagem). Estepe fica de fora.
create or replace function public.pneu_km_carga()
returns table (pneu_id uuid, km_carregado numeric, km_vazio numeric, km_suspenso numeric, km_suspenso_vida numeric)
language sql stable security definer set search_path = public as $$
  with mont as (
    select m.pneu_id, m.veiculo_id, m.posicao, m.data ini,
      coalesce((select min(d.data) from pneu_movimento d where d.pneu_id = m.pneu_id and d.tipo = 'desmontagem' and (d.data, d.criado_em) > (m.data, m.criado_em)), now()) fim,
      m.data > coalesce((select max(r.data) from pneu_movimento r where r.pneu_id = m.pneu_id and r.tipo = 'retorno_recapagem'), '-infinity') vida_atual
    from pneu_movimento m
    where m.tipo = 'montagem' and m.posicao not like 'EST%'
      and m.transportadora_id = minha_transportadora() and eh_gestao_ou_mecanico()),
  mc as (
    select mont.*, cavalo_do_veiculo(mont.veiculo_id) cavalo,
      substring(mont.posicao from '^(\d)')::smallint = any(v.eixos_levanta) levanta
    from mont join (select id, eixos_levantam eixos_levanta from veiculo) v on v.id = mont.veiculo_id),
  trechos as (
    select mc.pneu_id, mc.levanta, mc.vida_atual,
      greatest(0, coalesce(km_no_momento(mc.cavalo, mc.fim) - km_no_momento(mc.cavalo, mc.ini), 0)) total,
      (select coalesce(sum(greatest(0, km_no_momento(mc.cavalo, least(mc.fim, coalesce(g.concluida_em, now())))
                                     - km_no_momento(mc.cavalo, greatest(mc.ini, g.criado_em)))), 0)
       from viagem g
       where g.veiculo_id = mc.cavalo and g.criado_em < mc.fim
         and coalesce(g.concluida_em, case when g.status = 'em_andamento' then now() end) > mc.ini) carregado
    from mc where mc.cavalo is not null)
  select pneu_id,
    round(sum(least(carregado, total))),
    round(sum(case when levanta then 0 else total - least(carregado, total) end)),
    round(sum(case when levanta then total - least(carregado, total) else 0 end)),
    round(sum(case when levanta and vida_atual then total - least(carregado, total) else 0 end))
  from trechos group by pneu_id;
$$;
revoke all on function public.pneu_km_carga() from public, anon;
grant execute on function public.pneu_km_carga() to authenticated;

-- estepe não soma km: refaz o cálculo do pneu sem contar montagens na posição de estepe
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
    v_trecho := case when v_kmm is not null and m.km is not null and m.km >= v_kmm and v_pos not like 'EST%' then m.km - v_kmm
                     when v_pos like 'EST%' then 0 end;
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
