-- Répertoire de sociétés (clients, productions, employeurs, prestataires)
-- À exécuter dans Supabase → SQL Editor → New query → Run

create table if not exists public.societes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  nom             text not null,
  type            text default 'Client',     -- Client | Production | Employeur | Prestataire
  adresse         text,
  telephone       text,
  email           text,
  siret           text,
  delai_paiement  int,                        -- délai de paiement moyen en jours
  created_at      timestamptz not null default now()
);

create index if not exists societes_user_nom_idx
  on public.societes (user_id, nom);

grant select, insert, update, delete on public.societes to authenticated;

alter table public.societes enable row level security;

create policy "societes_select_own" on public.societes
  for select using (auth.uid() = user_id);
create policy "societes_insert_own" on public.societes
  for insert with check (auth.uid() = user_id);
create policy "societes_update_own" on public.societes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "societes_delete_own" on public.societes
  for delete using (auth.uid() = user_id);
