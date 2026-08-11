import { init, type InstantReactWebDatabase } from '@instantdb/react';
import type { AppSchema } from '@lumo/data';

export type InstantAdminClient = InstantReactWebDatabase<AppSchema, false>;

let instantClient: InstantAdminClient | null = null;

export function getInstantClient(): InstantAdminClient {
  instantClient ??= createInstantClient();
  return instantClient;
}

export async function sendDeviceActivationMagicCode(email: string): Promise<void> {
  await getInstantClient().auth.sendMagicCode({ email });
}

export function createInstantClient(
  appId = import.meta.env.VITE_INSTANT_APP_ID,
): InstantAdminClient {
  if (!appId) {
    throw new Error('VITE_INSTANT_APP_ID is required before InstantDB can be used');
  }

  return init<AppSchema>({ appId });
}
