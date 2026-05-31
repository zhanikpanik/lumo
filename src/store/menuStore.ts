import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../utils/supabase';
import { Category, Product, Modifier } from '../types';
import { VENUE_ID } from '../config';

const MENU_TTL = 5 * 60 * 1000; // 5 minutes

interface MenuStoreState {
  categories: Category[];
  products: Record<string, Product[]>; // keyed by category_id
  allProducts: Product[];
  modifierGroups: {
    id: string;
    name: string;
    productIds: string[];
    modifiers: Modifier[];
    maxSelect: number; // 0 = без лимита
    isRequired: boolean;
  }[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number;
  fetchMenu: (force?: boolean) => Promise<void>;
}

export const useMenuStore = create<MenuStoreState>()(
  persist(
    (set, get) => ({
  categories: [],
  products: {},
  allProducts: [],
  modifierGroups: [],
  isLoading: false,
  error: null,
  lastFetchedAt: 0,

  fetchMenu: async (force = false) => {
    const now = Date.now();
    if (!force && now - get().lastFetchedAt < MENU_TTL && get().categories.length > 0) return;
    set({ isLoading: true, error: null });

    try {
      // Fetch categories
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name, color_hex, sort_order')
        .eq('is_active', true)
        .order('sort_order');

      if (catError) throw catError;

      const categories: Category[] = (catData || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        colorHex: c.color_hex,
      }));

      // Fetch products
      const { data: prodData, error: prodError } = await supabase
        .from('products')
        .select('id, category_id, name, price, has_modifiers, sort_order')
        .eq('type', 'dish')
        .eq('is_active', true)
        .order('sort_order');

      if (prodError) throw prodError;

      const allProducts: Product[] = (prodData || []).map((p: any) => ({
        id: p.id,
        categoryId: p.category_id,
        name: p.name,
        price: Number(p.price),
        hasModifiers: p.has_modifiers,
      }));

      // Fetch modifier groups + modifiers linked to products
      const { data: groupData, error: groupError } = await supabase
        .from('modifier_groups')
        .select('id, name, max_select, is_required, product_modifier_groups(product_id), modifiers(id, name, price, sort_order)')
        .eq('venue_id', VENUE_ID)
        .order('name');

      if (groupError) throw groupError;

      const modifierGroups = (groupData || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        maxSelect: typeof g.max_select === 'number' ? g.max_select : 0,
        isRequired: Boolean(g.is_required),
        productIds: (g.product_modifier_groups || []).map((pg: any) => pg.product_id),
        modifiers: (g.modifiers || [])
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((m: any) => ({
            id: m.id,
            name: m.name,
            price: Number(m.price),
          })),
      }));

      // Group by category
      const products: Record<string, Product[]> = {};
      for (const cat of categories) {
        products[cat.id] = allProducts.filter(p => p.categoryId === cat.id);
      }

      set({ categories, products, allProducts, modifierGroups, isLoading: false, lastFetchedAt: Date.now() });
    } catch (err: any) {
      console.error('Failed to fetch menu:', err.message);
      set({ error: err.message, isLoading: false });
    }
  },
    }),
    {
      name: 'menu-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        categories: state.categories,
        products: state.products,
        allProducts: state.allProducts,
        modifierGroups: state.modifierGroups,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
