/* =========================================================================
   EGO-META — Migration v2 (améliorations : stories, messages vocaux,
   icônes de groupe/communauté, épingler/mute, suppression pour moi,
   mode lent, champs de profil étendus)
   -------------------------------------------------------------------------
   ⚠️ Ce script est ADDITIF : il ne remplace PAS schema.sql, il vient
   compléter une base EGO-META déjà installée. Ne réexécutez PAS schema.sql
   (vous perdriez toutes les données existantes / obtiendriez des erreurs
   "already exists"). Exécutez uniquement ce fichier, une seule fois,
   dans Supabase → SQL Editor → New query → Run.
   ========================================================================= */

/* =========================================================================
   1. CORRECTIF DE SÉCURITÉ — auto-promotion de rôle dans une conversation
   -------------------------------------------------------------------------
   La policy "conversation_members_update_self" (v1) autorisait un membre à
   modifier N'IMPORTE QUELLE colonne de sa propre ligne, y compris `role`.
   Un utilisateur malveillant aurait pu s'auto-promouvoir "owner" d'un
   groupe/salon en écrivant directement sur la table (en contournant le RPC
   set_conversation_role). Comme pour `profiles` en v1, on applique le même
   principe de défense en profondeur : retirer le droit UPDATE global puis
   ne le redonner que sur les colonnes réellement personnelles.
   ========================================================================= */

revoke update on public.conversation_members from authenticated, anon;

alter table public.conversation_members add column if not exists pinned boolean not null default false;
alter table public.conversation_members add column if not exists muted_until timestamptz;

grant update (nickname, last_read_at, muted, muted_until, pinned)
  on public.conversation_members to authenticated;

/* =========================================================================
   2. PROFILS — champs étendus (pronoms, personnage RP)
   ========================================================================= */

alter table public.profiles add column if not exists pronouns text not null default '';
alter table public.profiles add column if not exists rp_character text not null default '';

grant update (pronouns, rp_character) on public.profiles to authenticated;

/* =========================================================================
   3. SALONS — mode lent (anti-spam) + policy de mise à jour manquante
   -------------------------------------------------------------------------
   En v1, aucune policy UPDATE n'existait sur `channels` : impossible de
   renommer/modifier un salon après sa création. On l'ajoute, réservée aux
   owner/admin de la communauté.
   ========================================================================= */

alter table public.channels add column if not exists slow_mode_seconds integer not null default 0;

create policy "channels_update_owner_admin" on public.channels for update
  using (public.community_role(community_id) in ('owner','admin'));

