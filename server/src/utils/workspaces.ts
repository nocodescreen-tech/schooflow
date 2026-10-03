/**
 * Workspaces — the specialised spaces of SchoolFlow.
 *
 * A workspace is NOT a role and NOT an account. One person holds ONE account
 * and may have SEVERAL roles, each of which opens a different workspace. The
 * workspace only changes the PRESENTATION; it never grants a permission the
 * user does not actually hold.
 *
 * This file is the single source of truth for the spaces declared in the
 * product spec (SYSTEM_ADMIN, SCHOOL_ADMIN, ENSEIGNANT, ELEVE, PARENT…).
 */

export type WorkspaceCode =
  | 'SYSTEM_ADMIN'
  | 'SCHOOL_ADMIN'
  | 'DIRECTION'
  | 'DIRECTEUR_ETUDES'
  | 'SECRETARIAT'
  | 'ENSEIGNANT'
  | 'TITULAIRE'
  | 'PREFECT'
  | 'DISCIPLINE'
  | 'FINANCE'
  | 'CAISSERIE'
  | 'RH'
  | 'ORIENTATION'
  | 'ARCHIVES'
  | 'PARENT'
  | 'ELEVE';

export interface WorkspaceDef {
  code: WorkspaceCode;
  name: string;
  description: string;
  icon: string;
  /** Landing route for this workspace. */
  home: string;
  /**
   * Modules that must be enabled for the workspace to appear at all.
   * A parent workspace with the Parent Portal off simply does not exist.
   */
  requiresModules: string[];
  /**
   * Legacy `users.role` values that open this workspace. A user may match
   * several; each match becomes an available space in the switcher.
   */
  legacyRoles: string[];
  /** Roles that identify the holder as a system administrator. */
  systemLevel?: boolean;
  /** Order in the workspace switcher. */
  order: number;
}

export const WORKSPACES: WorkspaceDef[] = [
  {
    code: 'SYSTEM_ADMIN',
    name: 'Administration système',
    description: 'Configuration technique, sécurité, stockage et supervision de la plateforme',
    icon: 'ShieldCog',
    home: '/app/dashboard',
    requiresModules: [],
    legacyRoles: ['super_admin'],
    systemLevel: true,
    order: 1,
  },
  {
    code: 'SCHOOL_ADMIN',
    name: 'Administration de l’établissement',
    description: 'Scolarité, académique, utilisateurs et configuration fonctionnelle',
    icon: 'Settings',
    home: '/app/dashboard',
    requiresModules: [],
    legacyRoles: ['admin'],
    order: 2,
  },
  {
    code: 'DIRECTION',
    name: 'Direction',
    description: 'Pilotage de l’établissement : indicateurs, pédagogie, discipline et finance',
    icon: 'Building2',
    home: '/app/dashboard',
    requiresModules: [],
    legacyRoles: ['director'],
    order: 3,
  },
  {
    code: 'DIRECTEUR_ETUDES',
    name: 'Direction des études',
    description: 'Classes, enseignants, affectations, notes, validation et bulletins',
    icon: 'GraduationCap',
    home: '/app/dashboard',
    requiresModules: [],
    legacyRoles: ['directeur_etudes'],
    order: 4,
  },
  {
    code: 'SECRETARIAT',
    name: 'Secrétariat',
    description: 'Élèves, inscriptions, dossiers, certificats et archives',
    icon: 'ClipboardList',
    home: '/app/dashboard',
    requiresModules: [],
    legacyRoles: ['receptionist'],
    order: 5,
  },
  {
    code: 'ENSEIGNANT',
    name: 'Espace enseignant',
    description: 'Mes classes, mes matières, présences, notes et évaluations',
    icon: 'BookOpen',
    home: '/app/teacher',
    requiresModules: [],
    legacyRoles: ['teacher'],
    order: 6,
  },
  {
    code: 'TITULAIRE',
    name: 'Ma classe',
    description: 'Élèves de ma classe, présences, résultats et communication',
    icon: 'Users',
    home: '/app/dashboard',
    requiresModules: [],
    legacyRoles: ['titulaire'],
    order: 7,
  },
  {
    code: 'PREFECT',
    name: 'Préfecture',
    description: 'Vie scolaire : présences, discipline et sanctions',
    icon: 'ShieldCheck',
    home: '/app/prefect',
    requiresModules: ['discipline'],
    legacyRoles: ['prefect'],
    order: 8,
  },
  {
    code: 'DISCIPLINE',
    name: 'Discipline',
    description: 'Incidents, dossiers disciplinaires, convocations et conseil',
    icon: 'ShieldAlert',
    home: '/app/discipline',
    requiresModules: ['discipline'],
    legacyRoles: [],
    order: 9,
  },
  {
    code: 'FINANCE',
    name: 'Finance',
    description: 'Frais, paiements, reçus, caisse, impayés et rapports',
    icon: 'Wallet',
    home: '/app/accountant',
    requiresModules: ['finance'],
    legacyRoles: ['accountant'],
    order: 10,
  },
  {
    code: 'CAISSERIE',
    name: 'Caisse',
    description: 'Encaissements, reçus et suivi de la caisse',
    icon: 'CreditCard',
    home: '/app/payments',
    requiresModules: ['finance'],
    legacyRoles: ['caisseur'],
    order: 11,
  },
  {
    code: 'RH',
    name: 'Ressources humaines',
    description: 'Personnel, contrats, congés et absences',
    icon: 'UserCog',
    home: '/app/vacation-tickets',
    requiresModules: ['hr'],
    legacyRoles: ['rh'],
    order: 12,
  },
  {
    code: 'ORIENTATION',
    name: 'Orientation',
    description: 'Profils, aptitudes, entretiens et choix de filière',
    icon: 'Compass',
    home: '/app/dashboard',
    requiresModules: ['orientation'],
    legacyRoles: ['conseiller_orientation'],
    order: 13,
  },
  {
    code: 'ARCHIVES',
    name: 'Archives',
    description: 'Consultation et gestion des archives',
    icon: 'Archive',
    home: '/app/documents',
    requiresModules: [],
    legacyRoles: ['archiviste'],
    order: 14,
  },
  {
    code: 'PARENT',
    name: 'Espace parent',
    description: 'Suivi des résultats, présences et documents de mes enfants',
    icon: 'User',
    // The parent portal is optional: with the module off this space vanishes.
    home: '/app/parent',
    requiresModules: ['parents'],
    legacyRoles: ['parent'],
    order: 15,
  },
  {
    code: 'ELEVE',
    name: 'Mon espace',
    description: 'Mes notes, mes bulletins, mes présences et mon emploi du temps',
    icon: 'GraduationCap',
    home: '/app/student',
    requiresModules: [],
    legacyRoles: ['student'],
    order: 16,
  },
];

export const WORKSPACE_MAP: Record<string, WorkspaceDef> = Object.fromEntries(
  WORKSPACES.map((w) => [w.code, w])
);

export function getWorkspace(code: string): WorkspaceDef | undefined {
  return WORKSPACE_MAP[code];
}

/**
 * The workspace a legacy role opens when no explicit choice has been made.
 * A user with several roles gets several workspaces; the first is the default.
 */
export function workspacesForRole(role: string): WorkspaceDef[] {
  return WORKSPACES.filter((w) => w.legacyRoles.includes(role)).sort((a, b) => a.order - b.order);
}
