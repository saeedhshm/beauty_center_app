import { useEffect, useState, type ReactNode } from 'react';
import { loginAdmin, logoutAdmin, restoreAdminSession } from '../api/client';
import { currentRefreshToken } from './session-store';
import { AuthContext, type AuthState } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [restoreOnMount] = useState(() => currentRefreshToken() !== null);
  const [state, setState] = useState<AuthState>(() => restoreOnMount
    ? { status: 'loading', user: null }
    : { status: 'anonymous', user: null });

  useEffect(() => {
    let active = true;
    if (!restoreOnMount) return () => { active = false; };
    restoreAdminSession()
      .then((session) => {
        if (active) setState({ status: 'authenticated', user: session.user });
      })
      .catch(() => {
        if (active) setState({ status: 'anonymous', user: null });
      });
    return () => { active = false; };
  }, [restoreOnMount]);

  const login = async (phone: string, password: string) => {
    const session = await loginAdmin(phone, password);
    setState({ status: 'authenticated', user: session.user });
  };

  const logout = async () => {
    setState({ status: 'anonymous', user: null });
    await logoutAdmin();
  };

  return <AuthContext value={{ ...state, login, logout }}>{children}</AuthContext>;
}
