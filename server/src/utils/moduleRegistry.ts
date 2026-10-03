/**
 * Module Registry — the single source of truth for SchoolFlow's modularity.
 *
 * Every capability in SchoolFlow declares itself here: its identity, the
 * modules it depends on, the permissions it installs, the API route that owns
 * it, the navigation it contributes, the settings it needs and the workflows
 * it activates.
 *
 * Adding a new capability (e.g. TRANSPORT) means adding ONE entry here plus its
 * router. The dependency resolver, the enable/disable API, the navigation
 * builder and the frontend module page all derive from this file — nothing
 * else needs to change.
 *
 * Design rules:
 *  - `code` is stable and is what gets stored in school_modules.module_code
 *  - a module may not be enabled while one of its `dependencies` is off
 *  - disabling a module NEVER deletes data: it only hides navigation, blocks
 *    routes/API and prevents use. Re-enabling restores access to the history.
 */

export type ModuleCategory = 'Noyau' | 'Scolarité' | 'Académique' | 'Gestion' | 'Vie scolaire' | 'Communication' | 'Documents' | 'Ressources' | 'Pilotage';

export type ModuleLifecycle = 'core' | 'optional' | 'coming_soon';

export interface ModuleSetting {
  key: string;
  label: string;
  type: 'boolean' | 'number' | 'text' | 'select';
  options?: string[];
  default: boolean | number | string;
  help?: string;
}

export interface ModuleNavEntry {
  path: string;
  label: string;
  icon: string;
  /** Permission required for this entry to appear. */
  permission?: string;
  order?: number;
}

export interface ModuleDef {
  code: string;
  name: string;
  description: string;
  category: ModuleCategory;
  lifecycle: ModuleLifecycle;
  /** Module codes that must be enabled before this one can be enabled. */
  dependencies: string[];
  /** API route segment (mounted at /api/v1/<route>). */
  routes: string[];
  /** Permissions installed when the module is enabled. */
  permissions: string[];
  /** Navigation contributed to the sidebar. */
  nav: ModuleNavEntry[];
  /** Configuration the school must provide. */
  settings: ModuleSetting[];
  /** Workflows the module activates on enable. */
  workflows: string[];
  /** Dashboard widgets the module feeds. */
  dashboards: string[];
  /** Notification events the module emits. */
  notifications: string[];
}

const s = (
  key: string,
  label: string,
  type: ModuleSetting['type'],
  def: ModuleSetting['default'],
  help?: string,
  options?: string[]
): ModuleSetting => ({ key, label, type, default: def, help, options });

