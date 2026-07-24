-- Compteur de scans du QR code (stickers → intermitrack.fr/app.html).
-- Table minimale, données NON sensibles (juste un horodatage + la source/referrer).
create table if not exists public.qr_scans (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text
);

alter table public.qr_scans enable row level security;

-- Anonyme : peut ENREGISTRER un scan (chaque ouverture de app.html) et LIRE le total.
-- Aucune donnée personnelle → lecture publique du compteur assumée.
drop policy if exists qr_scans_insert on public.qr_scans;
create policy qr_scans_insert on public.qr_scans for insert to anon, authenticated with check (true);
drop policy if exists qr_scans_select on public.qr_scans;
create policy qr_scans_select on public.qr_scans for select to anon, authenticated using (true);

-- ⚠️ Les policies RLS ne suffisent pas : il faut AUSSI le GRANT de base sur la table pour le rôle anon,
-- sinon « permission denied for table qr_scans » (l'enregistrement du scan et la lecture du total échouent).
grant select, insert on public.qr_scans to anon, authenticated;
