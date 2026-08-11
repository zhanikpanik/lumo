import { useQuery } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';

export interface ExpenseCategory {
  name: string;
  amount: number;
  color: string;
  children?: ExpenseCategory[];
}

const CATEGORY_CONFIG: { name: string; color: string; keywords: string[] }[] = [
  { name: 'Продукты',   color: '#f97316', keywords: ['кофе', 'молоко', 'сливки', 'хлеб', 'вода питьевая', 'мука', 'сахар', 'яйца', 'масло', 'шоколад', 'сироп', 'чай'] },
  { name: 'Хозтовары',  color: '#eab308', keywords: ['салфетки', 'стакан', 'пакет', 'бумага', 'однораз'] },
  { name: 'Транспорт',  color: '#64748b', keywords: ['такси', 'курьер', 'доставка', 'бензин'] },
  { name: 'Обслуживание', color: '#ef4444', keywords: ['ремонт', 'лампочк', 'батарейк', 'чистящ', 'моющее', 'почин'] },
  { name: 'Персонал',   color: '#3b82f6', keywords: ['зарплата', 'аванс', 'премия', 'бариста', 'официант'] },
  { name: 'Канцтовары', color: '#8b5cf6', keywords: ['канцтовар', 'ручка', 'бумага', 'блокнот'] },
];

function classifyExpense(note: string | null): string {
  if (!note) return 'Прочее';
  const lower = note.toLowerCase();
  for (const cat of CATEGORY_CONFIG) {
    for (const kw of cat.keywords) {
      if (lower.includes(kw)) return cat.name;
    }
  }
  return 'Прочее';
}

async function fetchExpenseCategories(start: string, end: string): Promise<ExpenseCategory[]> {
  const { data: txns } = await supabase
    .from('cash_movements')
    .select('amount, note')
    .eq('venue_id', VENUE_ID)
    .eq('movement_type', 'float_out')
    .gte('occurred_at', start)
    .lt('occurred_at', end);

  // Group by category name
  const catMap = new Map<string, number>();
  for (const t of txns || []) {
    const cat = classifyExpense(t.note as string | null);
    catMap.set(cat, (catMap.get(cat) || 0) + (Number(t.amount) || 0));
  }

  // Build result with colors
  const result: ExpenseCategory[] = [];
  for (const [name, amount] of catMap) {
    const config = CATEGORY_CONFIG.find((c) => c.name === name);
    result.push({ name, amount, color: config?.color || '#94a3b8' });
  }

  // Sort by amount descending
  result.sort((a, b) => b.amount - a.amount);

  return result;
}

export function useExpenseCategories(start: string, end: string) {
  return useQuery({
    queryKey: ['expense_categories', VENUE_ID, start, end],
    queryFn: () => fetchExpenseCategories(start, end),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev: unknown) => prev as ExpenseCategory[] | undefined,
  });
}
