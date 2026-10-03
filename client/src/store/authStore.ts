import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string | null;
  avatar?: string | null;
}

export interface RoleRef {
  id: string;
  name: string;
}

export interface ScopeRef {
  id: string;
  scopeType: string;
  scopeId: string;
}

export interface School {
  id: string;
  name: string;
  slug?: string;
  currency?: string;
}

interface AuthState {
  user: User | null;
  school: School | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  roles: RoleRef[];
  permissions: string[];
  scopes: ScopeRef[];
  activeRoleId: string | null;
  /** True while the account still owes a temporary-password change. */
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  setSchool: (school: School | null) => void;
  setActiveRole: (roleId: string) => void;
  can: (module: string, action: string) => boolean;
  fetchMe: () => Promise<void>;
  /** Installs a freshly issued token (e.g. after a forced password change). */
  setSessionToken: (token: string) => void;
  clearMustChangePassword: () => void;
}

interface RegisterData {
  schoolName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  acceptTerms?: boolean;
}

interface ApiUser extends User {
  roles?: RoleRef[];
  permissions?: string[];
  scopes?: ScopeRef[];
}

interface ApiEnvelope {
  success: boolean;
  data: {
    token?: string;
    mustChangePassword?: boolean;
    user?: ApiUser;
    workspace?: School;
    school?: School;
  };
}

/**
 * Coarse permissions implying finer-grained ones, mirroring the backend
 * catalogue so the UI shows/hides the same things the API enforces.
 */
const PERMISSION_IMPLICATIONS: Record<string, string[]> = {
  'users.create': ['users.create_staff', 'users.create_teacher', 'users.create_student', 'users.create_parent'],
};

/**
 * Pure permission check, usable outside React.
 * `permissions` holds strings like 'students.view' (or '*' for full access).
 */
export function hasPermission(
  permissions: string[] | undefined | null,
  module: string,
  action: string
): boolean {
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  const needed = `${module}.${action}`;
  if (permissions.includes(needed)) return true;
  for (const held of permissions) {
    if (PERMISSION_IMPLICATIONS[held]?.includes(needed)) return true;
  }
  return false;
}

/**
 * React helper for permission-gated UI. While the auth context has not been
 * loaded yet (legacy persisted session), it returns true so users are not
 * stranded — the backend remains the enforcer.
 */
export function useCan(module: string, action: string): boolean {
  const permissions = useAuthStore((s) => s.permissions);
  if (!permissions || permissions.length === 0) return true;
  return hasPermission(permissions, module, action);
}

function extractAuthContext(body: ApiEnvelope['data']): {
  roles: RoleRef[];
  permissions: string[];
  scopes: ScopeRef[];
} {
  return {
    roles: Array.isArray(body.user?.roles) ? (body.user?.roles as RoleRef[]) : [],
    permissions: Array.isArray(body.user?.permissions) ? (body.user?.permissions as string[]) : [],
    scopes: Array.isArray(body.user?.scopes) ? (body.user?.scopes as ScopeRef[]) : [],
  };
}

function resolveActiveRoleId(roles: RoleRef[], previous: string | null): string | null {
  if (previous && roles.some((r) => r.id === previous)) return previous;
  return roles.length > 0 ? roles[0].id : null;
}

function persistSession(token: string, user: User, school: School | null) {
  localStorage.setItem('schoolflow_token', token);
  localStorage.setItem('schoolflow_user', JSON.stringify(user));
  if (school) localStorage.setItem('schoolflow_school', JSON.stringify(school));
  else localStorage.removeItem('schoolflow_school');
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      school: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      roles: [],
      permissions: [],
      scopes: [],
      activeRoleId: null,
      mustChangePassword: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await api.post<ApiEnvelope>('/auth/login', { email, password });
          const body = response.data?.data ?? {};
          const token = body.token;
          const user = body.user;

          if (!token || !user) {
            throw new Error('Réponse de connexion incomplète');
          }

          const school = body.workspace ?? null;
          const auth = extractAuthContext(body);
          persistSession(token, user, school);
          set({
            user,
            school,
            token,
            isAuthenticated: true,
            isLoading: false,
            roles: auth.roles,
            permissions: auth.permissions,
            scopes: auth.scopes,
            activeRoleId: resolveActiveRoleId(auth.roles, get().activeRoleId),
            mustChangePassword: Boolean(body.mustChangePassword),
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          const response = await api.post<ApiEnvelope>('/auth/register', data);
          const body = response.data?.data ?? {};
          const token = body.token;
          const user = body.user;

          if (!token || !user) {
            throw new Error('Réponse d’inscription incomplète');
          }

          const school = body.workspace ?? null;
          const auth = extractAuthContext(body);
          persistSession(token, user, school);
          set({
            user,
            school,
            token,
            isAuthenticated: true,
            isLoading: false,
            roles: auth.roles,
            permissions: auth.permissions,
            scopes: auth.scopes,
            activeRoleId: resolveActiveRoleId(auth.roles, get().activeRoleId),
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('schoolflow_token');
        localStorage.removeItem('schoolflow_user');
        localStorage.removeItem('schoolflow_school');
        set({
          user: null,
          school: null,
          token: null,
          isAuthenticated: false,
          roles: [],
          permissions: [],
          scopes: [],
          activeRoleId: null,
          mustChangePassword: false,
        });
      },

      setUser: (user) => {
        localStorage.setItem('schoolflow_user', JSON.stringify(user));
        set({ user });
      },

      setSchool: (school) => {
        if (school) localStorage.setItem('schoolflow_school', JSON.stringify(school));
        else localStorage.removeItem('schoolflow_school');
        set({ school });
      },

      setActiveRole: (roleId) => {
        if (get().roles.some((r) => r.id === roleId)) {
          set({ activeRoleId: roleId });
        }
      },

      setSessionToken: (token) => {
        localStorage.setItem('schoolflow_token', token);
        set({ token, isAuthenticated: true });
      },

      clearMustChangePassword: () => {
        set({ mustChangePassword: false });
      },

      can: (module, action) => {
        const permissions = get().permissions;
        if (!permissions || permissions.length === 0) return true;
        return hasPermission(permissions, module, action);
      },

      fetchMe: async () => {
        try {
          const response = await api.get<ApiEnvelope>('/auth/me');
          const body = response.data?.data ?? {};
          if (body.user) {
            const school = body.school ?? get().school;
            if (body.user && school) persistSession(get().token ?? '', body.user, school);
            const auth = extractAuthContext(body);
            set({
              user: body.user,
              school: school ?? null,
              isAuthenticated: true,
              roles: auth.roles,
              permissions: auth.permissions,
              scopes: auth.scopes,
              activeRoleId: resolveActiveRoleId(auth.roles, get().activeRoleId),
              mustChangePassword: Boolean(body.mustChangePassword),
            });
          }
        } catch {
          // keep current state; the axios interceptor handles 401
        }
      },
    }),
    {
      name: 'schoolflow-auth',
      partialize: (state) => ({
        user: state.user,
        school: state.school,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        roles: state.roles,
        permissions: state.permissions,
        scopes: state.scopes,
        activeRoleId: state.activeRoleId,
        mustChangePassword: state.mustChangePassword,
      }),
    }
  )
);
