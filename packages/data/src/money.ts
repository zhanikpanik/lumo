export type Tiyin = number & { readonly __brand: 'Tiyin' };

const TIYIN_PER_SOM = 100;

export function tiyin(value: number): Tiyin {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Money must be a safe integer number of tiyin');
  }

  return value as Tiyin;
}

export function som(value: string): Tiyin {
  const normalized = value.trim().replace(',', '.');
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    throw new TypeError(`Invalid som amount: ${value}`);
  }

  const [, sign, whole, fractional = ''] = match;
  const magnitude = Number(whole) * TIYIN_PER_SOM + Number(fractional.padEnd(2, '0'));
  return tiyin(sign === '-' ? -magnitude : magnitude);
}

export function addMoney(...amounts: readonly Tiyin[]): Tiyin {
  return tiyin(amounts.reduce((total, amount) => total + amount, 0));
}

export function formatSom(amount: Tiyin): string {
  const sign = amount < 0 ? '-' : '';
  const magnitude = Math.abs(amount);
  const whole = Math.trunc(magnitude / TIYIN_PER_SOM);
  const fractional = String(magnitude % TIYIN_PER_SOM).padStart(2, '0');
  return `${sign}${whole}.${fractional}`;
}

export interface CashLedgerMovement {
  movementType: string;
  amountTiyin: number;
}

export function cashMovementDeltaTiyin({ movementType, amountTiyin }: CashLedgerMovement): number {
  switch (movementType) {
    case 'sale':
    case 'cancel_refund':
    case 'float_in':
    case 'income':
      return amountTiyin;
    case 'refund':
      return amountTiyin;
    case 'collection':
    case 'float_out':
    case 'expense':
      return -Math.abs(amountTiyin);
    default:
      return 0;
  }
}

export function cashBalanceTiyin(
  startingCashTiyin: number,
  movements: readonly CashLedgerMovement[],
): number {
  return movements.reduce(
    (balance, movement) => balance + cashMovementDeltaTiyin(movement),
    startingCashTiyin,
  );
}
