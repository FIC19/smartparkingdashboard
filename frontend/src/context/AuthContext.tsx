import React, {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from 'react';
import { authAPI, usersAPI } from '../api/client';
import type { AuthTokens, User, UserRole } from '../types';

interface AuthContextValue {
  user:             User | null;
  isAuthenticated:  boolean;
  isLoading:        boolean;
  login:            (username: string, password: string) => Promise<void>;
  signup:           (username: string, password: string, role: UserRole) => Promise<void>;
  logout:           () => void;
  hasRole:          (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readTokens(): AuthTokens | null {
  const raw = localStorage.getItem('tokens');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    localStorage.removeItem('tokens');
    return null;
  }
}

function storeTokens(tokens: AuthTokens) {
  localStorage.setItem('tokens', JSON.stringify(tokens));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const tokens = readTokens();
      if (!tokens?.access) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await authAPI.me();
        if (!cancelled) setUser(res.data);
      } catch {
        localStorage.removeItem('tokens');
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    restoreSession();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const tokenRes = await authAPI.login(username.trim(), password);
    storeTokens({
      access: tokenRes.data.access,
      refresh: tokenRes.data.refresh,
    });

    const meRes = await authAPI.me();
    setUser(meRes.data);
  }, []);

  const signup = useCallback(async (username: string, password: string, role: UserRole) => {
    await usersAPI.create({
      username: username.trim(),
      password,
      role,
      first_name: username.trim(),
      last_name: '',
      email: `${username.trim()}@iuiupark.app`,
      phone: '',
    });
    await login(username, password);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem('tokens');
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles: UserRole[]) => {
    return user ? roles.includes(user.role) : false;
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      signup,
      logout,
      hasRole,
    }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
