-- Heures réellement PAYÉES (celles de la fiche de paie), pour les comparer aux heures faites
-- (déjà saisies sur la mission) et repérer une erreur de compta. Nullable → sans risque, exactement
-- comme net_reel. Concerne les missions à l'heure (techniciens) ; on ne l'affiche pas pour les cachets.
alter table public.missions add column if not exists heures_payees numeric;
