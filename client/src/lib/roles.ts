/**
 * Role-based routing helpers for SCHOOLFLOW.
 * Each role lands on its own dedicated dashboard after login.
 */

export type Role =
  | 'admin'
  | 'director'
  | 'teacher'
  | 'student'
  | 'parent'
  | 'prefect'
  | 'accountant';

export const ALL_ROLES: Role[] = [
  'admin',
  'director',
  'teacher',
  'student',
  'parent',
  'prefect',
  'accountant',
];

/**
 * Get the dashboard path a role should be redirected to after login.
 */
export function getRoleHomePath(role: string | null | undefined): string {
  switch (role) {
    case 'admin':
    case 'director':
      return '/app/dashboard';
    case 'teacher':
      return '/app/teacher';
    case 'student':
      return '/app/student';
    case 'parent':
      return '/app/parent';
    case 'prefect':
      return '/app/prefect';
    case 'accountant':
      return '/app/accountant';
    case 'receptionist':
      return '/app/dashboard';
    default:
      // Unknown or custom roles fall back to the main dashboard.
      return '/app/dashboard';
  }
}

/**
 * Normalize a role string (handles case-insensitivity and aliases).
 */
export function normalizeRole(role: string | null | undefined): Role | null {
  if (!role) return null;
  const lower = role.toLowerCase();
  return ALL_ROLES.find((r) => r === lower) ?? null;
}
