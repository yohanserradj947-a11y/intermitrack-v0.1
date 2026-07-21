-- Demi-cachets : la colonne missions.vacations était INTEGER → elle refusait 0,5
-- (« invalid input syntax for type integer: 0.5 »). On la passe en NUMERIC : les valeurs
-- entières déjà enregistrées restent valides, et on peut désormais stocker 0,5 (demi-cachet = 6 h).
alter table public.missions
  alter column vacations type numeric using vacations::numeric;
