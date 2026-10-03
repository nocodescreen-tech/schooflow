import type { WorkspaceCode } from './workspaces.js';
import { WORKSPACE_MAP as WORKSPACE_BY_CODE } from './workspaces.js';

/**
 * Central navigation definition.
 *
 * ONE tree serves every workspace. An item is visible to a workspace only when
 * it is listed in `workspaces` AND the module is enabled AND the user really
 * holds the permission. There is no per-role menu anywhere else: the sidebar
 * is generated from this file and nothing is hardcoded in the client.
 *
 * The decision table is:
 *   USER ACTIVE AND SCHOOL MATCH AND MODULE ACTIVE
 *   AND WORKSPACE ALLOWED AND PERMISSION PRESENT AND SCOPE VALID
 */

export type NavSection =
  | 'PRINCIPAL' | 'SCOLARITE' | 'ACADEMIQUE' | 'FINANCE' | 'DOCUMENTS'
  | 'COMMUNICATION' | 'PERSONNEL' | 'ANALYSE' | 'ADMINISTRATION' | 'SYSTEME';

export const SECTION_LABELS: Record<NavSection, string> = {
  PRINCIPAL: 'Principal',
  SCOLARITE: 'Scolarité',
  ACADEMIQUE: 'Académique',
  FINANCE: 'Finance',
  DOCUMENTS: 'Documents',
  COMMUNICATION: 'Communication',
  PERSONNEL: 'Personnel',
  ANALYSE: 'Analyse',
  ADMINISTRATION: 'Administration',
  SYSTEME: 'Système',
};

export const SECTION_ORDER: NavSection[] = [
  'PRINCIPAL', 'SCOLARITE', 'ACADEMIQUE', 'FINANCE', 'DOCUMENTS',
  'COMMUNICATION', 'PERSONNEL', 'ANALYSE', 'ADMINISTRATION', 'SYSTEME',
];

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  section: NavSection;
  /** Module that must be enabled for this entry to exist. */
  module?: string;
  /** Permission required; absence means "any authenticated user of the workspace". */
  permission?: string;
  /** Workspaces in which this entry is offered. Omitted = all workspaces. */
  workspaces?: WorkspaceCode[];
  order?: number;
  /** Marks the workspace landing entry so it can be highlighted. */
  isHome?: boolean;
}

const ALL: WorkspaceCode[] | undefined = undefined; // undefined = every workspace

/**
 * The tree. Kept flat on purpose: sections and ordering are derived, which
 * makes it trivial to add an entry without touching rendering code.
 */
