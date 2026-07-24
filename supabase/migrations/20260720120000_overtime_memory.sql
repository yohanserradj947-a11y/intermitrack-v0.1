-- Mémoire des règles d'heures supplémentaires par production (base garantie + heures + paliers).
-- Stockée en JSON dans profiles.overtime_memory, comme price_memory. Colonne nullable → sans risque.
alter table public.profiles add column if not exists overtime_memory jsonb;
