# EGO-META — Mise à jour vers la v3 (Phase 1 Premium)

Tu as déjà un site EGO-META en ligne avec la v2 déjà appliquée ? Voici comment passer à cette
nouvelle mise à jour sans rien perdre.

## 1. Mettre à jour la base de données (une seule fois)

1. Va sur ton projet Supabase → **SQL Editor** → **New query**.
2. Ouvre le fichier `sql/migration_v3.sql` de ce dossier, copie tout son contenu, colle-le dans
   l'éditeur.
3. Clique sur **Run**.

⚠️ Important : ne relance ni `sql/schema.sql` ni `sql/migration_v2.sql` — `migration_v3.sql` est
conçu pour s'ajouter proprement par-dessus ce qui existe déjà (il faut simplement avoir déjà
appliqué la v2 avant celle-ci).

## 2. (Optionnel) Activer la connexion Google / GitHub

Ce n'est pas obligatoire — le site fonctionne très bien sans. Si tu veux l'activer, suis le guide
dédié **README_OAUTH.md** (10 minutes par fournisseur, entièrement gratuit).

## 3. Redéployer le site

1. Le fichier `js/config.js` de ce dossier contient déjà tes clés Supabase actuelles — pas besoin
   de le retoucher.
2. Va sur **app.netlify.com/drop** et dépose le dossier `ego-meta` complet (celui-ci). Netlify
   remplace l'ancienne version automatiquement, en gardant la même URL.

## 4. C'est tout

Recharge ton site — les nouvelles fonctionnalités sont actives immédiatement pour tous les
membres déjà inscrits.

---

## Ce que cette mise à jour apporte

1. **Nouvelle identité visuelle** — écran de connexion retravaillé, nouvelles pages publiques
   (voir plus bas), un fond animé plus soigné.
2. **Connexion Google / GitHub** (gratuite, optionnelle — voir `README_OAUTH.md`).
3. **Transférer un message** vers une ou plusieurs conversations (icône 🔁 au survol d'un
   message).
4. **Messages favoris** — étoile ⭐ sur n'importe quel message, retrouvables depuis le menu
   latéral.
5. **Conversations archivées** — menu ⋮ d'une conversation → « Archiver », retrouvables et
   désarchivables depuis le menu latéral 🗄️.
6. **Sondages** dans les groupes et communautés — bouton 📊 dans la barre du haut d'une
   conversation.
7. **Cinq nouvelles pages publiques**, jusqu'ici absentes du site :
   - `home.html` — page d'accueil / vitrine publique
   - `help.html` — centre d'aide avec recherche et FAQ
   - `terms.html` — conditions d'utilisation
   - `privacy.html` — politique de confidentialité
   - `404.html` — page d'erreur pour les liens cassés

   Ces pages sont accessibles publiquement (elles ne nécessitent pas de compte), et sont liées
   depuis l'écran de connexion et depuis l'onglet « Aide » des paramètres du site.

---

## Correctif de sécurité important inclus dans cette mise à jour

En travaillant sur la connexion Google/GitHub, une faille bien plus ancienne (présente depuis la
toute première version) a été découverte : **le code d'invitation n'était en réalité jamais
vérifié côté serveur**. Le contrôle n'existait que côté interface (JavaScript) — n'importe qui
connaissant l'existence du projet aurait pu créer un compte directement via l'API Supabase, en
contournant entièrement le site, sans code d'invitation valide. Cela allait à l'encontre du
principe même du « cercle privé sur invitation » demandé dès le départ.

**Correctif** : la vérification et la consommation du code d'invitation se font désormais dans le
déclencheur serveur qui crée le profil (`handle_new_user`), de façon atomique et impossible à
contourner en appelant l'API directement. Un compte créé sans code valide est automatiquement mis
« en attente d'activation » (même mécanisme que pour un bannissement, avec un motif technique
dédié qui empêche toute confusion avec un vrai bannissement) jusqu'à ce qu'un code valide soit
fourni. C'est aussi ce mécanisme qui gère les comptes créés par Google/GitHub, qui ne peuvent
techniquement pas transmettre de code au moment de leur création.

Vérifié par une batterie de tests automatisés reproduisant l'attaque avant/après le correctif,
ainsi que le cas d'un vrai compte banni (pour non-respect des règles) qui ne doit surtout pas
pouvoir se « réactiver » lui-même via ce même mécanisme — testé et confirmé bloqué comme attendu.

## Limite honnête

Comme pour la v2, les notifications restent limitées à l'onglet ouvert (voir `UPDATE.md`). Les
appels audio/vidéo, la gestion avancée des sous-groupes de communautés et l'assistant IA restent
hors de cette mise à jour — voir la FAQ de `help.html` pour le détail des évolutions envisageables
plus tard.
