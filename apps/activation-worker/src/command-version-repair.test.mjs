import assert from 'node:assert/strict';
import test from 'node:test';
import { commandVersionRepair, planCommandVersionRepairs } from './command-version-repair.mjs';

test('initializes an unversioned resource without claims at zero', () => {
  assert.deepEqual(commandVersionRepair(undefined, undefined), {
    nextVersion: 0,
    needsRepair: true,
    staleClaim: false,
  });
});

test('advances a resource past an existing claim', () => {
  assert.deepEqual(commandVersionRepair(0, 0), {
    nextVersion: 1,
    needsRepair: true,
    staleClaim: true,
  });
});

test('leaves a resource already ahead of its claims unchanged', () => {
  assert.deepEqual(commandVersionRepair(4, 3), {
    nextVersion: 4,
    needsRepair: false,
    staleClaim: false,
  });
});

test('repairs employee profile and PIN credential versions past existing claims', () => {
  const repairs = planCommandVersionRepairs({
    commandClaims: [
      { resourceType: 'employee', resourceId: 'employee-1', expectedVersion: 2 },
      { resourceType: 'employee-pin-credential', resourceId: 'credential-1', expectedVersion: 4 },
    ],
    employees: [{ id: 'employee-1', version: 2 }],
    employeePinCredentials: [{ id: 'credential-1', credentialsVersion: 4 }],
  });

  assert.deepEqual(repairs, [
    {
      entity: 'employees',
      record: { id: 'employee-1', version: 2 },
      versionField: 'version',
      nextVersion: 3,
      staleClaim: true,
    },
    {
      entity: 'employeePinCredentials',
      record: { id: 'credential-1', credentialsVersion: 4 },
      versionField: 'credentialsVersion',
      nextVersion: 5,
      staleClaim: true,
    },
  ]);
});
