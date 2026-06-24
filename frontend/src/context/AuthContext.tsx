import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { User, UserRole } from '../types';

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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            setUser({ id: snap.id, ...snap.data() } as User);
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return unsub;
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const email = `${username.trim()}@iuiupark.app`;
    const cred  = await signInWithEmailAndPassword(auth, email, password);
    const snap  = await getDoc(doc(db, 'users', cred.user.uid));
    if (!snap.exists()) throw new Error('User profile not found. Contact administrator.');
    setUser({ id: snap.id, ...snap.data() } as User);
  }, []);

  const logout = useCallback(() => {
    signOut(auth);
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles: UserRole[]) => {
    return user ? roles.includes(user.role) : false;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
