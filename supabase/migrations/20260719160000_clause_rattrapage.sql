-- Statut « clause de rattrapage » (profil) : simple drapeau, pilote l'affichage
-- d'un bandeau + compte à rebours (6 mois après la date anniversaire) sur le dashboard.
alter table public.profiles add column if not exists clause_rattrapage boolean default false;
