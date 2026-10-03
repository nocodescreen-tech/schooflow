import { Permission, Role, RolePermission } from '../models/index.js';
import { PERMISSION_CATALOG, LEGACY_ROLE_PERMISSIONS } from './permissions.js';

export async function seedPermissions(): Promise<number> {
  let created = 0;
  for (const entry of PERMISSION_CATALOG) {
    const [, wasCreated] = await Permission.findOrCreate({
      where: { module: entry.module, action: entry.action },
      defaults: { module: entry.module, action: entry.action, description: entry.description },
    });
    if (wasCreated) created++;
  }
  return created;
}

const SYSTEM_ROLES: Array<{ legacy: string; name: string; description: string }> = [
  { legacy: 'admin', name: 'Administrateur', description: 'Full access to the school workspace' },
  { legacy: 'director', name: 'Directeur', description: 'School director with broad management access' },
  { legacy: 'teacher', name: 'Enseignant', description: 'Teaching staff with class-scoped access' },
  { legacy: 'accountant', name: 'Comptable', description: 'Financial staff managing fees and payments' },
  { legacy: 'receptionist', name: 'Secrétaire', description: 'Front-office staff managing records and documents' },
  { legacy: 'prefect', name: 'Préfet', description: 'Student discipline and attendance oversight' },
  { legacy: 'parent', name: 'Parent', description: 'Parent with read access to their children' },
  { legacy: 'student', name: 'Élève', description: 'Student with read access to their own records' },
];

/**
 * Idempotent: system roles are global (schoolId null). Skips existing rows.
 * The schoolId parameter is accepted for API symmetry but system roles are
 * intentionally not scoped to a school.
 */
export async function seedSystemRoles(_schoolId?: string): Promise<number> {
  await seedPermissions();
  const permissions = await Permission.findAll();
  const permissionIdByKey = new Map(permissions.map((p) => [`${p.module}.${p.action}`, p.id]));

  let created = 0;
  for (const sys of SYSTEM_ROLES) {
    const [role, wasCreated] = await Role.findOrCreate({
      where: { schoolId: null, name: sys.name },
      defaults: { schoolId: null, name: sys.name, description: sys.description, isSystem: true },
    });
    if (role.isSystem !== true) await role.update({ isSystem: true });
    if (wasCreated) created++;

    const keys = (LEGACY_ROLE_PERMISSIONS[sys.legacy] || []).filter((k) => k !== '*');
    for (const key of keys) {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId) continue;
      await RolePermission.findOrCreate({
        where: { roleId: role.id, permissionId },
        defaults: { roleId: role.id, permissionId },
      });
    }
  }
  return created;
}
