import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Menu, MoreHorizontal } from 'lucide-react';
import { useState, useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAuth } from '@/auth/useAuth';
import { useInstantWarehouses } from '@/hooks/useInstantWarehouses';
import { useInstantCreateWarehouse, useInstantUpdateWarehouse, useInstantDeleteWarehouse } from '@/hooks/useInstantWarehouseMutations';
import { useInstantShifts } from '@/hooks/useInstantShifts';
import { toast } from 'sonner';
import { SvgIcon } from '@/components/dashboard/SvgIcon';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextInputDialog } from '@/components/ui/TextInputDialog';
import iconOverview from '@/assets/icons/eye.svg?raw';
import iconSales from '@/assets/icons/wallet.svg?raw';
import iconMenu from '@/assets/icons/tableware.svg?raw';
import iconWarehouse from '@/assets/icons/warehouse.svg?raw';
import iconManagement from '@/assets/icons/wrench.svg?raw';

const GROUP_ICONS: Record<string, string> = {
  '/overview': iconOverview,
  '/sales': iconSales,
  '/menu': iconMenu,
  '/warehouse': iconWarehouse,
  '/management': iconManagement,
};

interface NavItem {
 to: string;
 label: string;
 children?: { to: string; label: string }[];
}

const navItems: NavItem[] = [
 {
  to: '/overview', label: 'Обзор',
  children: [
   { to: '/', label: 'Дашборд' },
   { to: '/analytics', label: 'Аналитика' },
   { to: '/analytics-profit', label: 'Прибыль' },
  ],
 },
 {
  to: '/sales', label: 'Продажи',
  children: [
   { to: '/cash-shifts', label: 'Кассовые смены' },
   { to: '/transactions', label: 'Журнал' },
   { to: '/checks', label: 'Чеки' },
  ],
 },
 {
  to: '/menu', label: 'Меню',
  children: [
   { to: '/menu', label: 'Блюда' },
   { to: '/menu/categories', label: 'Категории' },
   { to: '/menu/ingredients', label: 'Ингредиенты' },
  ],
 },
 {
  to: '/warehouse', label: 'Склад',
  children: [
   { to: '/warehouse/operations', label: 'Все операции' },
   { to: '/warehouse/inventory', label: 'Переучёт' },
  ],
 },
 {
  to: '/management', label: 'Управление',
  children: [
   { to: '/staff', label: 'Сотрудники' },
   { to: '/floor-plan', label: 'Схема зала' },
   { to: '/import', label: 'Импорт' },
   { to: '/settings', label: 'Настройки' },
  ],
 },
];

