import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ColumnDef, type Row } from '@tanstack/react-table';
import { SearchInput } from '@/components/ui/SearchInput';
import { AddButton } from '@/components/ui/ActionButtons';
import { toast } from 'sonner';
import { somRounded } from '@/lib/formatSom';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { EditButton } from '@/components/ui/EditButton';
import { useInstantCategories } from '@/hooks/useInstantCategories';
import { useInstantDishesDetailed, type DishProduct, type DishRecipeLine } from '@/hooks/useInstantDishesDetailed';
import { useInstantDeleteProduct, useInstantRestoreProduct } from '@/hooks/useInstantDeleteProduct';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { DataTable } from '@/components/ui/DataTable';

export function Menu() {
  const { data: categories = [], isLoading: categoriesPending, error: categoriesErr } = useInstantCategories();
  const { data: products = [], isLoading: dishesPending, error: dishesErr } = useInstantDishesDetailed();
  const { remove: deleteProduct } = useInstantDeleteProduct();
  const { restore: restoreProduct } = useInstantRestoreProduct();

  const menuPending = categoriesPending || dishesPending;
  const menuError = !!categoriesErr || !!dishesErr;
  const menuErrorMessage = (dishesErr instanceof Error && dishesErr.message) || (categoriesErr instanceof Error && categoriesErr.message) || 'Не удалось загрузить';

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const navigate = useNavigate();
  const [expandedRecipe, setExpandedRecipe] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  const filteredProducts = products
    .filter(p => selectedCategory === null || p.category_id === selectedCategory)
    .filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const undoRef = useRef<{ id: string; name: string } | null>(null);

  async function handleDeleteProduct(id: string, name: string) {
    await deleteProduct(id);
    undoRef.current = { id, name };
    toast(`«${name}» удалено`, {
      action: {
        label: 'Отменить',
        onClick: async () => {
          if (!undoRef.current || undoRef.current.id !== id) return;
          await restoreProduct(id);
          toast.success(`«${name}» восстановлено`);
          undoRef.current = null;
        },
      },
      duration: 5000,
    });
  }

  const handleExpand = (rowId: string) => {
    setExpandedRecipe(prev => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  const columns: ColumnDef<DishProduct, any>[] = [
    {
      accessorKey: 'name',
      header: 'Название',
      cell: ({ getValue }) => <span className="block truncate">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'category_name',
      header: 'Категория',
      meta: { align: 'text-left', className: 'text-left' },
      cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue<string>() || '—'}</span>,
    },
    {
      accessorKey: 'cost_price',
      header: 'Затраты',
      cell: ({ getValue }) => <span>{somRounded(getValue<number>())} сом</span>,
    },
    {
      accessorKey: 'price',
      header: 'Цена',
      cell: ({ getValue }) => <span>{somRounded(getValue<number>())} сом</span>,
    },
    {
      id: 'margin',
      header: 'Наценка',
      cell: ({ row }) => {
        const p = row.original;
        if (p.cost_price <= 0) return <span>—</span>;
        const pct = Math.round((p.price - p.cost_price) / p.cost_price * 100);
        return <span className={pct > 200 ? 'text-green-600' : ''}>{pct}%</span>;
      },
    },
    {
      id: 'edit',
      header: '',
      cell: ({ row }) => <EditButton onClick={() => navigate(`/menu/dish/${row.original.id}`)} />,
    },
    {
      id: 'delete',
      header: '',
      cell: ({ row }) => <DeleteButton variant="row" onClick={() => handleDeleteProduct(row.original.id, row.original.name)} />,
    },
  ];

  const renderRecipeRow = (row: Row<DishProduct>) => {
    const items = row.original.recipe_items;
    if (!items || items.length === 0) return null;
    return (
      <table className="w-full max-w-md text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-medium py-0.5 pr-2">Ингредиент</th>
            <th className="text-right font-medium py-0.5 px-2 w-16">Кол-во</th>
            <th className="text-right font-medium py-0.5 pl-2 w-20">Себест.</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: DishRecipeLine) => (
            <tr key={item.id}>
              <td className="py-0.5 pr-2">{item.ingredient_name}</td>
              <td className="py-0.5 px-2 text-right">{item.quantity} {item.unit}</td>
              <td className="py-0.5 pl-2 text-right">{somRounded(item.ingredient_cost)} сом</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const emptyMessage = search.trim()
    ? 'Ничего не найдено'
    : selectedCategory
      ? 'Нет блюд в этой категории'
      : 'Блюд пока нет';

  const showEmptyState = !menuPending && !menuError && filteredProducts.length === 0;

  return (
    <div className="page-shell"><div className="flex items-center justify-between mb-6">
      <h2 className="text-2xl font-bold">Блюда</h2>
      <AddButton onClick={() => navigate('/menu/dish/new')} label="Добавить блюдо" />
    </div>
    
    {/* Search + category filter */}
    <div className="flex items-center gap-2 mb-4">
      <SearchInput value={search} onChange={setSearch} className="w-56" />
      <SegmentTabs
        options={[
          { value: 'all', label: 'Все' },
          ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
        ]}
        value={selectedCategory ?? 'all'}
        onChange={(v) => setSelectedCategory(v === 'all' ? null : v)}
      />
    </div>
    
    {showEmptyState ? (
      <EmptyState
        title={emptyMessage}
        hint={search.trim() ? 'Попробуйте изменить поисковый запрос' : 'Добавьте первое блюдо, чтобы начать составлять меню'}
        action={!search.trim() ? { label: 'Добавить блюдо', onClick: () => navigate('/menu/dish/new') } : undefined}
      />
    ) : (
      <DataTable
        data={filteredProducts}
        columns={columns}
        dense
        isLoading={menuPending}
        error={menuError ? new Error(menuErrorMessage) : null}
        renderExpandedRow={renderRecipeRow}
        expandedRows={expandedRecipe}
        onExpandedChange={handleExpand}
        getRowClassName={(row) => !row.original.is_active ? 'opacity-50' : ''}
        className="max-w-4xl"
      />
    )}</div>
  );
}
