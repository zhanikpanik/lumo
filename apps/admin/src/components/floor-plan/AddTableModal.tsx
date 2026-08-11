import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TableShape, FloorTable } from '../../../types/floor-plan';

interface AddTableModalProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onAdd: (table: {
  name: string;
  shape: TableShape;
 }) => void;
 onEdit?: (id: string, updates: {
  name: string;
  shape: TableShape;
 }) => void;
 defaultName: string;
 editingTable?: FloorTable | null;
}

export function AddTableModal({
 open,
 onOpenChange,
 onAdd,
 onEdit,
 defaultName,
 editingTable,
}: AddTableModalProps) {
 const isEditMode = !!editingTable;

 const [name, setName] = useState(defaultName);
 const [shape, setShape] = useState<TableShape>('square');

 // Reset form when editingTable changes
 useEffect(() => {
  if (editingTable) {
   setName(editingTable.name);
   setShape(editingTable.shape);
  } else {
   setName(defaultName);
   setShape('square');
  }
 }, [editingTable, defaultName]);

 const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (isEditMode && editingTable && onEdit) {
   onEdit(editingTable.id, {
    name: name || defaultName,
    shape,
   });
  } else {
   onAdd({
    name: name || defaultName,
    shape,
   });
  }
  onOpenChange(false);
  setName('');
  setShape('square');
 };

 return (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
   <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
    <Dialog.Content
     className={cn(
      'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
      'bg-white rounded-lg p-6 w-96 z-50 shadow-lg'
     )}
    >
     <Dialog.Title className="text-lg font-semibold mb-4">
      {isEditMode ? 'Редактировать стол' : 'Добавить стол'}
     </Dialog.Title>
     <Dialog.Close className="absolute top-4 right-4 text-gray-500 hover:text-gray-700">
      <X className="w-5 h-5" />
     </Dialog.Close>

     <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
       <Label.Root htmlFor="table-name" className="text-sm font-medium">
        Номер стола
       </Label.Root>
       <input
        id="table-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={defaultName}
        className={cn(
         'w-full px-3 py-2 border rounded-md',
         'focus:outline-none focus:ring-2 focus:ring-blue-500'
        )}
       />
      </div>

      <div className="space-y-2">
       <span className="text-sm font-medium">Форма</span>
       <div className="flex gap-3">
        <button
         type="button"
         onClick={() => setShape('square')}
         className={cn(
          'flex-1 py-2 px-4 rounded-md border transition-colors',
          shape === 'square'
           ? 'bg-gray-800 text-white border-gray-800'
           : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
         )}
        >
         Квадрат
        </button>
        <button
         type="button"
         onClick={() => setShape('circle')}
         className={cn(
          'flex-1 py-2 px-4 rounded-md border transition-colors',
          shape === 'circle'
           ? 'bg-gray-800 text-white border-gray-800'
           : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
         )}
        >
         Круг
        </button>
       </div>
      </div>

      <div className="flex gap-3 pt-2">
       <button
        type="button"
        onClick={() => onOpenChange(false)}
        className={cn(
         'flex-1 py-2 px-4 rounded-md border border-gray-300',
         'text-gray-700 hover:bg-gray-50 transition-colors'
        )}
       >
        Отмена
       </button>
       <button
        type="submit"
        className={cn(
         'flex-1 py-2 px-4 rounded-md bg-blue-600 text-white',
         'hover:bg-blue-700 transition-colors'
        )}
       >
        {isEditMode ? 'Сохранить' : 'Добавить'}
       </button>
      </div>
     </form>
    </Dialog.Content>
   </Dialog.Portal>
  </Dialog.Root>
 );
}
