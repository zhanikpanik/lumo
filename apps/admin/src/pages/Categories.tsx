import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useInstantCategories, type InstantCategory } from '@/hooks/useInstantCategories';
import { useInstantDishes } from '@/hooks/useInstantProducts';
import { useInstantCreateCategory, useInstantRenameCategory, useInstantDeleteCategory } from '@/hooks/useInstantCategoryMutations';
import { EditButton } from '@/components/ui/EditButton';
import { DeleteButton } from '@/components/ui/DeleteButton';

interface CategoryRow extends InstantCategory {
  dishCount: number;
}

export function Categories() {
  const { data: categories = [], isLoading: catPending } = useInstantCategories();
  const { data: dishes = [] } = useInstantDishes();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');

  const { create: createCategory, loading: createLoading } = useInstantCreateCategory();
  const { rename: renameCategory } = useInstantRenameCategory();
  const { remove: deleteCategory, loading: deleteLoading } = useInstantDeleteCategory();

  const catsWithCount: CategoryRow[] = categories.map((c) => ({
    ...c,
    dishCount: dishes.filter((d) => d.categoryId === c.id).length,
  }));

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createCategory(name);
      setNewName('');
      toast.success('Категория создана');
    } catch (e) {
      toast.error((e as Error)?.message || 'Не удалось создать категорию');
    }
  }

  function startEdit(cat: CategoryRow) {
    setEditingId(cat.id);
    setEditName(cat.name);
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return;
    try {
      await renameCategory(editingId, editName.trim());
      setEditingId(null);
      toast.success('Сохранено');
    } catch (e) {
      toast.error((e as Error)?.message || 'Не удалось переименовать');
    }
  }

  async function handleDelete(cat: CategoryRow) {
    try {
      await deleteCategory(cat.id);
      toast.success(`«${cat.name}» удалена`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Не удалось удалить');
    }
  }

  return (
    <div className="page-shell"><div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-2xl font-bold">Категории</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Порядок категорий определяет их расположение в POS
        </p>
      </div>
    </div>
    
    {/* Create */}
    <div className="flex items-center gap-2 mb-6 max-w-sm">
      <input
        className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors"
        placeholder="Новая категория"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
      />
      <button
        type="button"
        onClick={handleCreate}
        disabled={createLoading || !newName.trim()}
        className="px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors"
      >
        Добавить
      </button>
    </div>
    
    {/* Category list */}
    <div className="max-w-lg space-y-px">
      {catPending && <p className="text-sm text-muted-foreground py-8">Загрузка…</p>}
    
      {!catPending && catsWithCount.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">Нет категорий</p>
      )}
    
      {!catPending && catsWithCount.map((cat) => {
        const isEditing = editingId === cat.id;
        return (
          <div
            key={cat.id}
            className="flex items-center gap-3 py-1.5 px-2 rounded-lg group transition-colors hover:bg-black/[0.03]"
          >
            <span className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  className="w-full px-2 py-0.5 border rounded text-sm bg-background outline-none focus:border-primary"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                />
              ) : (
                <span className="text-sm">{cat.name}</span>
              )}
            </span>
    
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums w-10 text-right">
              {cat.dishCount}
            </span>
    
            <span className="flex items-center shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
              <EditButton onClick={() => (isEditing ? handleSaveEdit() : startEdit(cat))} />
              <DeleteButton variant="row" onClick={() => handleDelete(cat)} />
            </span>
          </div>
        );
      })}
    </div></div>
  );
}
