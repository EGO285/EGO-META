/* =========================================================================
   EGO-META — Schéma de base de données complet (Supabase / PostgreSQL)
   -------------------------------------------------------------------------
   À exécuter dans : Supabase → SQL Editor → New query → coller tout ce
   fichier → Run. Voir README.md pour le guide complet pas à pas.
   ========================================================================= */

create extension if not exists "pgcrypto";

/* =========================================================================
   1. PROFILS
   ========================================================================= */

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  accent_color text not null default '#4c86d6',
  theme text not null default 'dark' check (theme in ('dark','light')),
  status text not null default 'online' check (status in ('online','away','dnd','offline')),
  status_message text not null default '',
  dm_privacy text not null default 'everyone' check (dm_privacy in ('everyone','friends_only','nobody')),
  xp integer not null default 0,
  level integer not null default 1,
  title text not null default 'Nouveau venu',
  last_xp_at timestamptz,
  is_site_admin boolean not null default false,
  is_banned boolean not null default false,
  banned_reason text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index profiles_username_idx on public.profiles (username);

/* =========================================================================
   2. CODES D'INVITATION (inscription sur invitation, cercle privé)
   ========================================================================= */

create table public.invite_codes (
  code text primary key,
  created_by uuid references public.profiles(id) on delete set null,
  max_uses integer not null default 1,
  uses integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

/* =========================================================================
   3. AMIS / BLOCAGES
   ========================================================================= */

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (from_user, to_user)
);

create table public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

/* =========================================================================
   4. CONVERSATIONS (backbone unifié : DM / groupe / salon de communauté)
   ========================================================================= */

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dm','group','channel')),
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  nickname text,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.groups (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  name text not null,
  description text not null default '',
  icon_url text,
  owner_id uuid not null references public.profiles(id),
  invite_code text unique,
  only_admins_can_tag_all boolean not null default true,
  created_at timestamptz not null default now()
);

/* =========================================================================
   5. COMMUNAUTÉS (façon "serveurs") + salons
   ========================================================================= */

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  icon_url text,
  banner_url text,
  owner_id uuid not null references public.profiles(id),
  is_public boolean not null default false,
  invite_code text unique,
  created_at timestamptz not null default now()
);

create table public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  nickname text,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index community_members_user_idx on public.community_members (user_id);

create table public.channel_categories (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  position integer not null default 0
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  category_id uuid references public.channel_categories(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  name text not null,
  description text not null default '',
  position integer not null default 0,
  only_admins_can_tag_all boolean not null default true,
  created_at timestamptz not null default now()
);

/* =========================================================================
   6. MESSAGES
   ========================================================================= */

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  content text,
  attachment_url text,
  attachment_type text,
  reply_to_id uuid references public.messages(id) on delete set null,
  is_tag_all boolean not null default false,
  edited_at timestamptz,
  deleted boolean not null default false,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.message_mentions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (message_id, user_id)
);

/* =========================================================================
   7. NOTIFICATIONS
   ========================================================================= */

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('mention','tag_all','friend_request','friend_accept','group_invite','community_invite','system')),
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

/* =========================================================================
   8. SIGNALEMENTS / MODÉRATION / ADMIN
   ========================================================================= */

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('user','message')),
  target_user_id uuid references public.profiles(id),
  target_message_id uuid references public.messages(id),
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.site_settings (
  id boolean primary key default true check (id),
  site_name text not null default 'EGO-META',
  announcement text not null default '',
  announcement_active boolean not null default false,
  maintenance_mode boolean not null default false,
  signup_requires_invite boolean not null default true
);
insert into public.site_settings (id) values (true);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id),
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

/* =========================================================================
   9. XP / NIVEAUX / TITRES RP
   ========================================================================= */

create table public.level_titles (
  level integer primary key,
  title text not null,
  xp_required integer not null
);

insert into public.level_titles (level, title, xp_required) values
(1, 'Nouveau venu', 0),
(2, 'Apprenti Roleplayer', 50),
(3, 'Conteur en herbe', 150),
(4, 'Interprète confirmé', 300),
(5, 'Plume assidue', 500),
(6, 'Narrateur talentueux', 800),
(7, 'Vétéran du RP', 1200),
(8, 'Maître du lore', 1700),
(9, 'Architecte de mondes', 2300),
(10, 'Légende vivante d''EGO-META', 3000);

