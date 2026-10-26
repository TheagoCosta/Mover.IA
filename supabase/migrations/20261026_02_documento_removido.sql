-- Cópia de segurança de documentos removidos em limpezas (ex.: duplicados). Sem políticas: só o servidor lê.
-- 26/10/2026: 109 CRLV em duplicidade (mesma placa cadastrada em 08/10 e de novo em 13/10) foram copiados
-- para cá e removidos de documento; ficou o cadastro mais recente de cada placa. Os arquivos no Storage
-- não foram apagados (dá para restaurar: insert into documento select <colunas> from documento_removido).
create table if not exists public.documento_removido (like public.documento);
alter table public.documento_removido add column if not exists removido_em timestamptz not null default now();
alter table public.documento_removido add column if not exists motivo text;
alter table public.documento_removido enable row level security;
