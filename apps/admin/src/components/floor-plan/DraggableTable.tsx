import { cn } from '@/lib/utils';
import type { FloorTable } from '../../../types/floor-plan';

const CELL_SIZE = 36;

interface DraggableTableProps {
 table: FloorTable;
 isDragging: boolean;
 isResizing?: boolean;
 isNew?: boolean;
 onMouseDown: (e: React.MouseEvent, table: FloorTable) => void;
 onResizeMouseDown?: (e: React.MouseEvent, table: FloorTable) => void;
 onDoubleClick?: (table: FloorTable) => void;
 onDelete?: (table: FloorTable) => void;
}

export function DraggableTable({
 table,
 isDragging,
 isResizing,
 isNew,
 onMouseDown,
 onResizeMouseDown,
 onDoubleClick,
 onDelete,
}: DraggableTableProps) {
 const baseX = table.x * CELL_SIZE;
 const baseY = table.y * CELL_SIZE;
 const w = (table.width || 2) * CELL_SIZE;
 const h = (table.height || 2) * CELL_SIZE;
 const borderRadius = table.shape === 'circle'
  ? Math.min(w, h) / 2
  : 8;

 return (
  <div
   data-table-id={table.id}
   onMouseDown={(e) => onMouseDown(e, table)}
   onDoubleClick={(e) => {
    e.stopPropagation();
    onDoubleClick?.(table);
   }}
   className={cn(
    'group absolute cursor-grab will-change-transform',
    isDragging && 'cursor-grabbing z-50 transition-none',
    isResizing && 'z-50 transition-none',
   )}
   style={{
    left: baseX,
    top: baseY,
    width: w,
    height: h,
    transform: isDragging
     ? 'translate3d(var(--drag-x, 0px), var(--drag-y, 0px), 0)'
     : 'translate3d(0, 0, 0)',
   }}
  >
   {/* Visual shape */}
   <div
    className={cn(
     'absolute inset-0 flex items-center justify-center',
     'transition-shadow',
     isNew && !isDragging && 'ring-4 ring-blue-400'
    )}
    style={{
     borderRadius,
     backgroundColor: '#6B7280',
    }}
   >
    <span className="text-white font-semibold text-lg select-none">
     {table.name}
    </span>
   </div>

   {/* Delete button */}
   {onDelete && (
    <button
     onMouseDown={(e) => e.stopPropagation()}
     onClick={(e) => {
      e.stopPropagation();
      onDelete(table);
     }}
     className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
    >
     ×
    </button>
   )}

   {/* Resize handle */}
   <div
    onMouseDown={(e) => {
     e.stopPropagation();
     onResizeMouseDown?.(e, table);
    }}
    className="absolute bottom-0 right-0 cursor-se-resize opacity-50 hover:opacity-100 z-10"
    style={{
     width: 14,
     height: 14,
     borderRight: '3px solid rgba(0,0,0,0.5)',
     borderBottom: '3px solid rgba(0,0,0,0.5)',
     borderBottomRightRadius: 4,
     margin: 3,
    }}
   />
  </div>
 );
}
