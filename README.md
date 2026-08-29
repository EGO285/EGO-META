# EGO-META

Une plateforme de messagerie façon WhatsApp/Discord pensée pour les communautés RP : comptes par email,
messages privés, groupes, communautés à salons multiples, système de rôles, XP/niveaux, tag-all, et un
panneau d'administration complet.

Voir **FEATURES.md** pour la liste détaillée des 102 fonctionnalités livrées.

📌 Vous avez déjà un site EGO-META en ligne et voulez juste appliquer la dernière mise à jour (connexion
Google/GitHub, transfert de message, favoris, archivage, sondages, nouvelles pages publiques, etc.) ?
Allez directement à **UPDATE_V3.md** (ou **UPDATE.md** si vous êtes encore en v1) — ce README couvre
l'installation complète depuis zéro.

Le site est un frontend statique (HTML/CSS/JS, aucun framework) qui parle directement à un projet
**Supabase** (base de données Postgres + authentification + temps réel + stockage de fichiers), gratuit
pour un cercle privé de cette taille. Tout se met en place en une quinzaine de minutes, sans écrire de
code serveur.

---

## 1. Créer votre projet Supabase

1. Allez sur [supabase.com](https://supabase.com) et créez un compte gratuit.
2. Cliquez sur **New project**. Choisissez un nom (ex: `ego-meta`), un mot de passe de base de données
   (gardez-le de côté, vous n'en aurez normalement plus besoin après), et une région proche de vous.
3. Attendez 1-2 minutes que le projet soit provisionné.

## 2. Installer le schéma de base de données

1. Dans le tableau de bord Supabase, ouvrez **SQL Editor** (menu de gauche).
2. Cliquez sur **New query**.
3. Ouvrez le fichier `sql/schema.sql` de ce dossier, copiez tout son contenu, collez-le dans l'éditeur.
4. Cliquez sur **Run**. Cela crée les 20 tables, toutes les règles de sécurité (RLS), les fonctions, les
   déclencheurs XP/notifications, et les buckets de stockage (`avatars`, `attachments`) en une seule fois.
5. Vérifiez qu'il n'y a pas d'erreur rouge dans la console de résultat. Un message de succès suffit.

## 3. Activer l'authentification par email

1. Allez dans **Authentication → Providers**, vérifiez que **Email** est activé (c'est le cas par défaut).
2. Dans **Authentication → Settings** :
   - Pour un cercle privé de test, vous pouvez désactiver "Confirm email" afin que les comptes soient
     utilisables immédiatement après inscription (pratique pour vos amis qui n'ont pas envie de vérifier
     leur boîte mail). Sinon laissez-le activé pour plus de sécurité — chacun devra cliquer sur le lien
     reçu par email avant de pouvoir se connecter.

## 4. Récupérer vos clés d'API

1. Allez dans **Project Settings → API**.
2. Copiez la **Project URL** et la clé **anon public**.
3. Ouvrez `js/config.js` dans ce dossier et remplacez les deux valeurs :

```js
const EGO_CONFIG = {
  supabaseUrl: "https://VOTRE-PROJET.supabase.co",   // → collez votre Project URL
  supabaseAnonKey: "VOTRE_CLE_ANON_PUBLIC",           // → collez votre clé anon public
  siteName: "EGO-META",
  inviteHint: "Demandez un code d'invitation à l'administrateur du site."
};
```

⚠️ La clé "anon public" est faite pour être exposée côté client, ce n'est pas un secret — ne confondez
pas avec la `service_role key` que vous ne devez **jamais** mettre dans ce fichier.

## 5. Créer votre premier code d'invitation

EGO-META est verrouillé par code d'invitation dès l'inscription (site pensé pour un cercle privé). Il
faut donc en créer un premier manuellement avant que quiconque puisse s'inscrire :

1. Dans Supabase, ouvrez **SQL Editor → New query** et lancez :

```sql
insert into public.invite_codes (code, max_uses, created_by)
values ('bienvenue2026', 50, null);
```

(Changez le code et le nombre d'utilisations max comme vous voulez. Vous pourrez en créer d'autres
directement depuis le panneau admin du site une fois connecté.)

## 6. Créer votre compte et devenir administrateur du site

1. Ouvrez `index.html` (voir section déploiement ci-dessous pour l'héberger), inscrivez-vous avec le
   code d'invitation créé à l'étape 5.
2. Une fois votre compte créé, retournez dans Supabase → **SQL Editor** et lancez (remplacez l'email) :

```sql
update public.profiles
set is_site_admin = true
where id = (select id from auth.users where email = 'votre-email@exemple.com');
```

3. Reconnectez-vous sur le site (ou rechargez la page) — vous avez maintenant accès à `admin.html`, le
   panneau d'administration complet du site.

## 7. Déployer le site

EGO-META est 100% statique (pas de serveur à héberger), le moyen le plus simple est **Netlify Drop** :

1. Allez sur [app.netlify.com/drop](https://app.netlify.com/drop).
2. Glissez-déposez le dossier complet `ego-meta` (avec `js/config.js` déjà rempli avec vos clés).
3. Netlify vous donne une URL en quelques secondes (ex: `https://ego-meta-xyz.netlify.app`). Partagez-la
   avec votre communauté.

Alternatives équivalentes : Vercel, GitHub Pages, Cloudflare Pages — tous fonctionnent puisqu'il n'y a
aucun code serveur à faire tourner, seulement des fichiers statiques.

## 8. Inviter vos membres

Envoyez-leur l'URL du site + le code d'invitation. Depuis le panneau admin (`admin.html` → onglet
**Codes d'invitation**), vous pouvez créer autant de codes que nécessaire, avec un nombre d'utilisations
maximum et une date d'expiration optionnelle.

---

## Structure du projet

```
ego-meta/
├── index.html              # Application principale (auth + messagerie)
├── admin.html               # Panneau d'administration du site
├── home.html                 # Page d'accueil publique (vitrine)
├── help.html                 # Centre d'aide public (recherche + FAQ)
├── terms.html                 # Conditions d'utilisation
├── privacy.html                # Politique de confidentialité
├── 404.html                    # Page d'erreur personnalisée
├── css/style.css            # Design système complet (thème noir/bleu foncé)
├── js/
│   ├── config.js             # ⚠️ À remplir avec vos clés Supabase (étape 4)
│   ├── supabase-client.js    # Initialisation du client Supabase
│   ├── utils.js               # Fonctions utilitaires (dates, toasts, modales...)
│   ├── xp.js                  # Calcul des niveaux/titres XP côté interface
│   ├── data.js                # Toute la couche d'accès aux données Supabase
│   ├── realtime.js            # Abonnements temps réel (messages, présence, typing)
│   ├── render.js              # Fonctions de rendu (listes, messages, membres)
│   ├── auth.js                # Logique des écrans de connexion/inscription
│   ├── app.js                 # Orchestrateur principal de l'application
│   └── admin-panel.js         # Logique du panneau admin
├── icons/                     # Icônes du site (favicon / icône de raccourci navigateur)
├── sql/
│   ├── schema.sql              # Schéma complet à exécuter dans Supabase (étape 2, installation initiale)
│   ├── migration_v2.sql        # Mise à jour additive v2 (voir UPDATE.md) — ne pas exécuter à l'installation initiale
│   ├── migration_v3.sql        # Mise à jour additive v3 (voir UPDATE_V3.md) — à exécuter après la v2
│   └── migration_v4.sql        # Mise à jour additive v4 (voir UPDATE_V4.md) — à exécuter après la v3
├── FEATURES.md                 # Liste détaillée des fonctionnalités
├── UPDATE.md                   # Guide de mise à jour v1 → v2
├── UPDATE_V3.md                 # Guide de mise à jour v2 → v3
├── UPDATE_V4.md                 # Guide de mise à jour v3 → v4 (dernière version)
├── README_OAUTH.md              # Guide pour activer la connexion Google/GitHub (gratuit)
└── README.md                   # Ce fichier
```

## Notes techniques

- **Sécurité** : toute la protection d'accès est appliquée côté base de données (Row Level Security +
  droits par colonne + fonctions serveur), pas seulement côté interface. Même un utilisateur qui
  bidouillerait les requêtes réseau ne peut pas s'auto-attribuer de l'XP, se déclarer admin, ou lire les
  messages d'une conversation dont il n'est pas membre.
- **XP** : chaque message envoyé rapporte de l'XP, avec un anti-spam de 10 secondes entre deux gains pour
  éviter le farming de niveau par spam. Les seuils de niveaux/titres sont éditables directement dans la
  table `level_titles` si vous voulez les personnaliser.
- **Temps réel** : messages, indicateurs de frappe, présence en ligne et notifications utilisent Supabase
  Realtime — aucune configuration supplémentaire n'est nécessaire, c'est activé par le script SQL.
- **Coût** : le plan gratuit de Supabase (500 Mo de base de données, 1 Go de stockage fichiers,
  50 000 utilisateurs actifs/mois) est largement suffisant pour un cercle privé de type communauté RP
  entre amis.
