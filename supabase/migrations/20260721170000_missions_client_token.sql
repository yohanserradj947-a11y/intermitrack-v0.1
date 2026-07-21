-- Mode hors ligne (écriture) : jeton client pour synchroniser SANS doublon les missions
-- saisies sans réseau. À la reconnexion, l'appli fait un upsert « onConflict client_token » :
-- si la mission a déjà été envoyée, elle est mise à jour au lieu d'être recréée (idempotent).
alter table public.missions add column if not exists client_token uuid;

-- Index unique NON partiel : Postgres considère les NULL comme distincts, donc les anciennes
-- missions (client_token NULL) coexistent sans souci, et chaque mission hors ligne a un jeton unique.
-- (Un index unique complet est requis pour servir de cible à ON CONFLICT via PostgREST.)
create unique index if not exists missions_client_token_key on public.missions (client_token);
