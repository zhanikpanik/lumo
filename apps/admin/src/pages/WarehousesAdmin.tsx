import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useInstantWarehouses } from '@/hooks/useInstantWarehouses';
import { useInstantWarehouseIngredients } from '@/hooks/useInstantWarehouseIngredients';
import { useInstantUpdateWarehouse, useInstantDeleteWarehouse } from '@/hooks/useInstantWarehouseMutations';
import searchIcon from '@/assets/icons/search.svg';
import { somRounded } from '@/lib/formatSom';

export function WarehousesAdmin() {
  const { warehouseId } = useParams<{ warehouseId: string }>();
  const navigate = useNavigate();
  const { data: warehouses = [], isLoading: warehousesPending } = useInstantWarehouses();
  const updateWarehouse = useInstantUpdateWarehouse();
  const deleteWarehouse = useInstantDeleteWarehouse();
  const [renameValue, setRenameValue] = useState('');
  const [search, setSearch] = useState('');
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId) || null;

  useEffect(() => {
    setRenameValue(selectedWarehouse?.name || '');
  }, [selectedWarehouse?.id, selectedWarehouse?.name]);

  const { data: ingredients = [], isLoading: ingredientsPending } = useInstantWarehouseIngredients(
    selectedWarehouse?.id ?? null,
  );

  const filteredIngredients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter((i) => i.name.toLowerCase().includes(q));
  }, [search, ingredients]);

  const total = filteredIngredients.reduce((sum, i) => sum + i.stock_quantity * i.price, 0);

  async function handleRenameWarehouse() {
    const id = selectedWarehouse?.id;
    const name = renameValue.trim();
    if (!id || !name) return;
    try {
      await updateWarehouse.update(id, { name });
      toast.success('Название склада обновлено');
      navigate(`/warehouse/${id}`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Не удалось обновить склад');
    }
  }

  async function handleDeleteWarehouse() {
    const id = selectedWarehouse?.id;
    if (!id) return;
    if (!confirm('Удалить склад? Разрешено только если нет остатков и активных документов.')) return;
    try {
      await deleteWarehouse.remove(id);
      toast.success('Склад удален');
      navigate('/warehouse/deliveries');
    } catch (e) {
      toast.error((e as Error)?.message || 'Не удалось удалить склад');
    }
  }

  return (
    <div className="p-8">
      <button
        type="button"
        onClick={() => navigate('/warehouse/deliveries')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Склад
      </button>

      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold">Склад: {selectedWarehouse?.name || '—'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Здесь отображаются ингредиенты, доступные на выбранном складе.
          </p>
        </div>
        {selectedWarehouse?.id && (
          <Link
            to={`/menu/ingredients/add?warehouse=${selectedWarehouse.id}&back=warehouse`}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors"
          >
            + Добавить ингредиент
          </Link>
        )}
      </div>

      {!warehousesPending && warehouses.length === 0 && (
        <div className="text-sm text-muted-foreground">Нет складов. Создайте склад в sidebar.</div>
      )}

      {!selectedWarehouse && warehouses.length > 0 && (
        <div className="text-sm text-muted-foreground">Выберите склад в sidebar.</div>
      )}

      {selectedWarehouse && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 w-72">
              <img src={searchIcon} className="w-3.5 h-3.5 opacity-40" alt="" />
              <input
                className="bg-transparent text-sm outline-none flex-1"
                placeholder="Быстрый поиск"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <input
              className="px-3 py-2 border rounded-lg text-sm bg-background"
              placeholder="Переименовать склад"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
            <button
              type="button"
              onClick={handleRenameWarehouse}
              disabled={updateWarehouse.loading || !renameValue.trim()}
              className="px-3 py-2 border rounded-lg text-sm hover:bg-accent disabled:opacity-50"
            >
              Сохранить название
            </button>
            <button
              type="button"
              onClick={handleDeleteWarehouse}
              disabled={deleteWarehouse.loading}
              className="px-3 py-2 border border-red-200 text-red-700 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
            >
              Удалить склад
            </button>
            <div className="ml-auto text-sm text-muted-foreground">
              Всего: <span className="font-medium text-foreground">{somRounded(total)} сом</span>
            </div>
          </div>

          <table className="table-fixed border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="text-sm font-medium text-foreground">
                <th scope="col" className="text-left py-3 px-3 w-[220px]">Название</th>
                <th scope="col" className="text-left py-3 px-3 w-[100px]">Ед.</th>
                <th scope="col" className="text-right py-3 px-3 w-[120px]">Остаток</th>
                <th scope="col" className="text-right py-3 px-3 w-[120px]">Себестоимость</th>
                <th scope="col" className="text-right py-3 px-3 w-[140px]">Сумма остатков</th>
              </tr>
            </thead>
            <tbody>
              {ingredientsPending && (
                <tr><td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">Загрузка…</td></tr>
              )}
              {!ingredientsPending && filteredIngredients.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                  {search ? 'Ничего не найдено' : 'На этом складе пока нет ингредиентов'}
                </td></tr>
              )}
              {!ingredientsPending && filteredIngredients.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => navigate(`/menu/ingredients/${item.id}?warehouse=${selectedWarehouse.id}&back=warehouse`)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/menu/ingredients/${item.id}?warehouse=${selectedWarehouse.id}&back=warehouse`); } }}
                >
                  <td className="py-2 px-3 text-sm truncate">{item.name}</td>
                  <td className="py-2 px-3 text-sm whitespace-nowrap">{item.unit}</td>
                  <td className="py-2 px-3 text-sm text-right tabular-nums whitespace-nowrap">{item.stock_quantity}</td>
                  <td className="py-2 px-3 text-sm text-right tabular-nums whitespace-nowrap">{somRounded(item.price)} сом</td>
                  <td className="py-2 px-3 text-sm text-right tabular-nums whitespace-nowrap">{somRounded(item.price * item.stock_quantity)} сом</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