export const NAVIGATION: NavItem[] = [
  // ───────────── PRINCIPAL ─────────────
  { id: 'dashboard', label: 'Tableau de bord', path: '/app/dashboard', icon: 'LayoutDashboard', section: 'PRINCIPAL', workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT', 'TITULAIRE', 'DISCIPLINE', 'ARCHIVES'], order: 1 },
  { id: 'teacher-home', label: 'Accueil', path: '/app/teacher', icon: 'LayoutDashboard', section: 'PRINCIPAL', workspaces: ['ENSEIGNANT'], order: 1, isHome: true },
  { id: 'student-home', label: 'Accueil', path: '/app/student', icon: 'LayoutDashboard', section: 'PRINCIPAL', workspaces: ['ELEVE'], order: 1, isHome: true },
  { id: 'parent-home', label: 'Mes enfants', path: '/app/parent', icon: 'User', section: 'PRINCIPAL', workspaces: ['PARENT'], order: 1, isHome: true },
  { id: 'prefect-home', label: 'Tableau de bord', path: '/app/prefect', icon: 'LayoutDashboard', section: 'PRINCIPAL', workspaces: ['PREFECT', 'DISCIPLINE'], order: 1, isHome: true },
  { id: 'accountant-home', label: 'Tableau de bord', path: '/app/accountant', icon: 'LayoutDashboard', section: 'PRINCIPAL', workspaces: ['FINANCE', 'CAISSERIE'], order: 1, isHome: true },
  { id: 'profile', label: 'Mon profil', path: '/app/profile', icon: 'UserCircle', section: 'PRINCIPAL', order: 2 },

  // ───────────── SCOLARITÉ ─────────────
  { id: 'students', label: 'Élèves', path: '/app/students', icon: 'Users', section: 'SCOLARITE', permission: 'students.view', order: 1, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT', 'PREFECT', 'TITULAIRE', 'FINANCE', 'ORIENTATION', 'ARCHIVES'] },
  { id: 'enrollment', label: 'Inscriptions', path: '/app/enrollment', icon: 'ClipboardCheck', section: 'SCOLARITE', module: 'enrollment', permission: 'enrollment.view', order: 2, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT'] },
  { id: 'classes', label: 'Classes', path: '/app/classes', icon: 'School', section: 'SCOLARITE', permission: 'classes.view', order: 3, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT', 'PREFECT', 'ENSEIGNANT', 'TITULAIRE', 'FINANCE', 'ARCHIVES'] },
  { id: 'teachers', label: 'Enseignants', path: '/app/teachers', icon: 'GraduationCap', section: 'SCOLARITE', permission: 'teachers.view', order: 4, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'ENSEIGNANT'] },
  { id: 'structure', label: 'Structure académique', path: '/app/settings', icon: 'Network', section: 'SCOLARITE', permission: 'classes.view', order: 5, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES'] },
  { id: 'timetable', label: 'Emploi du temps', path: '/app/timetable', icon: 'CalendarDays', section: 'SCOLARITE', permission: 'timetable.view', order: 6, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT', 'ENSEIGNANT', 'TITULAIRE'] },
  { id: 'parents', label: 'Parents', path: '/app/parents', icon: 'Users', section: 'SCOLARITE', module: 'parents', permission: 'parents.view', order: 7, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT'] },
  { id: 'my-schedule', label: 'Mon emploi du temps', path: '/app/schedule', icon: 'CalendarDays', section: 'SCOLARITE', permission: 'timetable.view', order: 1, workspaces: ['ELEVE', 'PARENT'] },

  // ───────────── ACADÉMIQUE ─────────────
  { id: 'subjects', label: 'Matières', path: '/app/subjects', icon: 'BookOpen', section: 'ACADEMIQUE', permission: 'subjects.view', order: 1, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT', 'ENSEIGNANT', 'TITULAIRE'] },
  { id: 'grades', label: 'Notes', path: '/app/grades', icon: 'ClipboardList', section: 'ACADEMIQUE', permission: 'grades.view', order: 2, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'ENSEIGNANT', 'TITULAIRE', 'RH'] },
  { id: 'attendance', label: 'Présences', path: '/app/attendance', icon: 'CalendarCheck', section: 'ACADEMIQUE', permission: 'attendance.view', order: 3, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'PREFECT', 'SECRETARIAT', 'ENSEIGNANT', 'TITULAIRE'] },
  { id: 'report-cards', label: 'Bulletins', path: '/app/report-cards', icon: 'FileText', section: 'ACADEMIQUE', permission: 'report-cards.view', order: 4, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'TITULAIRE'] },
  { id: 'promotion', label: 'Passage d\u2019ann\u00e9e', path: '/app/promotion', icon: 'ArrowRightLeft', section: 'ACADEMIQUE', module: 'promotion', permission: 'promotion.view', order: 5, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES'] },
  { id: 'academic-years', label: 'Ann\u00e9es scolaires', path: '/app/academic-years', icon: 'Calendar', section: 'ACADEMIQUE', module: 'academic-years', permission: 'academic-years.view', order: 6, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES'] },
  { id: 'rollover', label: 'Report d\u2019ann\u00e9e', path: '/app/rollover', icon: 'RotateCcw', section: 'ACADEMIQUE', module: 'academic-years', permission: 'academic-years.manage', order: 7, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES'] },
  // Student & parent see the SAME pages with their own wording \u2014 the pages
  // already scope the data to SELF / LINKED_CHILDREN.
  { id: 'my-grades', label: 'Mes notes', path: '/app/grades', icon: 'ClipboardList', section: 'ACADEMIQUE', permission: 'grades.view', order: 2, workspaces: ['ELEVE', 'PARENT'] },
  { id: 'my-attendance', label: 'Mes pr\u00e9sences', path: '/app/attendance', icon: 'CalendarCheck', section: 'ACADEMIQUE', permission: 'attendance.view', order: 3, workspaces: ['ELEVE', 'PARENT'] },
  { id: 'my-report-cards', label: 'Mes bulletins', path: '/app/report-cards', icon: 'FileText', section: 'ACADEMIQUE', permission: 'report-cards.view', order: 4, workspaces: ['ELEVE', 'PARENT'] },

  // ───────────── FINANCE (module-gated) ─────────────
  { id: 'fees', label: 'Frais scolaires', path: '/app/fees', icon: 'Receipt', section: 'FINANCE', module: 'finance', permission: 'fees.view', order: 1, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'SECRETARIAT', 'FINANCE', 'CAISSERIE'] },
  { id: 'payments', label: 'Paiements', path: '/app/payments', icon: 'CreditCard', section: 'FINANCE', module: 'finance', permission: 'payments.view', order: 2, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'SECRETARIAT', 'FINANCE', 'CAISSERIE'] },
  { id: 'cash', label: 'Caisse', path: '/app/cash', icon: 'Wallet', section: 'FINANCE', module: 'finance', permission: 'cash.view', order: 3, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'FINANCE', 'CAISSERIE'] },
  { id: 'my-fees', label: 'Ma situation financière', path: '/app/fees', icon: 'Receipt', section: 'FINANCE', module: 'finance', permission: 'fees.view', order: 1, workspaces: ['ELEVE', 'PARENT'] },
  { id: 'settings-finance', label: 'Devise et taux', path: '/app/settings', icon: 'Coins', section: 'FINANCE', module: 'finance', permission: 'finance.view', order: 4, workspaces: ['SCHOOL_ADMIN', 'DIRECTION', 'FINANCE'] },

  // ───────────── DOCUMENTS ─────────────
  { id: 'documents', label: 'Documents', path: '/app/documents', icon: 'FolderOpen', section: 'DOCUMENTS', permission: 'documents.view', order: 1, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT', 'PREFECT', 'TITULAIRE', 'FINANCE', 'CAISSERIE', 'ARCHIVES', 'ELEVE', 'PARENT', 'ENSEIGNANT', 'RH'] },
  { id: 'document-builder', label: 'Éditeur de documents', path: '/app/document-builder', icon: 'Layers', section: 'DOCUMENTS', module: 'templates', permission: 'templates.view', order: 2, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT'] },

  // ───────────── COMMUNICATION ─────────────
  { id: 'announcements', label: 'Annonces', path: '/app/announcements', icon: 'Megaphone', section: 'COMMUNICATION', module: 'communication', permission: 'announcements.view', order: 1, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT', 'PREFECT', 'TITULAIRE', 'FINANCE', 'RH', 'ORIENTATION', 'ARCHIVES'] },
  { id: 'my-announcements', label: 'Annonces', path: '/app/announcements', icon: 'Bell', section: 'COMMUNICATION', permission: 'announcements.view', order: 1, workspaces: ['ENSEIGNANT', 'ELEVE', 'PARENT'] },
  { id: 'messages', label: 'Messages', path: '/app/messages', icon: 'MessageSquare', section: 'COMMUNICATION', module: 'communication', permission: 'messages.view', order: 2, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT', 'PREFECT', 'TITULAIRE', 'FINANCE', 'CAISSERIE', 'RH', 'ORIENTATION', 'ARCHIVES', 'ENSEIGNANT', 'ELEVE', 'PARENT'] },
  { id: 'alerts', label: 'Alertes', path: '/app/alerts', icon: 'Siren', section: 'COMMUNICATION', permission: 'notifications.view', order: 3, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'PREFECT', 'TITULAIRE', 'RH'] },
  { id: 'calendar', label: 'Calendrier', path: '/app/calendar', icon: 'Calendar', section: 'COMMUNICATION', module: 'calendar', permission: 'events.view', order: 4, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'SECRETARIAT', 'PREFECT', 'TITULAIRE', 'RH', 'ARCHIVES', 'ELEVE', 'PARENT', 'ENSEIGNANT'] },

  // ───────────── PERSONNEL ─────────────
  { id: 'vacation-tickets', label: 'Congés', path: '/app/vacation-tickets', icon: 'Plane', section: 'PERSONNEL', permission: 'documents.view', order: 1, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'RH', 'SECRETARIAT'] },

  // ───────────── VIE SCOLAIRE ─────────────
  { id: 'discipline', label: 'Discipline', path: '/app/discipline', icon: 'ShieldAlert', section: 'PERSONNEL', module: 'discipline', permission: 'discipline.view', order: 2, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'SECRETARIAT', 'PREFECT', 'DISCIPLINE', 'TITULAIRE'] },
  { id: 'my-discipline', label: 'Mon dossier', path: '/app/discipline', icon: 'ShieldAlert', section: 'PERSONNEL', module: 'discipline', permission: 'discipline.view', order: 2, workspaces: ['ELEVE', 'PARENT'] },

  // ───────────── ANALYSE ─────────────
  { id: 'reports', label: 'Rapports', path: '/app/reports', icon: 'BarChart3', section: 'ANALYSE', module: 'reports', permission: 'reports.view', order: 1, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES', 'PREFECT', 'TITULAIRE', 'RH', 'ARCHIVES'] },
  { id: 'import-export', label: 'Import / Export', path: '/app/import-export', icon: 'Upload', section: 'ANALYSE', module: 'import-export', permission: 'import-export.export', order: 2, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION'] },

  // ───────────── ADMINISTRATION ─────────────
  { id: 'users', label: 'Utilisateurs', path: '/app/users', icon: 'UserCog', section: 'ADMINISTRATION', permission: 'users.view', order: 1, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION'] },
  { id: 'roles', label: 'Rôles & permissions', path: '/app/roles', icon: 'ShieldCheck', section: 'ADMINISTRATION', permission: 'roles.view', order: 2, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION'] },
  { id: 'delegations', label: 'Délégations', path: '/app/delegations', icon: 'ArrowRightLeft', section: 'ADMINISTRATION', permission: 'delegations.view', order: 3, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION'] },
  { id: 'my-delegations', label: 'Mes délégations', path: '/app/delegations', icon: 'ArrowRightLeft', section: 'ADMINISTRATION', order: 3, workspaces: ['ENSEIGNANT', 'TITULAIRE', 'SECRETARIAT', 'FINANCE', 'CAISSERIE', 'RH', 'DISCIPLINE', 'PREFECT', 'DIRECTEUR_ETUDES', 'ORIENTATION', 'ARCHIVES'] },
  { id: 'settings', label: 'Paramètres', path: '/app/settings', icon: 'Settings', section: 'ADMINISTRATION', permission: 'settings.view', order: 4, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES'] },

  // ───────────── SYSTÈME ─────────────
  { id: 'sessions', label: 'Sessions', path: '/app/sessions', icon: 'Monitor', section: 'SYSTEME', permission: 'sessions.view', order: 1, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'RH'] },
  { id: 'audit-logs', label: 'Journal d’audit', path: '/app/audit-logs', icon: 'ScrollText', section: 'SYSTEME', permission: 'audit.view', order: 2, workspaces: ['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION'] },
];

export interface NavSectionGroup {
  section: NavSection;
  label: string;
  items: NavItem[];
}

export interface NavigationContext {
  workspace: WorkspaceCode;
  permissions: string[];
  enabledModules: Set<string>;
  isSuperuser: boolean;
}

/**
 * Decides whether one navigation entry may be shown, applying the full
 * decision table: workspace allowed AND module enabled AND permission held.
 */
export function isNavItemAllowed(item: NavItem, ctx: NavigationContext): boolean {
  // 1. Workspace allowed
  if (item.workspaces && !item.workspaces.includes(ctx.workspace)) return false;
  // 2. Module enabled
  if (item.module && !ctx.enabledModules.has(item.module)) return false;
  // 3. Permission held
  if (item.permission) {
    if (ctx.isSuperuser) return true;
    if (!ctx.permissions.includes(item.permission)) return false;
  }
  return true;
}

/** Builds the grouped, ordered navigation for a workspace. */
export function buildNavigation(ctx: NavigationContext): NavSectionGroup[] {
  // An optional space whose module is off must render nothing at all, not a
  // filtered shell. WorkspaceService normally prevents this, but the navigation
  // builder refuses to leak it on its own too.
  const workspaceDef = WORKSPACE_BY_CODE[ctx.workspace];
  if (workspaceDef && workspaceDef.requiresModules.some((m) => !ctx.enabledModules.has(m))) {
    return [];
  }
  const allowed = NAVIGATION.filter((item) => isNavItemAllowed(item, ctx));
  const groups = new Map<NavSection, NavItem[]>();
  for (const item of allowed) {
    const list = groups.get(item.section);
    if (list) list.push(item);
    else groups.set(item.section, [item]);
  }
  return SECTION_ORDER.filter((s) => groups.has(s)).map((section) => ({
    section,
    label: SECTION_LABELS[section],
    items: (groups.get(section) ?? []).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.label.localeCompare(b.label)),
  }));
}
