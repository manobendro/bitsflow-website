import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../../lib/firebase/client';

export interface AuthState {
  user: User | null;
  loading: boolean;
}

/**
 * Subscribe to Firebase auth state. Safe to call in any client island; the
 * underlying listener is shared by the SDK.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth(), (user) => {
      setState({ user, loading: false });
    });
    return unsub;
  }, []);

  return state;
}
