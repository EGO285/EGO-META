/* =========================================================================
   EGO-META — Migration v4
   -------------------------------------------------------------------------
   Contenu : accès total de l'administrateur du site aux conversations.

   ⚠️ CHANGEMENT IMPORTANT DE CONFIDENTIALITÉ — à la demande explicite de
   Kylian (propriétaire du site), cette migration donne à tout compte marqué
   "is_site_admin" un accès en LECTURE à absolument toutes les conversations
   (messages privés, groupes, salons de communauté) de tous les membres, à
   tout moment — et non plus seulement aux outils de modération.

   Avant cette migration, un admin ne pouvait voir que les conversations
   dont il faisait lui-même partie (comme n'importe quel membre). Après :
   un admin peut parcourir n'importe quelle conversation depuis l'onglet
   "Conversations" du panneau d'administration (admin.html).

   Cet accès est :
   - LECTURE SEULE : un admin peut voir les messages, mais ne peut ni les
     envoyer, ni les modifier, ni se faire passer pour quelqu'un d'autre
     (aucune politique d'écriture n'est ajoutée ici).
   - non journalisé message par message (Kylian a explicitement choisi
     l'option "accès total à tout moment" plutôt que "accès limité aux
     signalements, avec journal détaillé").
   - documenté honnêtement dans privacy.html, que les membres peuvent lire.

   Si tu préfères revenir à l'ancien comportement (admin limité aux outils
   de modération, sans lecture des conversations d'autrui), il suffit de
   supprimer les 10 politiques "..._select_admin" créées ci-dessous
   (DROP POLICY "nom_de_la_politique" ON public.nom_de_la_table;) et de
   remettre à jour privacy.html en conséquence.
   ========================================================================= */

create policy "conversations_select_admin" on public.conversations for select
  using (public.is_site_admin());

create policy "conversation_members_select_admin" on public.conversation_members for select
  using (public.is_site_admin());

create policy "groups_select_admin" on public.groups for select
  using (public.is_site_admin());

create policy "communities_select_admin" on public.communities for select
  using (public.is_site_admin());

create policy "community_members_select_admin" on public.community_members for select
  using (public.is_site_admin());

create policy "channel_categories_select_admin" on public.channel_categories for select
  using (public.is_site_admin());

create policy "channels_select_admin" on public.channels for select
  using (public.is_site_admin());

create policy "messages_select_admin" on public.messages for select
  using (public.is_site_admin());

create policy "message_reactions_select_admin" on public.message_reactions for select
  using (public.is_site_admin());

create policy "message_mentions_select_admin" on public.message_mentions for select
  using (public.is_site_admin());

/* =========================================================================
   FIN DE LA MIGRATION V4
   ========================================================================= */
