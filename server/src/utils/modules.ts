import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import SchoolModule from '../models/SchoolModule.js';
import {
  MODULE_REGISTRY,
  MODULE_MAP,
  CORE_MODULE_CODES,
  isCore,
  resolveDependencies,
  findDependents,
  moduleForRoute,
  type ModuleDef,
} from './moduleRegistry.js';

export { MODULE_REGISTRY, MODULE_MAP, isCore, resolveDependencies, findDependents, moduleForRoute };
export type { ModuleDef };
export const CORE_MODULES = CORE_MODULE_CODES;

/** Backward-compatible flat catalog (code/name/description/category/routes/permissions/nav paths). */
export const MODULE_CATALOG: Array<ModuleDef & { nav: unknown }> = MODULE_REGISTRY.map((m) => m);

/**
 * Reads the school's module state.
 *
 * A missing row means the module is enabled (backwards compatibility with
 * schools created before modules existed). Core modules are always on.
 *
 * A module whose lifecycle is `coming_soon` is NEVER reported as enabled,
 * even if a stale row says so: nothing is served for it, so claiming otherwise
 * would be a lie the settings screen would then repeat.
 */
export async function getModuleStates(
  schoolId: string
): Promise<Record<string, { enabled: boolean; configuration: Record<string, unknown>; status: string }>> {
  const rows = await SchoolModule.findAll({ where: { schoolId } });
  const map: Record<string, { enabled: boolean; configuration: Record<string, unknown>; status: string }> = {};
  for (const code of CORE_MODULE_CODES) {
    map[code] = { enabled: true, configuration: {}, status: 'active' };
  }
  for (const row of rows) {
    if (MODULE_MAP[row.moduleCode]?.lifecycle === 'coming_soon') continue;
    map[row.moduleCode] = {
      enabled: row.enabled,
      configuration: (row.configuration as Record<string, unknown>) ?? {},
      status: row.status,
    };
  }
  return map;
}

export async function isModuleEnabled(schoolId: string, code: string): Promise<boolean> {
  if (isCore(code)) return true;
  const row = await SchoolModule.findOne({ where: { schoolId, moduleCode: code } });
  if (!row) return true;
  return row.enabled;
}

/**
 * Enables a module and installs its initial configuration and permissions.
 * Refuses when a dependency is disabled.
 */
export async function enableModule(
  schoolId: string,
  code: string,
  userId: string,
  configuration: Record<string, unknown> = {}
): Promise<{ module: SchoolModule; missingDependencies: string[] }> {
  const def = MODULE_MAP[code];
  if (!def) throw new Error(`Module inconnu : ${code}`);

  const missing: string[] = [];
  for (const dep of resolveDependencies(code)) {
    if (!(await isModuleEnabled(schoolId, dep))) missing.push(dep);
  }
  if (missing.length > 0) {
    throw new Error(`Dépendances non activées : ${missing.join(', ')}`);
  }

  // Seed defaults declared by the registry.
  const merged: Record<string, unknown> = { ...configuration };
  for (const setting of def.settings) {
    if (merged[setting.key] === undefined) merged[setting.key] = setting.default;
  }

  const [row] = await SchoolModule.findOrCreate({
    where: { schoolId, moduleCode: code },
    defaults: {
      schoolId,
      moduleCode: code,
      enabled: true,
      configuration: merged,
      settings: {},
      status: 'active',
      enabledAt: new Date(),
      enabledById: userId,
    },
  });

  if (row.enabled !== true || row.status !== 'active') {
    await row.update({
      enabled: true,
      status: 'active',
      enabledAt: new Date(),
      enabledById: userId,
      configuration: { ...(row.configuration as Record<string, unknown>), ...merged },
    });
  }

  return { module: row, missingDependencies: [] };
}

/**
 * Disables a module. Data is NEVER deleted — navigation disappears, routes and
 * API calls are refused, and re-enabling restores the full history.
 */
export async function disableModule(
  schoolId: string,
  code: string,
  userId: string
): Promise<{ module: SchoolModule; affectedDependents: string[] }> {
  const def = MODULE_MAP[code];
  if (!def) throw new Error(`Module inconnu : ${code}`);
  if (def.lifecycle === 'core') throw new Error('Un module du noyau ne peut pas être désactivé');

  const [row] = await SchoolModule.findOrCreate({
    where: { schoolId, moduleCode: code },
    defaults: { schoolId, moduleCode: code, enabled: true, configuration: {}, settings: {}, status: 'active' },
  });
  await row.update({ enabled: false, status: 'inactive' });

  return { module: row, affectedDependents: findDependents(code) };
}

/**
 * Blocks requests when an optional module is disabled for the school.
 * Missing row = enabled (backwards compat with schools created before modules).
 */
export function requireModule(code: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (isCore(code)) {
        next();
        return;
      }
      const schoolId = req.user?.schoolId;
      if (!schoolId) {
        next();
        return;
      }
      const enabled = await isModuleEnabled(schoolId, code);
      if (!enabled) {
        res.status(403).json({ success: false, error: `Module désactivé : ${MODULE_MAP[code]?.name ?? code}` });
        return;
      }
      next();
    } catch {
      res.status(500).json({ success: false, error: 'Module check failed' });
    }
  };
}

/**
 * Requires several modules at once (all must be enabled).
 */
export function requireModules(...codes: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) {
        next();
        return;
      }
      for (const code of codes) {
        if (!(await isModuleEnabled(schoolId, code))) {
          res.status(403).json({ success: false, error: `Module désactivé : ${MODULE_MAP[code]?.name ?? code}` });
          return;
        }
      }
      next();
    } catch {
      res.status(500).json({ success: false, error: 'Module check failed' });
    }
  };
}

export { Op };
