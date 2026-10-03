# SCHOOLFLOW

Système de gestion scolaire professionnel pour les écoles privées.

## Fonctionnalités

- Gestion des élèves, enseignants, parents
- Gestion des classes, matières, emploi du temps
- Gestion des notes, bulletins, évaluations
- Gestion des frais scolaires, paiements, caisse
- Gestion des documents, annonces, notifications
- Tableaux de bord par rôle
- Import/Export CSV
- Génération PDF (bulletins, reçus, certificats)
- Multi-établissements
- RBAC complet
- OTP par email
- Upload d'images via ImageKit

## Installation

### Prérequis
- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

### Backend
```bash
cd server
npm install
cp .env.example .env
# Configurer les variables d'environnement
npm run dev
```

### Frontend
```bash
cd client
npm install
npm run dev
```

### Base de données
```bash
cd server
npm run db:create
npm run db:migrate
npm run db:seed
```

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| Admin | admin@schoolflow.com | password123 |
| Directeur | director@schoolflow.com | password123 |
| Enseignant | teacher1@schoolflow.com | password123 |
| Comptable | accountant@schoolflow.com | password123 |

## Architecture

```
schoolflow/
├── server/          # API Express + TypeScript
│   ├── src/
│   │   ├── config/      # Configuration centralisée
│   │   ├── controllers/ # Contrôleurs
│   │   ├── middleware/  # Middlewares (auth, RBAC, rate limit)
│   │   ├── models/      # Modèles Sequelize
│   │   ├── routes/      # Routes API
│   │   ├── services/    # Logique métier
│   │   ├── utils/       # Utilitaires
│   │   └── types/       # Types TypeScript
│   └── tests/           # Tests
├── client/          # Frontend React + TypeScript
│   └── src/
│       ├── components/  # Composants réutilisables
│       ├── pages/       # Pages
│       ├── store/       # État global (Zustand)
│       ├── lib/         # Utilitaires
│       └── types/       # Types TypeScript
└── uploads/          # Fichiers uploadés
```

## API

### Authentification
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- POST /api/v1/auth/refresh
- POST /api/v1/auth/forgot-password
- POST /api/v1/auth/reset-password

### Élèves
- GET /api/v1/students
- POST /api/v1/students
- GET /api/v1/students/:id
- PATCH /api/v1/students/:id
- DELETE /api/v1/students/:id

### [Other endpoints...]

## Sécurité

- JWT + refresh tokens
- httpOnly cookies
- Rate limiting
- Helmet
- CORS
- Validation des données
- RBAC côté serveur
- Multi-tenant isolation

## Licence

MIT
