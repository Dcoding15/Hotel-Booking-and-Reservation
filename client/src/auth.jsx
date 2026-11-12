import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, TOKEN_KEY } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) { setUser(null); return null; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => { refresh().finally(() => setReady(true)); }, [refresh]);

  const signIn = (token, u) => { localStorage.setItem(TOKEN_KEY, token); setUser(u); };
  const signOut = () => { localStorage.removeItem(TOKEN_KEY); setUser(null); };

  return <Ctx.Provider value={{ user, ready, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}
