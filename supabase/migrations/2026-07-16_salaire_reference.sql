-- Salaire de référence (Prévisions / simulateur d'allocation).
-- « Les deux » : l'app pré-remplit depuis les missions (12 mois glissants), mais si
-- l'utilisateur enregistre une valeur ici, elle prend le dessus. Nullable = pas de valeur mémorisée.
alter table public.profiles add column if not exists salaire_reference numeric;
