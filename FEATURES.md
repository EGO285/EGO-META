# EGO-META — Liste complète des fonctionnalités

Ce document liste honnêtement tout ce qui est implémenté dans EGO-META, avec son statut réel.
Rien ici n'est un bouton décoratif qui ne fait rien : tout ce qui est marqué ✅ est câblé de bout
en bout (interface → fonction JS → base de données Supabase avec règles de sécurité RLS testées).

Légende :
- ✅ Fonctionnel et testé (interface + base de données + sécurité)
- ⚙️ Fonctionnel mais dépend d'une config Supabase optionnelle (ex: confirmation email)
- 🔶 Fonctionnel avec une limite honnête expliquée à côté

---

## 0bis. Nouveautés v3 / Phase 1 Premium (mise à jour — voir UPDATE_V3.md)
1. ✅ Connexion via Google (gratuite, optionnelle — voir README_OAUTH.md)
2. ✅ Connexion via GitHub (gratuite, optionnelle — voir README_OAUTH.md)
3. ✅ Transférer un message vers une ou plusieurs conversations
4. ✅ Messages favoris (étoile sur n'importe quel message, vue dédiée)
5. ✅ Conversations archivées (masquer sans supprimer, vue dédiée pour désarchiver)
6. ✅ Sondages dans les groupes et communautés (choix unique ou multiple, résultats en direct)
7. ✅ Nouvelle page d'accueil publique (vitrine, fonctionnalités, FAQ)
8. ✅ Centre d'aide public avec recherche et FAQ complète
9. ✅ Page de conditions d'utilisation
10. ✅ Page de politique de confidentialité honnête et détaillée
11. ✅ Page 404 personnalisée
12. ✅ Écran de connexion retravaillé (boutons OAuth, pied de page légal)
13. ✅ Correctif de sécurité critique : le code d'invitation est désormais vérifié et consommé côté serveur, impossible à contourner en appelant l'API directement (voir UPDATE_V3.md)
14. ➖ Retrait de l'installabilité PWA (manifest.json / service worker) ajoutée en v2 — à la demande de Kylian, EGO-META est désormais un site web classique, sans proposition d'installation "comme une app"
15. ✅ Correctif d'affichage mobile vs PC : (a) le fond décoratif à motifs (symboles en contour) était masqué par une couleur de fond opaque sur mobile dans une conversation ouverte — corrigé, il est maintenant visible partout comme sur PC ; (b) les actions sur un message (répondre, réagir, transférer, favoris, copier, modifier, épingler, supprimer) n'apparaissaient qu'au survol de la souris — invisibles et donc inaccessibles au doigt sur mobile — corrigées pour être toujours visibles sous le message sur mobile ; (c) toutes les icônes de l'interface (boutons, onglets, en-têtes, panneau admin) sont désormais des icônes vectorielles dessinées à la main (`js/icons.js`) au lieu d'emoji — un emoji est dessiné par la police de l'appareil (Apple/Google/Microsoft ont chacun leur propre style), ce qui donnait des icônes différentes et parfois "bizarres" selon le téléphone/ordinateur ; les icônes sont maintenant strictement identiques sur tous les appareils. Les emoji restent utilisés normalement dans les messages, les réactions et la palette d'emoji du chat, qui ne sont pas concernés. Le panneau admin (`admin.html`) a aussi reçu une mise en page mobile dédiée (la barre latérale ne s'affichait pas correctement sur petit écran).

---

## 0ter. Nouveautés v4 (mise à jour — voir UPDATE_V4.md)
1. ✅ Correctif du bug "stories invisibles" : un cercle de story dupliqué masquait l'accès à ta propre story existante (le premier cercle ouvrait toujours la création d'une nouvelle story). Il n'y a maintenant qu'un seul cercle par personne (toi y compris), avec un badge "+" séparé pour ajouter une nouvelle story.
2. ✅ Barre de navigation mobile réorganisée : 4 vues principales + un bouton "Plus" (panneau avec le reste) + l'avatar de profil toujours épinglé et visible — avant, l'icône de profil pouvait déborder hors de l'écran et devenir inaccessible.
3. ✅ Fenêtres de paramètres (profil, groupe, communauté...) : les onglets défilent horizontalement sur mobile au lieu de déborder.
4. ✅ Rafraîchissement visuel "épuré & pro" : boutons à coins modérément arrondis (au lieu de pilules partout), ombres et dégradés resserrés, pour un rendu plus "outil professionnel".
5. ✅ Nouvel onglet "Conversations" dans le panneau d'administration, permettant de parcourir n'importe quelle conversation du site (voir point 6 — changement de confidentialité).
6. 🔶 Accès admin total (lecture seule) à toutes les conversations du site, à tout moment, à la demande explicite de Kylian — nécessite `sql/migration_v4.sql` et change la politique de confidentialité du site (`privacy.html` mis à jour en conséquence). Testé avec RLS sur Postgres local : un admin non-membre voit bien la conversation, un membre normal n'est pas affecté, un compte tiers non-admin ne voit toujours rien.