-- Application du mode lent CÔTÉ SERVEUR (indispensable : la vérification faite
-- dans l'interface est seulement un confort, un utilisateur pourrait sinon la
-- contourner en appelant directement l'API). Owner/admin de la communauté
-- exemptés.
create or replace function public.enforce_slow_mode()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_slow integer;
  v_community uuid;
  v_role text;
  v_last timestamptz;
begin
  select ch.slow_mode_seconds, ch.community_id into v_slow, v_community
    from public.channels ch where ch.conversation_id = new.conversation_id;

  if v_slow is null or v_slow <= 0 then return new; end if;

  v_role := public.community_role(v_community);
  if v_role in ('owner','admin') then return new; end if;

  select max(created_at) into v_last from public.messages
    where conversation_id = new.conversation_id and sender_id = new.sender_id;

  if v_last is not null and v_last > now() - make_interval(secs => v_slow) then
    raise exception 'Mode lent actif sur ce salon : merci de patienter avant de renvoyer un message.';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_slow_mode
  before insert on public.messages
  for each row execute function public.enforce_slow_mode();

/* =========================================================================
   4. STORIES (24h) — publication, expiration automatique par filtrage,
   suivi des vues
   ========================================================================= */

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text,
  media_type text not null default 'image' check (media_type in ('image','video','text')),
  caption text not null default '',
  bg_color text not null default '#4c86d6',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index stories_user_idx on public.stories (user_id, created_at desc);
create index stories_expires_idx on public.stories (expires_at);

create table public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

-- Visible par tout le monde (site privé sur invitation) tant que non expirée
-- et que l'auteur ne vous a pas bloqué / que vous n'avez pas bloqué l'auteur.
create policy "stories_select_active_not_blocked" on public.stories for select
  using (expires_at > now() and not public.are_blocked(auth.uid(), user_id));
-- L'auteur voit toujours ses propres stories (même expirées, pour son historique).
create policy "stories_select_own" on public.stories for select
  using (user_id = auth.uid());
create policy "stories_insert_own" on public.stories for insert with check (user_id = auth.uid());
create policy "stories_delete_own" on public.stories for delete using (user_id = auth.uid());

create policy "story_views_select_own_or_author" on public.story_views for select
  using (
    viewer_id = auth.uid()
    or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
  );
create policy "story_views_insert_own" on public.story_views for insert
  with check (viewer_id = auth.uid());

create or replace function public.mark_story_viewed(p_story_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.story_views (story_id, viewer_id) values (p_story_id, auth.uid())
  on conflict (story_id, viewer_id) do nothing;
end;
$$;

alter publication supabase_realtime add table public.stories;

/* =========================================================================
   5. SUPPRESSION DE MESSAGE "POUR MOI"
   -------------------------------------------------------------------------
   La suppression "pour tout le monde" existait déjà en v1 (met le message à
   deleted=true, réservé à l'auteur ou à un modérateur — via la policy
   messages_update_sender_or_mod). Ceci ajoute la suppression "pour moi
   uniquement" : le message reste intact pour les autres, seul votre client
   le masque.
   ========================================================================= */

create table public.message_hidden_for (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_hidden_for enable row level security;

create policy "message_hidden_for_select_own" on public.message_hidden_for for select using (user_id = auth.uid());
create policy "message_hidden_for_insert_own" on public.message_hidden_for for insert with check (user_id = auth.uid());
create policy "message_hidden_for_delete_own" on public.message_hidden_for for delete using (user_id = auth.uid());

/* =========================================================================
   6. STOCKAGE — icônes de groupe/communauté + médias de stories
   ========================================================================= */

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('stories', 'stories', true) on conflict (id) do nothing;

create policy "media_public_read" on storage.objects for select using (bucket_id = 'media');

-- Chemin attendu : media/group/<conversation_id>/xxx  (owner/admin du groupe uniquement)
create policy "media_group_icon_insert" on storage.objects for insert
  with check (
    bucket_id = 'media' and (storage.foldername(name))[1] = 'group'
    and public.conversation_role(((storage.foldername(name))[2])::uuid) in ('owner','admin')
  );
create policy "media_group_icon_update" on storage.objects for update
  using (
    bucket_id = 'media' and (storage.foldername(name))[1] = 'group'
    and public.conversation_role(((storage.foldername(name))[2])::uuid) in ('owner','admin')
  );

-- Chemin attendu : media/community/<community_id>/xxx (owner/admin de la communauté uniquement)
create policy "media_community_icon_insert" on storage.objects for insert
  with check (
    bucket_id = 'media' and (storage.foldername(name))[1] = 'community'
    and public.community_role(((storage.foldername(name))[2])::uuid) in ('owner','admin')
  );
create policy "media_community_icon_update" on storage.objects for update
  using (
    bucket_id = 'media' and (storage.foldername(name))[1] = 'community'
    and public.community_role(((storage.foldername(name))[2])::uuid) in ('owner','admin')
  );

create policy "stories_media_public_read" on storage.objects for select using (bucket_id = 'stories');
create policy "stories_media_own_upload" on storage.objects for insert
  with check (bucket_id = 'stories' and auth.role() = 'authenticated' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "stories_media_own_delete" on storage.objects for delete
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);

/* =========================================================================
   FIN DE LA MIGRATION V2
   ========================================================================= */
