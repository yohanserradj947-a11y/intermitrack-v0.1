-- ============================================================
-- Intermitrack — Requêtes de stats propres
-- À coller dans le SQL Editor de Supabase (une requête à la fois).
-- Hypothèse : la table `analytics_events` a une colonne `created_at`.
-- ============================================================


-- 1. 👥 Utilisateurs actifs (30 derniers jours)
select count(distinct user_id) as utilisateurs_actifs_30j
from analytics_events
where created_at >= now() - interval '30 days';


-- 2. 📅 Utilisateurs actifs par jour (DAU — 14 derniers jours)
select date_trunc('day', created_at)::date as jour,
       count(distinct user_id)             as utilisateurs_actifs
from analytics_events
where created_at >= now() - interval '14 days'
group by 1
order by 1 desc;


-- 3. 🖱️ Clics par onglet
select replace(event_name, 'view_', '') as onglet,
       count(*)                          as clics,
       count(distinct user_id)           as utilisateurs
from analytics_events
where event_name like 'view_%'
group by 1
order by clics desc;


-- 4. 🎬 Missions par utilisateur
select u.email,
       count(m.id)                      as nb_missions,
       coalesce(sum(m.gross_amount), 0) as brut_total
from missions m
join auth.users u on u.id = m.user_id
group by u.email
order by nb_missions desc;


-- 5. 📧 Tous les emails (envoi groupé)
-- Version liste (un email par ligne) :
select email, created_at::date as date_inscription
from auth.users
where email is not null
order by created_at desc;

-- Version "copier-coller" (tous les emails sur une ligne, à mettre en Cci) :
select string_agg(email, ', ') as tous_les_emails
from auth.users
where email is not null;


-- 6. 🆕 Nouveaux inscrits depuis une date (pour éviter les doublons d'envoi)
-- ⬇️ Change la date pour celle de ton DERNIER envoi groupé.
select email, created_at::date as date_inscription
from auth.users
where created_at >= '2026-06-18'
  and email is not null
order by created_at desc;

-- Version "copier-coller" (Cci) des nouveaux uniquement :
select string_agg(email, ', ') as nouveaux_emails
from auth.users
where created_at >= '2026-06-18'
  and email is not null;
