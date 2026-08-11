import { useReducer, useCallback, useRef, useEffect } from 'react';

/**
 * Generic finite state machine for warehouse forms (Delivery, WriteOff, Transfer).
 *
 * Replaces ad-hoc `saving: boolean` with explicit states:
 *   idle → submitting → success | error → idle
 *
 * Why FSM over useEffect chains:
 *   - Every state and transition is explicit
 *   - No cascading side-effects — the machine knows what's allowed
 *   - AI-agent can reason about the form: "if error, show retry; if submitting, disable buttons"
 *   - The same machine drives NewDelivery, NewWriteOff, NewTransfer — no per-form copy-paste
 *   - Double-submit protection: SUBMIT is ignored outside idle/error states
 */

// ── Types ──────────────────────────────────────────────

export type FormMachineState =
  | 'idle'
  | 'submitting'
  | 'success'
  | 'error';

export type FormMachineEvent =
  | { type: 'SUBMIT' }
  | { type: 'SUCCESS' }
  | { type: 'ERROR'; message: string }
  | { type: 'RETRY' };

export interface FormMachineContext {
  errorMessage: string | null;
}

export interface FormMachine {
  state: FormMachineState;
  context: FormMachineContext;
  send: (event: FormMachineEvent) => void;
  /** Convenience: true when the form is in a "busy" state */
  isBusy: boolean;
  /** Convenience: true when in error state */
  isError: boolean;
}

// ── Reducer ────────────────────────────────────────────

interface MachineSnapshot {
  state: FormMachineState;
  context: FormMachineContext;
}

function transition(
  snapshot: MachineSnapshot,
  event: FormMachineEvent,
): MachineSnapshot {
  const { state } = snapshot;

  switch (state) {
    case 'idle':
      if (event.type === 'SUBMIT') {
        return { state: 'submitting', context: { errorMessage: null } };
      }
      break;

    case 'submitting':
      if (event.type === 'SUCCESS') {
        return { state: 'success', context: { errorMessage: null } };
      }
      if (event.type === 'ERROR') {
        return { state: 'error', context: { errorMessage: event.message } };
      }
      break;

    case 'error':
      if (event.type === 'RETRY') {
        return { state: 'idle', context: { errorMessage: null } };
      }
      if (event.type === 'SUBMIT') {
        return { state: 'submitting', context: { errorMessage: null } };
      }
      break;

    case 'success':
      // Terminal state — once successful, no further transitions
      break;
  }

  // Unhandled transition — no-op
  return snapshot;
}

// ── Hook ───────────────────────────────────────────────

const initialState: MachineSnapshot = {
  state: 'idle',
  context: { errorMessage: null },
};

export function useFormMachine(): FormMachine {
  const [snapshot, dispatch] = useReducer(transition, initialState);

  // Stable reference for the send callback to read current state
  // without re-creating the callback on every render
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  });

  const send = useCallback((event: FormMachineEvent) => {
    // Guard: ignore events that the current state doesn't handle.
    // This prevents double-submit races: if user clicks Save twice,
    // the second SUBMIT is ignored when already in 'submitting'.
    const current = snapshotRef.current.state;
    if (
      (event.type === 'SUBMIT' && current !== 'idle' && current !== 'error') ||
      (event.type === 'SUCCESS' && current !== 'submitting') ||
      (event.type === 'ERROR' && current !== 'submitting') ||
      (event.type === 'RETRY' && current !== 'error')
    ) {
      return;
    }
    dispatch(event);
  }, []);

  return {
    state: snapshot.state,
    context: snapshot.context,
    send,
    isBusy: snapshot.state === 'submitting',
    isError: snapshot.state === 'error',
  };
}
