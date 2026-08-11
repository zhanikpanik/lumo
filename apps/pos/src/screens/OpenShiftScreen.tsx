import React from 'react';
import { InstantOpenShiftScreen } from './InstantOpenShiftScreen';

interface Props {
  navigation: unknown;
}

/** Supabase path removed — delegates to InstantOpenShiftScreen. */
export const OpenShiftScreen: React.FC<Props> = InstantOpenShiftScreen;