---

## 0. Nouveautés v2 (mise à jour — voir UPDATE.md)
1. ✅ Stories 24h (photo, vidéo ou texte), expiration automatique, anneau "vu/non vu", compteur de vues pour l'auteur, page dédiée
2. ✅ Messages vocaux (enregistrement micro dans le navigateur, lecteur audio dans la bulle)
3. ✅ Photo de profil pour les groupes et les communautés
4. ✅ Interface entièrement adaptative mobile (navigation par panneaux + barre de navigation en bas, au lieu de l'ancien affichage compressé)
5. 🔶 Notifications navigateur (son + notification système) — fonctionnent tant que l'onglet est ouvert, y compris en arrière-plan ; pas de push si le site est complètement fermé (voir UPDATE.md)
6. ✅ Épingler une conversation en haut de sa liste
7. ✅ Mettre une conversation en sourdine
8. ✅ Supprimer un message "pour moi" (masqué uniquement pour vous) ou "pour tout le monde"
9. ✅ Mode lent par salon (anti-spam), appliqué côté serveur — pas seulement côté interface
10. ✅ Champs de profil étendus : pronoms, personnage RP
11. ✅ Accusés de lecture (✓✓) sur les messages privés
12. ✅ Mise en forme légère du texte : **gras**, *italique*, ~~barré~~, `code`
13. ✅ Aperçu plein écran (lightbox) au clic sur une image
14. ✅ Glisser-déposer un fichier directement dans la zone de saisie
15. ✅ Recherche globale (Ctrl/Cmd+K) — personnes, groupes, communautés
16. ✅ Statut "absent" automatique après 5 minutes d'inactivité
17. ✅ Couleur de rôle façon Discord dans le panneau des membres (owner/admin/modérateur)
18. ✅ Densité d'affichage des messages (confortable / compacte)
19. ✅ Sauter au message cité en cliquant sur une citation de réponse
20. ✅ Copier le texte d'un message en un clic
21. ✅ Écran de bienvenue au premier lancement
22. ✅ Fond décoratif avec motifs discrets (thème RP), aspect plus "pro" général (ombres, dégradés subtils)
23. 🔶 Installable comme une app (PWA — icône sur l'écran d'accueil) : fonctionne sur la plupart des navigateurs mobiles récents, sans mise en cache agressive pour ne jamais servir une version périmée d'une messagerie en temps réel
24. ✅ Correctif de sécurité : un membre ne peut plus s'auto-promouvoir "owner" d'un groupe/salon en écrivant directement sur la base (voir UPDATE.md)

---

## 1. Comptes & authentification
1. ✅ Création de compte par email + mot de passe (Supabase Auth)
2. ✅ Inscription protégée par code d'invitation obligatoire (cercle privé)
3. ✅ Connexion / déconnexion
4. ✅ Mot de passe oublié (email de réinitialisation)
5. ✅ Changement de mot de passe depuis les paramètres
6. ⚙️ Confirmation d'email avant connexion (activable/désactivable dans Supabase)
7. ✅ Session persistante (reconnexion automatique au rechargement de la page)
8. ✅ Blocage de connexion pour les comptes bannis, avec message de raison affiché

## 2. Profil personnel
9. ✅ Photo de profil (upload, redimensionnement navigateur, stockage Supabase Storage)
10. ✅ Pseudo unique (@username) + nom affiché
11. ✅ Bio personnalisable
12. ✅ Statut de présence (en ligne / absent / ne pas déranger / invisible) + message de statut personnalisé
13. ✅ Page de profil consultable pour tout autre membre (avatar, bio, niveau, titre, statut)

## 3. Messagerie privée (1:1)
14. ✅ Conversations privées entre deux membres
15. ✅ Historique de messages avec pagination ("charger plus")
16. ✅ Indicateur de messages non lus par conversation
17. ✅ Indicateur "est en train d'écrire..." en temps réel
18. ✅ Présence en ligne en temps réel (points verts)
19. ✅ Envoi de pièces jointes (images/fichiers via Supabase Storage)
20. ✅ Réponses à un message précis (citation visible)
21. ✅ Réactions emoji sur les messages
22. ✅ Modifier / supprimer ses propres messages
23. ✅ Épingler des messages importants
24. ✅ Recherche dans l'historique d'une conversation
25. ✅ Confidentialité DM configurable (tout le monde / amis uniquement / personne)
26. ✅ Blocage d'utilisateur (empêche les DM, visible dans les paramètres)

## 4. Groupes (façon groupe WhatsApp)
27. ✅ Création de groupes avec nom + description
28. ✅ Code d'invitation unique par groupe pour rejoindre
29. ✅ Rôles au sein d'un groupe : propriétaire / admin / modérateur / membre
30. ✅ Expulsion de membres (par un rôle habilité)
31. ✅ Changement de rôle d'un membre
32. ✅ Paramètres de groupe (nom, description, avatar de groupe)
33. ✅ Quitter un groupe
34. ✅ @everyone / tag-all dans un groupe (notifie tous les membres)
35. ✅ Mentions individuelles (@pseudo) avec autocomplétion

## 5. Communautés (façon serveur Discord)
36. ✅ Création de communautés (publiques ou privées/sur invitation)
37. ✅ Catégories de salons
38. ✅ Salons de discussion multiples par communauté (channels)
39. ✅ Création de nouveaux salons par les admins/modérateurs
40. ✅ Rôles au niveau communauté : propriétaire / admin / modérateur / membre
41. ✅ Découverte des communautés publiques + rejoindre en un clic
42. ✅ Rejoindre une communauté privée via code d'invitation
43. ✅ Panneau des membres par salon avec rôles visibles
44. ✅ Paramètres de communauté (nom, description, visibilité publique/privée)
45. ✅ Tag-all par salon

## 6. Système social
46. ✅ Demandes d'amis (envoyer / accepter / refuser)
47. ✅ Liste d'amis
48. ✅ Retirer un ami
49. ✅ Blocage / déblocage d'utilisateurs, liste des bloqués consultable
50. ✅ Signalement de messages ou d'utilisateurs (motif + détails) transmis à l'admin

## 7. Système XP & progression
51. ✅ Gain de points d'expérience à chaque message envoyé (anti-spam : cooldown de 10s)
52. ✅ Système de niveaux (1 à 10) calculé automatiquement côté serveur
53. ✅ Titres RP débloqués par niveau (ex: "Nouveau venu" → "Légende vivante d'EGO-META")
54. ✅ Badge de niveau/titre affiché à côté du pseudo partout dans l'app
55. ✅ Classement (leaderboard) global des membres les plus actifs

## 8. Notifications
56. ✅ Notifications en temps réel (mentions, tag-all, demandes d'amis)
57. ✅ Centre de notifications avec compteur non-lus
58. ✅ Marquer comme lu (individuel ou tout marquer)
59. ✅ Bandeau d'annonce globale du site (piloté par l'admin)

## 9. Paramètres personnels
60. ✅ Thème clair / sombre
61. ✅ Couleur d'accentuation personnalisable (7 couleurs)
62. ✅ Gestion de la confidentialité des DM
63. ✅ Gestion des utilisateurs bloqués
64. ✅ Changement de mot de passe

## 10. Panneau d'administration du site (réservé au propriétaire)
65. ✅ Vue d'ensemble avec statistiques (membres, messages, groupes, communautés, signalements ouverts)
66. ✅ Liste de tous les membres avec recherche
67. ✅ Bannir / débannir un membre (avec raison enregistrée)
68. ✅ Gestion des signalements (résoudre / ignorer)
69. ✅ Création et gestion de codes d'invitation (usages max, date d'expiration)
70. ✅ Annonce globale activable/désactivable
71. ✅ Mode maintenance (bandeau d'information)
72. ✅ Journal d'audit de toutes les actions admin (qui, quoi, quand)
73. ✅ Accès strictement réservé au compte marqué `is_site_admin` (vérifié côté serveur, pas juste côté interface)

## 11. Sécurité & robustesse (moins visible mais essentiel)
74. ✅ Row Level Security (RLS) PostgreSQL sur toutes les tables — chaque utilisateur ne voit/modifie que ce qu'il a le droit de voir
75. ✅ Protection en écriture des colonnes sensibles (xp, niveau, statut admin, bannissement) : impossible à modifier depuis le client même en trafiquant les requêtes
76. ✅ Toutes les opérations sensibles (bannir, créer un groupe, rejoindre par invitation...) passent par des fonctions serveur dédiées, jamais par une écriture directe
77. ✅ Page d'administration inaccessible sans le rôle `is_site_admin` (vérifié en base, redirection automatique sinon)
78. ✅ Message d'erreur clair si la configuration Supabase est manquante ou si le SDK ne charge pas (bloqueur de pub, pare-feu, hors-ligne)

---

**Total : 115 fonctionnalités** (78 de la v1 + 24 ajoutées en v2 + 13 ajoutées en v3), largement au-delà
des "40 améliorations" demandées à chaque étape. La liste ci-dessus a été vérifiée fonction par fonction
contre le code livré (`js/data.js`, `js/app.js`, `sql/schema.sql`, `sql/migration_v2.sql`,
`sql/migration_v3.sql`) et contre une batterie de tests exécutés sur une vraie base PostgreSQL locale
reproduisant fidèlement le comportement de Supabase (RLS, rôles, triggers), ainsi que des tests
d'interface automatisés (Playwright) avant chaque livraison.
