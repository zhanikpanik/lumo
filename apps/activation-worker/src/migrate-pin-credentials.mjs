import { randomBytes } from 'node:crypto';
import { init } from '@instantdb/admin';
import { deterministicId, instantSchema } from '@lumo/data';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
const db = init({ appId, adminToken, schema: instantSchema });
const apply = process.env.PIN_MIGRATION_APPLY === '1';

const data = await db.query({ employees: { pinCredential: {} } });
const operations = [];
let plaintextPinsFound = 0;
let credentialsToInvalidate = 0;
for (const employee of data.employees) {
  const hasPlaintextPin = typeof employee.pin === 'string' && employee.pin.length > 0;
  if (hasPlaintextPin) plaintextPinsFound += 1;
  const linkedCredential = Array.isArray(employee.pinCredential) ? employee.pinCredential[0] : employee.pinCredential;
  const isModernCredential = linkedCredential?.pinVerifier?.startsWith('pbkdf2-sha256:')
    && Number.isSafeInteger(linkedCredential.credentialsVersion)
    && typeof linkedCredential.pinLookupHash === 'string'
    && linkedCredential.expiresAt;
  const alreadyResetRequired = linkedCredential?.pinVerifier === 'reset-required'
    && linkedCredential.expiresAt === '1970-01-01T00:00:00.000Z';
  if (!hasPlaintextPin && (isModernCredential || alreadyResetRequired)) continue;
  const credentialId = linkedCredential?.id ?? deterministicId('employee-pin-credential', employee.id);
  const currentVersion = Number.isSafeInteger(linkedCredential?.credentialsVersion)
    ? linkedCredential.credentialsVersion
    : 0;
  operations.push(
    db.tx.employeePinCredentials[credentialId]
      .update({
        pinSalt: randomBytes(16).toString('hex'),
        pinVerifier: 'reset-required',
        pinLookupHash: `reset-required:${credentialId}`,
        credentialsVersion: currentVersion + 1,
        expiresAt: '1970-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
      })
      .link({ employee: employee.id }),
  );
  credentialsToInvalidate += 1;
}

if (!apply) {
  console.log(JSON.stringify({
    status: 'dry_run',
    employees: data.employees.length,
    plaintextPinsFound,
    credentialsToInvalidate,
  }, null, 2));
  process.exit(0);
}

for (let offset = 0; offset < operations.length; offset += 100) {
  await db.transact(operations.slice(offset, offset + 100));
}
console.log(JSON.stringify({
  status: 'reset_required',
  employees: data.employees.length,
  plaintextPinsFound,
  credentialsInvalidated: credentialsToInvalidate,
}, null, 2));
