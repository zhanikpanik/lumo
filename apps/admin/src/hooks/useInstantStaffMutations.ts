import { executeStaffCommand } from '@/data/staffCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import type { StaffMember } from './useInstantStaff';

export function useInstantCreateEmployee() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (input: {
    name: string;
    email: string | null;
    pin: string;
    role: StaffMember['role'];
  }) => {
    setLoading(true);
    try {
      const result = await executeStaffCommand<{ employeeId: string }>(
        'create-employee',
        crypto.randomUUID(),
        venueId,
        {
          displayName: input.name,
          email: input.email,
          pin: input.pin,
          role: input.role,
        },
      );
      return result.employeeId;
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  return { create, loading };
}

export function useInstantUpdateEmployee() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const update = useCallback(async (id: string, input: {
    name: string;
    email: string | null;
    pin?: string;
    role: StaffMember['role'];
  }) => {
    setLoading(true);
    try {
      await executeStaffCommand(
        'update-employee',
        crypto.randomUUID(),
        venueId,
        {
          employeeId: id,
          displayName: input.name,
          email: input.email,
          role: input.role,
          ...(input.pin ? { pin: input.pin } : {}),
        },
      );
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  return { update, loading };
}

export function useInstantDeleteEmployee() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await executeStaffCommand(
        'deactivate-employee',
        crypto.randomUUID(),
        venueId,
        { employeeId: id },
      );
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  return { remove, loading };
}
