export interface PermissionEntry {
  module: string;
  action: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionEntry[] = [
  // students
  { module: 'students', action: 'view', description: 'View student records' },
  { module: 'students', action: 'create', description: 'Enroll new students' },
  { module: 'students', action: 'update', description: 'Update student records' },
  { module: 'students', action: 'delete', description: 'Delete student records' },
  // teachers
  { module: 'teachers', action: 'view', description: 'View teacher records' },
  { module: 'teachers', action: 'create', description: 'Add new teachers' },
  { module: 'teachers', action: 'update', description: 'Update teacher records' },
  { module: 'teachers', action: 'delete', description: 'Remove teachers' },
  // classes
  { module: 'classes', action: 'view', description: 'View classes' },
  { module: 'classes', action: 'create', description: 'Create classes' },
  { module: 'classes', action: 'update', description: 'Update classes' },
  { module: 'classes', action: 'delete', description: 'Delete classes' },
  // subjects
  { module: 'subjects', action: 'view', description: 'View subjects' },
  { module: 'subjects', action: 'create', description: 'Create subjects' },
  { module: 'subjects', action: 'update', description: 'Update subjects' },
  { module: 'subjects', action: 'delete', description: 'Delete subjects' },
  // timetable
  { module: 'timetable', action: 'view', description: 'View timetable' },
  { module: 'timetable', action: 'create', description: 'Create timetable entries' },
  { module: 'timetable', action: 'update', description: 'Update timetable entries' },
  { module: 'timetable', action: 'delete', description: 'Delete timetable entries' },
  // attendance
  { module: 'attendance', action: 'view', description: 'View attendance records' },
  { module: 'attendance', action: 'create', description: 'Record attendance' },
  { module: 'attendance', action: 'update', description: 'Update attendance records' },
  { module: 'attendance', action: 'validate', description: 'Validate attendance records' },
  // grades
  { module: 'grades', action: 'view', description: 'View grades' },
  { module: 'grades', action: 'create', description: 'Enter grades' },
  { module: 'grades', action: 'update', description: 'Update grades' },
  { module: 'grades', action: 'delete', description: 'Delete grades' },
  { module: 'grades', action: 'validate', description: 'Validate grades' },
  { module: 'grades', action: 'publish', description: 'Publish grades' },
  { module: 'grades', action: 'export', description: 'Export grades' },
  // report-cards
  { module: 'report-cards', action: 'view', description: 'View report cards' },
  { module: 'report-cards', action: 'create', description: 'Generate report cards' },
  { module: 'report-cards', action: 'publish', description: 'Publish report cards' },
  { module: 'report-cards', action: 'download', description: 'Download report cards' },
  { module: 'report-cards', action: 'print', description: 'Print report cards' },
  // templates (document-builder layouts)
  { module: 'templates', action: 'view', description: 'View document templates' },
  { module: 'templates', action: 'create', description: 'Create document templates' },
  { module: 'templates', action: 'update', description: 'Update document templates' },
  { module: 'templates', action: 'delete', description: 'Delete document templates' },
  { module: 'templates', action: 'publish', description: 'Publish document templates' },
  // reports (RDC bulletin workflow)
  { module: 'reports', action: 'view', description: 'View RDC bulletin reports' },
  { module: 'reports', action: 'create', description: 'Generate RDC bulletin reports' },
  { module: 'reports', action: 'validate', description: 'Validate RDC bulletin reports' },
  { module: 'reports', action: 'publish', description: 'Publish RDC bulletin reports' },
  { module: 'reports', action: 'download', description: 'Download RDC bulletin reports' },
  { module: 'reports', action: 'print', description: 'Print RDC bulletin reports' },
  // fees
  { module: 'fees', action: 'view', description: 'View fees' },
  { module: 'fees', action: 'create', description: 'Create fee assignments' },
  { module: 'fees', action: 'update', description: 'Update fees' },
  // payments
  { module: 'payments', action: 'view', description: 'View payments' },
  { module: 'payments', action: 'create', description: 'Record payments' },
  { module: 'payments', action: 'export', description: 'Export payment records' },
  // cash
  { module: 'cash', action: 'view', description: 'View cash transactions' },
  { module: 'cash', action: 'create', description: 'Record cash transactions' },
  // documents
  { module: 'documents', action: 'view', description: 'View documents' },
  { module: 'documents', action: 'create', description: 'Upload documents' },
  { module: 'documents', action: 'delete', description: 'Delete documents' },
  { module: 'documents', action: 'download', description: 'Download documents' },
  // announcements
  { module: 'announcements', action: 'view', description: 'View announcements' },
  { module: 'announcements', action: 'create', description: 'Create announcements' },
  { module: 'announcements', action: 'publish', description: 'Publish announcements' },
  // messages
  { module: 'messages', action: 'view', description: 'View messages' },
  { module: 'messages', action: 'create', description: 'Send messages' },
  // notifications
  { module: 'notifications', action: 'view', description: 'View notifications' },
  { module: 'notifications', action: 'manage', description: 'Manage notifications' },
  // users
  { module: 'users', action: 'view', description: 'View users' },
  { module: 'users', action: 'create', description: 'Create users' },
  { module: 'users', action: 'update', description: 'Update users' },
  { module: 'users', action: 'disable', description: 'Deactivate users' },
  { module: 'users', action: 'reset_password', description: 'Reset a user password' },
  { module: 'users', action: 'manage_roles', description: 'Assign roles to users' },
  { module: 'users', action: 'manage_permissions', description: 'Override user permissions' },
  // users — granular "who may create what" matrix (users.create implies all of them)
  { module: 'users', action: 'create_staff', description: 'Create staff accounts' },
  { module: 'users', action: 'create_teacher', description: 'Create teacher accounts' },
  { module: 'users', action: 'create_student', description: 'Create student accounts' },
  { module: 'users', action: 'create_parent', description: 'Create parent accounts' },
  // roles
  { module: 'roles', action: 'view', description: 'View roles' },
  { module: 'roles', action: 'create', description: 'Create roles' },
  { module: 'roles', action: 'update', description: 'Update roles' },
  { module: 'roles', action: 'manage', description: 'Manage roles and assignments' },
  // sessions
  { module: 'sessions', action: 'view', description: 'View active sessions' },
  { module: 'sessions', action: 'revoke', description: 'Revoke sessions' },
  // modules
  { module: 'modules', action: 'view', description: 'View modules' },
  { module: 'modules', action: 'enable', description: 'Enable modules' },
  { module: 'modules', action: 'disable', description: 'Disable modules' },
  // delegations
  { module: 'delegations', action: 'view', description: 'View delegations' },
  { module: 'delegations', action: 'manage', description: 'Create and revoke own delegations' },
  { module: 'delegations', action: 'delegate_others', description: "Delegate another user's authority" },
  // settings
  { module: 'settings', action: 'view', description: 'View school settings' },
  { module: 'settings', action: 'update', description: 'Update school settings' },
  { module: 'settings', action: 'manage', description: 'Manage school settings' },
  // audit
  { module: 'audit', action: 'view', description: 'View audit logs' },
  // import-export
  { module: 'import-export', action: 'import', description: 'Import data' },
  { module: 'import-export', action: 'export', description: 'Export data' },
  // parents
  { module: 'parents', action: 'view', description: 'View parent records' },
  { module: 'parents', action: 'create', description: 'Create parent records' },
  { module: 'parents', action: 'update', description: 'Update parent records' },
  { module: 'parents', action: 'delete', description: 'Delete parent records' },
  // academic-years
  { module: 'academic-years', action: 'view', description: 'View academic years' },
  { module: 'academic-years', action: 'manage', description: 'Manage academic years and promotions' },
  // discipline
  { module: 'discipline', action: 'view', description: 'View discipline records' },
  { module: 'discipline', action: 'create', description: 'Record discipline incidents' },
  { module: 'discipline', action: 'manage', description: 'Manage sanctions and convocations' },
  // events
  { module: 'events', action: 'view', description: 'View calendar events' },
  { module: 'events', action: 'create', description: 'Create calendar events' },
  { module: 'events', action: 'update', description: 'Update calendar events' },
  { module: 'events', action: 'delete', description: 'Delete calendar events' },
  // finance (aggregate capability for the school's internal finances)
  { module: 'finance', action: 'view', description: 'View school finances' },
  { module: 'finance', action: 'create', description: 'Create financial entries' },
  { module: 'finance', action: 'update', description: 'Update financial entries' },
  { module: 'finance', action: 'approve', description: 'Approve financial operations' },
  { module: 'finance', action: 'export', description: 'Export financial data' },
  { module: 'finance', action: 'print', description: 'Print financial documents' },
  // enrollments (admissions, dossiers, transfers)
  { module: 'enrollment', action: 'view', description: 'View enrollment dossiers' },
  { module: 'enrollment', action: 'create', description: 'Create an enrollment file' },
  { module: 'enrollment', action: 'update', description: 'Update an enrollment file' },
  { module: 'enrollment', action: 'decide', description: 'Decide on an admission' },
  // assignments (teacher → class/subject)
  { module: 'assignments', action: 'view', description: 'View assignments' },
  { module: 'assignments', action: 'manage', description: 'Create and revoke assignments' },
  // premises (buildings, rooms)
  { module: 'premises', action: 'view', description: 'View premises and rooms' },
  { module: 'premises', action: 'manage', description: 'Manage premises and rooms' },
  // deliberations (exams, councils)
  { module: 'deliberations', action: 'view', description: 'View exam and council sessions' },
  { module: 'deliberations', action: 'manage', description: 'Manage exam and council sessions' },
  { module: 'deliberations', action: 'decide', description: 'Record deliberation decisions' },
  // promotion (year rollover)
  { module: 'promotion', action: 'view', description: 'View promotion decisions' },
  { module: 'promotion', action: 'manage', description: 'Run the year rollover' },
  // human resources
  { module: 'hr', action: 'view', description: 'View HR records' },
  { module: 'hr', action: 'manage', description: 'Manage HR records' },
  // inventory & assets
  { module: 'inventory', action: 'view', description: 'View inventory' },
  { module: 'inventory', action: 'manage', description: 'Manage inventory' },
  // procurement
  { module: 'procurement', action: 'view', description: 'View suppliers and orders' },
  { module: 'procurement', action: 'manage', description: 'Manage suppliers and orders' },
  // transport
  { module: 'transport', action: 'view', description: 'View transport data' },
  { module: 'transport', action: 'manage', description: 'Manage transport data' },
  // boarding
  { module: 'boarding', action: 'view', description: 'View boarding data' },
  { module: 'boarding', action: 'manage', description: 'Manage boarding data' },
  // library
  { module: 'library', action: 'view', description: 'View library catalogue and loans' },
  { module: 'library', action: 'manage', description: 'Manage library catalogue and loans' },
  // school health (restricted)
  { module: 'health', action: 'view', description: 'View school health records' },
  { module: 'health', action: 'manage', description: 'Manage school health records' },
  // orientation
  { module: 'orientation', action: 'view', description: 'View orientation data' },
  { module: 'orientation', action: 'manage', description: 'Manage orientation data' },
  // offline mode
  { module: 'offline', action: 'view', description: 'View offline settings' },
  { module: 'offline', action: 'manage', description: 'Manage offline sync' },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_CATALOG.map((p) => `${p.module}.${p.action}`);

/**
 * Permissions implied by each legacy `users.role` value, derived from the
 * current backend `requireRole(...)` usage (additive reference only).
 */
export const LEGACY_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: ['*'],
  director: ALL_PERMISSIONS.filter((p) => !['users.disable', 'roles.manage'].includes(p)),
  teacher: [
    'students.view',
    'teachers.view',
    'classes.view',
    'subjects.view',
    'timetable.view',
    'attendance.view',
    'attendance.create',
    'attendance.update',
    'grades.view',
    'grades.create',
    'grades.update',
    'grades.delete',
    'grades.publish',
    'report-cards.view',
    'report-cards.create',
    'report-cards.publish',
    'report-cards.download',
    'report-cards.print',
    'templates.view',
    'reports.view',
    'reports.create',
    'reports.download',
    'reports.print',
    'fees.view',
    'payments.view',
    'documents.view',
    'documents.download',
    'announcements.view',
    'announcements.create',
    'announcements.publish',
    'messages.view',
    'messages.create',
    'notifications.view',
    'settings.view',
    'import-export.import',
    'import-export.export',
    'parents.view',
    'events.view',
    'events.create',
  ],
  accountant: [
    'students.view',
    'teachers.view',
    'classes.view',
    'subjects.view',
    'timetable.view',
    'attendance.view',
    'grades.view',
    'report-cards.view',
    'report-cards.download',
    'reports.view',
    'reports.download',
    'fees.view',
    'fees.create',
    'fees.update',
    'payments.view',
    'payments.create',
    'payments.export',
    'cash.view',
    'cash.create',
    'documents.view',
    'documents.download',
    'announcements.view',
    'messages.view',
    'messages.create',
    'notifications.view',
    'settings.view',
    'import-export.export',
    'parents.view',
    'events.view',
  ],
  receptionist: [
    'students.view',
    'students.create',
    'students.update',
    'teachers.view',
    'classes.view',
    'subjects.view',
    'timetable.view',
    'attendance.view',
    'grades.view',
    'report-cards.view',
    'reports.view',
    'fees.view',
    'payments.view',
    'documents.view',
    'documents.create',
    'documents.download',
    'announcements.view',
    'messages.view',
    'messages.create',
    'notifications.view',
    'settings.view',
    'parents.view',
    'parents.create',
    'parents.update',
    'parents.delete',
    'discipline.view',
    'discipline.create',
    'events.view',
  ],
  prefect: [
    'students.view',
    'classes.view',
    'timetable.view',
    'attendance.view',
    'announcements.view',
    'documents.view',
    'messages.view',
    'messages.create',
    'notifications.view',
    'discipline.view',
    'discipline.create',
    'discipline.manage',
    'reports.view',
    'reports.download',
    'parents.view',
    'events.view',
  ],
  parent: [
    'students.view',
    'classes.view',
    'timetable.view',
    'grades.view',
    'report-cards.view',
    'report-cards.download',
    'reports.view',
    'reports.download',
    'fees.view',
    'payments.view',
    'documents.view',
    'documents.download',
    'announcements.view',
    'messages.view',
    'messages.create',
    'notifications.view',
  ],
  student: [
    'students.view',
    'classes.view',
    'timetable.view',
    'grades.view',
    'report-cards.view',
    'report-cards.download',
    'reports.view',
    'reports.download',
    'payments.view',
    'documents.view',
    'documents.download',
    'announcements.view',
    'messages.view',
    'messages.create',
    'notifications.view',
  ],
};

export function resolvePermissions(legacyRole: string, customRolePermissions: string[] = []): string[] {
  const base = LEGACY_ROLE_PERMISSIONS[legacyRole] || [];
  if (base.includes('*') || customRolePermissions.includes('*')) return ['*'];
  return [...new Set([...base, ...customRolePermissions])];
}

/**
 * Coarse permissions that imply finer-grained ones, so existing grants keep
 * working when the catalogue gains granularity:
 *   users.create → users.create_staff / create_teacher / create_student / create_parent
 */
export const PERMISSION_IMPLICATIONS: Record<string, string[]> = {
  'users.create': ['users.create_staff', 'users.create_teacher', 'users.create_student', 'users.create_parent'],
};
