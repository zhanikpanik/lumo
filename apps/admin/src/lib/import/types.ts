// ── Raw input ──

/** A single row from a spreadsheet: column header → cell value (string). */
export type RawRow = Record<string, string>;

/** Result of parsing a multi-sheet workbook. */
export interface ParsedData {
  sheets: Record<string, { headers: string[]; rows: RawRow[] }>;
  fileName: string;
}

// ── Column matching ──

/** Result of matching a set of sheet headers against a profile's field matchers. */
export interface FieldMapping {
  /** canonical field name → column index in the sheet (0-based) */
  resolved: Record<string, number>;
  /** headers that didn't match any canonical field */
  unmatched: string[];
}

/** Result of auto-detecting which sheet holds which entity. */
export interface EntityDetection {
  sheetName: string;
  entity: 'categories' | 'dishes' | 'ingredients' | 'recipeItems' | 'workshops';
  /** 0–1 how confident the match is */
  confidence: number;
  fieldMapping: FieldMapping;
}

// ── Intermediate Representation (IR) — normalized before DB insert ──

export interface ImportIR {
  categories: ImportCategory[];
  dishes: ImportDish[];
  ingredients: ImportIngredient[];
  recipeItems: ImportRecipeItem[];
  workshops: ImportWorkshop[];
  warnings: ImportWarning[];
}

export interface ImportCategory {
  _row: number; // source row index for error reporting
  name: string;
  color_hex?: string;
  sort_order?: number;
}

export interface ImportDish {
  _row: number;
  name: string;
  price: number;
  cost_price?: number;
  category_name?: string; // resolved to category_id during resolve phase
  workshop_name?: string; // resolved to workshop_id during resolve phase
  is_active?: boolean;
  sort_order?: number;
  output_weight?: number;
}

export interface ImportIngredient {
  _row: number;
  name: string;
  price?: number;
  unit?: string;
  stock_quantity?: number;
  workshop_name?: string;
}

export interface ImportRecipeItem {
  _row: number;
  dish_name: string; // resolved to product_id via dishes name lookup
  ingredient_name: string; // resolved to ingredient_id via ingredients name lookup
  quantity: number;
  unit: string;
}

export interface ImportWorkshop {
  _row: number;
  name: string;
}

export interface ImportWarning {
  row: number;
  entity: string;
  field: string;
  message: string;
}

// ── Results ──

export interface ImportResult {
  created: { entity: string; count: number }[];
  updated: { entity: string; count: number }[];
  skipped: { entity: string; count: number; reason: string }[];
  errors: { row: number; entity: string; message: string }[];
  warnings: ImportWarning[];
}

export interface ImportProgress {
  stage: 'parsing' | 'detecting' | 'mapping' | 'resolving' | 'importing' | 'done' | 'error';
  current?: number;
  total?: number;
  message?: string;
}

// ── Duplicate strategy ──

export type DuplicateStrategy = 'skip' | 'update' | 'create_new';

export interface ImportOptions {
  duplicateStrategy: DuplicateStrategy;
  autoCreateCategories: boolean;
  autoCreateWorkshops: boolean;
  autoCreateIngredients: boolean;
  /** Which entities to import */
  entities: ('categories' | 'dishes' | 'ingredients' | 'recipeItems' | 'workshops')[];
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  duplicateStrategy: 'skip',
  autoCreateCategories: true,
  autoCreateWorkshops: true,
  autoCreateIngredients: true,
  entities: ['categories', 'dishes', 'ingredients', 'recipeItems', 'workshops'],
};

// ── Profile types ──

/** Per-field transform config. */
export interface FieldTransform {
  transform?: (value: string, row: RawRow) => unknown;
  default?: unknown;
}

/** Maps canonical field names to arrays of possible column header patterns. */
export interface ColumnMatchers {
  [canonicalField: string]: string[];
}

/** Full entity mapping for one entity type. */
export interface EntityMapping {
  /** Canonical field → possible header patterns (case-insensitive substring match) */
  matchers: ColumnMatchers;
  /** Per-field value transforms */
  transforms?: Record<string, FieldTransform>;
}

/** Detects which sheet holds an entity and maps its columns. */
export interface EntityProfile extends EntityMapping {
  /** Regex to match sheet name. If omitted, all sheets are tried and best match wins. */
  sheetPattern?: RegExp;
}

export interface ImportProfile {
  id: string;
  name: string;
  description?: string;

  /**
   * Detect if the workbook belongs to this profile.
   * Receives a map of sheetName → header row.
   * Returns 0–1 confidence.
   */
  detect: (sheets: Record<string, string[]>) => number;

  /** Entity mappings per entity type. */
  entities: {
    categories?: EntityProfile;
    dishes?: EntityProfile;
    ingredients?: EntityProfile;
    recipeItems?: EntityProfile;
    workshops?: EntityProfile;
  };

  /**
   * Global value transforms applied to all entities.
   * Example: Poster stores prices in kopecks → divide by 100.
   */
  globalTransforms?: {
    priceDivider?: number;
  };
}
