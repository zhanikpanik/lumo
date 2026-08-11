export type TableShape = 'square' | 'circle';

export interface FloorTable {
  id: string;
  name: string;
  shape: TableShape;
  x: number;
  y: number;
  width: number;  // grid cells (min 2)
  height: number; // grid cells (min 2)
  seats: number;
}

export interface Zone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface FloorPlan {
  id: string;
  name: string;
  tables: FloorTable[];
  zones: Zone[];
}

export interface DragState {
  tableId: string | null;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
}
