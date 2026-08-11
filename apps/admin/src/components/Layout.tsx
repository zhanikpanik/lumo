import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Menu, MoreHorizontal } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/auth/useAuth';
import { useInstantWarehouses } from '@/hooks/useInstantWarehouses';
import { useInstantCreateWarehouse, useInstantUpdateWarehouse, useInstantDeleteWarehouse } from '@/hooks/useInstantWarehouseMutations';
import { useInstantShifts } from '@/hooks/useInstantShifts';
import { toast } from 'sonner';
import { SvgIcon } from '@/components/dashboard/SvgIcon';
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
 const { signOut } = useAuth();
 const navigate = useNavigate();
 const location = useLocation();
  const { data: warehouses = [] } = useInstantWarehouses();
  const createWarehouse = useInstantCreateWarehouse();
  const renameWarehouse = useInstantUpdateWarehouse();
  const deleteWarehouse = useInstantDeleteWarehouse();
 const { data: shifts } = useInstantShifts();
 const activeShift = shifts.find((shift) => shift.status === 'open');
 const [openMenuId, setOpenMenuId] = useState<string | null>(null);
 const [sidebarOpen, setSidebarOpen] = useState(false);
 const menuRef = useRef<HTMLDivElement>(null);

 // Auto-close sidebar on navigation (mobile)
 useEffect(() => {
  setSidebarOpen(false);
 }, [location.pathname]);

 // Close warehouse context menu on outside click
 useEffect(() => {
  if (!openMenuId) return;
  const handler = (e: MouseEvent) => {
   if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
    setOpenMenuId(null);
   }
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
 }, [openMenuId]);

 async function handleCreateWarehouseFromSidebar() {
  const name = window.prompt('Название нового склада')?.trim();
  if (!name) return;
  try {
   await createWarehouse.create({ operationId: crypto.randomUUID(), name });
   toast.success('Склад создан');
  } catch (e) {
   toast.error((e as Error)?.message || 'Не удалось создать склад');
  }
 }

 async function handleRenameWarehouse(id: string, currentName: string) {
  const name = window.prompt('Новое название склада', currentName)?.trim();
  if (!name || name === currentName) return;
  try {
   await renameWarehouse.update(id, { name });
   toast.success('Склад переименован');
  } catch (e) {
   toast.error((e as Error)?.message || 'Не удалось переименовать');
  }
  setOpenMenuId(null);
 }

 async function handleDeleteWarehouse(id: string) {
  if (!confirm('Удалить склад? Разрешено только если нет остатков и активных документов.')) return;
  try {
   await deleteWarehouse.remove(id);
   toast.success('Склад удален');
   if (location.pathname.startsWith(`/warehouse/${id}`)) {
    navigate('/warehouse/operations');
   }
  } catch (e) {
   toast.error((e as Error)?.message || 'Не удалось удалить склад');
  }
  setOpenMenuId(null);
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
     'fixed inset-y-0 left-0 z-40 w-60 bg-[#F9F8F7] border-r border-border flex flex-col select-none transition-transform duration-200',
     'md:static md:translate-x-0',
     sidebarOpen ? 'translate-x-0' : '-translate-x-full',
    )}
   >
    <div className="px-3 pt-3 pb-2">
     <h1 className="text-sm font-semibold px-2 py-1">r_keeper</h1>
    </div>

    <nav className="flex-1 px-3 space-y-3">
     {navItems.map((item) => {
      if (item.children) {
       const isActive = isChildActive(item);

       return (
        <div key={item.to}>
         <div
          className={cn(
           'flex items-center gap-0.5 px-2 py-1 rounded text-sm font-medium',
           isActive ? 'text-[#37352f]' : 'text-[#9b9a97]'
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
              'block px-2 py-1 rounded text-sm transition-colors',
              isActive
               ? 'bg-[#efefee] text-[#37352f]'
               : 'text-[#37352f] hover:bg-[#efefee]'
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
              'group relative flex items-center px-2 py-1 rounded transition-colors hover:bg-[#efefee]'
             )}>
              <span className="flex-1 text-sm text-[#9b9a97] select-none">{warehouse.name}</span>
              <button
               type="button"
               onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpenMenuId(openMenuId === warehouse.id ? null : warehouse.id);
               }}
               className={cn(
                'shrink-0 px-1 py-0.5 rounded text-[#9b9a97] hover:bg-[#e8e7e4] hover:text-[#37352f] transition-colors',
                openMenuId === warehouse.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
               )}
              >
               <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {openMenuId === warehouse.id && (
               <div
                ref={menuRef}
                className="absolute left-0 top-full mt-1 z-30 bg-white border border-[#F0EFED] rounded-lg shadow-lg py-1 min-w-[180px]"
               >
                <button
                 type="button"
                 onClick={() => handleRenameWarehouse(warehouse.id, warehouse.name)}
                 className="w-full text-left px-3 py-1.5 text-sm text-[#37352f] hover:bg-[#efefee] transition-colors"
                >
                 Переименовать
                </button>
                <button
                 type="button"
                 onClick={() => handleDeleteWarehouse(warehouse.id)}
                 className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-[#efefee] transition-colors"
                >
                 Удалить
                </button>
               </div>
              )}
             </div>
             );
            })}
            <button
             type="button"
             onClick={handleCreateWarehouseFromSidebar}
             className="w-full px-2 py-1 rounded text-sm text-[#9b9a97] hover:bg-[#efefee] hover:text-[#37352f] transition-colors text-left"
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
       className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[#9b9a97] hover:bg-[#efefee] hover:text-[#37352f] transition-colors"
      >
       <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
       <span className="truncate">
        Смена открыта ({new Date(activeShift.openedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})
       </span>
      </NavLink>
     ) : (
      <NavLink
       to="/cash-shifts"
       className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[#9b9a97] hover:bg-[#efefee] hover:text-[#37352f] transition-colors"
      >
       <span className="w-1.5 h-1.5 rounded-full bg-[#d4d2ce] shrink-0" />
       <span>Нет активной смены</span>
      </NavLink>
     )}
    </div>

    <div className="p-4 text-xs text-[#9b9a97]">
     <p>Alto Coffee Bishkek</p>
     <button
      type="button"
      onClick={() => void signOut()}
      className="mt-1 block hover:text-[#37352f] transition-colors"
     >
      Выйти
     </button>
    </div>
   </aside>

   {/* Main content */}
   <main className="flex-1 overflow-y-auto">
    {/* Mobile hamburger */}
    <button
     type="button"
     onClick={() => setSidebarOpen(true)}
     className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-md bg-background border border-border shadow-sm hover:bg-muted transition-colors"
     aria-label="Открыть меню"
    >
     <Menu className="w-5 h-5" />
    </button>
    <Outlet />
   </main>
  </div>
 );
}
