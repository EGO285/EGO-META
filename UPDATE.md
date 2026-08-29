# EGO-META — Mise à jour vers la v2

Tu as déjà un site EGO-META en ligne (Supabase configuré, Netlify déployé) ? Voici comment appliquer
cette mise à jour sans rien perdre.

## 1. Mettre à jour la base de données (une seule fois)

1. Va sur ton projet Supabase → **SQL Editor** → **New query**.
2. Ouvre le fichier `sql/migration_v2.sql` de ce dossier, copie tout son contenu, colle-le dans l'éditeur.
3. Clique sur **Run**.

⚠️ Important : ne relance **pas** `sql/schema.sql` — il recréerait les tables depuis zéro et provoquerait
des erreurs (ou pire, un conflit) sur une base qui a déjà des données. `migration_v2.sql` est conçu pour
s'ajouter proprement à ce qui existe déjà.

Ce script ajoute : les stories (24h), les messages vocaux (réutilisent le stockage existant, rien à
créer), les photos de groupe/communauté, épingler/mettre en sourdine une conversation, la suppression de
message "pour moi", le mode lent par salon, les champs de profil pronoms/personnage RP — et corrige une
faille de sécurité découverte pendant les tests (voir plus bas).

## 2. Redéployer le site

1. Le fichier `js/config.js` de ce dossier contient déjà tes clés Supabase actuelles — pas besoin de le
   retoucher.
2. Va sur **app.netlify.com/drop** et dépose le dossier `ego-meta` complet (celui-ci). Netlify remplace
   l'ancienne version automatiquement, en gardant la même URL.

## 3. C'est tout

Recharge ton site — les nouvelles fonctionnalités sont actives immédiatement pour tous les membres déjà
inscrits, pas besoin qu'ils fassent quoi que ce soit de leur côté.

---

## Correctif de sécurité inclus dans cette mise à jour

En travaillant sur la fonctionnalité "épingler une conversation", j'ai découvert que la version précédente
laissait n'importe quel membre d'un groupe ou d'un salon modifier **son propre rôle** en écrivant
directement sur la base (par exemple se déclarer "owner" lui-même), en contournant les boutons normaux de
l'interface. Ce n'était exploitable qu'en bidouillant les requêtes réseau — aucun signe qu'il ait été
exploité — mais `migration_v2.sql` le corrige avec le même principe déjà utilisé pour protéger l'XP et le
statut admin (droits d'écriture limités colonne par colonne plutôt qu'au niveau de la table entière).
Vérifié par un test automatisé reproduisant l'attaque avant/après le correctif.

## Limite honnête sur les notifications

Les notifications de cette mise à jour utilisent l'API standard du navigateur (`Notification`). Elles
fonctionnent tant que l'onglet EGO-META est ouvert, même en arrière-plan ou minimisé — mais **pas** si le
site est complètement fermé sur le téléphone. Une vraie notification "push" qui réveille un téléphone
même site fermé demande un serveur de notifications dédié, ce qui dépasse ce qu'un site statique gratuit
peut offrir. Si votre communauté grandit et que ce besoin devient important, c'est une évolution possible
à envisager séparément.
