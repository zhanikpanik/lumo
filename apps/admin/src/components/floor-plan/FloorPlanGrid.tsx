import { useRef, useState, useEffect, useCallback } from 'react';
import { useFloorPlan } from '@/hooks/useFloorPlan';
import { FloorPlanToolbar } from './FloorPlanToolbar';
import { ZoneBlock } from './ZoneBlock';
import { DraggableTable } from './DraggableTable';
import { AddTableModal } from './AddTableModal';
import type { FloorTable } from '../../../types/floor-plan';
import { toast } from 'sonner';

const CELL_SIZE = 36;
const GRID_COLS = 24;
const GRID_ROWS = 14;
const MIN_CELLS = 2;

interface ZoneItem {
 id: string;
 name: string;
}

export function FloorPlanGrid() {
 const gridRef = useRef<HTMLDivElement>(null);
 const [isModalOpen, setIsModalOpen] = useState(false);
 const [editingTable, setEditingTable] = useState<FloorTable | null>(null);
 const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
 const [resizingTableId, setResizingTableId] = useState<string | null>(null);
 const dragOffsetRef = useRef({ x: 0, y: 0 });
 const draggedTableRef = useRef<FloorTable | null>(null);
 const resizedTableRef = useRef<FloorTable | null>(null);
 const [newTableId, setNewTableId] = useState<string | null>(null);

 // Zone management
 const [zones, setZones] = useState<ZoneItem[]>([]);
 const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
 const [pillMenuId, setPillMenuId] = useState<string | null>(null);
 const [renamingId, setRenamingId] = useState<string | null>(null);
 const [renameValue, setRenameValue] = useState('');
 const [creating, setCreating] = useState(false);
 const [newZoneName, setNewZoneName] = useState('');
 const renameRef = useRef<HTMLInputElement>(null);
 const createRef = useRef<HTMLInputElement>(null);
 const menuRef = useRef<HTMLDivElement>(null);

 const {
  tables,
  zones: hookZones,
  moveTable,
  resizeTable,
  addTable,
  removeTable,
  updateTable,
  getNextTableNumber,
  createZone,
  renameZone,
  deleteZone,
 } = useFloorPlan(activeZoneId);

 // Sync zones from hook
 useEffect(() => {
  setZones(hookZones);
  if (!activeZoneId && hookZones.length > 0) {
   setActiveZoneId(hookZones[0].id);
  }
 }, [hookZones, activeZoneId]);

 // Focus handlers
 useEffect(() => {
  if (renamingId) renameRef.current?.focus();
 }, [renamingId]);
 useEffect(() => {
  if (creating) createRef.current?.focus();
 }, [creating]);

 // Close menu on outside click
 useEffect(() => {
  if (!pillMenuId) return;
  const h = (e: MouseEvent) => {
   if (menuRef.current && !menuRef.current.contains(e.target as Node)) setPillMenuId(null);
  };
  document.addEventListener('mousedown', h);
  return () => document.removeEventListener('mousedown', h);
 }, [pillMenuId]);

 // Zone CRUD
 function startRename(z: ZoneItem) {
  setRenamingId(z.id);
  setRenameValue(z.name);
  setPillMenuId(null);
 }

 async function submitRename() {
  const id = renamingId;
  const name = renameValue.trim();
  if (!id || !name) { setRenamingId(null); return; }
  try {
   await renameZone(id, name);
   toast.success('Зал переименован');
  } catch (e) {
   toast.error((e as Error)?.message || 'Не удалось переименовать');
  }
  setRenamingId(null);
 }

 async function handleDeleteZone(id: string) {
  if (!confirm('Удалить зал? Столы этого зала будут удалены.')) return;
  try {
   await deleteZone(id);
   toast.success('Зал удален');
   if (activeZoneId === id) {
    setActiveZoneId(zones.find(z => z.id !== id)?.id ?? null);
   }
  } catch (e) {
   toast.error((e as Error)?.message || 'Не удалось удалить зал');
  }
  setPillMenuId(null);
 }

 async function submitCreate() {
  const name = newZoneName.trim();
  if (!name) { setCreating(false); return; }
  try {
   const id = await createZone(name);
   setNewZoneName('');
   setCreating(false);
   setActiveZoneId(id);
   toast.success('Зал создан');
  } catch (e) {
   toast.error((e as Error)?.message || 'Не удалось создать зал');
  }
 }

 // ── Drag handling ──
 const handleMouseDown = useCallback((e: React.MouseEvent, table: FloorTable) => {
  e.preventDefault();
  e.stopPropagation();

  if (newTableId === table.id) {
   setNewTableId(null);
  }

  if (!gridRef.current) return;

  const gridRect = gridRef.current.getBoundingClientRect();
  const offsetX = e.clientX - gridRect.left - table.x * CELL_SIZE;
  const offsetY = e.clientY - gridRect.top - table.y * CELL_SIZE;

  dragOffsetRef.current = { x: offsetX, y: offsetY };
  draggedTableRef.current = table;
  setDraggingTableId(table.id);

  const tableEl = document.querySelector(`[data-table-id="${table.id}"]`) as HTMLElement;
  if (tableEl) {
   tableEl.style.setProperty('--drag-x', '0px');
   tableEl.style.setProperty('--drag-y', '0px');
  }
 }, [newTableId]);

 useEffect(() => {
  const handleMouseMove = (e: MouseEvent) => {
   if (!draggingTableId || !gridRef.current || !draggedTableRef.current) return;

   const gridRect = gridRef.current.getBoundingClientRect();
   const rawX = e.clientX - gridRect.left - dragOffsetRef.current.x;
   const rawY = e.clientY - gridRect.top - dragOffsetRef.current.y;

   const tableEl = document.querySelector(`[data-table-id="${draggingTableId}"]`) as HTMLElement;
   if (tableEl) {
    const baseX = draggedTableRef.current.x * CELL_SIZE;
    const baseY = draggedTableRef.current.y * CELL_SIZE;
    tableEl.style.setProperty('--drag-x', `${rawX - baseX}px`);
    tableEl.style.setProperty('--drag-y', `${rawY - baseY}px`);
   }
  };

  const handleMouseUp = (e: MouseEvent) => {
   if (!draggingTableId || !gridRef.current || !draggedTableRef.current) return;

   const gridRect = gridRef.current.getBoundingClientRect();
   const rawX = e.clientX - gridRect.left - dragOffsetRef.current.x;
   const rawY = e.clientY - gridRect.top - dragOffsetRef.current.y;

   const tw = draggedTableRef.current.width || 2;
   const th = draggedTableRef.current.height || 2;
   const snappedX = Math.max(0, Math.min(GRID_COLS - tw, Math.round(rawX / CELL_SIZE)));
   const snappedY = Math.max(0, Math.min(GRID_ROWS - th, Math.round(rawY / CELL_SIZE)));

   moveTable(draggingTableId, snappedX, snappedY);
   setDraggingTableId(null);
   draggedTableRef.current = null;
  };

  if (draggingTableId) {
   window.addEventListener('mousemove', handleMouseMove, { passive: true });
   window.addEventListener('mouseup', handleMouseUp);
  }

  return () => {
   window.removeEventListener('mousemove', handleMouseMove);
   window.removeEventListener('mouseup', handleMouseUp);
  };
 }, [draggingTableId, moveTable]);

 // ── Resize handling ──
 const handleResizeMouseDown = useCallback((e: React.MouseEvent, table: FloorTable) => {
  e.preventDefault();
  e.stopPropagation();
  resizedTableRef.current = table;
  setResizingTableId(table.id);
 }, []);

 useEffect(() => {
  const handleResizeMove = (e: MouseEvent) => {
   if (!resizingTableId || !gridRef.current || !resizedTableRef.current) return;

   const gridRect = gridRef.current.getBoundingClientRect();
   const table = resizedTableRef.current;
   const mouseX = e.clientX - gridRect.left;
   const mouseY = e.clientY - gridRect.top;

   const newW = Math.max(MIN_CELLS, Math.round((mouseX - table.x * CELL_SIZE) / CELL_SIZE));
   const newH = Math.max(MIN_CELLS, Math.round((mouseY - table.y * CELL_SIZE) / CELL_SIZE));

   const clampedW = Math.min(newW, GRID_COLS - table.x);
   const clampedH = Math.min(newH, GRID_ROWS - table.y);

   const tableEl = document.querySelector(`[data-table-id="${resizingTableId}"]`) as HTMLElement;
   if (tableEl) {
    tableEl.style.width = `${clampedW * CELL_SIZE}px`;
    tableEl.style.height = `${clampedH * CELL_SIZE}px`;
    if (table.shape === 'circle') {
     tableEl.style.borderRadius = `${Math.min(clampedW, clampedH) * CELL_SIZE / 2}px`;
    }
   }
  };

  const handleResizeUp = (e: MouseEvent) => {
   if (!resizingTableId || !gridRef.current || !resizedTableRef.current) return;

   const gridRect = gridRef.current.getBoundingClientRect();
   const table = resizedTableRef.current;
   const mouseX = e.clientX - gridRect.left;
   const mouseY = e.clientY - gridRect.top;

   const newW = Math.max(MIN_CELLS, Math.round((mouseX - table.x * CELL_SIZE) / CELL_SIZE));
   const newH = Math.max(MIN_CELLS, Math.round((mouseY - table.y * CELL_SIZE) / CELL_SIZE));
   const clampedW = Math.min(newW, GRID_COLS - table.x);
   const clampedH = Math.min(newH, GRID_ROWS - table.y);

   resizeTable(resizingTableId, clampedW, clampedH);
   setResizingTableId(null);
   resizedTableRef.current = null;
  };

  if (resizingTableId) {
   window.addEventListener('mousemove', handleResizeMove, { passive: true });
   window.addEventListener('mouseup', handleResizeUp);
  }

  return () => {
   window.removeEventListener('mousemove', handleResizeMove);
   window.removeEventListener('mouseup', handleResizeUp);
  };
 }, [resizingTableId, resizeTable]);

 // ── Double-click to edit ──
 const handleDoubleClick = useCallback((table: FloorTable) => {
  setEditingTable(table);
  setIsModalOpen(true);
 }, []);


 const activeZoneName = zones.find(z => z.id === activeZoneId)?.name ?? '';

 return (
  <div className="p-6">
   <FloorPlanToolbar
    onAddClick={() => {
     setEditingTable(null);
     setIsModalOpen(true);
    }}
    zones={zones}
    activeZoneId={activeZoneId}
    onZoneChange={setActiveZoneId}
    pillMenuId={pillMenuId}
    setPillMenuId={setPillMenuId}
    renamingId={renamingId}
    renameValue={renameValue}
    setRenameValue={setRenameValue}
    onStartRename={startRename}
    onSubmitRename={submitRename}
    onDeleteZone={handleDeleteZone}
    creating={creating}
    newZoneName={newZoneName}
    setNewZoneName={setNewZoneName}
    setCreating={setCreating}
    onSubmitCreate={submitCreate}
    renameRef={renameRef}
    createRef={createRef}
    menuRef={menuRef}
   />

   <div
    ref={gridRef}
    className="relative border border-border rounded-lg bg-background select-none"
    style={{
     width: GRID_COLS * CELL_SIZE,
     height: GRID_ROWS * CELL_SIZE,
    }}
   >
    {/* Grid lines */}
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
     {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
      <line
       key={`v-${i}`}
       x1={i * CELL_SIZE}
       y1={0}
       x2={i * CELL_SIZE}
       y2={GRID_ROWS * CELL_SIZE}
       stroke="#e5e5e5"
       strokeWidth={1}
      />
     ))}
     {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
      <line
       key={`h-${i}`}
       x1={0}
       y1={i * CELL_SIZE}
       x2={GRID_COLS * CELL_SIZE}
       y2={i * CELL_SIZE}
       stroke="#e5e5e5"
       strokeWidth={1}
      />
     ))}
    </svg>

    {/* Zones */}
    {activeZoneName && (
     <ZoneBlock name={activeZoneName} rows={GRID_ROWS} cols={GRID_COLS} />
    )}

    {/* Tables */}
    <div className="absolute inset-0">
     {tables.map((table) => (
      <DraggableTable
       key={table.id}
       table={table}
       isDragging={draggingTableId === table.id}
       onMouseDown={handleMouseDown}
       onDoubleClick={handleDoubleClick}
       onResizeMouseDown={handleResizeMouseDown}
       onDelete={(table) => removeTable(table.id)}
      />
     ))}
    </div>
   </div>

   {isModalOpen && (
    <AddTableModal
     open={isModalOpen}
     onOpenChange={(open) => {
      setIsModalOpen(open);
      if (!open) setEditingTable(null);
     }}
     defaultName={getNextTableNumber()}
     editingTable={editingTable}
     onAdd={({ name, shape }) => addTable(name, shape)}
     onEdit={(id, updates) => updateTable(id, updates)}
    />
   )}
  </div>
 );
}
