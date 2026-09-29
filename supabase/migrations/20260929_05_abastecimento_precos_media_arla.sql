-- =====================================================================
-- MOVER.IA — Abastecimento: preço por litro (externo) e média do Arla
--
-- • preco_litro_diesel / preco_litro_arla: informados pelo motorista no
--   abastecimento externo (posto) — permite calcular o gasto.
-- • media_arla_calculada: km rodados desde o último abastecimento de Arla
--   do mesmo veículo ÷ litros de Arla. Separada da média do diesel
--   (media_calculada), que continua sendo a principal.
-- =====================================================================

alter table public.abastecimento
  add column if not exists preco_litro_diesel numeric check (preco_litro_diesel is null or preco_litro_diesel > 0),
  add column if not exists preco_litro_arla numeric check (preco_litro_arla is null or preco_litro_arla > 0),
  add column if not exists media_arla_calculada numeric;
