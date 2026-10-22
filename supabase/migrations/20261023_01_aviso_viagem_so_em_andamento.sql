-- Aviso "Nova viagem para você" só para viagem em andamento: as viagens antigas trazidas do Bsoft
-- (MDF-e anteriores do mesmo motorista) entram já concluídas, só como histórico, sem aviso.
create or replace function public.trg_notif_viagem_nova() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.motorista_id is not null and new.status = 'em_andamento' then
    perform notificar(new.transportadora_id, array[new.motorista_id], 'viagem', 'Nova viagem para você',
      coalesce(new.origem, '?') || ' → ' || coalesce(new.destino, '?'), 'tab:viagem');
  end if;
  return new;
end $$;
