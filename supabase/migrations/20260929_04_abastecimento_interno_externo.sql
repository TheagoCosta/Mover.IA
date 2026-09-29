-- =====================================================================
-- MOVER.IA — Abastecimento interno x externo + Arla
--
-- • interno: km, litros, odômetro da bomba, Arla; confirmado com a senha
--   de quem do escritório abasteceu (confirmado_por / confirmado_em).
--   Só é gravado pela função de servidor registrar-abastecimento-interno,
--   que confere a senha — o motorista não consegue lançar "interno" sozinho.
-- • externo: km, litros, Arla, posto (ex: "Posto 56, Jundiaí") e número
--   da nota/comprovante. O motorista grava direto pelo app.
-- Registros antigos ficam com tipo nulo ("não informado").
-- =====================================================================

alter table public.abastecimento
  add column if not exists tipo text check (tipo in ('interno', 'externo')),
  add column if not exists posto text,
  add column if not exists nota_numero text,
  add column if not exists arla_litros numeric check (arla_litros is null or arla_litros >= 0),
  add column if not exists confirmado_por uuid references public.usuario(id),
  add column if not exists confirmado_em timestamptz;

-- Motorista só grava abastecimento EXTERNO, dele, sem "confirmação" forjada.
-- (interno entra pela função de servidor, que usa a chave de serviço.)
drop policy if exists abastecimento_registrar on public.abastecimento;
create policy abastecimento_registrar on public.abastecimento for insert
  with check (transportadora_id = minha_transportadora()
              and (eh_gestao()
                   or (motorista_id = auth.uid() and tipo = 'externo'
                       and confirmado_por is null and confirmado_em is null)));
