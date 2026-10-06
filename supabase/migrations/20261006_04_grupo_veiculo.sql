-- =====================================================================
-- MOVER.IA — Grupo do veículo (ex: frota própria, empresa parceira,
-- agregado). Texto livre curto, para filtrar nas telas e relatórios.
-- (As placas da frota são cadastradas direto no banco, não neste arquivo:
-- o repositório é público.)
-- =====================================================================
alter table public.veiculo add column if not exists grupo text;
alter table public.veiculo drop constraint if exists veiculo_grupo_chk;
alter table public.veiculo add constraint veiculo_grupo_chk check (grupo is null or length(grupo) between 1 and 40);
