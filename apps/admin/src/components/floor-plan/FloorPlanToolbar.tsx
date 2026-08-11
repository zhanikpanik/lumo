import { MoreHorizontal } from 'lucide-react';

interface ZoneItem {
 id: string;
 name: string;
}

interface FloorPlanToolbarProps {
 onAddClick: () => void;
 zones: ZoneItem[];
 activeZoneId: string | null;
 onZoneChange: (id: string) => void;
 pillMenuId: string | null;
 setPillMenuId: (id: string | null) => void;
 renamingId: string | null;
 renameValue: string;
 setRenameValue: (v: string) => void;
 onStartRename: (z: ZoneItem) => void;
 onSubmitRename: () => void;
 onDeleteZone: (id: string) => void;
 creating: boolean;
 newZoneName: string;
 setNewZoneName: (v: string) => void;
 setCreating: (v: boolean) => void;
 onSubmitCreate: () => void;
 renameRef: React.RefObject<HTMLInputElement | null>;
 createRef: React.RefObject<HTMLInputElement | null>;
 menuRef: React.RefObject<HTMLDivElement | null>;
}

export function FloorPlanToolbar({
 onAddClick,
 zones,
 activeZoneId,
 onZoneChange,
 pillMenuId,
 setPillMenuId,
 renamingId,
 renameValue,
 setRenameValue,
 onStartRename,
 onSubmitRename,
 onDeleteZone,
 creating,
 newZoneName,
 setNewZoneName,
 setCreating,
 onSubmitCreate,
 renameRef,
 createRef,
 menuRef,
}: FloorPlanToolbarProps) {
 return (
  <div>
   <div className="flex items-center justify-between mb-4">
    <h2 className="text-2xl font-bold">Схема зала</h2>
    <div className="flex items-center gap-2">
     <button
      onClick={onAddClick}
      className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/80 transition-colors"
     >
      + Добавить стол
     </button>
    </div>
   </div>

   {/* Zone pills */}
   <div className="flex items-center gap-1.5 mb-6 flex-wrap">
    {zones.map((z) => (
     <div key={z.id} className="relative flex items-center">
      {renamingId === z.id ? (
       <input
        ref={renameRef}
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onBlur={onSubmitRename}
        onKeyDown={(e) => {
         if (e.key === 'Enter') onSubmitRename();
         if (e.key === 'Escape') { /* handled by blur */ }
        }}
        className="px-3 py-1 rounded-full text-sm border border-[#F0EFED] bg-white outline-none w-28"
       />
      ) : (
       <button
        type="button"
        onClick={() => onZoneChange(z.id)}
        className={`group flex items-center gap-1 px-3 py-1 rounded-full text-sm transition-colors cursor-pointer ${
         activeZoneId === z.id
          ? 'bg-[#efefee] text-[#37352f] font-medium'
          : 'text-[#9b9a97] hover:bg-[#efefee] hover:text-[#37352f]'
        }`}
       >
        {z.name}
        <span
         className="inline-flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
         onClick={(e) => {
          e.stopPropagation();
          setPillMenuId(pillMenuId === z.id ? null : z.id);
         }}
        >
         <MoreHorizontal className="w-3 h-3" />
        </span>
       </button>
      )}
      {pillMenuId === z.id && (
       <div
        ref={menuRef}
        className="absolute left-0 top-full mt-1 z-30 bg-white border border-[#F0EFED] rounded-lg shadow-lg py-1 min-w-[160px]"
       >
        <button
         type="button"
         onClick={() => onStartRename(z)}
         className="w-full text-left px-3 py-1.5 text-sm text-[#37352f] hover:bg-[#efefee] transition-colors"
        >
         Переименовать
        </button>
        <button
         type="button"
         onClick={() => onDeleteZone(z.id)}
         className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-[#efefee] transition-colors"
        >
         Удалить
        </button>
       </div>
      )}
     </div>
    ))}
    {creating ? (
     <input
      ref={createRef}
      value={newZoneName}
      onChange={(e) => setNewZoneName(e.target.value)}
      onBlur={onSubmitCreate}
      onKeyDown={(e) => {
       if (e.key === 'Enter') onSubmitCreate();
       if (e.key === 'Escape') {
        setCreating(false);
        setNewZoneName('');
       }
      }}
      placeholder="Название зала"
      className="px-3 py-1 rounded-full text-sm border border-[#F0EFED] bg-white outline-none w-36"
     />
    ) : (
     <button
      type="button"
      onClick={() => setCreating(true)}
      className="px-2.5 py-1 rounded-full text-sm text-[#9b9a97] hover:bg-[#efefee] hover:text-[#37352f] transition-colors cursor-pointer"
     >
      +
     </button>
    )}
   </div>
  </div>
 );
}
