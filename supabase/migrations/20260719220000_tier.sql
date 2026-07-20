-- Freemium : niveau d'accès par utilisateur.
-- 'pionnier' = tout gratuit à vie · 'gratuit' = limité (3 onglets) · 'premium' = tout payant.
-- BÊTA : tout le monde est Pionnier (défaut) → personne n'est bloqué tant que le paiement
-- n'est pas en place. À la mise en marché (sept/oct) : passer le défaut à 'gratuit' pour
-- les nouveaux + sélectionner les vrais Pionniers.
alter table public.profiles add column if not exists tier text default 'pionnier';
update public.profiles set tier = 'pionnier' where tier is null;
