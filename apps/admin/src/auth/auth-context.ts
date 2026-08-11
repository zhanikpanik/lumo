import { createContext } from 'react';

export interface AuthValue {
  isAuthenticated: boolean;
  loading: boolean;
  membershipLoading: boolean;
  venueId: string | null;
  authError: Error | null;
  requestMagicCode: (email: string) => Promise<void>;
  verifyMagicCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);
