import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import {
  MODULE_REGISTRY, MODULE_MAP, isCore, resolveDependencies, findDependents,
  getModuleStates, enableModule, disableModule,
} from '../utils/modules.js';
import { SchoolModule, Permission, Role, RolePermission } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { PERMISSION_CATALOG } from '../utils/permissions.js';
import { seedPermissions } from '../utils/seedRoles.js';

const router = Router();
router.use(authenticateToken);

const READ_ROLES = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'prefect', 'parent', 'student'] as const;
const ADMIN_WRITE = ['super_admin', 'admin', 'director'] as const;

/** Counts of rows per table, so the UI can show what data a module owns. */
const MODULE_DATA_HINTS: Record<string, { label: string; table: string }> = {
  finance: { label: 'Frais et paiements', table: 'payments' },
  parents: { label: 'Parents et liens', table: 'student_parents' },
  discipline: { label: 'Incidents et sanctions', table: 'incidents' },
  communication: { label: 'Annonces et messages', table: 'announcements' },
  calendar: { label: 'Événements', table: 'calendar_events' },
  templates: { label: 'Modèles de documents', table: 'document_templates' },
  reports: { label: 'Journal d’audit', table: 'audit_logs' },
  'import-export': { label: 'Aucun stockage dédié', table: '' },
  attendance: { label: 'Appels et absences', table: 'attendance' },
  reportcards: { label: 'Bulletins', table: 'report_cards' },
  timetable: { label: 'Créneaux horaires', table: 'timetables' },
  deliberation: { label: 'Sessions d’examen', table: 'timetables' },
};

/**
 * Installs the permissions a module declares, so enabling it genuinely grants
 * its functional capabilities rather than only toggling a flag.
 */
async function installModulePermissions(schoolId: string, codes: string[]): Promise<number> {
  await seedPermissions();
  const wanted = new Set<string>();
  for (const code of codes) {
    for (const p of MODULE_MAP[code]?.permissions ?? []) wanted.add(p);
  }
  if (wanted.size === 0) return 0;

  const perms = await Permission.findAll();
  const byName = new Map(perms.map((p) => [`${p.module}.${p.action}`, p]));

  // Attach the module's permissions to the school administrator role so the
  // school's own admin keeps full control of what it just turned on.
  let adminRole = await Role.findOne({ where: { schoolId, name: 'Administrateur' } });
  if (!adminRole) {
    adminRole = await Role.create({ schoolId, name: 'Administrateur', description: 'Administrateur de l’établissement', isSystem: true });
  }

  let granted = 0;
  for (const name of wanted) {
    const perm = byName.get(name);
    if (!perm) continue;
    const existing = await RolePermission.findOne({ where: { roleId: adminRole.id, permissionId: perm.id } });
    if (existing) continue;
    await RolePermission.create({ roleId: adminRole.id, permissionId: perm.id });
    granted += 1;
  }
  return granted;
}

