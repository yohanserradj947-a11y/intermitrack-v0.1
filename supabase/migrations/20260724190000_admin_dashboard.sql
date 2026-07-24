-- Tableau de bord admin PRIVÉ. Accès par CODE SECRET (dans l'URL, connu de Yohan seul) — pas de mot
-- de passe à taper. SECURITY DEFINER : la fonction lit tout, mais ne renvoie rien sans le bon code.
-- Exclut le compte de Yohan de tous les chiffres. Heures = estimées par sessions (gap > 30 min).
drop function if exists public.get_admin_dashboard();
drop function if exists public.get_admin_dashboard(text);
create or replace function public.get_admin_dashboard(pin text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text := 'itk-stats-2f9K4pR7qL';   -- ← ton code secret (change-le si tu veux)
  admin_email text := 'yohanserradj947@gmail.com';
  me uuid;
  result json;
begin
  if pin <> secret then raise exception 'Accès réservé'; end if;
  select id into me from auth.users where email = admin_email limit 1;

  with ev as (
    select user_id, created_at, (event_data->>'platform') as platform, event_name
    from analytics_events where user_id is distinct from me
  ),
  ordered as (select user_id, created_at, lag(created_at) over (partition by user_id order by created_at) as prev from ev),
  marked as (select user_id, created_at, case when prev is null or created_at - prev > interval '30 minutes' then 1 else 0 end as new_sess from ordered),
  sess as (select user_id, created_at, sum(new_sess) over (partition by user_id order by created_at) as sess_id from marked),
  sess_dur as (select user_id, sess_id, max(created_at) - min(created_at) as dur from sess group by user_id, sess_id)
  select json_build_object(
    'total_users', (select count(*) from auth.users where id <> me),
    'new_today',   (select count(*) from auth.users where id <> me and created_at >= date_trunc('day', now())),
    'new_7d',      (select count(*) from auth.users where id <> me and created_at >= now() - interval '7 days'),
    'new_30d',     (select count(*) from auth.users where id <> me and created_at >= now() - interval '30 days'),
    'dau', (select count(distinct user_id) from ev where created_at >= now() - interval '1 day'),
    'wau', (select count(distinct user_id) from ev where created_at >= now() - interval '7 days'),
    'mau', (select count(distinct user_id) from ev where created_at >= now() - interval '30 days'),
    'retention_7d', (select case when denom=0 then 0 else round(100.0*num/denom) end from (
        select count(*) filter (where u.created_at <= now() - interval '7 days') as denom,
               count(*) filter (where u.created_at <= now() - interval '7 days' and exists (select 1 from ev where ev.user_id=u.id and ev.created_at >= now() - interval '7 days')) as num
        from auth.users u where u.id <> me) r),
    'total_hours', (select coalesce(round((extract(epoch from sum(dur))/3600.0)::numeric,1),0) from sess_dur),
    'hours_per_user', (select case when count(distinct user_id)=0 then 0 else round((extract(epoch from sum(dur))/3600.0/count(distinct user_id))::numeric,1) end from sess_dur),
    'total_missions', (select count(*) from missions),
    'missions_per_user', (select case when (select count(*) from auth.users where id <> me)=0 then 0 else round((select count(*) from missions)::numeric/(select count(*) from auth.users where id <> me),1) end),
    'total_events', (select count(*) from ev),
    'qr_total', (select count(*) from qr_scans),
    'qr_today', (select count(*) from qr_scans where created_at >= date_trunc('day', now())),
    'qr_7d',    (select count(*) from qr_scans where created_at >= now() - interval '7 days'),
    'active_mobile_7d', (select count(distinct user_id) from ev where created_at >= now() - interval '7 days' and platform='mobile'),
    'active_web_7d', (select count(distinct user_id) from ev where created_at >= now() - interval '7 days' and platform is distinct from 'mobile'),
    'signups_by_day', (select coalesce(json_agg(d order by d->>'jour'),'[]'::json) from (
        select json_build_object('jour', to_char(date_trunc('day', created_at),'YYYY-MM-DD'), 'n', count(*)) as d
        from auth.users where id <> me and created_at >= now() - interval '30 days' group by date_trunc('day', created_at)) x),
    'top_views', (select coalesce(json_agg(t),'[]'::json) from (
        select replace(event_name,'view_','') as vue, count(*) as n from ev where event_name like 'view_%' group by event_name order by n desc limit 10) t)
  ) into result;
  return result;
end $$;

grant execute on function public.get_admin_dashboard(text) to anon, authenticated;