/* =========================================================================
   10. FONCTIONS UTILITAIRES (sécurité)
   ========================================================================= */

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;

create or replace function public.conversation_role(p_conversation_id uuid)
returns text language sql security definer stable set search_path = public as $$
  select role from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid();
$$;

create or replace function public.is_community_member(p_community_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_community_id and user_id = auth.uid()
  );
$$;

create or replace function public.community_role(p_community_id uuid)
returns text language sql security definer stable set search_path = public as $$
  select role from public.community_members
    where community_id = p_community_id and user_id = auth.uid();
$$;

create or replace function public.is_site_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_site_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.are_blocked(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_user_a and blocked_id = p_user_b)
       or (blocker_id = p_user_b and blocked_id = p_user_a)
  );
$$;

/* =========================================================================
   11. TRIGGERS AUTOMATIQUES
   ========================================================================= */

-- 11.1 Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', 'Nouveau membre')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 11.2 Protection des colonnes sensibles du profil (xp, niveau, admin, ban)
-- NOTE : on protège ces colonnes au niveau PRIVILÈGES (GRANT/REVOKE, section 13)
-- plutôt que par trigger, pour éviter qu'un trigger de protection ne bloque
-- aussi les écritures légitimes faites par nos propres fonctions internes
-- (ex: award_message_xp) qui agissent "au nom" de l'utilisateur courant.

-- 11.3 Attribution automatique d'XP à l'envoi d'un message (anti-spam : 1 gain / 10s)
create or replace function public.award_message_xp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_last timestamptz;
  v_xp integer;
  v_level integer;
  v_title text;
begin
  select last_xp_at into v_last from public.profiles where id = new.sender_id;
  if v_last is null or now() - v_last > interval '10 seconds' then
    update public.profiles
      set xp = xp + 2, last_xp_at = now()
      where id = new.sender_id
      returning xp into v_xp;
    select level, title into v_level, v_title
      from public.level_titles where xp_required <= v_xp
      order by xp_required desc limit 1;
    if v_level is not null then
      update public.profiles set level = v_level, title = v_title where id = new.sender_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger award_message_xp_trigger
  after insert on public.messages
  for each row execute procedure public.award_message_xp();

-- 11.4 Notification de mention individuelle
create or replace function public.notify_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sender uuid;
begin
  select sender_id into v_sender from public.messages where id = new.message_id;
  if new.user_id <> v_sender then
    insert into public.notifications (user_id, type, payload)
    values (new.user_id, 'mention', jsonb_build_object('message_id', new.message_id));
  end if;
  return new;
end;
$$;

create trigger notify_mention_trigger
  after insert on public.message_mentions
  for each row execute procedure public.notify_mention();

-- 11.5 Notification de tag-all (@everyone)
create or replace function public.notify_tag_all()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_tag_all then
    insert into public.notifications (user_id, type, payload)
    select cm.user_id, 'tag_all', jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id)
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id;
  end if;
  return new;
end;
$$;

create trigger notify_tag_all_trigger
  after insert on public.messages
  for each row execute procedure public.notify_tag_all();

/* =========================================================================
   12. FONCTIONS RPC (actions applicatives sécurisées)
   ========================================================================= */

