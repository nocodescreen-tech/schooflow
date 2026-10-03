# SchoolFlow — Agent Instructions

This file contains mandatory rules and conventions for any AI agent working on the SchoolFlow codebase. These rules are **non-negotiable** and must be followed for every change.

---

## 🔥 CORE PRINCIPLE: NO DECORATIVE BUTTONS

**Every visible button must trigger a real business action.** No exceptions.

```
[Button] → onClick → API call → Backend validation → PostgreSQL → Audit log → Response → UI refresh → Toast
```

If a button doesn't have this complete chain, it doesn't belong in the codebase.

---

## ⚡ SYSTEM D'ACTIONS — TOUS LES BOUTONS DOIVENT ÊTRE FONCTIONNELS

```text
==================================================
36. ACTIONS ET BOUTONS — OBLIGATION DE FONCTIONNEMENT
==================================================

RÈGLE ABSOLUE :

AUCUN bouton ne doit être créé uniquement pour l'apparence.

Chaque bouton visible dans SCHOOLFLOW doit avoir une fonction réelle.

INTERDICTION :

- boutons sans onClick
- boutons qui ne font rien
- boutons avec console.log uniquement
- boutons "Coming Soon"
- boutons "TODO"
- boutons simulant une action
- liens qui ne mènent nulle part
- menus dont les options ne fonctionnent pas
- actions utilisant uniquement des données mockées
- boutons qui affichent simplement un toast sans effectuer l'opération réelle

Chaque action doit être reliée au frontend, à l'API et à la base de données lorsque l'action nécessite une modification des données.

==================================================
37. BOUTONS D'ACTION STANDARD
==================================================

Pour chaque module, prévoir lorsque pertinent :

+ Ajouter
+ Créer
+ Modifier
+ Supprimer
+ Voir
+ Détails
+ Rechercher
+ Filtrer
+ Réinitialiser les filtres
+ Actualiser
+ Importer
+ Exporter
+ Télécharger
+ Imprimer
+ Archiver
+ Restaurer
+ Activer
+ Désactiver
+ Valider
+ Annuler
+ Enregistrer
+ Fermer
+ Retour
+ Dupliquer
+ Assigner
+ Réassigner
+ Générer
+ Envoyer
+ Copier
+ Voir l'historique

Chaque bouton doit être affiché uniquement lorsque l'utilisateur possède la permission correspondante.

==================================================
38. ACTIONS DANS LES TABLEAUX
==================================================

Chaque ligne d'un tableau doit pouvoir avoir un menu d'actions.

Exemple étudiant :

[Voir]
[Modifier]
[Documents]
[Présences]
[Notes]
[Paiements]
[Archiver]
[Supprimer]

Exemple enseignant :

[Voir]
[Modifier]
[Affectations]
[Emploi du temps]
[Présences]
[Archiver]

Exemple paiement :

[Voir]
[Reçu]
[Télécharger]
[Imprimer]
[Annuler]

Exemple note :

[Voir]
[Modifier]
[Supprimer]

Exemple classe :

[Voir]
[Modifier]
[Élèves]
[Enseignants]
[Emploi du temps]
[Archiver]

==================================================
39. CONFIRMATION DES ACTIONS DESTRUCTIVES
==================================================

Les actions suivantes doivent demander confirmation :

- suppression
- archivage
- restauration
- annulation d'un paiement
- suppression d'une note
- suppression d'un document
- désactivation d'un utilisateur
- suppression d'un établissement
- suppression d'une classe

Afficher un dialogue clair :

Titre :
"Confirmer la suppression"

Description :
"Cette action est irréversible. Voulez-vous continuer ?"

Boutons :

[Annuler]
[Confirmer]

Ne jamais supprimer directement une donnée critique sans confirmation.

==================================================
40. ÉTAT DES BOUTONS
==================================================

Chaque bouton qui déclenche une requête doit gérer :

IDLE
LOADING
SUCCESS
ERROR

Exemple :

Avant :
[Enregistrer]

Pendant :
[Enregistrement...]

Après succès :
[Enregistré]

En cas d'erreur :
afficher un message explicite.

Pendant une requête :

- désactiver le bouton
- empêcher les doubles clics
- afficher un indicateur de chargement

==================================================
41. RETOUR UTILISATEUR
==================================================

Après chaque action importante, afficher une notification appropriée.

Succès :

"Élève créé avec succès."

Erreur :

"Impossible de créer l'élève."

Validation :

"Veuillez corriger les champs obligatoires."

Permission :

"Vous n'avez pas l'autorisation d'effectuer cette action."

Erreur réseau :

"Impossible de contacter le serveur. Vérifiez votre connexion."

Ne jamais afficher uniquement :

"Error"
"Something went wrong"

Les messages doivent être compréhensibles.

==================================================
42. FORMULAIRES
==================================================

Tous les formulaires doivent être fonctionnels.

Chaque formulaire doit avoir :

- validation
- messages d'erreur
- état loading
- sauvegarde réelle
- annulation
- réinitialisation lorsque pertinent
- gestion des erreurs API

Exemple :

Créer un élève

Remplir formulaire
↓
Validation frontend
↓
POST /api/students
↓
Validation backend
↓
PostgreSQL
↓
Réponse API
↓
Actualisation de l'interface
↓
Notification de succès

==================================================
43. MODALES
==================================================

Toutes les modales doivent fonctionner.

Une modale doit pouvoir :

- s'ouvrir
- se fermer
- sauvegarder
- annuler
- afficher les erreurs
- afficher le loading
- réinitialiser son état lorsque nécessaire

Ne jamais créer une modale purement visuelle.

==================================================
44. FILTRES
==================================================

Les filtres doivent réellement modifier les données affichées.

Exemple :

Classe
Période
Statut
Date
Sexe
Année scolaire

Le filtrage doit fonctionner côté serveur pour les grandes listes.

Les paramètres doivent être synchronisés avec l'URL lorsque pertinent.

==================================================
45. RECHERCHE
==================================================

La recherche doit être réelle.

Exemple :

Recherche :
"Jean"

→ appel API

GET /api/students?search=Jean

Afficher uniquement les résultats correspondants.

Ajouter debounce pour éviter les requêtes inutiles.

==================================================
46. PAGINATION
==================================================

La pagination doit fonctionner côté serveur.

Exemple :

GET /api/students?page=2&limit=20

Afficher :

Première page
Page précédente
Pages
Page suivante
Dernière page

Afficher également :

"21–40 sur 327 élèves"

==================================================
47. TRI
==================================================

Les colonnes triables doivent réellement trier les résultats.

Exemple :

Nom ↑
Nom ↓
Date d'inscription ↑
Date d'inscription ↓

Le tri doit être sécurisé côté backend.

==================================================
48. EXPORT
==================================================

Les boutons :

[Exporter CSV]
[Exporter Excel]
[Exporter PDF]

doivent générer de vrais fichiers contenant les données actuellement filtrées lorsque pertinent.

Ne jamais télécharger un fichier fictif.

==================================================
49. IMPRESSION
==================================================

Les boutons d'impression doivent ouvrir une version imprimable réelle.

Exemples :

- bulletin
- reçu
- liste des élèves
- emploi du temps
- rapport financier

==================================================
50. TÉLÉCHARGEMENT
==================================================

Tous les boutons [Télécharger] doivent télécharger le véritable fichier.

Vérifier les permissions avant de fournir le fichier.

Pour les fichiers privés :

utiliser une URL temporaire/signée.

==================================================
51. UPLOAD
==================================================

Les boutons :

[Ajouter une photo]
[Changer la photo]
[Ajouter un document]

doivent réellement uploader le fichier.

Pipeline :

Sélection fichier
↓
Validation type
↓
Validation taille
↓
Upload
↓
Stockage ImageKit/R2
↓
URL retournée
↓
Enregistrement URL en PostgreSQL
↓
Actualisation UI

Afficher une progression lorsque nécessaire.

==================================================
52. ACTIONS EN MASSE
==================================================

Les tableaux doivent permettre la sélection multiple lorsque pertinent.

Exemple :

☑ Élève 1
☑ Élève 2
☑ Élève 3

Actions :

[Archiver]
[Exporter]
[Supprimer]

Les actions doivent être exécutées réellement.

Demander confirmation pour les actions destructives.

==================================================
53. MENU UTILISATEUR
==================================================

Le menu utilisateur doit fonctionner :

Profil
Paramètres
Changer mot de passe
Sessions
Déconnexion

Déconnexion :

→ invalider la session
→ supprimer les tokens locaux
→ rediriger vers /login

==================================================
54. SIDEBAR
==================================================

Tous les liens de navigation doivent fonctionner.

Aucun lien mort.

Chaque module doit correspondre à une vraie route.

Exemple :

/dashboard
/students
/teachers
/parents
/classes
/subjects
/timetable
/attendance
/evaluations
/grades
/report-cards
/fees
/payments
/cash
/documents
/announcements
/notifications
/users
/settings
/audit-logs

==================================================
55. DASHBOARD
==================================================

Les statistiques du dashboard doivent venir de l'API.

INTERDICTION :

Afficher :

"1,250 élèves"
"85 enseignants"
"$25,000 revenus"

si ces valeurs sont codées en dur.

Les chiffres doivent provenir de PostgreSQL.

Les graphiques doivent être alimentés par de vraies données.

==================================================
56. ACTIONS FINANCIÈRES
==================================================

Les actions financières doivent être particulièrement sécurisées.

Créer paiement :

POST /api/payments

Puis transaction PostgreSQL :

1. vérifier l'élève
2. vérifier le frais
3. vérifier le montant
4. créer le paiement
5. mettre à jour le solde
6. générer numéro de reçu
7. créer audit log
8. retourner résultat

Une erreur à une étape doit annuler la transaction.

==================================================
57. ACTIONS ACADÉMIQUES
==================================================

Créer/modifier une note :

1. vérifier utilisateur
2. vérifier permission
3. vérifier enseignant
4. vérifier classe
5. vérifier matière
6. vérifier période
7. vérifier valeur de note
8. sauvegarder
9. recalculer les moyennes nécessaires
10. créer audit log

==================================================
58. ACTIONS D'ARCHIVAGE
==================================================

Pour les données importantes, préférer :

ARCHIVE

plutôt que :

DELETE

lorsque cela est compatible avec le métier.

Prévoir :

[Archiver]

puis :

[Restaurer]

avec historique.

==================================================
59. PERMISSIONS DES BOUTONS
==================================================

Le frontend doit masquer ou désactiver les actions auxquelles l'utilisateur n'a pas accès.

Exemple :

Utilisateur sans students.delete :

→ ne pas afficher [Supprimer]

Mais la sécurité doit également être appliquée au backend.

Même si quelqu'un appelle directement :

DELETE /api/students/:id

le backend doit refuser si la permission manque.

==================================================
60. AUDIT DES ACTIONS
==================================================

Toute action sensible doit générer un audit log.

Exemples :

création
modification
suppression
archivage
restauration
paiement
annulation paiement
modification note
changement rôle
connexion
déconnexion

==================================================
61. TEST FINAL DES BOUTONS
==================================================

Avant de considérer SCHOOLFLOW comme terminé :

Parcourir toutes les pages.

Pour CHAQUE bouton :

1. cliquer
2. vérifier l'action
3. vérifier la requête API
4. vérifier la réponse
5. vérifier la base PostgreSQL
6. vérifier l'actualisation de l'interface
7. vérifier les permissions
8. vérifier les erreurs
9. vérifier l'état loading
10. vérifier l'état success
11. vérifier l'état error

Créer une checklist de validation.

AUCUN bouton mort ne doit rester.

==================================================
62. RÈGLE FINALE
==================================================

SCHOOLFLOW doit être traité comme un logiciel commercial réel.

Ne crée jamais une interface qui donne l'impression que la fonctionnalité existe alors qu'elle n'existe pas.

Si un bouton est visible, il doit fonctionner.

Si une page est accessible, elle doit être fonctionnelle.

Si une donnée est affichée comme provenant de la base de données, elle doit réellement provenir de la base de données.

Si une action est annoncée comme terminée, elle doit réellement avoir été exécutée.

Pas de faux CRUD.
Pas de fake API.
Pas de données hardcodées.
Pas de boutons décoratifs.
Pas de fonctionnalités simulées.
Pas de pages mortes.
Pas de liens morts.

Le produit final doit être cohérent de bout en bout :
UI → API → logique métier → PostgreSQL → stockage → réponse → UI.
```

