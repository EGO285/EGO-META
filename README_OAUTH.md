# Activer la connexion Google / GitHub (gratuit)

Ce guide t'explique comment activer les boutons « Continuer avec Google » et « Continuer avec
GitHub » sur ton site EGO-META. Les deux sont **entièrement gratuits** et prennent environ
10 minutes chacun. Tu peux activer un seul des deux, les deux, ou aucun (les boutons resteront
simplement inutilisés, le reste du site fonctionne sans eux).

⚠️ Avant de commencer, assure-toi d'avoir déjà appliqué `sql/migration_v3.sql` (voir
`UPDATE_V3.md`) — c'est cette migration qui sécurise correctement les comptes créés par ce biais.

---

## 1. GitHub (le plus rapide)

1. Connecte-toi sur [github.com](https://github.com), va dans **Settings → Developer settings →
   OAuth Apps → New OAuth App** (ou directement
   [github.com/settings/applications/new](https://github.com/settings/applications/new)).
2. Remplis le formulaire :
   - **Application name** : `EGO-META` (ou le nom de ton site)
   - **Homepage URL** : l'URL de ton site (ex : `https://ego-meta-xyz.netlify.app`)
   - **Authorization callback URL** : voir l'étape 3 ci-dessous — c'est une URL fournie par
     Supabase, pas ton propre site.
3. Avant de valider, va sur ton tableau de bord Supabase → **Authentication → Providers →
   GitHub**. Supabase y affiche l'URL de callback à utiliser (de la forme
   `https://TON-PROJET.supabase.co/auth/v1/callback`). Copie-la dans le champ **Authorization
   callback URL** de GitHub, puis clique sur **Register application** côté GitHub.
4. GitHub t'affiche un **Client ID**. Clique sur **Generate a new client secret** pour obtenir le
   **Client Secret** (copie-le tout de suite, il ne sera plus affiché ensuite).
5. Retourne sur Supabase → **Authentication → Providers → GitHub** : active le fournisseur, colle
   le Client ID et le Client Secret, puis **Save**.

C'est tout — le bouton « Continuer avec GitHub » de ton site est actif immédiatement.

---

## 2. Google

1. Va sur la [Google Cloud Console](https://console.cloud.google.com/) (un compte Google gratuit
   suffit, aucune carte bancaire n'est requise pour ce qu'on fait ici).
2. Crée un nouveau projet (ou réutilise un projet existant) via le sélecteur de projet en haut de
   la page.
3. Va dans **APIs & Services → OAuth consent screen** :
   - Choisis **External**.
   - Renseigne un nom d'application (`EGO-META`), un email de support, et un email de contact
     développeur (les tiens suffisent).
   - Tu peux laisser les autres champs par défaut et publier l'écran de consentement en mode
     "Testing" si ton cercle est restreint, ou "In production" pour l'ouvrir plus largement —
     les deux sont gratuits.
4. Va dans **APIs & Services → Credentials → Create Credentials → OAuth client ID** :
   - **Application type** : Web application
   - **Name** : `EGO-META`
   - **Authorized redirect URIs** : ajoute l'URL de callback fournie par Supabase (même principe
     qu'à l'étape 3 de la section GitHub ci-dessus) — va sur Supabase → **Authentication →
     Providers → Google** pour la copier.
5. Clique sur **Create**. Google t'affiche un **Client ID** et un **Client Secret**.
6. Retourne sur Supabase → **Authentication → Providers → Google** : active le fournisseur, colle
   le Client ID et le Client Secret, puis **Save**.

Le bouton « Continuer avec Google » est maintenant actif.

---

## 3. Pourquoi le compte demande un code d'invitation après la connexion Google/GitHub ?

C'est normal et volontaire. Google et GitHub ne permettent pas à un site de transmettre des
informations personnalisées (comme un code d'invitation) au moment de la création du compte via
OAuth — c'est une limite technique de ces fournisseurs, pas un bug d'EGO-META.

Pour que le principe du « cercle privé sur invitation » reste garanti même avec ces connexions,
tout compte créé via Google/GitHub démarre **en attente d'activation** : la personne reste
connectée, mais doit saisir un code d'invitation valide pour accéder au site (voir l'écran
« Bienvenue ! » qui s'affiche automatiquement). Ce mécanisme est appliqué et vérifié côté serveur
(pas seulement côté interface), donc impossible à contourner.

## 4. Ce qui reste volontairement exclu

**La connexion « Apple » n'est pas incluse.** Contrairement à Google et GitHub, un compte
développeur Apple capable de fournir l'authentification "Sign in with Apple" coûte 99 $/an — ce
n'est donc pas une option gratuite, et n'a pas été implémentée dans cette version d'EGO-META.