export function Layout() {
 const { signOut, venueName } = useAuth();
 const navigate = useNavigate();
 const location = useLocation();
  const { data: warehouses = [] } = useInstantWarehouses();
  const createWarehouse = useInstantCreateWarehouse();
  const renameWarehouse = useInstantUpdateWarehouse();
  const deleteWarehouse = useInstantDeleteWarehouse();
 const { data: shifts } = useInstantShifts();
 const activeShift = shifts.find((shift) => shift.status === 'open');
 const [sidebarOpen, setSidebarOpen] = useState(false);
 const [warehouseNameDialog, setWarehouseNameDialog] = useState<
  { mode: 'create' } | { mode: 'rename'; id: string; currentName: string } | null
 >(null);
 const [warehouseToDelete, setWarehouseToDelete] = useState<{ id: string; name: string } | null>(null);

 // Auto-close sidebar on navigation (mobile)
 useEffect(() => {
  setSidebarOpen(false);
 }, [location.pathname]);

 useEffect(() => {
  if (!sidebarOpen) return;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => {
   document.body.style.overflow = previousOverflow;
  };
 }, [sidebarOpen]);


 async function handleWarehouseName(name: string) {
  const dialog = warehouseNameDialog;
  if (!dialog) return;
  try {
   if (dialog.mode === 'create') {
    await createWarehouse.create({ operationId: crypto.randomUUID(), name });
    toast.success('Склад создан');
   } else if (name !== dialog.currentName) {
    await renameWarehouse.update(dialog.id, { name });
    toast.success('Склад переименован');
   }
   setWarehouseNameDialog(null);
  } catch (e) {
   toast.error((e as Error)?.message || 'Не удалось сохранить склад');
  }
 }

 async function handleDeleteWarehouse() {
  const candidate = warehouseToDelete;
  if (!candidate) return;
  try {
   await deleteWarehouse.remove(candidate.id);
   toast.success('Склад удален');
   if (location.pathname.startsWith(`/warehouse/${candidate.id}`)) {
    navigate('/warehouse/operations');
   }
   setWarehouseToDelete(null);
  } catch (e) {
   toast.error((e as Error)?.message || 'Не удалось удалить склад');
  }
 }

 const isChildActive = (item: NavItem) => {
  return item.children?.some((child) => {
   if (child.to === '/') return location.pathname === '/';
   if (child.to === item.to) return location.pathname === item.to;
   return location.pathname.startsWith(child.to);
  });
 };

 return (
  <div className="flex h-screen bg-background">
   {/* Mobile overlay */}
   {sidebarOpen && (
    <div
     className="fixed inset-0 z-30 bg-black/30 md:hidden"
     onClick={() => setSidebarOpen(false)}
    />
   )}

   {/* Sidebar — Notion-style */}
   <aside
    className={cn(
     'fixed inset-y-0 left-0 z-40 w-60 bg-muted/40 border-r border-border flex flex-col select-none transition-transform duration-200',
     'md:static md:translate-x-0',
     sidebarOpen ? 'translate-x-0' : '-translate-x-full',
    )}
   >
    <div className="px-3 pt-3 pb-3">
     <div className="flex items-center gap-2 px-2 py-1">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">L</span>
      <div className="min-w-0">
       <h1 className="text-sm font-semibold leading-tight">Lumo</h1>
       <p className="truncate text-xs text-muted-foreground">{venueName || 'Alto Coffee Bishkek'}</p>
      </div>
     </div>
    </div>

    <nav className="sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 space-y-3">
     {navItems.map((item) => {
      if (item.children) {
       const isActive = isChildActive(item);

       return (
        <div key={item.to}>
         <div
          className={cn(
           'flex items-center gap-0.5 px-2 py-1 rounded text-sm font-medium',
           isActive ? 'text-foreground' : 'text-muted-foreground'
          )}
         >
          {GROUP_ICONS[item.to] && (
           <SvgIcon raw={GROUP_ICONS[item.to]} className="w-6 h-6" />
          )}
          {item.label}
         </div>

         <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
           <NavLink
            key={child.to}
            to={child.to}
            end={child.to === '/' || child.to === '/menu'}
            className={({ isActive }) =>
             cn(
              'flex min-h-11 items-center px-2 py-1 rounded text-sm transition-colors md:min-h-0 md:block',
              isActive
               ? 'bg-accent text-foreground'
               : 'text-foreground hover:bg-accent'
             )
            }
           >
            {child.label}
           </NavLink>
          ))}
          {item.to === '/warehouse' && (
           <>
            {warehouses.map((warehouse) => {
             return (
             <div key={warehouse.id} className={cn(
              'group relative flex min-h-11 items-center px-2 py-1 rounded transition-colors hover:bg-accent md:min-h-0'
             )}>
              <span className="flex-1 text-sm text-muted-foreground select-none">{warehouse.name}</span>
              <DropdownMenu.Root>
               <DropdownMenu.Trigger asChild>
                <button
                 type="button"
                 className="flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-colors hover:bg-accent hover:text-foreground md:size-auto md:px-1 md:py-0.5 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 data-[state=open]:opacity-100"
                 aria-label={`Действия со складом ${warehouse.name}`}
                >
                 <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
               </DropdownMenu.Trigger>
               <DropdownMenu.Portal>
                <DropdownMenu.Content
                 side="right"
                 align="start"
                 sideOffset={8}
                 collisionPadding={12}
                 className="z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                >
                 <DropdownMenu.Item
                  onSelect={() => setWarehouseNameDialog({ mode: 'rename', id: warehouse.id, currentName: warehouse.name })}
                  className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm outline-none focus:bg-accent"
                 >
                  Переименовать
                 </DropdownMenu.Item>
                 <DropdownMenu.Item
                  onSelect={() => setWarehouseToDelete({ id: warehouse.id, name: warehouse.name })}
                  className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm text-destructive outline-none focus:bg-accent"
                 >
                  Удалить
                 </DropdownMenu.Item>
                </DropdownMenu.Content>
               </DropdownMenu.Portal>
              </DropdownMenu.Root>
             </div>
             );
            })}
            <button
             type="button"
             onClick={() => setWarehouseNameDialog({ mode: 'create' })}
             className="min-h-11 w-full px-2 py-1 rounded text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-left md:min-h-0"
            >
             + Новый склад
            </button>
           </>
          )}
         </div>
        </div>
       );
      }
     })}
    </nav>

    {/* Active shift indicator */}
    <div className="px-3 pb-1">
     {activeShift ? (
      <NavLink
       to={`/cash-shifts?shift=${activeShift.id}`}
       className="flex min-h-11 items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:min-h-0"
      >
       <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
       <span className="truncate">
        Смена открыта ({new Date(activeShift.openedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})
       </span>
      </NavLink>
     ) : (
      <NavLink
       to="/cash-shifts"
       className="flex min-h-11 items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:min-h-0"
      >
       <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
       <span>Нет активной смены</span>
      </NavLink>
     )}
    </div>

    <div className="p-4 text-xs text-muted-foreground">
     <button
      type="button"
      onClick={() => void signOut()}
      className="min-h-11 hover:text-foreground transition-colors md:min-h-0"
     >
      Выйти
     </button>
    </div>
   </aside>

   {/* Main content */}
   <main className="flex-1 overflow-y-auto pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0">
    <header className="fixed inset-x-0 top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-end gap-2 border-b bg-background px-3 pb-1.5 md:hidden">
     <button
      type="button"
      onClick={() => setSidebarOpen(true)}
      className="flex size-11 items-center justify-center rounded-lg hover:bg-muted transition-colors"
      aria-label="Открыть меню"
     >
      <Menu className="w-5 h-5" />
     </button>
     <div className="min-w-0 pb-1.5">
      <p className="text-sm font-semibold leading-tight">Lumo</p>
      <p className="truncate text-xs text-muted-foreground">{venueName || 'Alto Coffee Bishkek'}</p>
     </div>
    </header>
    <Outlet />
   </main>
   {warehouseNameDialog && (
    <TextInputDialog
     title={warehouseNameDialog.mode === 'create' ? 'Новый склад' : 'Переименовать склад'}
     label="Название"
     initialValue={warehouseNameDialog.mode === 'rename' ? warehouseNameDialog.currentName : ''}
     submitLabel={warehouseNameDialog.mode === 'create' ? 'Создать' : 'Сохранить'}
     onSubmit={handleWarehouseName}
     onClose={() => setWarehouseNameDialog(null)}
    />
   )}
   {warehouseToDelete && (
    <ConfirmDialog
     title={`Удалить «${warehouseToDelete.name}»?`}
     description="Удаление возможно только если на складе нет остатков и активных документов. Это действие нельзя отменить."
     confirmLabel="Удалить склад"
     destructive
     onConfirm={handleDeleteWarehouse}
     onCancel={() => setWarehouseToDelete(null)}
    />
   )}
  </div>
 );
}
