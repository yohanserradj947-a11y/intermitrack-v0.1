-- Table des factures auto-entrepreneur (micro-entreprise)
-- À exécuter dans Supabase → SQL Editor → New query → Run

create table if not exists public.factures (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  client       text not null,
  prestation   text not null,
  facture_date date not null,
  amount       numeric(10,2) not null default 0,
  status       text not null default 'impayee',  -- 'impayee' | 'payee'
  created_at   timestamptz not null default now()
);

create index if not exists factures_user_date_idx
  on public.factures (user_id, facture_date desc);

-- Sécurité : chaque utilisateur ne voit/modifie que ses propres factures
alter table public.factures enable row level security;

create policy "factures_select_own" on public.factures
  for select using (auth.uid() = user_id);

create policy "factures_insert_own" on public.factures
  for insert with check (auth.uid() = user_id);

create policy "factures_update_own" on public.factures
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "factures_delete_own" on public.factures
  for delete using (auth.uid() = user_id);