---

## 🛠 TECHNICAL STANDARDS

### Frontend (React + TypeScript + Vite)
- **State**: TanStack Query for server state, Zustand for client state
- **Forms**: React Hook Form + Zod validation
- **UI**: Tailwind CSS + Lucide icons + motion/react
- **Routing**: React Router v6 with route guards
- **API**: Axios instance with interceptors (`client/src/lib/api.ts`)

### Backend (Express + TypeScript + Sequelize)
- **Auth**: JWT access + refresh tokens in httpOnly cookies
- **RBAC**: Permission-based (`requirePermission`, `requireRole`)
- **Validation**: express-validator on every route
- **Audit**: Automatic audit logging via middleware
- **Email**: Nodemailer with provider abstraction (`services/EmailService.ts`)

### Database (PostgreSQL + Sequelize)
- **Migrations**: Sequelize migrations in `server/src/config/migrations/`
- **Models**: `server/src/models/` with proper associations
- **Soft deletes**: Use `isActive` / `archivedAt` instead of hard deletes where possible

---

## 📁 KEY FILES TO KNOW

| Purpose | File |
|---------|------|
| API client | `client/src/lib/api.ts` |
| Auth store | `client/src/store/authStore.ts` |
| Toast store | `client/src/components/Toast.tsx` |
| Route guards | `client/src/components/routeGuards.tsx` |
| Email service | `server/src/services/EmailService.ts` |
| RBAC middleware | `server/src/middleware/rbac.ts` |
| Audit middleware | `server/src/middleware/auditLog.ts` |
| Permission utils | `server/src/utils/permissions.ts` |
| Route index | `server/src/routes/index.ts` |

