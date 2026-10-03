import {
  WORKSPACES, WORKSPACE_MAP, workspacesForRole, getWorkspace,
  type WorkspaceDef, type WorkspaceCode,
} from '../utils/workspaces.js';
import { buildNavigation, type NavSectionGroup, type NavigationContext } from '../utils/navigation.js';
import { getModuleStates } from '../utils/modules.js';
import { computeEffectivePermissions } from './AuthorizationService.js';
import { resolveScopeForUser, type ScopeKind } from './ScopeService.js';
import type { User } from '../models/index.js';

/**
 * WorkspaceService — resolves which space a user is in and what that space
 * contains.
 *
 * Two guarantees, both required by the spec:
 *
 * 1. Switching workspace NEVER grants a permission. The same effective
 *    permission set applies everywhere; the workspace only changes which
 *    entries are offered and how the workspace reads.
 * 2. A workspace can be unavailable purely because a module is off (the
 *    parent portal, HR, orientation…), in which case it is not offered at all
 *    rather than shown empty.
 */

export interface AvailableWorkspace extends WorkspaceDef {
  available: boolean;
  /** Why it is unavailable, for an honest UI message. */
  reason?: string;
}

export interface WorkspaceContext {
  active: WorkspaceDef;
  available: AvailableWorkspace[];
  navigation: NavSectionGroup[];
  permissions: string[];
  isSuperuser: boolean;
  scope: { kind: ScopeKind; isGlobal: boolean };
  enabledModules: string[];
}

export class WorkspaceService {
  /**
   * Lists every workspace, marking which ones the user can actually enter.
   */
  static async listAvailable(user: Pick<User, 'id' | 'role' | 'schoolId'>): Promise<AvailableWorkspace[]> {
    const states = await getModuleStates(user.schoolId);
    const enabled = new Set(Object.entries(states).filter(([, v]) => v.enabled).map(([k]) => k));
    const byRole = new Set(workspacesForRole(user.role).map((w) => w.code));

    return WORKSPACES
      // A workspace is offered only when the user's role opens it. The
      // `systemLevel` flag is a marker, NOT a wildcard: treating it as one
      // would hand the system-administration space to teachers and students,
      // which the spec explicitly forbids.
      .filter((w) => byRole.has(w.code))
      .map((w) => {
        const missing = w.requiresModules.filter((m) => !enabled.has(m));
        return {
          ...w,
          available: missing.length === 0,
          reason: missing.length ? `Module requis désactivé : ${missing.join(', ')}` : undefined,
        };
      })
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Resolves the workspace to render. When several are available, the first is
   * the default unless `preferred` is one of them.
   */
  static async resolve(
    user: Pick<User, 'id' | 'role' | 'schoolId'>,
    preferred?: string | null
  ): Promise<WorkspaceContext> {
    const available = await WorkspaceService.listAvailable(user);
    const usable = available.filter((w) => w.available);

    // Fall back to the school admin space so a user is never stranded with an
    // empty shell; the navigation filter still protects the data.
    const chosen =
      (preferred ? usable.find((w) => w.code === preferred) : undefined) ??
      usable[0] ??
      WORKSPACE_MAP.SCHOOL_ADMIN;

    const states = await getModuleStates(user.schoolId);
    const enabledModules = Object.entries(states).filter(([, v]) => v.enabled).map(([k]) => k);

    const effective = await computeEffectivePermissions(user);
    const permissions = effective.permissions;
    const isSuperuser = effective.isSuperuser;
    const scope = await resolveScopeForUser(user);

    const navigation = buildNavigation({
      workspace: chosen.code as WorkspaceCode,
      permissions,
      enabledModules: new Set(enabledModules),
      isSuperuser,
    });

    return {
      active: chosen,
      available,
      navigation,
      permissions,
      isSuperuser,
      scope: { kind: scope.kind, isGlobal: scope.isGlobal },
      enabledModules,
    };
  }

  /** True when the user may enter a given workspace at all. */
  static async canEnter(user: Pick<User, 'id' | 'role' | 'schoolId'>, code: string): Promise<boolean> {
    const def = getWorkspace(code);
    if (!def) return false;
    const available = await WorkspaceService.listAvailable(user);
    return available.some((w) => w.code === code && w.available);
  }
}
