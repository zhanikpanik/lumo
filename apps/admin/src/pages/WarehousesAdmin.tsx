import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { useInstantWarehouses } from '@/hooks/useInstantWarehouses';
import { useInstantWarehouseIngredients, type InstantWarehouseIngredient } from '@/hooks/useInstantWarehouseIngredients';
import { useInstantUpdateWarehouse, useInstantDeleteWarehouse } from '@/hooks/useInstantWarehouseMutations';
import { formatSom } from '@/lib/formatSom';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { DataTable } from '@/components/ui/DataTable';

export function WarehousesAdmin() {
  const { warehouseId } = useParams<{ warehouseId: string }>();
  const navigate = useNavigate();
  const { data: warehouses = [], isLoading: warehousesPending } = useInstantWarehouses();
  const updateWarehouse = useInstantUpdateWarehouse();
  const deleteWarehouse = useInstantDeleteWarehouse();
  const [renameValue, setRenameValue] = useState('');
  const [search, setSearch] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null;

  useEffect(() => {
    setRenameValue(selectedWarehouse?.name ?? '');
  }, [selectedWarehouse?.id, selectedWarehouse?.name]);

  const { data: ingredients = [], isLoading: ingredientsPending } = useInstantWarehouseIngredients(
    selectedWarehouse?.id ?? null,
  );

  const filteredIngredients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(query)) : ingredients;
  }, [search, ingredients]);

  const total = filteredIngredients.reduce(
    (sum, ingredient) => sum + ingredient.stock_quantity * ingredient.price,
    0,
  );

  const columns = useMemo<ColumnDef<InstantWarehouseIngredient, unknown>[]>(() => [
    { accessorKey: 'name', header: 'Название' },
    { accessorKey: 'unit', header: 'Ед.' },
    {
      accessorKey: 'stock_quantity',
      header: 'Остаток',
      cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
    },
    {
      accessorKey: 'price',
      header: 'Себестоимость',
      cell: ({ getValue }) => <span className="tabular-nums">{formatSom(Number(getValue()))}</span>,
    },
    {
      id: 'total',
      header: 'Сумма остатков',
      cell: ({ row }) => (
        <span className="tabular-nums">{formatSom(row.original.price * row.original.stock_quantity)}</span>
      ),
    },
  ], []);

  async function handleRenameWarehouse() {
    const id = selectedWarehouse?.id;
    const name = renameValue.trim();
    if (!id || !name || name === selectedWarehouse.name) return;
    try {
      await updateWarehouse.update(id, { name });
      toast.success('Название склада обновлено');
    } catch (error) {
      toast.error((error as Error)?.message || 'Не удалось обновить склад');
    }
  }

  async function handleDeleteWarehouse() {
    const id = selectedWarehouse?.id;
    if (!id) return;
    try {
      await deleteWarehouse.remove(id);
      toast.success('Склад удален');
      setDeleteOpen(false);
      navigate('/warehouse/operations');
    } catch (error) {
      toast.error((error as Error)?.message || 'Не удалось удалить склад');
    }
  }

  return (
    <div className="page-shell">
      <button
        type="button"
        onClick={() => navigate('/warehouse/operations')}
        className="mb-6 flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Склад
      </button>

      <div className="mb-6">
        <h2 className="text-2xl font-bold">Склад: {selectedWarehouse?.name ?? '—'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ингредиенты и остатки выбранного склада.</p>
      </div>

      {!warehousesPending && warehouses.length === 0 && (
        <p className="text-sm text-muted-foreground">Нет складов. Создайте склад в боковом меню.</p>
      )}
      {!selectedWarehouse && warehouses.length > 0 && (
        <p className="text-sm text-muted-foreground">Выберите склад в боковом меню.</p>
      )}

      {selectedWarehouse && (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput value={search} onChange={setSearch} className="w-full sm:w-72" />
            <input
              className="min-h-11 w-full rounded-lg border bg-background px-3 text-base sm:w-auto sm:text-sm"
              placeholder="Переименовать склад"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
            <button
              type="button"
              onClick={handleRenameWarehouse}
              disabled={updateWarehouse.loading || !renameValue.trim()}
              className="min-h-11 rounded-lg border px-3 text-sm hover:bg-accent disabled:opacity-50"
            >
              Сохранить название
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={deleteWarehouse.loading}
              className="min-h-11 rounded-lg border border-destructive/30 px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Удалить склад
            </button>
            <p className="text-sm text-muted-foreground sm:ml-auto">
              Всего: <span className="font-medium text-foreground">{formatSom(total)}</span>
            </p>
          </div>
          <DataTable
            data={filteredIngredients}
            columns={columns}
            dense
            isLoading={ingredientsPending}
            emptyMessage={search ? 'Ничего не найдено' : 'На этом складе пока нет ингредиентов'}
            onRowClick={(row) => navigate(`/menu/ingredients/${row.original.id}?warehouse=${selectedWarehouse.id}&back=warehouse`)}
          />
        </>
      )}

      {deleteOpen && selectedWarehouse && (
        <ConfirmDialog
          title={`Удалить «${selectedWarehouse.name}»?`}
          description="Удаление возможно только если на складе нет остатков и активных документов. Это действие нельзя отменить."
          confirmLabel="Удалить склад"
          destructive
          onConfirm={handleDeleteWarehouse}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}
