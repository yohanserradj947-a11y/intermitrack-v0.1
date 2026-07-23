-- Interrupteur « monétisation » : permet d'activer les abonnements (paywall) SANS refaire de build.
-- Tant que monetisation_active = false, TOUT est gratuit pour tout le monde (état par défaut).
-- Pour lancer les abonnements : passer la valeur à true (update ci-dessous).
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table public.app_config enable row level security;

-- Lecture autorisée à tous les utilisateurs connectés (l'app lit l'interrupteur).
drop policy if exists "app_config readable by authenticated" on public.app_config;
create policy "app_config readable by authenticated"
  on public.app_config for select to authenticated using (true);

-- Valeur par défaut : monétisation DÉSACTIVÉE (tout gratuit).
insert into public.app_config (key, value) values ('monetisation_active', 'false'::jsonb)
  on conflict (key) do nothing;

-- ▶ POUR ACTIVER LES ABONNEMENTS LE JOUR VENU (à lancer manuellement dans le SQL Editor) :
--   update public.app_config set value = 'true'::jsonb, updated_at = now() where key = 'monetisation_active';