---

## ✅ BEFORE SUBMITTING ANY CHANGE

Verify:
- [ ] Every new button has `onClick` → API call → real backend logic
- [ ] Loading / success / error states handled
- [ ] Toast notifications use `useToastStore().addToast()`
- [ ] Form validation with Zod (frontend) + express-validator (backend)
- [ ] Permissions checked on both frontend (hide/disable) and backend (enforce)
- [ ] Audit log generated for sensitive actions
- [ ] No hardcoded data in UI — all from API
- [ ] TypeScript compiles (`npm run typecheck` in server, `npm run build` in client)

---

## 🚫 FORBIDDEN PATTERNS

```tsx
// ❌ NEVER DO THIS
<button onClick={() => console.log('clicked')}>Action</button>
<button disabled>Coming Soon</button>
<Link to="#">Dead Link</Link>
<div onClick={fakeAction}>Pretend Button</div>

// ✅ ALWAYS DO THIS
<button onClick={handleRealAction} disabled={isLoading}>
  {isLoading ? 'Enregistrement...' : 'Enregistrer'}
</button>
```

---

*This document is the source of truth for code quality in SchoolFlow. Any agent violating these rules produces unacceptable work.*
---

## 🏫 SCHOOLFLOW — DASHBOARD COMPLET

```text
## 📄 MODULE DOCUMENTS & ÉDITEUR DE TEMPLATES SCHOOLFLOW

==================================================
63. SYSTÈME PROFESSIONNEL DE DOCUMENTS SCOLAIRES
==================================================

Créer dans SCHOOLFLOW un véritable moteur de génération et
d'édition de documents scolaires.

IMPORTANT :

Ce module ne doit PAS être un simple générateur PDF.

Il doit fonctionner comme un mini logiciel de PAO/document
builder permettant à l'administration de :

- choisir un template
- prévisualiser le document
- modifier les informations
- personnaliser le template
- enregistrer une version
- générer le document
- imprimer
- télécharger en PDF
- éventuellement exporter en PNG/JPG
- réutiliser le template pour d'autres élèves/classes/périodes.

==================================================
64. TYPES DE DOCUMENTS
==================================================

Créer au minimum les catégories suivantes :

A. DOCUMENTS ACADÉMIQUES

- Bulletin de notes
- Bulletin trimestriel
- Bulletin semestriel
- Bulletin annuel
- Relevé de notes
- Relevé de résultats
- Grille d'évaluation
- Fiche de résultats
- Certificat de scolarité
- Attestation de réussite
- Attestation de fréquentation
- Certificat de fin d'études

B. DOCUMENTS ADMINISTRATIFS

- Billet de vacances
- Avis aux parents
- Communiqué
- Convocation
- Lettre administrative
- Attestation d'inscription
- Fiche d'inscription
- Fiche de renseignement
- Certificat de présence
- Autorisation de sortie

C. DOCUMENTS FINANCIERS

- Reçu de paiement
- Facture scolaire
- État des frais scolaires
- Avis de paiement
- Échéancier
- Relevé de paiements
- Situation financière de l'élève

D. DOCUMENTS INTERNES

- Liste des élèves
- Liste de classe
- Liste des enseignants
- Fiche de présence
- Rapport de classe
- Rapport académique
- Rapport financier

==================================================
65. TEMPLATES PRÉDÉFINIS
==================================================

Créer une bibliothèque de templates.

Chaque type de document doit pouvoir avoir plusieurs templates.

Exemple - Bulletin de notes :

- Bulletin Classique
- Bulletin Officiel / grille
- Bulletin Moderne
- Bulletin Minimal
- Bulletin Administratif

Exemple - Billet de vacances :

- Billet Classique
- Billet avec encadrement
- Billet administratif
- Billet compact

Chaque template doit avoir :
- nom, description, catégorie, miniature
- format papier (A4, A5, Letter, Custom)
- orientation (portrait/landscape)
- marges configurables
- version, statut, dates
- créateur

==================================================
66. TEMPLATE BULLETIN DE NOTES
==================================================

En-tête :

- République, ministère, province, établissement
- logo, année scolaire, période

Informations élève :
- nom, prénom, matricule, date de naissance
- classe, section, option

Tableau d'évaluation :
- Matière, Coefficient, Évaluation 1, Évaluation 2, Examen, Total, Moyenne, Rang, Appréciation

Puis :
- total, moyenne générale, rang, absences, retards
- appréciation générale, décision du conseil, signatures, cachet

Les valeurs doivent être alimentées automatiquement depuis
les données réelles de SCHOOLFLOW.

Ne jamais afficher les variables brutes dans le PDF final.

==================================================
67. ÉDITEUR VISUEL DE DOCUMENT
==================================================

Créer un éditeur visuel permettant à l'administrateur
de personnaliser un template.

Interface :

┌─────────────────────────────────────────────┐
│ Toolbar │ Éléments │ DOCUMENT │ Propriétés │
├─────────┴──────────┴──────────┴────────────┤
│                                             │
│             Canvas / Preview                │
│                                             │
└─────────────────────────────────────────────┘

Éléments disponibles :
- Text, Rich Text, Image, Logo
- Table, Line, Rectangle, Circle
- Signature, Stamp, QR Code, Barcode
- Page Number, Date, Dynamic Field, Divider

L'éditeur doit permettre :

- drag & drop
- déplacer
- redimensionner
- aligner
- dupliquer
- supprimer
- verrouiller
- masquer
- modifier
- grouper
- ordre avant/arrière

==================================================
68. CHAMPS DYNAMIQUES
==================================================

Créer un système de variables dynamiques.

Exemples :

{{student.firstName}} {{student.lastName}} {{student.matricule}}
{{student.class}} {{student.dateOfBirth}}

{{school.name}} {{school.address}} {{school.phone}} {{school.email}}

{{academicYear.name}} {{term.name}}

{{student.average}} {{student.rank}}

{{director.name}} {{director.signature}}

{{payment.amount}} {{payment.remaining}}

Lors de la génération :

{{student.firstName}}

doit être remplacé automatiquement par la véritable donnée.

Ne jamais afficher les variables brutes dans le PDF final.

==================================================
69. LIVE PREVIEW
==================================================

OBLIGATOIRE.

Le preview doit être actualisé immédiatement
lorsqu'on modifie texte, police, taille, couleur, position,
image, tableau, données, logo, signature, bordure.

Aucun bouton "Preview" ne doit être nécessaire.

Le rendu doit être aussi proche que possible du PDF final.

==================================================
70. FORMAT PAPIER
==================================================

Formats : A4, A5, A6, Letter, Legal, Custom
Orientation : Portrait, Landscape
Marges : Top, Bottom, Left, Right configurables

==================================================
71. SIGNATURES ET CACHETS
==================================================

L'éditeur doit permettre d'ajouter :
- signature directeur
- signature secrétaire
- signature enseignant
- cachet établissement

Position, taille, rotation, transparence configurables.

==================================================
72. VERSIONING DES TEMPLATES
==================================================

Chaque modification importante crée une version.
Permettre [Voir version], [Restaurer], [Dupliquer].
Ne jamais détruire silencieusement une version.

==================================================
73. SAUVEGARDE AUTOMATIQUE
==================================================

L'éditeur doit sauvegarder automatiquement.
Afficher "Enregistré", "Enregistrement...", "Modifications non enregistrées".
Prévenir la perte de données si l'utilisateur ferme la page.

==================================================
74. GÉNÉRATION PDF
==================================================

Bouton [Générer PDF] génère un vrai document à partir du template
et des données réelles. Le rendu doit respecter dimensions, positions,
marges, polices, tableaux, images, signatures, logo, pagination.

Ne pas générer une capture d'écran du navigateur.
Le PDF doit être un véritable document imprimable.

==================================================
75. EXPORT IMAGE
==================================================

[Télécharger PNG] [Télécharger JPG] pour documents nécessitant
un format image.

==================================================
76. GÉNÉRATION EN MASSE
==================================================

[Générer pour toute la classe] - Exemple : 30 élèves → 30 bulletins.
Chaque PDF utilise les données du bon élève.

==================================================
77. DOCUMENT BUILDER UX
==================================================

- undo, redo, copier, coller, duplication
- alignement, grille, guides, snap, zoom
- plein écran, raccourcis clavier, sélection multiple
Raccourcis : Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, Delete, Ctrl+S

==================================================
78. TESTS DU DOCUMENT BUILDER
==================================================
79. DUPLICATION
==================================================

Bouton [Dupliquer le template]

Créer une copie indépendante.

Exemple :

Bulletin Officiel
→ Dupliquer
→ Bulletin Officiel Primaire

==================================================
80. MODÈLES ET DONNÉES
==================================================

Séparer clairement :

TEMPLATE

et

DOCUMENT GÉNÉRÉ.

Un template peut être réutilisé.

Un document généré conserve un snapshot du template utilisé
afin qu'une modification ultérieure du template ne change
pas les anciens documents.

==================================================
81. HISTORIQUE DES DOCUMENTS
==================================================

Créer :

Documents générés

Colonnes :

Document
Élève
Classe
Type
Template
Date
Créateur
Version

Actions :

[Voir]
[Télécharger]
[Imprimer]
[Regénérer]
[Dupliquer]

==================================================
82. PERMISSIONS
==================================================

Permissions spécifiques :

templates.read
templates.create
templates.update
templates.delete
templates.publish
templates.restore

documents.read
documents.create
documents.download
documents.print
documents.delete

Seuls les utilisateurs autorisés peuvent modifier les
templates officiels.

==================================================
83. TEMPLATE OFFICIEL
==================================================

Permettre de marquer un template comme :

BROUILLON
ACTIF
ARCHIVÉ

Un template ACTIF peut être utilisé pour générer des documents.

Un template BROUILLON peut être modifié.

Un template ARCHIVÉ ne doit plus être utilisé pour les
nouveaux documents sauf restauration explicite.

==================================================
84. SYSTÈME DE PRÉVISUALISATION DES DONNÉES
==================================================

Dans l'éditeur, fournir un sélecteur :

"Prévisualiser avec"

[Élève de démonstration]

ou

[Élève réel]

 Cela permet de voir immédiatement comment le document
sera rempli.

Exemple :

{{student.firstName}}

devient :

"MAMIE DIARRA"

dans le preview.

==================================================
85. VALIDATION AVANT GÉNÉRATION
==================================================

Avant génération :

Vérifier :

- données obligatoires présentes
- logo disponible si requis
- signature disponible si requise
- template valide
- champs dynamiques valides
- aucune variable inconnue
- aucun élément hors page
- aucune donnée manquante

Afficher les erreurs avant de générer.

==================================================
86. DOCUMENT BUILDER — UX
==================================================

L'éditeur doit être fluide et professionnelle.

Ajouter :

- undo
- redo
- copier
- coller
- duplication
- alignement
- grille
- guides
- snap
- zoom
- plein écran
- raccourcis clavier
- sélection multiple

==================================================
87. RESPONSIVE EDITOR
==================================================

L'éditeur doit fonctionner sur :

Desktop
Laptop
Tablet

Sur mobile :

prévoir une interface simplifiée permettant au minimum :

- preview
- modification de texte
- sélection template
- génération PDF
- impression
- téléchargement

==================================================
88. QUALITÉ DU RENDU
==================================================

Le rendu du preview et le PDF final doivent être visuellement
cohérents.

Le document doit respecter les standards d'impression.

Les documents fournis comme références servent de
référence visuelle et structurelle pour concevoir les
templates, sans copier des données personnelles présentes
dans ces exemples.

==================================================
89. TESTS DU DOCUMENT BUILDER (suite)
==================================================

Tester obligatoirement :

- création template
- modification
- sauvegarde
- autosave
- duplication
- suppression
- archivage
- restauration
- insertion texte
- insertion image
- insertion tableau
- insertion champ dynamique
- déplacement
- redimensionnement
- preview temps réel
- génération PDF
- impression
- export PNG
- génération individuelle/en masse
- permissions
- versioning

AUCUN bouton du Document Builder ne doit être fictif.

==================================================
90. RÈGLE ABSOLUE DU DOCUMENT BUILDER
==================================================

Le système doit fonctionner comme un véritable éditeur de
documents scolaires et non comme une simple page avec des
formulaires.

Architecture :

Template
↓
Document Schema
↓
Dynamic Data
↓
Renderer
↓
Live Preview
↓
PDF Renderer
↓
PDF final

Le même modèle de données doit être utilisé autant que
possible pour le Preview et le PDF afin d'éviter les
différences entre ce que l'utilisateur voit et ce qu'il
imprime.

==================================================
91. OBJECTIF FINAL
==================================================

SCHOOLFLOW doit permettre à une école de créer, personnaliser,
prévisualiser, sauvegarder, versionner, générer, imprimer,
télécharger et réutiliser ses documents officiels.

L'administrateur doit pouvoir créer un bulletin ou un billet
de vacances sans modifier le code source.

Les templates doivent être réutilisables d'une année scolaire
à l'autre.

Les données doivent être dynamiques.

Le preview doit être temps réel.

Les PDF doivent être réellement générés.

Toutes les actions doivent être fonctionnelles.

Aucun bouton mort.

Aucune donnée fictive.

Aucun template purement décoratif.

Aucune génération simulée.

SCHOOLFLOW doit posséder un véritable DOCUMENT BUILDER.
==================================================

Tester création template, modification, sauvegarde, autosave, duplication,
suppression, archivage, restauration, insertion texte/image/tableau,
déplacement, redimensionnement, preview te
99. DASHBOARD SCHOOLFLOW — VERSION COMPLETE
==================================================

Créer un dashboard professionnel, riche, dynamique et
entièrement connecté aux données réelles de SCHOOLFLOW.

IMPORTANT :

Le dashboard ne doit PAS être une simple collection de cartes.

Toutes les statistiques, graphiques, tableaux, alertes,
indicateurs et activités doivent provenir de l'API et de
PostgreSQL.

AUCUNE donnée hardcodée.

AUCUN chiffre fictif.

AUCUN graphique décoratif.

Chaque élément doit représenter une donnée réelle ou une
action réelle.

100. STRUCTURE GÉNÉRALE
==================================================

Dashboard avec :
- Sidebar │ Topbar
- Header : Bienvenue, établissement, année scolaire, période
- KPI Cards : Élèves, Enseignants, Classes, Présences, Paiements, Impayés, Moyenne, Absences
- Graphiques : Évolution financière, Répartition élèves
- Académique : Performances, Présences, Classes
- Finances : Paiements récents, Impayés
- Activités / Alertes

101. HEADER DU DASHBOARD
==================================================

Afficher :
- logo établissement, nom établissement, année scolaire active
- période active, utilisateur connecté, rôle, photo/avatar
- notifications, recherche globale, menu utilisateur

Sélecteurs : [Année scolaire ▼] , [Période ▼]

102. ACTIONS RAPIDES
==================================================

Boutons :
[+ Nouvel élève] [+ Nouvel enseignant] [+ Nouvelle classe]
[+ Nouvelle matière] [+ Enregistrer paiement] [+ Saisir notes]
[+ Marquer présence] [+ Créer document] [+ Nouvelle annonce]

Chaque bouton doit ouvrir la vraie fonctionnalité correspondante.
Aucun bouton décoratif.

103. KPI PRINCIPAUX
==================================================

Créer au minimum les cartes :

1. TOTAL ÉLÈVES
Nombre total, Variation période précédente, Nouveaux, Actifs, Archivés
Action : [Voir les élèves]

2. ENSEIGNANTS
Total, Actifs, Inactifs, Nouveaux
Action : [Voir les enseignants]

3. CLASSES
Total classes, Classes actives, Nombre moyen d'élèves/classe
Action : [Voir les classes]

4. PRÉSENCE
Taux de présence, Présents aujourd'hui, Absents, Retards
Action : [Voir les présences]

5. PAIEMENTS
Total encaissé, Aujourd'hui, Cette semaine, Ce mois
Action : [Voir les paiements]

6. IMPAYÉS
Montant total restant, Nombre d'élèves concernés, Échéances dépassées
Action : [Voir les impayés]

7. MOYENNE ACADÉMIQUE
Moyenne générale, Meilleure classe, Élèves ayant la moyenne, Sous la moyenne
Action : [Voir les résultats]

8. DOCUMENTS
Documents générés, Bulletins générés, Attestations, Billets de vacances, Documents en attente
Action : [Voir les documents]

104. GRAPHIQUES
==================================================

ÉVOLUTION DES EFFECTIFS : par mois (nouveaux élèves, départs, effectif total)
RÉPÉRATION DES ÉLÈVES : par niveau, classe, sexe, section, option
PRÉSENCE AUJOURD'HUI : donut avec Présents, Absents, Retards, Justifiés
ABSENTES : par jour/semaine/mois, absences/retards/justifiées/non justifiées
PERFORMANCE ACADÉMIQUE : moyenne par matière
ENCAISSEMENTS : prévu vs encaissé
RÉPARTITION DES FRAIS : Inscription, Minerval, Transport, Cantine, Uniforme, Examen

105. ACTIONS RAPIDES
==================================================

[+ Créer un élève] [+ Créer un enseignant] [+ Créer une classe]
[+ Créer une matière] [+ Enregistrer un paiement] [+ Saisir des notes]
[+ Marquer une présence] [+ Créer un document] [+ Publier une annonce]

106. ALERTES ACADÉMIQUES
==================================================

- Élève avec nombreuses absences
- Élève avec moyenne faible
- Notes manquantes
- Classe sans notes
- Bulletin non généré
- Évaluations en retard

Chaque alerte cliquable → voir / résoudre.

107. FINANCIAL OVERVIEW
==================================================

Total facturé, Total encaissé, Total restant, Total en retard
Graphique d'encaissements : jour, semaine, mois, année

108. DOCUMENTS RÉCENTS
==================================================

Type, Élève, Classe, Template, Date, Créateur, Statut
Actions : [Voir] [Télécharger] [Imprimer]

109. VERBS D'ENREGISTREMENT
==================================================

Chaque bouton doit afficher :
[Enregistrement...] pendant la requête
[Enregistré] après succès
Message d'erreur en cas d'échec

110. PERMISSIONS DES BOUTONS
==================================================

Le frontend masque ; le backend bloque.
Manipulation idem DELETE /api/students/:id → backend refuse si permission manquante.

111. DÉMOUX DU TABLEAU
==================================================

Cliquer sur "325 élèves" → ouvre /students filtré.
Cliquer sur "12 impayés" → /payments/unpaid.
Cliquer sur "8 absents" → /attendance.
Cliquer sur "Moyenne 12.8" → résultats académiques.

112. DASHBOARD RESPONSIVE
==================================================

Desktop : grille multi-colonnes complète.
Tablet : 2 colonnes.
Mobile : 1 colonne scrollable.
Widgets réorganisés intelligemment.

113. DARK MODE
==================================================

Light, Dark, System.
Graphiques, tableaux, badges, modales adaptent correctement.

114. ÉTATS DES WIDGETS
==================================================

Loading (skeleton), Loaded, Empty ("Pas encore de données"), Error + [Réessayer]

115. ACTUALISATION
==================================================

[Actualiser] → invalide queries, récupère API.
Actualisation automatique pour données pertinentes (pas de polling agressif).

116. TEMPS RÉEL
==================================================

WebSocket pour nouvelles notifications, paiements, présences, annonces, activité admin.

Exemple : paiement enregistré → dashboard financier actualisé sans rechargement.

117. EXPORT DASHBOARD
==================================================

[Générer rapport] → PDF, Excel, CSV.
Options : rapport académique, financier, présence, global.
Données filtrées actuels.

118. RAPPORT ADMINISTRATIF
==================================================

[Générer rapport de direction] comporte :
1. Effectifs
2. Personnel
3. Présence
4. Résultats académiques
5. Finances
6. Impayés
7. Documents
8. Activité administrative

PDF professionnel.

119. PERFORMANCE
==================================================

Ne pas charger toutes les données d'un coup.
Endpoints statistiques dédiés, agrégations SQL, indexes, cache, React Query, lazy loading.

120. RÈGLE ABSOLUE DU DASHBOARD
==================================================

AUCUN chiffre hardcodé. AUCUN graphique fictif. AUCUNE activité inventée.
AUCUN bouton mort.

Flux : PostgreSQL → API → React Query → Dashboard
Actions : Utilisateur → Bouton → API → Service → PostgreSQL → Audit Log → UI

SCHOOLFLOW Dashboard doit être centre de pilotage réel établissement.

```

