-- Table des frais réels (dépenses déductibles) — module Fiscalité
-- À exécuter dans Supabase → SQL Editor → New query → Run

create table if not exists public.frais (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  frais_date  date not null,
  categorie   text not null,
  description text,
  montant     numeric(10,2) not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists frais_user_date_idx
  on public.frais (user_id, frais_date desc);

grant select, insert, update, delete on public.frais to authenticated;

alter table public.frais enable row level security;

create policy "frais_select_own" on public.frais
  for select using (auth.uid() = user_id);
create policy "frais_insert_own" on public.frais
  for insert with check (auth.uid() = user_id);
create policy "frais_update_own" on public.frais
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "frais_delete_own" on public.frais
  for delete using (auth.uid() = user_id);
