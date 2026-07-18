-- Déclencheur : appelle la fonction Edge "welcome-email" quand un utilisateur
-- vient de confirmer son adresse (email_confirmed_at passe de vide -> date),
-- ou est créé déjà confirmé. L'appel HTTP est ASYNCHRONE (pg_net) : il ne
-- ralentit ni ne bloque jamais l'inscription.

create extension if not exists pg_net;

create or replace function public.handle_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
begin
  -- On n'agit qu'au moment de la confirmation de l'adresse.
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    perform net.http_post(
      url := 'https://upeogpgczoghlfwblnkb.supabase.co/functions/v1/welcome-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', '7d61a5126977ada6911c03e68eacc703017554c08a58f2f8'
      ),
      body := jsonb_build_object(
        'record', jsonb_build_object(
          'email', new.email,
          'email_confirmed_at', new.email_confirmed_at
        ),
        'old_record', jsonb_build_object(
          'email_confirmed_at',
          case when tg_op = 'INSERT' then null else old.email_confirmed_at end
        )
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_welcome on auth.users;
create trigger on_auth_user_welcome
  after insert or update on auth.users
  for each row execute function public.handle_welcome_email();