// GET / — full registry merged with the school's state
router.get('/', requireRole(...READ_ROLES), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const states = await getModuleStates(schoolId);
    const items = MODULE_REGISTRY.map((def) => {
      const state = states[def.code];
      const dependencies = resolveDependencies(def.code);
      const dependents = findDependents(def.code);
      const missingDeps = dependencies.filter((d) => states[d]?.enabled === false);
      return {
        ...def,
        enabled: state?.enabled ?? true,
        core: isCore(def.code),
        status: state?.status ?? (isCore(def.code) ? 'active' : 'inactive'),
        configuration: state?.configuration ?? {},
        dependencies,
        dependents,
        // A module can only be enabled once every dependency is on.
        canEnable: missingDeps.length === 0,
        missingDependencies: missingDeps,
        dataHint: MODULE_DATA_HINTS[def.code] ?? null,
      };
    });
    return res.json({ success: true, data: { items, total: items.length } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /registry — the static catalog (no school state), for documentation
router.get('/registry', requireRole(...READ_ROLES), async (_req: Request, res: Response) => {
  return res.json({ success: true, data: { items: MODULE_REGISTRY, total: MODULE_REGISTRY.length } });
});

// GET /enabled — enabled module codes (drives the frontend navigation)
router.get('/enabled', requireRole(...READ_ROLES), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const states = await getModuleStates(schoolId);
    const enabled = Object.entries(states)
      .filter(([, v]) => v.enabled)
      .map(([code]) => code);
    return res.json({ success: true, data: { modules: enabled, codes: enabled } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /:code/impact — what enabling/disabling this module affects
router.get('/:code/impact', requireRole(...READ_ROLES), async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const def = MODULE_MAP[code];
    if (!def) return res.status(404).json({ success: false, error: 'Module introuvable' });
    const dependents = findDependents(code).map((c) => ({ code: c, name: MODULE_MAP[c]?.name }));
    return res.json({
      success: true,
      data: {
        code,
        name: def.name,
        core: isCore(code),
        lifecycle: def.lifecycle,
        dependencies: resolveDependencies(code).map((c) => ({ code: c, name: MODULE_MAP[c]?.name })),
        dependents,
        permissions: def.permissions,
        routes: def.routes,
        nav: def.nav,
        workflows: def.workflows,
        settings: def.settings,
        dataHint: MODULE_DATA_HINTS[code] ?? null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:code/enable',
  requireRole(...ADMIN_WRITE),
  requirePermission('modules', 'enable'),
  body('configuration').optional().custom((v) => v === undefined || (typeof v === 'object' && v !== null && !Array.isArray(v))),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { code } = req.params;
      const schoolId = req.user!.schoolId!;
      const configuration = (req.body as { configuration?: Record<string, unknown> }).configuration ?? {};
      const { module } = await enableModule(schoolId, code, req.user!.id, configuration);
      const granted = await installModulePermissions(schoolId, [code]);
      await logAudit(req, { action: 'module_enabled', entity: 'school_module', entityId: module.id, details: { moduleCode: code, granted } });
      return res.json({ success: true, data: { module: { code, enabled: true }, permissionsInstalled: granted } });
    } catch (error) {
      const message = (error as Error).message;
      const status = /Dépendances non activées/.test(message) ? 409 : 500;
      return res.status(status).json({ success: false, error: message });
    }
  }
);

router.post('/:code/disable',
  requireRole(...ADMIN_WRITE),
  requirePermission('modules', 'disable'),
  async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const schoolId = req.user!.schoolId!;
      if (isCore(code)) {
        return res.status(400).json({ success: false, error: 'Un module du noyau ne peut pas être désactivé' });
      }
      const { module, affectedDependents } = await disableModule(schoolId, code, req.user!.id);
      await logAudit(req, { action: 'module_disabled', entity: 'school_module', entityId: module.id, details: { moduleCode: code, affectedDependents } });
      return res.json({
        success: true,
        data: {
          module: { code, enabled: false },
          affectedDependents,
          message: 'Module désactivé. Les données sont conservées et l’historique reste accessible.',
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// PUT /:code/configuration — school-specific settings
router.put('/:code/configuration',
  requireRole(...ADMIN_WRITE),
  requirePermission('settings', 'manage'),
  body('configuration').custom((v) => typeof v === 'object' && v !== null && !Array.isArray(v)).withMessage('configuration must be an object'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { code } = req.params;
      const def = MODULE_MAP[code];
      if (!def) return res.status(404).json({ success: false, error: 'Module introuvable' });
      const schoolId = req.user!.schoolId!;
      const { configuration } = req.body as { configuration: Record<string, unknown> };
      const row = await SchoolModule.findOne({ where: { schoolId, moduleCode: code } });
      const merged = { ...((row?.configuration as Record<string, unknown>) ?? {}), ...configuration };
      if (row) await row.update({ configuration: merged });
      else await SchoolModule.create({ schoolId, moduleCode: code, enabled: false, configuration: merged, status: 'inactive' });
      await logAudit(req, { action: 'module_configured', entity: 'school_module', details: { moduleCode: code, keys: Object.keys(configuration) } });
      return res.json({ success: true, data: { code, configuration: merged, settings: def.settings } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// GET /permissions/catalog — the full permission catalog (for the Roles page)
router.get('/permissions/catalog', requireRole(...READ_ROLES), async (_req: Request, res: Response) => {
  return res.json({ success: true, data: { items: PERMISSION_CATALOG } });
});

export default router;
