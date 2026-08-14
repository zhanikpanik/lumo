export type MembershipRole = 'owner' | 'manager' | 'cashier' | 'waiter';
export type MembershipStatus = 'active' | 'suspended';
export type DeviceStatus = 'active' | 'revoked';
export type EmployeeStatus = 'active' | 'inactive';

export interface DeviceActivationVenue {
  id: string;
  name: string;
}

export interface DeviceActivationMagicCodeRequest {
  email: string;
  installationId: string;
}

export interface DeviceActivationMagicCodeResult {
  resendAfterSeconds: number;
}

export interface DeviceActivationRequest {
  email: string;
  magicCode: string;
  installationId: string;
  label: string;
  platform: 'ios' | 'android' | 'web';
}

export interface DeviceActivationResult {
  deviceId: string;
  venueId: string;
  token: string;
}

export interface DeviceActivationVenueSelection {
  activationChallenge: string;
  venues: DeviceActivationVenue[];
}

export type DeviceActivationResponse =
  | { status: 'activated'; activation: DeviceActivationResult }
  | { status: 'venue-selection'; selection: DeviceActivationVenueSelection };

export interface CompleteDeviceActivationRequest {
  activationChallenge: string;
  venueId: string;
}

/** PIN material is returned only to a venue-bound device session. */
export interface EmployeePinCredential {
  employeeId: string;
  pinSalt: string;
  pinVerifier: string;
  credentialsVersion: number;
  expiresAt: string;
}
