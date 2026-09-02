import { useState } from 'react';
import { toast } from 'sonner';
import { EMPLOYEE_PIN_LENGTH } from '@lumo/data';
import { useInstantStaff, type StaffMember } from '@/hooks/useInstantStaff';
import { useInstantCreateEmployee, useInstantUpdateEmployee, useInstantDeleteEmployee } from '@/hooks/useInstantStaffMutations';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { EditButton } from '@/components/ui/EditButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { AddButton } from '@/components/ui/ActionButtons';

const PIN_PATTERN = new RegExp(`^\\d{${EMPLOYEE_PIN_LENGTH}}$`);
const generatePin = () => String(
 crypto.getRandomValues(new Uint32Array(1))[0] % (10 ** EMPLOYEE_PIN_LENGTH),
).padStart(EMPLOYEE_PIN_LENGTH, '0');

const ROLES: { value: StaffMember['role']; label: string }[] = [
 { value: 'owner', label: 'Владелец' },
 { value: 'manager', label: 'Менеджер' },
 { value: 'cashier', label: 'Кассир' },
 { value: 'waiter', label: 'Официант' },
];

const ROLE_LABELS: Record<string, string> = {
 owner: 'Владелец',
 manager: 'Менеджер',
 cashier: 'Кассир',
 waiter: 'Официант',
};

type StaffEditData = Partial<StaffMember> & { pin?: string };

