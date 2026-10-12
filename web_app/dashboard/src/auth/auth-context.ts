import { createContext, use } from 'react';
import type { AdminUser } from '../api/types';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: AdminUser };

export type AuthContextValue = AuthState & {
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
