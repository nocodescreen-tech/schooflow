import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, hasPermission } from '../store/authStore';
import api from '../lib/api';

/**
 * Route-level authorization guards.
 *
 * These are a UX convenience only: the frontend hides what a user cannot use.
 * The backend remains the real enforcement point — every API is gated by
 * requirePermission / requireModule on the server.
 */

interface DeniedProps {
  title: string;
  message: string;
}

function Denied({ title, message }: DeniedProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="card p-8 text-center max-w-md">
        <ShieldAlert className="w-10 h-10 text-danger mx-auto mb-4" />
        <h2 className="text-lg font-bold text-text mb-2">{title}</h2>
        <p className="text-sm text-muted">{message}</p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
    </div>
  );
}

interface GuardProps {
  children: ReactNode;
  module: string;
  action: string;
}

export function PermissionRoute({ children, module, action }: GuardProps) {
  const permissions = useAuthStore((s) => s.permissions);
  const authReady = permissions.length > 0;

  // Before the auth context loads, do not flash a false denial.
  if (!authReady) return <Loading />;
  if (hasPermission(permissions, module, action)) return <>{children}</>;
  return <Denied title="Accès refusé" message="Vous ne disposez pas des droits nécessaires pour accéder à cette page." />;
}

/** Fetches the school's enabled modules once and shares the result. */
export function useEnabledModules(): Set<string> | null {
  const { data } = useQuery({
    queryKey: ['modules-enabled'],
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<Set<string>> => {
      const res = await api.get('/modules/enabled');
      const codes = res.data?.data?.codes ?? res.data?.data?.items ?? res.data?.data;
      return new Set(Array.isArray(codes) ? (codes as string[]) : []);
    },
  });
  return data ?? null;
}

export function ModuleRoute({ children, module }: { children: ReactNode; module: string }) {
  const enabled = useEnabledModules();
  if (!enabled) return <Loading />;
  if (enabled.has(module)) return <>{children}</>;
  return (
    <Denied
      title="Module désactivé"
      message="Ce module n’est pas activé pour votre établissement. Demandez à l’administration de l’activer si vous en avez besoin."
    />
  );
}

/**
 * Blocks every app route while the account still owes a password change.
 * The API already answers 428; this avoids a broken, half-usable interface.
 */
export function PasswordChangeGate({ children }: { children: ReactNode }) {
  const mustChange = useAuthStore((s) => s.mustChangePassword);
  const location = useLocation();
  if (mustChange && location.pathname !== '/app/change-password') {
    return <Navigate to="/app/change-password" replace />;
  }
  return <>{children}</>;
}

// ─── Workspace & scope guards (§34) ───────────────────────────────────────────

interface WorkspaceNavItem { id: string; label: string; path: string; icon: string; isHome?: boolean }
interface WorkspaceNavGroup { section: string; label: string; items: WorkspaceNavItem[] }
interface WorkspaceContext {
  active: { code: string; name: string; home: string };
  available: Array<{ code: string; name: string; home: string; available: boolean }>;
  navigation: WorkspaceNavGroup[];
  permissions: string[];
  isSuperuser: boolean;
  scope: { kind: string; isGlobal: boolean };
}

/**
 * The workspace context, shared with the Sidebar through the React Query cache
 * so both always agree on which space is active.
 */
export function useWorkspaceContext() {
  return useQuery({
    queryKey: ['workspace'],
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<WorkspaceContext> => {
      const res = await api.get('/workspace');
      return res.data?.data as WorkspaceContext;
    },
  });
}

/**
 * AppShellGuard — protects EVERY /app route with a single check.
 *
 * Rather than wrapping each <Route> individually (which is how routes end up
 * reachable by typing a URL while their menu entry is hidden), the whole
 * layout is guarded once. The server's `/workspace` response already applied
 * the full decision table, so a path that is not in the returned navigation is
 * refused here — and the API refuses it independently in any case.
 */
export function WorkspaceGuard({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useWorkspaceContext();
  const location = useLocation();

  if (isLoading) return <Loading />;
  if (isError || !data) {
    // Never lock the user out because the shell failed to load: the API is
    // still the real gate, and a transient error must not look like a denial.
    return <>{children}</>;
  }

  const target = location.pathname;
  const reachable = data.navigation.some((g) =>
    g.items.some((item) => isReachablePath(item.path, target))
  );
  if (reachable || isReachablePath(data.active.home, target)) return <>{children}</>;

  return (
    <Denied
      title="Page indisponible"
      message={`Cette page n’existe pas dans l’espace « ${data.active.name} ». Elle est masquée car un module est désactivé ou vos permissions ne la couvrent pas.`}
    />
  );
}

/** `/app/students/:id` is covered by the `/app/students` entry, not the reverse. */
function isReachablePath(navPath: string, target: string): boolean {
  if (navPath === target) return true;
  const strip = (p: string) => p.replace(/\/+$/, '');
  return strip(target).startsWith(`${strip(navPath)}/`);
}

/**
 * `guarded()` composes the three guards into one wrapper so no app route can be
 * added without them. Optional module/action narrow it further.
 */
export function guarded(options: { module?: string; action?: string } = {}) {
  return function Guarded({ children }: { children: ReactNode }) {
    const permitted = options.action && options.module
      ? <PermissionRoute module={options.module} action={options.action}>{children}</PermissionRoute>
      : <>{children}</>;
    const gated = options.module ? <ModuleRoute module={options.module}>{permitted}</ModuleRoute> : permitted;
    return <WorkspaceGuard>{gated}</WorkspaceGuard>;
  };
}

/** Scope kinds a page may legitimately be opened by. */
const SCOPE_RANKS: Record<string, number> = {
  GLOBAL: 0,
  SCHOOL: 0,
  SECTION: 1,
  DEPARTMENT: 1,
  LEVEL: 2,
  CLASS: 3,
  SUBJECT: 3,
  ASSIGNED_CLASSES: 3,
  ASSIGNED_SUBJECTS: 3,
  STUDENT: 4,
  LINKED_CHILDREN: 4,
  SELF: 4,
};

/**
 * ScopeGuard — refuses a page when the caller's resolved data scope is too
 * narrow for it.
 *
 * `requires` is the narrowest scope that still makes the page meaningful. A
 * page marked `SELF` is useless to a teacher, and one marked `SCHOOL` would
 * only ever show an empty or misleading view to a single student.
 *
 * Row-level filtering itself stays on the server: this guard only avoids
 * showing a page that could not return anything the user may see.
 */
export function ScopeGuard({
  children,
  requires = 'SCHOOL',
  path,
}: {
  children: ReactNode;
  requires?: string;
  path?: string;
}) {
  const { data, isLoading, isError } = useWorkspaceContext();
  const location = useLocation();
  const target = path ?? location.pathname;

  if (isLoading) return <Loading />;
  if (isError || !data) return <>{children}</>;

  // The scope check applies on top of the workspace check; if the page is not
  // even in this workspace, WorkspaceGuard will say so.
  const reachable = data.navigation.some((g) => g.items.some((item) => item.path === target));
  if (!reachable) return <>{children}</>;

  if (data.isSuperuser || data.scope.isGlobal) return <>{children}</>;

  const have = SCOPE_RANKS[data.scope.kind] ?? 99;
  const need = SCOPE_RANKS[requires] ?? 99;
  if (have <= need) return <>{children}</>;

  return (
    <Denied
      title="Données hors de votre portée"
      message={`Votre périmètre de données (${data.scope.kind}) ne couvre pas cette page. Rapprochez-vous de l’administration de l’établissement.`}
    />
  );
}