function formatDate(dateStr: string | null): string {
 if (!dateStr) return '—';
 const d = new Date(dateStr);
 return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' }) +
  ' ' + d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function PinReveal({ pin, isActive }: { pin: string | null; isActive: boolean }) {
 if (!isActive) return <span aria-label="PIN недоступен для неактивного сотрудника">—</span>;
 if (!pin) return <span className="text-xs text-muted-foreground" title="Сбросьте PIN, чтобы сохранить его для просмотра">Нет данных</span>;

 return (
  <span
   className="group/pin inline-grid min-w-16 cursor-default rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
   tabIndex={0}
   aria-label="PIN скрыт. Наведите курсор или установите фокус, чтобы показать"
   title="Наведите курсор, чтобы показать PIN"
  >
   <span className="col-start-1 row-start-1 group-hover/pin:invisible group-focus/pin:invisible" aria-hidden="true">{'•'.repeat(EMPLOYEE_PIN_LENGTH)}</span>
   <span className="invisible col-start-1 row-start-1 group-hover/pin:visible group-focus/pin:visible">{pin}</span>
  </span>
 );
}

export function Staff() {
 const {
  data: staff = [],
  isLoading: isPending,
  error: staffError,
 } = useInstantStaff();
 const { create: createEmployee } = useInstantCreateEmployee();
 const { update: updateEmployee } = useInstantUpdateEmployee();
 const { remove: deleteEmployee } = useInstantDeleteEmployee();

 const isError = !!staffError;

 const [search, setSearch] = useState('');
 const [roleFilter, setRoleFilter] = useState<string | null>(null);
 const [showAddForm, setShowAddForm] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [editData, setEditData] = useState<StaffEditData>({});
 const [newStaff, setNewStaff] = useState({ name: '', email: '', pin: generatePin(), role: 'cashier' as StaffMember['role'] });


 const filtered = staff
  .filter(s => !roleFilter || s.role === roleFilter)
  .filter(s => {
   if (!search.trim()) return true;
   const q = search.toLowerCase();
   return s.name.toLowerCase().includes(q) ||
       (s.email || '').toLowerCase().includes(q);
  });

 const showEmptyList = !isPending && !isError && filtered.length === 0;

 async function handleAdd() {
  if (!newStaff.name.trim()) return;
  if (!PIN_PATTERN.test(newStaff.pin)) {
   toast.error(`PIN должен содержать ${EMPLOYEE_PIN_LENGTH} цифры`);
   return;
  }

  try {
   await createEmployee({
    name: newStaff.name.trim(),
    email: newStaff.email.trim() || null,
    pin: newStaff.pin,
    role: newStaff.role,
   });
   setNewStaff({ name: '', email: '', pin: generatePin(), role: 'cashier' });
   setShowAddForm(false);
   toast.success('Сотрудник добавлен');
  } catch (e) {
   toast.error('Ошибка: ' + ((e as Error)?.message || 'Не удалось создать'));
  }
 }

 function startEdit(member: StaffMember) {
  setEditingId(member.id);
  setEditData({ name: member.name, email: member.email, pin: '', role: member.role });
 }

 async function handleSaveEdit() {
  if (!editingId || !editData.name?.trim()) return;
  if (editData.pin && !PIN_PATTERN.test(editData.pin)) {
   toast.error(`Новый PIN должен содержать ${EMPLOYEE_PIN_LENGTH} цифры`);
   return;
  }

  try {
   await updateEmployee(editingId, {
    name: editData.name.trim(),
    email: editData.email?.trim() || null,
    pin: editData.pin,
    role: editData.role || 'cashier',
   });
   setEditingId(null);
   setEditData({});
  } catch (e) {
   toast.error('Ошибка: ' + ((e as Error)?.message || 'Не удалось сохранить'));
  }
 }

 async function handleDelete(id: string) {
  await deleteEmployee(id);
  toast.success('Сотрудник удалён');
 }
 return (
  <div className="page-shell"><div className="flex items-center justify-between mb-6">
   <h2 className="text-2xl font-bold">Сотрудники</h2>
   <AddButton onClick={() => setShowAddForm(true)} label="Добавить сотрудника" />
  </div>
  
  {/* Search + role filter */}
  <div className="flex items-center gap-2 mb-4">
   <SearchInput value={search} onChange={setSearch} placeholder="Поиск по имени или эл. почте" className="w-56" />
   <div className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
    <button
     onClick={() => setRoleFilter(null)}
     className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
      roleFilter === null ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
     }`}
    >
     Все
    </button>
    {ROLES.map(r => (
     <button
      key={r.value}
      onClick={() => setRoleFilter(r.value)}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
       roleFilter === r.value ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
     >
      {r.label}
     </button>
    ))}
   </div>
  </div>
  
  {/* Add form */}
  {showAddForm && (
   <div className="flex gap-3 items-end py-3 border-b">
    <div className="flex-1">
     <input
      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
      value={newStaff.name}
      onChange={(e) => setNewStaff(p => ({ ...p, name: e.target.value }))}
      placeholder="Имя сотрудника"
      autoFocus
      onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
     />
    </div>
    <div className="w-48">
     <input
      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
      value={newStaff.email}
      onChange={(e) => setNewStaff(p => ({ ...p, email: e.target.value }))}
      placeholder="Эл. почта"
     />
    </div>
    <div className="w-28">
     <input
      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background font-mono"
      value={newStaff.pin}
      onChange={(e) => setNewStaff(p => ({ ...p, pin: e.target.value.replace(/\D/g, '').slice(0, EMPLOYEE_PIN_LENGTH) }))}
      placeholder={`${EMPLOYEE_PIN_LENGTH} цифры`}
      maxLength={EMPLOYEE_PIN_LENGTH}
      inputMode="numeric"
      autoComplete="new-password"
     />
    </div>
    <div className="w-36">
     <select
      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
      value={newStaff.role}
      onChange={(e) => setNewStaff(p => ({ ...p, role: e.target.value as StaffMember['role'] }))}
     >
      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
     </select>
    </div>
    <button onClick={handleAdd} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm cursor-pointer font-medium">Добавить</button>
    <button onClick={() => { setShowAddForm(false); setNewStaff({ name: '', email: '', pin: generatePin(), role: 'cashier' }); }} className="px-4 py-2 text-sm hover:text-foreground">Закрыть</button>
   </div>
  )}
  
  <div className="max-w-4xl">
  <table className="table-fixed border-separate border-spacing-0 w-full">
   <thead className="sticky top-0 z-10 bg-background">
    <tr className="text-sm font-medium text-foreground">
     <th scope="col" className="text-left py-1.5 w-[180px]">Имя</th>
     <th scope="col" className="text-left py-1.5 w-[120px]">Должность</th>
     <th scope="col" className="text-left py-1.5 w-[180px]">Эл. почта</th>
     <th scope="col" className="text-center py-1.5 w-[96px]">PIN</th>
     <th scope="col" className="text-center py-1.5 w-[140px]">Последний вход</th>
     <th scope="col" className="py-1.5 w-[56px]" />
     <th scope="col" className="py-1.5 w-[56px] pr-3" />
    </tr>
   </thead>
   <tbody>
    {isPending && (
     <tr><td colSpan={7} className="py-16 text-center text-sm">Загрузка…</td></tr>
    )}
    {isError && (
     <tr><td colSpan={7} className="py-16 text-center text-sm text-destructive">{staffError instanceof Error ? staffError.message : 'Не удалось загрузить'}</td></tr>
    )}
    {!isPending && !isError && filtered.map((member) => (
     <tr
      key={member.id}
      className={`group row-hover ${!member.is_active ? 'opacity-50' : ''}`}
     >
      {editingId === member.id ? (
       <>
        <td className="py-1.5">
         <input className="w-full px-2 py-1 border rounded text-sm bg-background" value={editData.name || ''} onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()} />
        </td>
        <td className="py-1.5">
         <select className="w-full px-2 py-1 border rounded text-sm bg-background" value={editData.role || 'cashier'} onChange={(e) => setEditData((d) => ({ ...d, role: e.target.value as StaffMember['role'] }))}>
          {ROLES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
         </select>
        </td>
        <td className="py-1.5">
         <input className="w-full px-2 py-1 border rounded text-sm bg-background" value={editData.email || ''} onChange={(e) => setEditData((d) => ({ ...d, email: e.target.value }))} placeholder="Эл. почта" />
        </td>
        <td className="py-1.5 text-center">
         <input type="password" className="w-full max-w-[7rem] px-2 py-1 border rounded text-sm bg-background font-mono text-center" value={editData.pin || ''} onChange={(e) => setEditData((d) => ({ ...d, pin: e.target.value.replace(/\D/g, '').slice(0, EMPLOYEE_PIN_LENGTH) }))} placeholder="Новый PIN" maxLength={EMPLOYEE_PIN_LENGTH} inputMode="numeric" autoComplete="new-password" />
        </td>
        <td className="py-1.5" />
        <td className="py-1.5">
         <div className="flex justify-end gap-1">
          <button type="button" onClick={handleSaveEdit} className="text-sm text-green-600 font-medium px-2 py-1">✓</button>
          <button type="button" onClick={() => { setEditingId(null); setEditData({}); }} className="text-sm px-2 py-1">✕</button>
         </div>
        </td>
        <td className="py-1.5" />
       </>
      ) : (
       <>
        <td className="py-1.5 text-sm truncate">{member.name}</td>
        <td className="py-1.5 text-sm whitespace-nowrap">{ROLE_LABELS[member.role] ?? member.role}</td>
        <td className="py-1.5 text-sm truncate">{member.email || '—'}</td>
        <td className="py-1.5 text-center font-mono text-sm">
         <PinReveal pin={member.pin} isActive={member.is_active} />
        </td>
        <td className="py-1.5 text-center text-sm tabular-nums whitespace-nowrap">{formatDate(member.last_session_at)}</td>
        <td className="py-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
         <EditButton onClick={() => startEdit(member)} />
        </td>
        <td className="py-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
         <DeleteButton variant="row" onClick={() => handleDelete(member.id)} />
        </td>
       </>
      )}
     </tr>
    ))}
    {showEmptyList && (
     <tr><td colSpan={7}>
      <EmptyState
       title={search.trim() || roleFilter ? 'Ничего не найдено' : 'Сотрудников пока нет'}
       hint={search.trim() || roleFilter ? 'Попробуйте изменить фильтры' : 'Добавьте сотрудников, чтобы они могли работать с POS-терминалом'}
       action={!search.trim() && !roleFilter ? { label: 'Добавить сотрудника', onClick: () => setShowAddForm(true) } : undefined}
      />
     </td></tr>
    )}
   </tbody>
  </table>
  </div></div>
 );
}