-- 12.1 Rejoindre / créer une conversation DM
create or replace function public.create_dm(p_other_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
  v_privacy text;
  v_are_friends boolean;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  if v_me = p_other_user then raise exception 'Impossible de démarrer une conversation avec soi-même'; end if;
  if public.are_blocked(v_me, p_other_user) then raise exception 'Conversation impossible (blocage)'; end if;

  select dm_privacy into v_privacy from public.profiles where id = p_other_user;
  if v_privacy = 'nobody' then raise exception 'Cet utilisateur n''accepte aucun message privé'; end if;
  if v_privacy = 'friends_only' then
    select exists(
      select 1 from public.friendships
      where (user_a = least(v_me,p_other_user) and user_b = greatest(v_me,p_other_user))
    ) into v_are_friends;
    if not v_are_friends then raise exception 'Cet utilisateur n''accepte les messages que de ses amis'; end if;
  end if;

  select c.id into v_conv
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_me
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = p_other_user
  where c.type = 'dm'
  limit 1;

  if v_conv is not null then return v_conv; end if;

  insert into public.conversations (type) values ('dm') returning id into v_conv;
  insert into public.conversation_members (conversation_id, user_id) values (v_conv, v_me), (v_conv, p_other_user);
  return v_conv;
end;
$$;

-- 12.2 Créer un groupe
create or replace function public.create_group(p_name text, p_description text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  insert into public.conversations (type) values ('group') returning id into v_conv;
  insert into public.groups (conversation_id, name, description, owner_id, invite_code)
    values (v_conv, p_name, p_description, v_me, substr(md5(random()::text), 1, 8));
  insert into public.conversation_members (conversation_id, user_id, role) values (v_conv, v_me, 'owner');
  return v_conv;
end;
$$;

-- 12.3 Rejoindre un groupe via code d'invitation
create or replace function public.join_group_by_invite(p_invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  select conversation_id into v_conv from public.groups where invite_code = p_invite_code;
  if v_conv is null then raise exception 'Code d''invitation invalide'; end if;
  insert into public.conversation_members (conversation_id, user_id)
    values (v_conv, v_me) on conflict do nothing;
  return v_conv;
end;
$$;

-- 12.4 Quitter une conversation (groupe ou DM)
create or replace function public.leave_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

-- 12.5 Exclure un membre (owner/admin uniquement)
create or replace function public.kick_member(p_conversation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.conversation_role(p_conversation_id) not in ('owner','admin') then
    raise exception 'Permission refusée';
  end if;
  delete from public.conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id;
end;
$$;

-- 12.6 Changer le rôle d'un membre dans un groupe
create or replace function public.set_conversation_role(p_conversation_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.conversation_role(p_conversation_id) <> 'owner' then
    raise exception 'Seul le propriétaire peut changer les rôles';
  end if;
  update public.conversation_members set role = p_role
    where conversation_id = p_conversation_id and user_id = p_user_id;
end;
$$;

-- 12.7 Créer une communauté
create or replace function public.create_community(p_name text, p_description text default '', p_is_public boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_general_conv uuid;
  v_cat uuid;
begin
  if v_me is null then raise exception 'Non authentifié'; end if;
  insert into public.communities (name, description, owner_id, is_public, invite_code)
    values (p_name, p_description, v_me, p_is_public, substr(md5(random()::text), 1, 8))
    returning id into v_id;
  insert into public.community_members (community_id, user_id, role) values (v_id, v_me, 'owner');

  insert into public.channel_categories (community_id, name, position) values (v_id, 'Général', 0) returning id into v_cat;
  insert into public.conversations (type) values ('channel') returning id into v_general_conv;
  insert into public.conversation_members (conversation_id, user_id, role) values (v_general_conv, v_me, 'owner');
  insert into public.channels (community_id, category_id, conversation_id, name, position)
    values (v_id, v_cat, v_general_conv, 'général', 0);

  return v_id;
end;
$$;

-- 12.8 Rejoindre une communauté publique
create or replace function public.join_community(p_community_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_public boolean;
  v_chan record;
begin
  select is_public into v_public from public.communities where id = p_community_id;
  if not coalesce(v_public, false) then raise exception 'Cette communauté est privée'; end if;
  insert into public.community_members (community_id, user_id) values (p_community_id, v_me) on conflict do nothing;
  for v_chan in select conversation_id from public.channels where community_id = p_community_id loop
    insert into public.conversation_members (conversation_id, user_id) values (v_chan.conversation_id, v_me) on conflict do nothing;
  end loop;
end;
$$;

-- 12.9 Rejoindre une communauté via code d'invitation (privée ou publique)
create or replace function public.join_community_by_invite(p_invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_chan record;
begin
  select id into v_id from public.communities where invite_code = p_invite_code;
  if v_id is null then raise exception 'Code d''invitation invalide'; end if;
  insert into public.community_members (community_id, user_id) values (v_id, v_me) on conflict do nothing;
  for v_chan in select conversation_id from public.channels where community_id = v_id loop
    insert into public.conversation_members (conversation_id, user_id) values (v_chan.conversation_id, v_me) on conflict do nothing;
  end loop;
  return v_id;
end;
$$;

-- 12.10 Créer un salon dans une communauté (owner/admin)
create or replace function public.create_channel(p_community_id uuid, p_name text, p_category_id uuid default null, p_description text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid;
  v_member record;
begin
  if public.community_role(p_community_id) not in ('owner','admin') then
    raise exception 'Permission refusée';
  end if;
  insert into public.conversations (type) values ('channel') returning id into v_conv;
  insert into public.channels (community_id, category_id, conversation_id, name, description)
    values (p_community_id, p_category_id, v_conv, p_name, p_description);
  for v_member in select user_id, role from public.community_members where community_id = p_community_id loop
    insert into public.conversation_members (conversation_id, user_id, role) values (v_conv, v_member.user_id, v_member.role);
  end loop;
  return v_conv;
end;
$$;

-- 12.11 Changer le rôle d'un membre de communauté (owner/admin)
create or replace function public.set_community_role(p_community_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.community_role(p_community_id) not in ('owner','admin') then
    raise exception 'Permission refusée';
  end if;
  update public.community_members set role = p_role where community_id = p_community_id and user_id = p_user_id;
  update public.conversation_members cm set role = p_role
    from public.channels ch
    where ch.community_id = p_community_id and cm.conversation_id = ch.conversation_id and cm.user_id = p_user_id;
end;
$$;

-- 12.12 Exclure un membre d'une communauté (owner/admin)
create or replace function public.kick_community_member(p_community_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.community_role(p_community_id) not in ('owner','admin') then
    raise exception 'Permission refusée';
  end if;
  delete from public.community_members where community_id = p_community_id and user_id = p_user_id;
  delete from public.conversation_members cm
    using public.channels ch
    where ch.community_id = p_community_id and cm.conversation_id = ch.conversation_id and cm.user_id = p_user_id;
end;
$$;

-- 12.13 Demande d'ami
create or replace function public.send_friend_request(p_to_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me = p_to_user then raise exception 'Action impossible'; end if;
  if public.are_blocked(v_me, p_to_user) then raise exception 'Action impossible'; end if;
  insert into public.friend_requests (from_user, to_user)
    values (v_me, p_to_user)
    on conflict (from_user, to_user) do update set status = 'pending'
    returning id into v_id;
  insert into public.notifications (user_id, type, payload)
    values (p_to_user, 'friend_request', jsonb_build_object('from_user', v_me));
  return v_id;
end;
$$;

-- 12.14 Accepter une demande d'ami
create or replace function public.accept_friend_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_from uuid; v_to uuid;
begin
  select from_user, to_user into v_from, v_to from public.friend_requests
    where id = p_request_id and to_user = auth.uid() and status = 'pending';
  if v_from is null then raise exception 'Demande introuvable'; end if;
  update public.friend_requests set status = 'accepted' where id = p_request_id;
  insert into public.friendships (user_a, user_b) values (least(v_from,v_to), greatest(v_from,v_to))
    on conflict do nothing;
  insert into public.notifications (user_id, type, payload)
    values (v_from, 'friend_accept', jsonb_build_object('by_user', v_to));
end;
$$;

-- 12.15 Refuser une demande d'ami
create or replace function public.decline_friend_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.friend_requests set status = 'declined'
    where id = p_request_id and to_user = auth.uid();
end;
$$;

-- 12.16 Valider / consommer un code d'invitation au site (après inscription)
create or replace function public.redeem_invite_code(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_row public.invite_codes%rowtype;
begin
  select * into v_row from public.invite_codes where code = p_code for update;
  if v_row.code is null then return false; end if;
  if v_row.expires_at is not null and v_row.expires_at < now() then return false; end if;
  if v_row.uses >= v_row.max_uses then return false; end if;
  update public.invite_codes set uses = uses + 1 where code = p_code;
  return true;
end;
$$;

-- 12.17 Marquer une conversation comme lue
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

-- 12.18 Admin : bannir / débannir un utilisateur
create or replace function public.admin_ban_user(p_user_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Permission refusée'; end if;
  update public.profiles set is_banned = true, banned_reason = p_reason where id = p_user_id;
  insert into public.audit_log (admin_id, action, target, details)
    values (auth.uid(), 'ban_user', p_user_id::text, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_unban_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Permission refusée'; end if;
  update public.profiles set is_banned = false, banned_reason = null where id = p_user_id;
  insert into public.audit_log (admin_id, action, target)
    values (auth.uid(), 'unban_user', p_user_id::text);
end;
$$;

-- 12.19 Admin : annonce globale / mode maintenance
create or replace function public.admin_set_announcement(p_text text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Permission refusée'; end if;
  update public.site_settings set announcement = p_text, announcement_active = p_active where id = true;
  insert into public.audit_log (admin_id, action, details)
    values (auth.uid(), 'set_announcement', jsonb_build_object('text', p_text, 'active', p_active));
end;
$$;

create or replace function public.admin_toggle_maintenance(p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Permission refusée'; end if;
  update public.site_settings set maintenance_mode = p_active where id = true;
  insert into public.audit_log (admin_id, action, details)
    values (auth.uid(), 'toggle_maintenance', jsonb_build_object('active', p_active));
end;
$$;

-- 12.20 Admin : résoudre un signalement
create or replace function public.admin_resolve_report(p_report_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Permission refusée'; end if;
  update public.reports set status = p_status, resolved_by = auth.uid() where id = p_report_id;
  insert into public.audit_log (admin_id, action, target, details)
    values (auth.uid(), 'resolve_report', p_report_id::text, jsonb_build_object('status', p_status));
end;
$$;

-- 12.21 Admin : créer un code d'invitation
create or replace function public.admin_create_invite_code(p_code text, p_max_uses integer default 1, p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Permission refusée'; end if;
  insert into public.invite_codes (code, created_by, max_uses, expires_at)
    values (p_code, auth.uid(), p_max_uses, p_expires_at);
end;
$$;

/* =========================================================================
   13. ROW LEVEL SECURITY
   ========================================================================= */

alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.groups enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.channel_categories enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_mentions enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.site_settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.level_titles enable row level security;

-- profiles
create policy "profiles_select_authenticated" on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_self_or_admin" on public.profiles for update
  using (auth.uid() = id or public.is_site_admin())
  with check (auth.uid() = id or public.is_site_admin());

-- Verrouillage des colonnes sensibles : même si la ligne est modifiable par
-- son propriétaire (policy ci-dessus), ces colonnes précises doivent rester
-- interdites en écriture directe depuis le client (anon/authenticated).
-- IMPORTANT (piège Postgres) : un simple `revoke update (colonnes) ... from
-- authenticated` ne suffit PAS si authenticated possède déjà un GRANT UPDATE
-- au niveau de toute la table (ce qui est le cas par défaut sur Supabase) —
-- le privilège large reste prioritaire. Il faut donc retirer le privilège
-- UPDATE global sur la table, puis le regrant uniquement sur les colonnes
-- autorisées. Nos fonctions internes (SECURITY DEFINER, propriétaire =
-- postgres) restent non affectées, car ces privilèges ne s'appliquent pas
-- au propriétaire de la table.
revoke update on public.profiles from authenticated, anon;
grant update (
  username, display_name, bio, avatar_url, accent_color, theme,
  status, status_message, dm_privacy
) on public.profiles to authenticated;

-- invite_codes (lecture publique pour validation à l'inscription ; écriture via RPC admin uniquement)
create policy "invite_codes_select_all" on public.invite_codes for select using (true);

-- friend_requests
create policy "friend_requests_select_involved" on public.friend_requests for select
  using (auth.uid() = from_user or auth.uid() = to_user);
create policy "friend_requests_insert_self" on public.friend_requests for insert
  with check (auth.uid() = from_user);
create policy "friend_requests_update_involved" on public.friend_requests for update
  using (auth.uid() = to_user or auth.uid() = from_user);

-- friendships
create policy "friendships_select_involved" on public.friendships for select
  using (auth.uid() = user_a or auth.uid() = user_b);
create policy "friendships_delete_involved" on public.friendships for delete
  using (auth.uid() = user_a or auth.uid() = user_b);

-- blocks
create policy "blocks_select_own" on public.blocks for select using (auth.uid() = blocker_id);
create policy "blocks_insert_own" on public.blocks for insert with check (auth.uid() = blocker_id);
create policy "blocks_delete_own" on public.blocks for delete using (auth.uid() = blocker_id);

-- conversations
create policy "conversations_select_member" on public.conversations for select
  using (public.is_conversation_member(id));

-- conversation_members
create policy "conversation_members_select_member" on public.conversation_members for select
  using (public.is_conversation_member(conversation_id));
create policy "conversation_members_update_self" on public.conversation_members for update
  using (auth.uid() = user_id);

-- groups
create policy "groups_select_member" on public.groups for select
  using (public.is_conversation_member(conversation_id));
create policy "groups_update_owner_admin" on public.groups for update
  using (public.conversation_role(conversation_id) in ('owner','admin'));

-- communities
create policy "communities_select_public_or_member" on public.communities for select
  using (is_public or public.is_community_member(id));
create policy "communities_update_owner_admin" on public.communities for update
  using (public.community_role(id) in ('owner','admin'));

-- community_members
create policy "community_members_select_public_or_member" on public.community_members for select
  using (
    public.is_community_member(community_id)
    or exists (select 1 from public.communities c where c.id = community_id and c.is_public)
  );

-- channel_categories / channels
create policy "channel_categories_select_member" on public.channel_categories for select
  using (public.is_community_member(community_id) or exists (select 1 from public.communities c where c.id = community_id and c.is_public));
create policy "channels_select_member" on public.channels for select
  using (public.is_community_member(community_id) or exists (select 1 from public.communities c where c.id = community_id and c.is_public));

-- messages
create policy "messages_select_member" on public.messages for select
  using (public.is_conversation_member(conversation_id));
create policy "messages_insert_member" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and not coalesce((select is_banned from public.profiles where id = auth.uid()), false)
  );
create policy "messages_update_sender_or_mod" on public.messages for update
  using (
    sender_id = auth.uid()
    or public.conversation_role(conversation_id) in ('owner','admin','moderator')
  );

-- message_reactions
create policy "reactions_select_member" on public.message_reactions for select
  using (exists (
    select 1 from public.messages m where m.id = message_id and public.is_conversation_member(m.conversation_id)
  ));
create policy "reactions_insert_self" on public.message_reactions for insert with check (auth.uid() = user_id);
create policy "reactions_delete_self" on public.message_reactions for delete using (auth.uid() = user_id);

-- message_mentions
create policy "mentions_select_member" on public.message_mentions for select
  using (exists (
    select 1 from public.messages m where m.id = message_id and public.is_conversation_member(m.conversation_id)
  ));
create policy "mentions_insert_sender" on public.message_mentions for insert
  with check (exists (
    select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid()
  ));

-- notifications
create policy "notifications_select_own" on public.notifications for select using (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications for update using (auth.uid() = user_id);

-- reports
create policy "reports_insert_self" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "reports_select_own_or_admin" on public.reports for select
  using (auth.uid() = reporter_id or public.is_site_admin());
create policy "reports_update_admin" on public.reports for update using (public.is_site_admin());

-- site_settings
create policy "site_settings_select_all" on public.site_settings for select using (true);

-- audit_log
create policy "audit_log_select_admin" on public.audit_log for select using (public.is_site_admin());

-- level_titles (référence publique en lecture)
create policy "level_titles_select_all" on public.level_titles for select using (true);

/* =========================================================================
   14. REALTIME (diffusion en direct)
   ========================================================================= */

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.conversation_members;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.community_members;

/* =========================================================================
   15. STOCKAGE (photos de profil, pièces jointes)
   ========================================================================= */

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true) on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_own_upload" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_own_update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_own_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "attachments_public_read" on storage.objects for select using (bucket_id = 'attachments');
create policy "attachments_own_upload" on storage.objects for insert
  with check (bucket_id = 'attachments' and auth.role() = 'authenticated' and (storage.foldername(name))[1] = auth.uid()::text);

/* =========================================================================
   FIN — Pensez à créer votre premier code d'invitation ET votre premier
   compte admin (voir README.md, sections 4 et 5).
   ========================================================================= */
