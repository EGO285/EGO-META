/* =========================================================================
   EGO-META — Migration v3 (connexion Google/GitHub, transfert de message,
   messages favoris, conversations archivées, sondages, correctif sécurité
   invitation)
   -------------------------------------------------------------------------
   ⚠️ ADDITIF, à exécuter APRÈS schema.sql et migration_v2.sql (pas besoin
   de les rejouer). Une seule exécution, dans Supabase → SQL Editor → Run.
   ========================================================================= */

/* =========================================================================
   1. CORRECTIF DE SÉCURITÉ IMPORTANT — le code d'invitation n'était en
   réalité JAMAIS vérifié côté serveur.
   -------------------------------------------------------------------------
   En v1/v2, le contrôle du code d'invitation à l'inscription n'existait que
   côté interface (JS) : la fonction qui crée automatiquement le profil au
   moment de l'inscription (handle_new_user) ne vérifiait rien. N'importe qui
   connaissant l'existence du projet aurait pu créer un compte directement
   via l'API Supabase (en contournant le site) SANS code d'invitation valide,
   ce qui va à l'encontre du principe même du "cercle privé sur invitation"
   demandé dès le départ pour EGO-META.
   Correctif : la vérification et la consommation du code se font maintenant
   DANS le trigger serveur, de façon atomique. Un compte créé sans code
   valide est automatiquement mis en attente (is_banned=true,
   banned_reason='invite_required') jusqu'à ce qu'il active son compte avec
   un vrai code, via la nouvelle fonction activate_account_with_invite().
   Nécessaire aussi pour la connexion Google/GitHub (voir section 2) : ces
   fournisseurs ne permettent pas de transmettre un code d'invitation avant
   la création du compte, donc tout compte créé par leur biais démarre en
   attente et doit être activé après coup.
   ========================================================================= */

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_display text;
  v_invite text;
  v_valid boolean := false;
begin
  v_username := coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8));
  v_display := coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'username', 'Nouveau membre');
  v_invite := new.raw_user_meta_data->>'invite_code';

  if v_invite is not null then
    update public.invite_codes set uses = uses + 1
      where code = v_invite and uses < max_uses and (expires_at is null or expires_at > now())
      returning true into v_valid;
  end if;

  insert into public.profiles (id, username, display_name, avatar_url, is_banned, banned_reason)
  values (
    new.id, v_username, v_display, new.raw_user_meta_data->>'avatar_url',
    not coalesce(v_valid, false),
    case when not coalesce(v_valid, false) then 'invite_required' else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Active un compte créé sans code valide (typiquement : première connexion via
-- Google/GitHub) en lui faisant consommer un vrai code d'invitation après coup.
-- Refuse explicitement de "réactiver" un compte banni pour une autre raison
-- (harcèlement, spam...) — seul le motif technique 'invite_required' est concerné.
create or replace function public.activate_account_with_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_valid boolean := false;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and banned_reason = 'invite_required') then
    raise exception 'Ce compte n''est pas en attente d''activation.';
  end if;
  update public.invite_codes set uses = uses + 1
    where code = p_code and uses < max_uses and (expires_at is null or expires_at > now())
    returning true into v_valid;
  if not coalesce(v_valid, false) then
    raise exception 'Code d''invitation invalide ou expiré.';
  end if;
  update public.profiles set is_banned = false, banned_reason = null where id = auth.uid();
  return true;
end;
$$;

/* =========================================================================
   2. CONNEXION GOOGLE / GITHUB
   -------------------------------------------------------------------------
   Rien à créer côté base pour l'authentification elle-même (Supabase Auth
   la gère nativement) — voir README_OAUTH.md pour activer les fournisseurs
   côté tableau de bord Supabase et créer les identifiants gratuits chez
   Google/GitHub. Ce correctif de sécurité (section 1) est le seul
   changement de base de données réellement nécessaire pour que ce soit
   sûr à activer.
   ========================================================================= */

/* =========================================================================
   3. TRANSFÉRER UN MESSAGE
   ========================================================================= */

alter table public.messages add column if not exists forwarded_from_id uuid references public.messages(id) on delete set null;

/* =========================================================================
   4. MESSAGES FAVORIS (par utilisateur)
   ========================================================================= */

create table public.starred_messages (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  starred_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.starred_messages enable row level security;
create policy "starred_messages_select_own" on public.starred_messages for select using (user_id = auth.uid());
create policy "starred_messages_insert_own" on public.starred_messages for insert with check (user_id = auth.uid());
create policy "starred_messages_delete_own" on public.starred_messages for delete using (user_id = auth.uid());

/* =========================================================================
   5. CONVERSATIONS ARCHIVÉES
   ========================================================================= */

alter table public.conversation_members add column if not exists archived boolean not null default false;
-- Redonne le droit d'auto-mise à jour incluant la nouvelle colonne (le
-- correctif de migration_v2 avait déjà retiré le droit UPDATE global).
grant update (nickname, last_read_at, muted, muted_until, pinned, archived)
  on public.conversation_members to authenticated;

/* =========================================================================
   6. SONDAGES (groupes / communautés)
   ========================================================================= */

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  question text not null,
  options jsonb not null, -- ["Option A", "Option B", ...]
  allow_multiple boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index integer not null,
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id, option_index)
);
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

create policy "polls_select_member" on public.polls for select using (public.is_conversation_member(conversation_id));
create policy "polls_insert_member" on public.polls for insert with check (public.is_conversation_member(conversation_id) and created_by = auth.uid());
create policy "poll_votes_select_member" on public.poll_votes for select
  using (exists (select 1 from public.polls p where p.id = poll_id and public.is_conversation_member(p.conversation_id)));
create policy "poll_votes_insert_own" on public.poll_votes for insert
  with check (user_id = auth.uid() and exists (select 1 from public.polls p where p.id = poll_id and public.is_conversation_member(p.conversation_id) and (p.closes_at is null or p.closes_at > now())));
create policy "poll_votes_delete_own" on public.poll_votes for delete using (user_id = auth.uid());

create or replace function public.cast_poll_vote(p_poll_id uuid, p_option_index integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_allow_multiple boolean;
begin
  select allow_multiple into v_allow_multiple from public.polls where id = p_poll_id;
  if v_allow_multiple is null then raise exception 'Sondage introuvable'; end if;
  if not v_allow_multiple then
    delete from public.poll_votes where poll_id = p_poll_id and user_id = auth.uid();
  end if;
  insert into public.poll_votes (poll_id, user_id, option_index) values (p_poll_id, auth.uid(), p_option_index)
    on conflict do nothing;
end;
$$;

alter publication supabase_realtime add table public.polls;
alter publication supabase_realtime add table public.poll_votes;

/* =========================================================================
   FIN DE LA MIGRATION V3
   ========================================================================= */