export const MODULE_REGISTRY: ModuleDef[] = [
  // ───────────────────────────── Noyau (core, always on) ─────────────────────────────
  {
    code: 'school',
    name: 'Établissement',
    description: 'Identité, informations administratives et paramètres de l’école',
    category: 'Noyau',
    lifecycle: 'core',
    dependencies: [],
    routes: ['settings', 'dashboard'],
    permissions: ['settings.view', 'settings.update', 'settings.manage'],
    nav: [{ path: '/app/settings', label: 'Paramètres', icon: 'Settings', permission: 'settings.view' }],
    settings: [s('currency', 'Devise monétaire', 'text', 'USD'), s('timezone', 'Fuseau horaire', 'text', 'Africa/Kinshasa'), s('dateFormat', 'Format de date', 'select', 'DD/MM/YYYY', undefined, ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'])],
    workflows: [],
    dashboards: ['school_identity'],
    notifications: [],
  },
  {
    code: 'structure',
    name: 'Structure académique',
    description: 'Cycles, filières, sections, options et niveaux — configurables par l’établissement',
    category: 'Noyau',
    lifecycle: 'core',
    dependencies: [],
    routes: ['structure'],
    permissions: ['classes.view', 'classes.create', 'classes.update'],
    nav: [{ path: '/app/settings', label: 'Structure', icon: 'Network' }],
    settings: [],
    workflows: ['structure_configuration'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'academic-years',
    name: 'Années scolaires',
    description: 'Années, périodes, clôture et archivage',
    category: 'Noyau',
    lifecycle: 'core',
    dependencies: ['structure'],
    routes: ['academic-years'],
    permissions: ['academic-years.view', 'academic-years.manage'],
    nav: [],
    settings: [s('periodsPerYear', 'Nombre de périodes par année', 'number', 3)],
    workflows: ['year_lifecycle', 'period_closure', 'year_archive'],
    dashboards: ['academic_year'],
    notifications: [],
  },
  {
    code: 'academic-core',
    name: 'Moteur académique',
    description: 'Système de notation, coefficients, pondérations, moyennes et seuils',
    category: 'Académique',
    lifecycle: 'core',
    dependencies: ['structure', 'academic-years'],
    routes: ['grading'],
    permissions: ['grades.view', 'grades.create', 'grades.update', 'grades.validate', 'grades.publish', 'grades.export'],
    nav: [{ path: '/app/grades', label: 'Notes', icon: 'ClipboardList', permission: 'grades.view' }],
    settings: [
      s('defaultMax', 'Note maximale par défaut', 'number', 20),
      s('rounding', 'Arrondi des moyennes', 'number', 2, 'Nombre de décimales'),
      s('passingGrade', 'Moyenne de passage', 'number', 10),
    ],
    workflows: ['grade_entry', 'grade_validation', 'grade_publication', 'computed_averages'],
    dashboards: ['grade_entry_progress', 'class_averages'],
    notifications: ['grade.published'],
  },
  {
    code: 'students',
    name: 'Élèves',
    description: 'Dossiers scolaires, matricules et suivi des élèves',
    category: 'Scolarité',
    lifecycle: 'core',
    dependencies: ['structure'],
    routes: ['students'],
    permissions: ['students.view', 'students.create', 'students.update', 'students.delete'],
    nav: [{ path: '/app/students', label: 'Élèves', icon: 'Users', permission: 'students.view' }],
    settings: [s('matriculePrefix', 'Préfixe des matricules', 'text', 'STU'), s('matriculeYear', 'Année dans le matricule', 'boolean', true)],
    workflows: ['student_record'],
    dashboards: ['student_counts'],
    notifications: [],
  },
  {
    code: 'enrollment',
    name: 'Admissions & inscriptions',
    description: 'Candidatures, dossiers, admission, réinscription et transferts',
    category: 'Scolarité',
    lifecycle: 'optional',
    dependencies: ['students', 'academic-years'],
    routes: ['enrollment'],
    permissions: ['enrollment.view', 'enrollment.create', 'enrollment.update', 'enrollment.decide'],
    nav: [{ path: '/app/enrollment', label: 'Inscriptions', icon: 'ClipboardCheck', permission: 'enrollment.view' }],
    settings: [s('autoMatricule', 'Matricule automatique', 'boolean', true), s('waitlistEnabled', 'Liste d’attente', 'boolean', true)],
    workflows: ['application', 'document_check', 'admission_decision', 'enrollment', 'reenrollment', 'transfer_in', 'transfer_out'],
    dashboards: ['enrollment_stats'],
    notifications: ['enrollment.accepted', 'enrollment.rejected'],
  },
  {
    code: 'classes',
    name: 'Classes',
    description: 'Classes, effectifs et rattachement des élèves',
    category: 'Scolarité',
    lifecycle: 'core',
    dependencies: ['structure'],
    routes: ['classes'],
    permissions: ['classes.view', 'classes.create', 'classes.update', 'classes.delete'],
    nav: [{ path: '/app/classes', label: 'Classes', icon: 'School', permission: 'classes.view' }],
    settings: [s('maxStudents', 'Effectif maximal par classe', 'number', 50)],
    workflows: [],
    dashboards: ['class_distribution'],
    notifications: [],
  },
  {
    code: 'subjects',
    name: 'Matières',
    description: 'Matières, coefficients et regroupements',
    category: 'Académique',
    lifecycle: 'core',
    dependencies: ['structure', 'classes'],
    routes: ['subjects'],
    permissions: ['subjects.view', 'subjects.create', 'subjects.update', 'subjects.delete'],
    nav: [{ path: '/app/subjects', label: 'Matières', icon: 'BookOpen', permission: 'subjects.view' }],
    settings: [s('subjectGroups', 'Groupes de matières', 'boolean', true)],
    workflows: [],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'teachers',
    name: 'Enseignants',
    description: 'Dossiers du personnel enseignant',
    category: 'Scolarité',
    lifecycle: 'core',
    dependencies: ['users'],
    routes: ['teachers'],
    permissions: ['teachers.view', 'teachers.create', 'teachers.update', 'teachers.delete'],
    nav: [{ path: '/app/teachers', label: 'Enseignants', icon: 'GraduationCap', permission: 'teachers.view' }],
    settings: [],
    workflows: [],
    dashboards: ['staff_counts'],
    notifications: [],
  },
  {
    code: 'assignments',
    name: 'Affectations',
    description: 'Affectations des enseignants aux classes et matières',
    category: 'Académique',
    lifecycle: 'core',
    dependencies: ['teachers', 'classes', 'subjects', 'academic-years'],
    // Assignments are served by the teachers and users routers (there is no
    // dedicated /assignments mount), so the registry points at the real ones.
    routes: ['teachers', 'users'],
    permissions: ['assignments.view', 'assignments.manage'],
    nav: [],
    settings: [],
    workflows: ['teacher_assignment'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'attendance',
    name: 'Présences',
    description: 'Appels, absences, retards et justificatifs',
    category: 'Vie scolaire',
    lifecycle: 'core',
    dependencies: ['students', 'classes'],
    routes: ['attendance'],
    permissions: ['attendance.view', 'attendance.create', 'attendance.update', 'attendance.validate'],
    nav: [{ path: '/app/attendance', label: 'Présences', icon: 'CalendarCheck', permission: 'attendance.view' }],
    settings: [s('lateAfterMinutes', 'Retard après (minutes)', 'number', 10)],
    workflows: ['roll_call', 'justification'],
    dashboards: ['attendance_rate'],
    notifications: ['attendance.absent', 'attendance.late'],
  },
  {
    code: 'timetable',
    name: 'Emploi du temps',
    description: 'Planning des cours avec détection automatique des conflits',
    category: 'Académique',
    lifecycle: 'core',
    dependencies: ['classes', 'subjects', 'teachers'],
    routes: ['timetable'],
    permissions: ['timetable.view', 'timetable.create', 'timetable.update', 'timetable.delete'],
    nav: [{ path: '/app/timetable', label: 'Emploi du temps', icon: 'CalendarDays', permission: 'timetable.view' }],
    settings: [s('dayStart', 'Début de journée', 'text', '08:00'), s('dayEnd', 'Fin de journée', 'text', '17:00'), s('slotMinutes', 'Durée d’une heure', 'number', 60)],
    workflows: ['timetable_planning', 'conflict_detection'],
    dashboards: [],
    notifications: ['timetable.changed'],
  },
  {
    code: 'premises',
    name: 'Locaux & salles',
    description: 'Bâtiments, salles, capacité et équipement',
    category: 'Ressources',
    // Declared honestly: buildings and rooms are NOT built yet. Marking this
    // `optional` would promise a screen and an API that do not exist. Transport,
    // boarding and health depend on it and will follow.
    lifecycle: 'coming_soon',
    dependencies: ['school'],
    routes: [],
    permissions: ['premises.view', 'premises.manage'],
    nav: [],
    settings: [],
    workflows: [],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'reportcards',
    name: 'Bulletins',
    description: 'Édition, validation et publication des bulletins',
    category: 'Académique',
    lifecycle: 'core',
    dependencies: ['academic-core', 'students'],
    routes: ['report-cards'],
    permissions: ['report-cards.view', 'report-cards.create', 'report-cards.publish', 'report-cards.download', 'report-cards.print'],
    nav: [{ path: '/app/report-cards', label: 'Bulletins', icon: 'FileText', permission: 'report-cards.view' }],
    settings: [s('templateId', 'Modèle de bulletin', 'text', ''), s('autoPublish', 'Publication automatique', 'boolean', false)],
    workflows: ['report_card_generation', 'report_card_validation', 'report_card_publication'],
    dashboards: [],
    notifications: ['reportcard.available'],
  },
  {
    code: 'deliberations',
    name: 'Examens & délibérations',
    description: 'Sessions d’examen, conseils de classe et procès-verbaux',
    category: 'Académique',
    // Declared but not yet built: it has no router, so it must not be
    // advertised as activable (a module with no route would be a dead link).
    lifecycle: 'coming_soon',
    dependencies: ['academic-core', 'classes'],
    routes: [],
    permissions: ['deliberations.view', 'deliberations.manage', 'deliberations.decide'],
    nav: [],
    settings: [s('councilQuorum', 'Quorum du conseil', 'number', 2, 'Nombre minimum de membres'), s('doubleSession', 'Session de rattrapage', 'boolean', true)],
    workflows: ['exam_session', 'exam_invigilation', 'class_council', 'deliberation', 'promotion_decision'],
    dashboards: ['deliberation_progress'],
    notifications: ['deliberation.scheduled', 'deliberation.decided'],
  },
  {
    code: 'promotion',
    name: 'Passage d’année',
    description: 'Promotions, redoublements, transferts et préparation de la nouvelle année',
    category: 'Scolarité',
    lifecycle: 'optional',
    // Depends on the academic engine (for the computed averages) and the
    // year/roster data — not on the unbuilt council module.
    dependencies: ['academic-core', 'academic-years', 'students', 'classes'],
    routes: ['promotion'],
    permissions: ['promotion.view', 'promotion.manage'],
    nav: [{ path: '/app/promotion', label: 'Passage d’année', icon: 'ArrowRightLeft', permission: 'promotion.view' }],
    settings: [s('autoPromote', 'Proposer automatiquement une promotion', 'boolean', false)],
    workflows: ['deliberation', 'promotion_decision', 'rollover_prepare', 'rollover_execute'],
    dashboards: ['deliberation_progress'],
    notifications: ['promotion.completed'],
  },
  {
    code: 'users',
    name: 'Utilisateurs',
    description: 'Comptes, cycle de vie et habilitations',
    category: 'Noyau',
    lifecycle: 'core',
    dependencies: [],
    routes: ['users', 'activation-codes'],
    permissions: ['users.view', 'users.create', 'users.update', 'users.disable', 'users.reset_password', 'users.manage_roles', 'users.manage_permissions'],
    nav: [{ path: '/app/users', label: 'Utilisateurs', icon: 'UserCog', permission: 'users.view' }],
    settings: [s('forcePasswordChange', 'Forcer le changement à la première connexion', 'boolean', true), s('passwordMinLength', 'Longueur minimale du mot de passe', 'number', 8)],
    workflows: ['account_provisioning', 'account_activation', 'account_lifecycle', 'password_reset'],
    dashboards: [],
    notifications: ['account.activated'],
  },
  {
    code: 'roles',
    name: 'Rôles & permissions',
    description: 'Rôles, permissions, portées, affectations et délégations',
    category: 'Noyau',
    lifecycle: 'core',
    dependencies: ['users'],
    routes: ['roles'],
    permissions: ['roles.view', 'roles.create', 'roles.update', 'roles.manage', 'delegations.view', 'delegations.manage', 'delegations.delegate_others', 'sessions.view', 'sessions.revoke'],
    nav: [{ path: '/app/roles', label: 'Rôles', icon: 'ShieldCheck', permission: 'roles.view' }],
    settings: [s('allowCustomRoles', 'Autoriser les rôles personnalisés', 'boolean', true), s('allowDelegation', 'Autoriser les délégations', 'boolean', true)],
    workflows: ['role_assignment', 'permission_override', 'delegation'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'modules',
    name: 'Modules',
    description: 'Activation, configuration et dépendances des modules',
    category: 'Noyau',
    lifecycle: 'core',
    dependencies: [],
    routes: ['modules'],
    permissions: ['modules.view', 'modules.enable', 'modules.disable'],
    nav: [],
    settings: [],
    workflows: ['module_lifecycle'],
    dashboards: [],
    notifications: ['module.enabled', 'module.disabled'],
  },
  {
    code: 'documents',
    name: 'Documents',
    description: 'Documents administratifs, certificats et vérification publique',
    category: 'Documents',
    lifecycle: 'core',
    dependencies: [],
    routes: ['documents', 'verify'],
    permissions: ['documents.view', 'documents.create', 'documents.delete', 'documents.download'],
    nav: [{ path: '/app/documents', label: 'Documents', icon: 'FolderOpen', permission: 'documents.view' }],
    settings: [s('docPrefix', 'Préfixe des documents', 'text', 'DOC'), s('publicVerification', 'Vérification publique par QR', 'boolean', true)],
    workflows: ['document_workflow'],
    dashboards: [],
    notifications: ['document.available'],
  },
  {
    code: 'templates',
    name: 'Éditeur de documents',
    description: 'Modèles, mise en page et génération de documents',
    category: 'Documents',
    lifecycle: 'optional',
    dependencies: ['documents'],
    routes: ['document-builder'],
    permissions: ['templates.view', 'templates.create', 'templates.update', 'templates.delete', 'templates.publish'],
    nav: [{ path: '/app/document-builder', label: 'Éditeur', icon: 'Layers', permission: 'templates.view' }],
    settings: [],
    workflows: ['template_design', 'document_generation', 'bulk_generation'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'notifications',
    name: 'Notifications',
    description: 'Notifications internes et préférences par utilisateur',
    category: 'Communication',
    lifecycle: 'core',
    dependencies: ['users'],
    routes: ['notifications'],
    permissions: ['notifications.view', 'notifications.manage'],
    nav: [],
    settings: [s('emailEnabled', 'Notifications par email', 'boolean', false), s('digest', 'Résumé quotidien', 'boolean', false)],
    workflows: ['notification_dispatch'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'audit',
    name: 'Audit',
    description: 'Journal des opérations sensibles',
    category: 'Noyau',
    lifecycle: 'core',
    dependencies: ['users'],
    routes: ['audit-logs'],
    permissions: ['audit.view'],
    nav: [{ path: '/app/audit-logs', label: 'Journal d’audit', icon: 'ScrollText', permission: 'audit.view' }],
    settings: [s('retentionDays', 'Rétention (jours)', 'number', 3650)],
    workflows: ['audit_trail'],
    dashboards: [],
    notifications: [],
  },

  // ───────────────────────────── Modules optionnels ─────────────────────────────
  {
    code: 'finance',
    name: 'Finance scolaire',
    description: 'Frais, paiements, reçus, caisse, impayés et rapports financiers internes',
    category: 'Gestion',
    lifecycle: 'optional',
    dependencies: ['students'],
    routes: ['fees', 'payments', 'cash'],
    permissions: ['fees.view', 'fees.create', 'fees.update', 'payments.view', 'payments.create', 'payments.export', 'cash.view', 'cash.create', 'finance.view', 'finance.export', 'finance.print'],
    nav: [
      { path: '/app/fees', label: 'Frais', icon: 'Receipt', permission: 'fees.view' },
      { path: '/app/payments', label: 'Paiements', icon: 'CreditCard', permission: 'payments.view' },
      { path: '/app/cash', label: 'Caisse', icon: 'Wallet', permission: 'cash.view' },
    ],
    settings: [
      s('paymentMethods', 'Moyens de paiement', 'select', 'Espèces', undefined, ['Espèces', 'Banque', 'Virement', 'Autre']),
      s('allowPartial', 'Paiement partiel', 'boolean', true),
      s('allowOverpay', 'Trop-perçu autorisé', 'boolean', false),
    ],
    workflows: ['fee_assignment', 'payment', 'receipt', 'cash_session', 'debt_tracking'],
    dashboards: ['revenue', 'outstanding'],
    notifications: ['payment.received', 'payment.overdue'],
  },
  {
    code: 'parents',
    name: 'Portail parent',
    description: 'Comptes parents et espace de suivi des enfants',
    category: 'Communication',
    lifecycle: 'optional',
    dependencies: ['students', 'users'],
    routes: ['parents'],
    permissions: ['parents.view', 'parents.create', 'parents.update', 'parents.delete'],
    nav: [{ path: '/app/parents', label: 'Parents', icon: 'Users', permission: 'parents.view' }],
    settings: [s('selfRegistration', 'Auto-activation parent', 'boolean', true), s('financialVisibility', 'Voir la situation financière', 'boolean', false)],
    workflows: ['parent_account', 'child_linkage'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'discipline',
    name: 'Discipline',
    description: 'Incidents, sanctions, convocations et conseil de discipline',
    category: 'Vie scolaire',
    lifecycle: 'optional',
    dependencies: ['students'],
    routes: ['incidents', 'convocations'],
    permissions: ['discipline.view', 'discipline.create', 'discipline.manage'],
    nav: [{ path: '/app/discipline', label: 'Discipline', icon: 'ShieldAlert', permission: 'discipline.view' }],
    settings: [s('parentNotified', 'Notification automatique des parents', 'boolean', true)],
    workflows: ['incident', 'sanction', 'council_discipline'],
    dashboards: ['discipline_stats'],
    notifications: ['incident.recorded', 'sanction.applied'],
  },
  {
    code: 'communication',
    name: 'Communication',
    description: 'Annonces ciblées et messagerie interne',
    category: 'Communication',
    lifecycle: 'optional',
    dependencies: ['notifications'],
    routes: ['announcements', 'messages'],
    permissions: ['announcements.view', 'announcements.create', 'announcements.publish', 'messages.view', 'messages.create'],
    nav: [
      { path: '/app/announcements', label: 'Annonces', icon: 'Megaphone', permission: 'announcements.view' },
      { path: '/app/messages', label: 'Messages', icon: 'MessageSquare', permission: 'messages.view' },
    ],
    settings: [s('audiences', 'Audiences ciblées', 'boolean', true)],
    workflows: ['announcement', 'targeted_announcement', 'internal_message'],
    dashboards: [],
    notifications: ['announcement.published'],
  },
  {
    code: 'calendar',
    name: 'Calendrier scolaire',
    description: 'Événements, examens, réunions, vacances et échéances',
    category: 'Vie scolaire',
    lifecycle: 'optional',
    dependencies: ['academic-years'],
    routes: ['events'],
    permissions: ['events.view', 'events.create', 'events.update', 'events.delete'],
    nav: [{ path: '/app/calendar', label: 'Calendrier', icon: 'Calendar', permission: 'events.view' }],
    settings: [],
    workflows: ['school_calendar'],
    dashboards: ['upcoming_events'],
    notifications: ['event.upcoming'],
  },
  {
    code: 'reports',
    name: 'Centre de rapports',
    description: 'Rapports académiques, financiers, d_assistance et exports',
    category: 'Pilotage',
    lifecycle: 'optional',
    dependencies: ['academic-core', 'attendance'],
    // The report centre reads the dashboard aggregates and delegates the file
    // generation to the import/export router; those are the real mounts.
    routes: ['dashboard', 'import-export'],
    permissions: ['reports.view', 'reports.create', 'reports.validate', 'reports.publish', 'reports.download', 'reports.print'],
    nav: [{ path: '/app/reports', label: 'Rapports', icon: 'BarChart3', permission: 'reports.view' }],
    settings: [s('formats', 'Formats d’export', 'select', 'PDF', undefined, ['PDF', 'CSV', 'XLSX'])],
    workflows: ['report_generation', 'data_export'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'import-export',
    name: 'Import / Export',
    description: 'Importation avec validation préalable et exports',
    category: 'Pilotage',
    lifecycle: 'optional',
    dependencies: ['students'],
    routes: ['import-export'],
    permissions: ['import-export.import', 'import-export.export'],
    nav: [{ path: '/app/import-export', label: 'Import / Export', icon: 'Upload', permission: 'import-export.view' }],
    settings: [s('requireValidation', 'Validation obligatoire avant import', 'boolean', true)],
    workflows: ['import_preview', 'import_execute', 'export'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'hr',
    name: 'Ressources humaines',
    description: 'Contrats, congés, absences du personnel et remplacements',
    category: 'Ressources',
    lifecycle: 'coming_soon',
    dependencies: ['users', 'assignments'],
    routes: [],
    permissions: ['hr.view', 'hr.manage'],
    nav: [],
    settings: [],
    workflows: ['leave_request', 'staff_absence', 'substitution'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'inventory',
    name: 'Stock & patrimoine',
    description: 'Inventaire des équipements, valorisation et maintenance',
    category: 'Ressources',
    lifecycle: 'coming_soon',
    dependencies: ['premises'],
    routes: [],
    permissions: ['inventory.view', 'inventory.manage'],
    nav: [],
    settings: [],
    workflows: ['asset', 'maintenance'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'procurement',
    name: 'Achats & fournisseurs',
    description: 'Fournisseurs, demandes d’achat, commandes et réceptions',
    category: 'Gestion',
    lifecycle: 'coming_soon',
    dependencies: ['finance'],
    routes: [],
    permissions: ['procurement.view', 'procurement.manage'],
    nav: [],
    settings: [],
    workflows: ['supplier', 'purchase_request', 'purchase_order', 'goods_receipt'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'transport',
    name: 'Transport scolaire',
    description: 'Véhicules, chauffeurs, lignes et suivi des élèves',
    category: 'Gestion',
    lifecycle: 'coming_soon',
    dependencies: ['students', 'premises'],
    routes: [],
    permissions: ['transport.view', 'transport.manage'],
    nav: [],
    settings: [],
    workflows: ['vehicle', 'route', 'transport_attendance'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'boarding',
    name: 'Internat',
    description: 'Chambres, lits, présences et sorties des élèves internes',
    category: 'Gestion',
    lifecycle: 'coming_soon',
    dependencies: ['premises', 'students'],
    routes: [],
    permissions: ['boarding.view', 'boarding.manage'],
    nav: [],
    settings: [],
    workflows: ['boarding_room', 'boarding_attendance'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'library',
    name: 'Bibliothèque',
    description: 'Catalogue, exemplaires, emprunts et pénalités',
    category: 'Ressources',
    lifecycle: 'coming_soon',
    dependencies: ['students'],
    routes: [],
    permissions: ['library.view', 'library.manage'],
    nav: [],
    settings: [],
    workflows: ['loan', 'return', 'penalty'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'health',
    name: 'Santé scolaire',
    description: 'Infirmerie, consultations, allergies et accidents — accès très restreint',
    category: 'Vie scolaire',
    lifecycle: 'coming_soon',
    dependencies: ['students'],
    routes: [],
    permissions: ['health.view', 'health.manage'],
    nav: [],
    settings: [s('restricted', 'Accès restreint', 'boolean', true)],
    workflows: ['consultation', 'accident', 'allergy'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'orientation',
    name: 'Orientation',
    description: 'Profils, aptitudes, entretiens et choix de filière',
    category: 'Vie scolaire',
    lifecycle: 'coming_soon',
    dependencies: ['students'],
    routes: [],
    permissions: ['orientation.view', 'orientation.manage'],
    nav: [],
    settings: [],
    workflows: ['aptitude', 'interview', 'orientation_choice'],
    dashboards: [],
    notifications: [],
  },
  {
    code: 'offline',
    name: 'Mode hors connexion',
    description: 'Consultation et saisie en mode faible connexion avec synchronisation',
    category: 'Pilotage',
    lifecycle: 'coming_soon',
    dependencies: [],
    routes: [],
    permissions: ['offline.view', 'offline.manage'],
    nav: [],
    settings: [s('syncOnReconnect', 'Synchronisation à la reconnexion', 'boolean', true)],
    workflows: ['local_cache', 'sync', 'conflict_resolution'],
    dashboards: [],
    notifications: [],
  },
];

export const MODULE_MAP: Record<string, ModuleDef> = Object.fromEntries(
  MODULE_REGISTRY.map((m) => [m.code, m])
);

export const CORE_MODULE_CODES = MODULE_REGISTRY.filter((m) => m.lifecycle === 'core').map((m) => m.code);

/** Returns codes that are not yet implemented (declared for the roadmap). */
export const ROADMAP_MODULE_CODES = MODULE_REGISTRY.filter((m) => m.lifecycle === 'coming_soon').map((m) => m.code);

export function isCore(code: string): boolean {
  return MODULE_MAP[code]?.lifecycle === 'core';
}

/** Recursively resolves every module a code transitively depends on. */
export function resolveDependencies(code: string, seen = new Set<string>()): string[] {
  const def = MODULE_MAP[code];
  if (!def) return [];
  const out: string[] = [];
  for (const dep of def.dependencies) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    out.push(dep);
    out.push(...resolveDependencies(dep, seen));
  }
  return [...new Set(out)];
}

/** Modules that would break if `code` were disabled. */
export function findDependents(code: string): string[] {
  return MODULE_REGISTRY.filter((m) => resolveDependencies(m.code).includes(code) && m.code !== code).map((m) => m.code);
}

/** The legacy `moduleForRoute(prefix)` used by the route guard. */
export function moduleForRoute(prefix: string): ModuleDef | undefined {
  const clean = prefix.replace(/^\/+/, '').split('/')[0];
  return MODULE_REGISTRY.find((m) => m.routes.includes(clean));
}