---

## 🛠 ARCHITECTURE RECOMMANDÉE

Pour le Document Builder & Dashboard, structurez ainsi :

```
SCHOOLFLOW/
├── server/
│   ├── routes/
│   │   ├── templates.ts          # CRUD templates
│   │   ├── documents.ts          # Documents générés
│   │   └── dashboard.ts          # Stats par rôle
│   ├── services/
│   │   ├── DocumentBuilder.ts    # PDF generation
│   │   ├── TemplateService.ts    # Template logic
│   │   └── ReportService.ts      # Reporting
│   └── middleware/
│       └── auditLog.ts          # Audit system
├── client/
│   ├── components/
│   │   ├── Dashboard/           # Widgets
│   │   ├── DocumentBuilder/     # Editor
│   │   └── TemplateLibrary/     # Template selector
│   ├── stores/
│   │   └── documentStore.ts     # Zustand state
│   └── pages/
│       └── DocumentBuilder.tsx
└── docs/
    └── templates/               # Starter templates (JSON)
```

---

## 🎨 SCHOOLFLOW — UI/UX PREMIUM + ANIMATIONS + AUTHENTIFICATION

```text
143. DESIGN SYSTEM — SCHOOLFLOW
==================================================

Créer une interface moderne, premium, propre et soigneusement
finie.

SCHOOLFLOW doit donner l'impression d'un logiciel professionnel
commercial utilisé quotidiennement par des établissements
scolaires.

Éviter absolument :

- interface générique générée par IA
- design amateur
- composants disproportionnés
- gradients excessifs
- glassmorphism partout
- animations excessives
- couleurs criardes
- ombres trop fortes
- boutons énormes sans raison
- espaces mal équilibrés
- icônes incohérentes
- pages visuellement vides

Priorités :

1. Hiérarchie visuelle
2. Lisibilité
3. Cohérence
4. Rapidité
5. Accessibilité
6. Responsive
7. Micro-interactions
8. Professionnalisme

144. DESIGN SYSTEM
==================================================

Créer un véritable Design System centralisé.

Définir :

- couleurs
- typographies
- espacements
- rayons
- ombres
- bordures
- tailles de boutons
- tailles d'icônes
- états
- badges
- inputs
- tables
- modales
- drawers
- dropdowns
- tooltips
- notifications

Toutes les pages doivent utiliser les mêmes composants.

Ne pas créer un style différent pour chaque page.

145. TYPOGRAPHIE
==================================================

Utiliser une typographie moderne et très lisible.

Hiérarchie :

Display
H1
H2
H3
Body
Small
Caption

Les titres doivent être clairement différenciés
des informations secondaires.

Éviter les textes trop petits.

Optimiser particulièrement la lisibilité des tableaux
et informations administratives.

146. ICÔNES
==================================================

Utiliser une bibliothèque d'icônes cohérente.

Priorité :

Lucide Icons.

Utiliser également des icônes spécialisées lorsque
cela apporte une vraie valeur.

Règles :

- même style d'icônes
- tailles cohérentes
- stroke cohérent
- jamais mélanger plusieurs styles sans raison
- toujours accompagner les icônes importantes d'un tooltip
  lorsqu'elles sont utilisées seules

Exemples :

Students → Users
Teachers → GraduationCap
Classes → School
Attendance → ClipboardCheck
Grades → BookOpenCheck
Finance → Wallet
Payments → CreditCard
Documents → FileText
Settings → Settings
Notifications → Bell
Search → Search
Add → Plus
Edit → Pencil
Delete → Trash2
Download → Download
Print → Printer
Calendar → CalendarDays

147. BIBLIOTHÈQUE D'ANIMATIONS
==================================================

Utiliser intelligemment :

- Framer Motion / Motion
- Reactbits pour certains composants visuels
- composants 21st.dev lorsque pertinents
- GSAP uniquement pour des animations avancées nécessitant
  réellement son moteur
- CSS transitions pour les micro-interactions simples

IMPORTANT :

Ne jamais ajouter une bibliothèque uniquement pour
faire joli.

Les animations doivent améliorer :

- compréhension
- navigation
- feedback
- perception de performance
- hiérarchie
- continuité visuelle

148. PRINCIPES D'ANIMATION
==================================================

Animations rapides et naturelles.

Durées recommandées :

micro interaction :
100–180ms

transition :
180–300ms

modal :
200–350ms

page transition :
250–450ms

Éviter les animations lentes.

Utiliser :

ease-out
ease-in-out
spring subtil

Éviter :

bounce excessif
rotation inutile
zoom agressif
animations permanentes

149. PAGE TRANSITIONS
==================================================

Créer des transitions fluides entre les pages.

Exemple :

page actuelle
↓
fade + slight translate
↓
nouvelle page

Les transitions doivent être très légères.

Ne jamais bloquer la navigation.

Respecter :

prefers-reduced-motion.

150. SIDEBAR ANIMÉE
==================================================

La sidebar doit pouvoir :

- s'ouvrir
- se réduire
- se développer
- afficher les labels
- afficher uniquement les icônes en mode compact

Animation fluide.

Desktop :

expanded / collapsed

Tablet :

collapsed

Mobile :

drawer

151. MICRO-INTERACTIONS
==================================================

Ajouter des micro-interactions sur :

- boutons
- cartes
- menus
- inputs
- toggles
- checkboxes
- tabs
- pagination
- dropdowns
- notifications

Exemples :

Bouton :

hover
→ légère variation

click
→ feedback subtil

Succès :

→ check animé

Erreur :

→ feedback visuel léger

152. BUTTONS
==================================================

Créer plusieurs variantes :

Primary
Secondary
Outline
Ghost
Destructive
Success
Icon
Icon + Text

Chaque bouton doit avoir :

default
hover
active
focus
disabled
loading

Exemple :

[Enregistrer]

devient :

[Spinner Enregistrement...]

pendant la requête.

153. CARDS
==================================================

Créer des cards propres :

- border subtle
- radius cohérent
- padding équilibré
- hover uniquement lorsque pertinent
- aucune ombre excessive

Les KPI cards peuvent avoir une micro-animation
sur leur valeur lors du chargement.

154. TABLEAUX
==================================================

Créer des tableaux professionnels.

Features :

- sticky header
- hover row
- sélection
- tri
- pagination
- filtres
- recherche
- actions
- responsive
- loading skeleton

Les actions de ligne utilisent un menu :

⋮

avec :

Voir
Modifier
Dupliquer
Archiver
Supprimer

selon les permissions.

155. LOADING EXPERIENCE
==================================================

Ne jamais afficher une page blanche pendant le chargement.

Utiliser :

Skeleton loaders
Progress indicators
Spinners uniquement lorsque pertinent

Les skeletons doivent reproduire approximativement
la structure réelle du contenu.

156. EMPTY STATES
==================================================

Chaque liste vide doit avoir un vrai empty state.

Exemple :

Aucun élève

Icône
Titre
Description

[Ajouter un élève]

Le bouton doit être fonctionnel.

157. ERROR STATES
==================================================

Créer des états d'erreur propres.

Exemple :

Impossible de charger les données.

[Réessayer]

Le bouton doit réellement relancer la requête.

158. TOASTS / NOTIFICATIONS
==================================================

Créer un système de notifications global.

Types :

Success
Error
Warning
Info

Exemple :

✓ Élève créé avec succès.

Les notifications doivent être :

- discrètes
- lisibles
- animées
- empilables
- fermables

159. MODALS
==================================================

Créer des modales professionnelles.

Animation :

opacity
+
scale subtil

ou

opacity
+
translateY léger

Prévoir :

ESC
clic extérieur lorsque pertinent
bouton fermer
focus management

160. DRAWERS
==================================================

Utiliser des drawers pour :

- détails élève
- détails paiement
- détails enseignant
- notifications
- filtres avancés

Animation latérale fluide.

161. TOOLTIPS
==================================================

Utiliser des tooltips pour les icônes seules.

Exemples :

Edit
Delete
Download
Print
Refresh
Settings

Ne pas utiliser de tooltip sur chaque élément inutilement.

162. COMMAND PALETTE
==================================================

Créer une Command Palette professionnelle.

Raccourci :

Ctrl + K

Permettre :

Rechercher un élève
Ouvrir dashboard
Créer un élève
Créer paiement
Ouvrir notes
Ouvrir documents
Ouvrir paramètres

Les commandes doivent déclencher les vraies actions.

163. ONBOARDING — PREMIÈRE UTILISATION
==================================================

Créer un véritable onboarding pour les nouveaux utilisateurs.

Après la première connexion :

Bienvenue dans SchoolFlow.

Étape 1 :
Créer / configurer l'établissement

Étape 2 :
Année scolaire

Étape 3 :
Logo

Étape 4 :
Informations établissement

Étape 5 :
Créer les niveaux/classes

Étape 6 :
Ajouter les enseignants

Étape 7 :
Importer les élèves

Étape 8 :
Configurer les frais scolaires

Étape 9 :
Configurer les templates de documents

Étape 10 :
Terminer la configuration

Afficher une progression :

1 / 10
2 / 10
...

Permettre :

[Continuer]
[Retour]
[Passer pour le moment]

164. ONBOARDING VISUEL
==================================================

L'onboarding doit être premium.

Utiliser :

- illustrations légères
- icônes
- animations Framer Motion
- progress indicator
- transitions entre étapes

Ne pas utiliser une animation lourde.

Chaque étape doit expliquer clairement son objectif.

165. CHECKLIST DE CONFIGURATION
==================================================

Après onboarding, afficher une checklist :

Configuration SchoolFlow

✓ Établissement
✓ Année scolaire
✓ Logo
✓ Classes

○ Enseignants
○ Élèves
○ Frais scolaires
○ Templates

Afficher :

"75% terminé"

Chaque élément doit être cliquable et ouvrir
la fonctionnalité correspondante.

166. REGISTER — INSCRIPTION
==================================================

Créer une page d'inscription professionnelle.

Structure :

Logo SchoolFlow

Créer votre compte

Nom
Prénom
Email
Téléphone
Mot de passe
Confirmation mot de passe

Checkbox :

J'accepte les conditions d'utilisation.

Bouton :

[Créer mon compte]

Afficher :

force du mot de passe
validation des champs
erreurs en temps réel

Pendant l'inscription :

[Création du compte...]

Après succès :

→ création réelle du compte
→ session
→ onboarding

167. VALIDATION REGISTER
==================================================

Validation :

email valide
mot de passe suffisamment sécurisé
confirmation identique
email non déjà utilisé

Afficher les erreurs sous les champs.

Ne pas attendre le submit pour toutes les validations.

168. LOGIN
==================================================

Page de connexion premium.

Email
Mot de passe

Options :

[Se connecter]

[Mot de passe oublié ?]

[Créer un compte]

[Afficher le mot de passe]

Prévoir éventuellement :

"Se souvenir de moi"

Ne pas conserver inutilement les mots de passe.

169. FORGOT PASSWORD
==================================================

Créer un vrai processus :

Étape 1 :

Entrer email

[Envoyer le lien]

Étape 2 :

Email envoyé

"Si ce compte existe, un lien de récupération
a été envoyé."

Étape 3 :

Réinitialisation

Nouveau mot de passe
Confirmation

Étape 4 :

Succès

"Votre mot de passe a été réinitialisé."

[Se connecter]

Le système doit utiliser un vrai token
de récupération avec expiration.

170. RESET PASSWORD
==================================================

Le token doit être :

- aléatoire
- à usage unique
- expirant
- stocké de manière sécurisée

Après utilisation :

invalider le token.

Ne jamais stocker le token de reset
en clair lorsque ce n'est pas nécessaire.

171. EMAIL VERIFICATION
==================================================

Après inscription, si activé :

Afficher :

"Vérifiez votre adresse email."

Boutons :

[Renvoyer l'email]

[Modifier l'adresse]

Le lien doit avoir une durée de validité.

172. SESSION MANAGEMENT
==================================================

Créer une page :

"Sessions actives"

Afficher :

Appareil
Navigateur
Localisation approximative si disponible
Dernière activité
Date de connexion

Action :

[Déconnecter]

Prévoir :

[Déconnecter toutes les sessions]

173. SECURITY UX
==================================================

Lors d'une action sensible :

demander confirmation.

Exemples :

changement email
changement mot de passe
suppression compte
déconnexion globale

174. PROFILE
==================================================

Page profil :

photo
nom
prénom
email
téléphone
rôle
établissement

Actions :

[Modifier]
[Changer photo]
[Changer mot de passe]

Toutes fonctionnelles.

175. SETTINGS
==================================================

Créer un centre de paramètres.

Sections :

Compte
Sécurité
Établissement
Année scolaire
Notifications
Apparence
Documents
Finance
Permissions
Stockage
Sessions

176. APPEARANCE
==================================================

Permettre :

Light
Dark
System

Accent color configurable uniquement si cela
reste cohérent avec le Design System.

Sauvegarder la préférence.

177. ACCESSIBILITY
==================================================

Respecter :

WCAG autant que possible.

Prévoir :

- navigation clavier
- focus visible
- labels accessibles
- contraste correct
- aria-label
- reduced motion
- taille des zones cliquables adaptée

178. MOBILE
==================================================

Sur mobile :

navigation drawer
bottom actions lorsque pertinent
tables adaptées
modales adaptées
formulaires une colonne
boutons facilement accessibles

Ne jamais simplement réduire la version desktop.

Créer une véritable expérience mobile.

179. PERFORMANCE UI
==================================================

Animations GPU-friendly.

Préférer :

transform
opacity

Éviter les animations coûteuses sur :

width
height
top
left

lorsqu'une alternative transform est possible.

Lazy-load :

pages
images
composants lourds
éditeur de documents
graphiques

180. CONSISTANCE VISUELLE
==================================================

Toutes les pages doivent respecter le même langage visuel.

Même :

- spacing
- radius
- typography
- icons
- buttons
- forms
- tables
- modal
- animations

Une nouvelle fonctionnalité doit utiliser les composants
existants avant de créer un nouveau composant.

181. FINITION
==================================================

Avant livraison :

inspecter visuellement chaque page.

Corriger :

- alignements
- espacements
- tailles
- responsive
- overflow
- textes coupés
- boutons trop grands
- icônes mal alignées
- animations incohérentes
- contrastes
- états loading
- états empty
- états error

SCHOOLFLOW doit avoir une finition comparable à un
produit SaaS professionnel.

182. RÈGLE ABSOLUE
==================================================

Les animations ne doivent jamais masquer une fonctionnalité
incomplète.

PRIORITÉ :

Fonctionnalité réelle
>
UX
>
Performance
>
Animation

L'animation vient en dernier.

Chaque composant animé doit rester parfaitement utilisable
sans animation.

Respecter prefers-reduced-motion.

183. STACK UI RECOMMANDÉE
==================================================

Utiliser selon les besoins :

React
TypeScript
Tailwind CSS
shadcn/ui
Lucide React
Motion / Framer Motion
React Hook Form
Zod
TanStack Query
React Router
Recharts

21st.dev et React Bits peuvent être utilisés comme
source de composants et d'inspiration pour les éléments
premium, mais tous les composants doivent être intégrés
au Design System SCHOOLFLOW.

Ne pas importer aveuglément plusieurs styles différents.

Tout doit avoir une apparence cohérente.

✨ Le résultat visuel recherché
```
