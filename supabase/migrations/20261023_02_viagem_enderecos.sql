-- Endereços de coleta e entrega da viagem (vindos do XML do CT-e no Bsoft), para o motorista abrir no mapa.
alter table public.viagem add column if not exists origem_endereco text;
alter table public.viagem add column if not exists destino_endereco text;
do $$ begin
  alter table public.viagem add constraint viagem_enderecos_chk check ((origem_endereco is null or length(origem_endereco) <= 300) and (destino_endereco is null or length(destino_endereco) <= 300));
exception when duplicate_object then null; end $$;
