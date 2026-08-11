import React from 'react';
import { InstantLockScreen } from './InstantLockScreen';

interface LockNavigation {
  goBack(): void;
  replace(screen: 'Orders' | 'OpenShift'): void;
}

interface Props {
  navigation: LockNavigation;
  route?: { params?: { mode?: string } };
}

/** Supabase path removed — delegates to InstantLockScreen. */
export const LockScreen: React.FC<Props> = (props) =>
  <InstantLockScreen {...props} />;
