/**
 * IUIU Smart Parking — Authentication Context
 * Provides login, logout, and the current user to all child components.
 */
import React, {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react';
import { authAPI } from '../api/client';
import type { User, AuthTokens, UserRole } from '../types';

interface AuthContextValue {
  user:            User | null;
  isAuthenticated: boolean;
  isLoading:       boolean;
  login:           (username: string, password: string) => Promise<void>;
  logout:          () => void;
  hasRole:         (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem('tokens');
    if (!stored) { setIsLoading(false); return; }

    authAPI.me()
      .then(({ data }) => setUser(data))
      .catch(() => { localStorage.removeItem('tokens'); })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await authAPI.login(username, password);
    const tokens: AuthTokens = { access: data.access, refresh: data.refresh };
    localStorage.setItem('tokens', JSON.stringify(tokens));
    const me = await authAPI.me();
    setUser(me.data);
  }, []);

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
      logout,
      hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
