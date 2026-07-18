-- Répartition des cachets par jour pour un contrat d'annexe artiste saisi en
-- UNE seule mission (retour Emeric : « 1 le 10, 1 le 14, 2 le 25 » = 1 AEM).
-- Forme : { "2026-07-10": 1, "2026-07-14": 1, "2026-07-25": 2 }.
-- Null pour les missions classiques (heures) et les cachets d'un seul jour.
alter table public.missions add column if not exists cachet_days jsonb;
