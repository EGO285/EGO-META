# EGO-META — Mise à jour vers la v4

Tu as déjà un site EGO-META en ligne avec la v3 déjà appliquée ? Voici comment passer à cette
nouvelle mise à jour sans rien perdre.

## 1. Mettre à jour la base de données (une seule fois)

1. Va sur ton projet Supabase → **SQL Editor** → **New query**.
2. Ouvre le fichier `sql/migration_v4.sql` de ce dossier, copie tout son contenu, colle-le dans
   l'éditeur.
3. Clique sur **Run**.

⚠️ Important : ne relance ni `sql/schema.sql`, ni `sql/migration_v2.sql`, ni `sql/migration_v3.sql`
— `migration_v4.sql` est conçu pour s'ajouter proprement par-dessus ce qui existe déjà (il faut
simplement avoir déjà appliqué la v3 avant celle-ci).

Cette migration a été testée sur un Postgres local (rejeu complet de `schema.sql` +
`migration_v2.sql` + `migration_v3.sql` + `migration_v4.sql`, puis vérification RLS avec plusieurs
comptes simulés) avant d'être livrée — voir la section dédiée plus bas.

## 2. Redéployer le site

1. Le fichier `js/config.js` de ce dossier contient déjà tes clés Supabase actuelles — pas besoin
   de le retoucher.
2. Va sur **app.netlify.com/drop** et dépose le dossier `ego-meta` complet (celui-ci). Netlify
   remplace l'ancienne version automatiquement, en gardant la même URL.

## 3. C'est tout

Recharge ton site — les changements sont actifs immédiatement pour tous les membres déjà inscrits.

---

## Ce que cette mise à jour apporte

1. **Deux bugs mobile corrigés** :
   - Le fond décoratif (petits symboles en contour) était masqué par une couleur opaque sur mobile
     dès qu'une conversation était ouverte — il est désormais visible partout, comme sur PC.
   - Les actions sur un message (répondre, réagir, transférer, favoris, copier, modifier, épingler,
     supprimer) n'apparaissaient qu'au survol de la souris, donc invisibles au doigt sur mobile —
     elles s'affichent maintenant en permanence sous chaque message sur mobile.
2. **Toutes les icônes de l'interface remplacées par un jeu d'icônes vectorielles fait main**
   (`js/icons.js`), au lieu d'emoji dont l'apparence changeait selon l'appareil (Apple, Android,
   Windows ont chacun leur propre style d'emoji). Les icônes sont désormais strictement identiques
   sur PC et mobile. Les emoji restent utilisés normalement dans les messages, les réactions et la
   palette d'emoji du chat — ça, ça ne change pas.
3. **Barre de navigation mobile réorganisée.** Avant, les 9 icônes de vues (Messages, Groupes,
   Communautés, Stories, Amis, Notifications, Favoris, Archivées, Classement) plus l'avatar de
   profil étaient toutes entassées dans la même barre du bas, qui débordait — l'icône de profil
   (le dernier élément) devenait invisible/inaccessible sur beaucoup de téléphones. Désormais :
   4 vues principales + un bouton « ⋯ Plus » qui ouvre un panneau avec le reste + l'avatar de
   profil **toujours épinglé et visible**. Le panneau d'administration a aussi reçu sa propre mise
   en page mobile (la barre latérale débordait sur petit écran).
4. **Correctif du bug « je ne vois pas mes propres stories ».** En réalité, deux cercles de story
   quasi identiques cohabitaient quand tu avais une story active : le premier ouvrait toujours la
   création d'une nouvelle story, jamais l'existante — ta story semblait donc « invisible ». Il n'y
   a maintenant qu'un seul cercle pour ta story (avec un badge « + » séparé pour en ajouter une
   nouvelle), affiché en cercle comme celles des autres membres.
5. **Rafraîchissement visuel « épuré & pro »** : boutons à coins modérément arrondis plutôt qu'en
   pilule partout, ombres et couleurs resserrées, onglets des fenêtres de paramètres qui défilent
   au lieu de déborder sur petit écran — un rendu plus proche d'un outil "SaaS" moderne.
6. **Nouvel onglet « Conversations » dans le panneau d'administration**, avec un accès total en
   lecture à toutes les conversations du site (voir section dédiée ci-dessous — **changement de
   confidentialité important**).

---

## ⚠️ Changement de confidentialité important : accès admin total aux conversations

À ta demande explicite, cette mise à jour donne à ton compte administrateur (`is_site_admin`) un
accès en **lecture seule** à absolument toutes les conversations du site — privées, groupes et
salons de communauté — à tout moment, y compris celles dont tu ne fais pas partie. Avant cette
mise à jour, un administrateur ne pouvait voir que les outils de modération (bannissement,
signalements) et les conversations dont il était lui-même membre, comme n'importe quel membre.

Ce que ça permet concrètement : dans `admin.html` → onglet **Conversations**, tu peux chercher et
ouvrir n'importe quelle conversation du site pour en lire les messages.

Ce que ça ne permet pas : envoyer des messages à la place de quelqu'un, modifier ou supprimer les
messages des autres depuis cet onglet, ou voir les mots de passe (toujours chiffrés, même pour toi).

**J'ai mis à jour `privacy.html`** (section « 5. Qui peut voir tes données ») pour que tes membres
soient informés honnêtement de ce changement — c'est le principe déjà suivi depuis la v3 : ne
jamais documenter le site autrement que ce qu'il fait réellement. Relis cette page avant de
redéployer si tu veux ajuster la formulation.

Si tu changes d'avis plus tard et préfères revenir à l'ancien comportement (admin limité aux outils
de modération, sans lecture des conversations d'autrui), les instructions pour annuler cette
migration sont en commentaire en haut de `sql/migration_v4.sql`.

---

## Comment la migration a été testée

`migration_v4.sql` ajoute 10 nouvelles règles de sécurité (Row Level Security) au niveau de la base
de données — c'est ce mécanisme, pas le code de l'interface, qui décide réellement qui peut lire
quoi. Avant de te la livrer, elle a été rejouée sur un Postgres local (schéma complet + v2 + v3 +
v4) avec trois comptes simulés :
- Un administrateur **non-membre** d'une conversation privée entre deux autres comptes → confirmé
  qu'il peut bien lire cette conversation et ses messages (comportement voulu).
- Un membre normal de cette même conversation → confirmé qu'il continue de voir ses propres
  conversations normalement (pas de régression).
- Un compte ni administrateur ni membre → confirmé qu'il ne voit toujours **rien** de cette
  conversation (la confidentialité entre membres normaux n'est pas affectée par cette mise à jour).

## Limite honnête

Le rafraîchissement visuel de cette mise à jour porte sur les éléments transversaux (boutons,
onglets, navigation, densité) plutôt que sur une refonte pixel par pixel de chaque écran — une
refonte complète de chaque fenêtre du site est un chantier plus large que ce que cette mise à jour
couvre. Si des écrans précis te semblent encore à retravailler après avoir testé cette version,
dis-le-moi et on les reprend un par un.
