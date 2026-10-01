-- =====================================================================
-- MOVER.IA — Assinatura do motorista no checklist (igual à da jornada)
-- A imagem é gerada no app (tinta escura sobre fundo branco). As regras de
-- acesso do checklist já valem: o motorista grava o dele, a gestão vê todos.
-- =====================================================================
alter table public.checklist
  add column if not exists assinatura_base64 text,
  add column if not exists assinado_em timestamptz;
