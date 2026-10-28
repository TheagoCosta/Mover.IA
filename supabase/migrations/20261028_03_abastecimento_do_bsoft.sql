-- Abastecimentos lançados no Bsoft passam a ser LIDOS pelo MOVER.IA (decisão do Thiago, 28/10/2026),
-- para o relatório de Consumo funcionar sem mudar a rotina do escritório. Nada é gravado no Bsoft.
-- bsoft_origem = 'posto:<id>' ou 'proprio:<id>' do Bsoft (não importa duas vezes).
-- O Bsoft não informa o motorista: a função procura pela viagem (MDF-e) do cavalo naquele dia ou
-- pelo conjunto atual; sem achar, fica sem motorista.
alter table public.abastecimento alter column motorista_id drop not null;
alter table public.abastecimento add column if not exists bsoft_origem text;
alter table public.abastecimento drop constraint if exists abastecimento_bsoft_origem_chk;
alter table public.abastecimento add constraint abastecimento_bsoft_origem_chk check (bsoft_origem is null or length(bsoft_origem) <= 60);
create unique index if not exists abastecimento_bsoft_origem_uk on public.abastecimento (transportadora_id, bsoft_origem) where bsoft_origem is not null;

-- Recalcula as médias de um veículo a partir de uma data (depois de importar lançamentos antigos).
-- Só o servidor (função bsoft-sincronizar) chama.
create or replace function public.recalcular_medias_veiculo(p_veiculo uuid, p_desde timestamptz)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update abastecimento set litros = litros where veiculo_id = p_veiculo and data > p_desde;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.recalcular_medias_veiculo(uuid, timestamptz) from public, anon, authenticated;
