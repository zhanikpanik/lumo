import { verifyEmployeePin, type EmployeePinCredential } from '@lumo/data'

export interface OfflineEmployee extends EmployeePinCredential {
  displayName: string;
  role: string;
  status: 'active' | 'inactive';
}

export async function verifyOfflineEmployeePin(
  employee: OfflineEmployee,
  pin: string,
  now = Date.now(),
): Promise<boolean> {
  return employee.status === 'active' && verifyEmployeePin(employee, pin, now);
}
