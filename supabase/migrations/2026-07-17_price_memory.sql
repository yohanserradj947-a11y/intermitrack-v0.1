-- Mémoire de prix par (production + poste), synchronisée entre appareils.
-- Clé JSON "PROD|POSTE" -> prix journalier appris. Alimentée silencieusement à chaque
-- enregistrement de mission ; pré-remplit le prix la fois suivante.
alter table public.profiles add column if not exists price_memory jsonb;
