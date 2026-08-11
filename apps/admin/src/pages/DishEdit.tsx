import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { EditPage } from '@/components/ui/EditPage';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { IngredientPicker } from '@/components/ui/IngredientPicker';
import { parseDecimalField, sanitizeDecimalString } from '@/lib/decimalMask';
import {
 canonicalUnitFromIngredient,
 ingredientCostForRecipeItem,
 normalizeQuantityToCanonical,
} from '@/lib/units';
import { useInstantCategories } from '@/hooks/useInstantCategories';
import {
 useInstantDish, useInstantDishRecipe, useInstantDishModifiers,
 useInstantIngredients_list,
 type DishDetail, type RecipeItem, type ModifierGroup, type Ingredient,
} from '@/hooks/useInstantDishEditor';
import {
 useInstantCreateDish, useInstantUpdateDish,
 useInstantAddRecipeItem, useInstantRemoveRecipeItem, useInstantUpdateRecipeItem,
} from '@/hooks/useInstantDishMutations';
import {
 useInstantCreateModifierGroup, useInstantUnlinkModifierGroup,
 useInstantUpdateModifierGroup, useInstantCreateModifier,
 useInstantUpdateModifier, useInstantDeleteModifier,
} from '@/hooks/useInstantModifierMutations';
import { useInstantDeleteProduct } from '@/hooks/useInstantDeleteProduct';
import { useWiggle } from '@/hooks/useWiggle';

// Simple label+input field wrapper
function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
 return (
  <div className={`flex items-center gap-4 ${className}`}>
   <label className="w-36 text-sm text-foreground shrink-0">{label}</label>
   <div className="w-90">{children}</div>
  </div>
 );
}

// Input with suffix like "сом" or "мл" always visible inside
function InputWithSuffix({ suffix, defaultValue, onSave, className = '' }: {
 suffix: string;
 defaultValue: string | number;
 onSave: (val: number) => void;
 className?: string;
}) {
 const [value, setValue] = useState(String(defaultValue ?? ''));

 useEffect(() => {
  setValue(String(defaultValue ?? ''));
 }, [defaultValue]);

 return (
  <div className={`${className} relative`}>
   <input
    className="w-full pl-3 pr-8 py-2 border border-border rounded-lg text-sm text-right"
    value={value}
    inputMode="decimal"
    onChange={(e) => setValue(sanitizeDecimalString(e.target.value))}
    onBlur={(e) => {
     const val = parseDecimalField(e.target.value);
     setValue(String(val || ''));
     onSave(val);
    }}
    onKeyDown={(e) => {
     if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
     if (!/[0-9.,]/.test(e.key) && !['Backspace','Tab','ArrowLeft','ArrowRight','Delete'].includes(e.key)) e.preventDefault();
    }}
   />
   <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{suffix}</span>
  </div>
 );
}

// Custom dropdown for categories (when > 4)
function CategoryDropdown({ categories, value, onChange }: {
 categories: any[];
 value: string;
 onChange: (id: string) => void;
}) {
 const [open, setOpen] = useState(false);
 const [search, setSearch] = useState('');
 const selected = categories.find((c: any) => c.id === value);
 const filtered = search
  ? categories.filter((c: any) => c.name.toLowerCase().includes(search.toLowerCase()))
  : categories;

 return (
  <div className="relative w-full">
   <button
    onClick={() => setOpen(!open)}
    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-left flex items-center justify-between"
   >
    <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
     {selected?.name || 'Без категории'}
    </span>
    <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
   </button>
   {open && (
    <div className="absolute top-full left-0 right-0 bg-white border rounded-lg mt-1 shadow-lg z-10 max-h-48 overflow-auto">
     <div className="p-1">
      <input
       className="w-full px-2 py-1 border rounded text-sm bg-background mb-1"
       placeholder="Поиск..."
       value={search}
       onChange={(e) => setSearch(e.target.value)}
       autoFocus
      />
     </div>
     <button
      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${
       !value ? 'font-medium' : ''
      }`}
      onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
     >
      Без категории
     </button>
     {filtered.map((c: any) => (
      <button
       key={c.id}
       className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${
        value === c.id ? 'font-medium' : ''
       }`}
       onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
      >
       {c.name}
      </button>
     ))}
    </div>
   )}
  </div>
 );
}

export function DishEdit() {
 const { id } = useParams<{ id: string }>();
 const isCreateMode = !id || id === 'new';
 const currentDishId = isCreateMode ? null : id;
 const navigate = useNavigate();
 const { data: dish, isLoading } = useInstantDish(currentDishId || undefined);
 const { data: recipe = [] } = useInstantDishRecipe(currentDishId || undefined);
 const { data: dishModGroups = [] } = useInstantDishModifiers(currentDishId || undefined);
 const { data: categories = [] } = useInstantCategories();
 const workshops: { id: string; name: string }[] = []; // Not in InstantDB yet
 const { data: ingredients = [] } = useInstantIngredients_list();
 const { create: createDish } = useInstantCreateDish();
 const { update: updateDish } = useInstantUpdateDish();
 const { add: addRecipeItem } = useInstantAddRecipeItem();
 const { remove: removeRecipeItem } = useInstantRemoveRecipeItem();
 const { update: updateRecipeItem } = useInstantUpdateRecipeItem();
 const { remove: deleteDish } = useInstantDeleteProduct();
 const { create: createModGroup } = useInstantCreateModifierGroup();
 const { unlink: unlinkModGroup } = useInstantUnlinkModifierGroup();
 const { update: updateModGroup } = useInstantUpdateModifierGroup();
 const { create: createModifier } = useInstantCreateModifier();
 const { update: updateModifier_ } = useInstantUpdateModifier();
 const { remove: deleteModifier } = useInstantDeleteModifier();

 // Form state
 const [name, setName] = useState('');
 const [price, setPrice] = useState('');
 const [categoryId, setCategoryId] = useState('');
 const [workshopId, setWorkshopId] = useState('');
 const [isActive, setIsActive] = useState(true);
 const modifierIngredients: Ingredient[] = []; // Workshop-scoped ingredients not in InstantDB yet

 // Ingredient add
 const [showAddIngredient, setShowAddIngredient] = useState(false);
 const [ingredientSearch, setIngredientSearch] = useState('');
 const [newIngQty, setNewIngQty] = useState('');
 const [selectedIngId, setSelectedIngId] = useState('');

 // Wiggle refs
 const [nameRef, wiggleName] = useWiggle<HTMLInputElement>();
 const [ingSearchRef, wiggleIngSearch] = useWiggle<HTMLInputElement>();
 const [ingQtyRef, wiggleIngQty] = useWiggle<HTMLInputElement>();
 const [modNameRef, wiggleModName] = useWiggle<HTMLInputElement>();
 const [groupNameRef, wiggleGroupName] = useWiggle<HTMLInputElement>();

 // Modifier group add/create
 const [showAddModGroup, setShowAddModGroup] = useState(false);
 const [newGroupName, setNewGroupName] = useState('');
 const [newGroupType, setNewGroupType] = useState<'single' | 'multi'>('single');

 // Modifier add within a group
 const [addingModToGroup, setAddingModToGroup] = useState<string | null>(null);
 const [modIngSearch, setModIngSearch] = useState('');
 const [modIngId, setModIngId] = useState('');
 const [newModPrice, setNewModPrice] = useState('');
 const [newModQty, setNewModQty] = useState('');

 const availableModifierIngredientIds = new Set(modifierIngredients.map((i) => i.id));

 // Init form from dish data
 useEffect(() => {
  if (dish) {
   setName(dish.name);
   setPrice(String(dish.price));
   setCategoryId(dish.category_id || '');
   setWorkshopId(dish.workshop_id || '');
   setIsActive(dish.is_active);
   return;
  }
  if (isCreateMode) {
   setName('');
   setPrice('');
   setCategoryId('');
   setWorkshopId('');
   setIsActive(true);
  }
 }, [dish, isCreateMode]);

 if (!isCreateMode && isLoading) return <div className="p-8 text-muted-foreground">Загрузка...</div>;
 if (!isCreateMode && !dish) return <div className="p-8 text-muted-foreground">Блюдо не найдено</div>;

 // Calculations
 const costPrice = recipe.reduce(
  (sum, r) =>
   sum +
   ingredientCostForRecipeItem({
    ingredientPrice: r.ingredient_price,
    ingredientUnit: r.ingredient_unit,
    recipeQuantity: r.quantity,
    recipeUnit: r.unit,
   }),
  0
 );
 const outputWeightCalc = recipe.reduce((sum, r) => sum + r.quantity, 0);
 const priceNum = parseDecimalField(price);
 const markup = costPrice > 0 ? Math.round((priceNum - costPrice) / costPrice * 100) : 0;

 // Available modifier groups (not yet linked)
 // Hardcoded preset templates
 const filteredIngredients = ingredientSearch.trim()
  ? ingredients.filter((i) => i.name.toLowerCase().includes(ingredientSearch.toLowerCase()))
  : ingredients;
 const selectedIngredient = ingredients.find((i) => i.id === selectedIngId);
 const selectedIngredientUnit = selectedIngredient ? canonicalUnitFromIngredient(selectedIngredient.unit) : 'г';

 // Filtered ingredients for modifier search
 const filteredModIngredients = modIngSearch.trim()
  ? modifierIngredients.filter(i => i.name.toLowerCase().includes(modIngSearch.toLowerCase()))
  : modifierIngredients;
 const selectedModIngredient = modifierIngredients.find((i) => i.id === modIngId);
 const selectedModUnit = selectedModIngredient ? canonicalUnitFromIngredient(selectedModIngredient.unit) : 'мл';

 async function handleSave() {
  if (!name.trim()) { wiggleName(); return; }

  const priceTiyin = Math.round(parseDecimalField(price) * 100);
  const costTiyin = Math.round(costPrice * 100);

  if (isCreateMode) {
   try {
    const newId = await createDish({
     name: name.trim(),
     priceTiyin,
     costTiyin,
     categoryId: categoryId || null,
    });
    navigate(`/menu/dish/${newId}`);
   } catch (e) {
    toast.error('Ошибка: ' + ((e as Error)?.message || 'Не удалось создать блюдо'));
   }
   return;
  }

  if (!currentDishId) return;
  try {
   await updateDish(currentDishId, {
    name: name.trim(),
    priceTiyin,
    costTiyin,
    categoryId: categoryId || null,
   });
   navigate('/menu');
  } catch (e) {
   toast.error('Ошибка: ' + ((e as Error)?.message || 'Не удалось сохранить'));
  }
 }

 async function handleDelete() {
  if (!currentDishId) return;
  await deleteDish(currentDishId);
  navigate('/menu');
  toast.success('Блюдо удалено');
 }

 async function handleAddIngredient() {
  if (!currentDishId) return;
  if (!selectedIngId) { wiggleIngSearch(); return; }
  if (!newIngQty) { wiggleIngQty(); return; }
  const qty = parseDecimalField(newIngQty);
  const normalized = normalizeQuantityToCanonical(qty, selectedIngredientUnit);

  setShowAddIngredient(false);
  setIngredientSearch('');
  setNewIngQty('');
  setSelectedIngId('');

  try {
   await addRecipeItem({
    dishId: currentDishId,
    ingredientId: selectedIngId,
    quantityMilli: Math.round(normalized.quantity * 1000),
    unit: normalized.unit,
   });
  } catch (e) {
   toast.error('Не удалось добавить ингредиент');
  }
 }

 async function handleRemoveIngredient(recipeItemId: string) {
  if (!currentDishId) return;
  try {
   await removeRecipeItem(recipeItemId);
  } catch (e) {
   toast.error('Не удалось удалить ингредиент');
  }
 }

 async function handleUpdateRecipeIngredient(recipeItemId: string, ingredientId: string) {
  if (!currentDishId) return;
  const ing = ingredients.find((i) => i.id === ingredientId);
  if (!ing) return;
  try {
   await updateRecipeItem(recipeItemId, {
    ingredientId,
    unit: canonicalUnitFromIngredient(ing.unit),
   });
  } catch (e) {
   toast.error('Не удалось обновить ингредиент');
  }
 }

 async function handleCreateModGroup() {
  if (!currentDishId) return;
  if (!newGroupName.trim()) { wiggleGroupName(); return; }
  const name = newGroupName.trim();
  const maxSelect = newGroupType === 'single' ? 1 : 0;

  setShowAddModGroup(false);
  setNewGroupName('');
  setNewGroupType('single');

  try {
   const groupId = await createModGroup({ name, dishId: currentDishId, maxSelect });
   setAddingModToGroup(groupId);
  } catch (e) {
   toast.error('Не удалось создать набор модификаторов');
  }
 }

 async function handleRemoveModGroup(groupId: string) {
  if (!currentDishId) return;
  try {
   await unlinkModGroup(groupId, currentDishId);
  } catch (e) {
   toast.error('Не удалось удалить группу');
  }
 }

 async function handleAddModifier(groupId: string, ingredientIdOverride?: string) {
  if (!currentDishId) return;
  const nextIngId = ingredientIdOverride || modIngId;
  if (!nextIngId) { wiggleModName(); return; }

  const price = parseDecimalField(newModPrice);
  const priceTiyin = Math.round(price * 100);

  setModIngSearch('');
  setModIngId('');
  setNewModPrice('');
  setNewModQty('');

  try {
   await createModifier({
    groupId,
    name: nextIngId, // will be overridden by ingredient name in UI
    priceTiyin,
   });
  } catch (e) {
   toast.error('Не удалось сохранить модификатор');
  }
 }

 async function handleUpdateModifierIngredient(modId: string, _ingredientId: string) {
  // Modifier ingredient linking not yet supported in InstantDB — no-op for now
 }

 async function handleRemoveModifier(modId: string) {
  if (!currentDishId) return;
  try {
   await deleteModifier(modId);
  } catch (e) {
   toast.error('Не удалось удалить модификатор');
  }
 }

 const renderModSwitcher = (group: any) => (
  <div className="inline-flex items-center gap-1.5">
   <span className="text-sm text-muted-foreground">Выбор:</span>
   <div
   className="inline-flex rounded-md bg-[#F2F2F7] p-0.5 shrink-0 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"

  >
   <button
    onClick={async () => {
     if (!currentDishId) return;
     try {
      await updateModGroup(group.id, { maxSelect: 1 });
     } catch (e) {
      toast.error('Не удалось обновить режим');
     }
    }}
    className={`px-2 py-0.5 rounded-md text-sm transition-all ${
     group.max_select === 1 ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
    }`}

   >
    Только один
   </button>
   <button
    onClick={async () => {
     if (!currentDishId) return;
     try {
      await updateModGroup(group.id, { maxSelect: 0 });
     } catch (e) {
      toast.error('Не удалось обновить режим');
     }
    }}
    className={`px-2 py-0.5 rounded-md text-sm transition-all ${
     group.max_select !== 1 ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
    }`}

   >
    Любое количество
   </button>
  </div>
  </div>
 );

 return (
  <EditPage
   title={currentDishId ? 'Редактирование блюда' : 'Новое блюдо'}
   backTo="/menu"
   onSave={handleSave}
  >
   {/* Basic info */}
   <div className="space-y-4">
    <Field label="Название">
     <input
      className="w-full px-3 py-2 border border-border rounded-lg text-sm "
      value={name}
      onChange={(e) => setName(e.target.value)}
     />
    </Field>

    <Field label="Категория">
     {categories.length <= 4 ? (
      <div
       className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"

      >
       {categories.map((c: any) => (
        <button
         key={c.id}
         onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
         className={`px-4 py-1.5 rounded-lg text-sm transition-all ${
          categoryId === c.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
         }`}
         style={categoryId === c.id ? {  } : {}}
        >
         {c.name}
        </button>
       ))}
      </div>
     ) : (
      <CategoryDropdown
       categories={categories}
       value={categoryId}
       onChange={setCategoryId}
      />
     )}
    </Field>

    <Field label="Цех">
     <div
      className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"

     >
      {workshops.map((w: any) => (
       <button
        key={w.id}
        onClick={() => setWorkshopId(workshopId === w.id ? '' : w.id)}
        className={`px-4 py-1.5 rounded-lg text-sm transition-all ${
         workshopId === w.id
          ? 'bg-white text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
        }`}

       >
        {w.name}
       </button>
      ))}
     </div>
    </Field>

    <div className="flex items-center gap-4">
     <label className="w-36 text-sm text-foreground shrink-0">Цена</label>
     <div className="w-28 relative">
      <input
       className="w-full pl-3 pr-11 py-2 border border-border rounded-lg text-sm text-right"
       inputMode="decimal"
       value={price}
       onChange={(e) => setPrice(sanitizeDecimalString(e.target.value))}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">сом</span>
     </div>
     {costPrice > 0 && (
      <div className="flex gap-4 text-sm">
       <span className="text-muted-foreground">
        Себестоимость: <span className="text-foreground font-medium">{Math.round(costPrice)} сом</span>
       </span>
       <span className="text-muted-foreground">
        Наценка: <span className={`font-medium ${markup > 200 ? 'text-green-600' : 'text-foreground'}`}>{markup}%</span>
       </span>
      </div>
     )}
    </div>
   </div>

   {/* Recipe / Состав */}
   <div className="mb-6">
    <h3 className="text-base font-medium mb-4">Состав</h3>
    {!currentDishId ? (
     <p className="text-sm text-muted-foreground">
      Сначала сохраните карточку блюда, после этого можно редактировать состав.
     </p>
    ) : (
     <div>
      {recipe.map((item) => (
       <div key={item.id} className="group flex items-center py-1.5 gap-4">
        <IngredientPicker
         ingredients={ingredients}
         valueId={item.ingredient_id}
         onSelect={(ingredientId) => handleUpdateRecipeIngredient(item.id, ingredientId)}
        />
        <InputWithSuffix
         suffix={item.unit || 'г'}
         className="w-20"
         defaultValue={item.quantity}
         onSave={async (qty) => {
          if (!qty || qty === item.quantity) return;
          const normalized = normalizeQuantityToCanonical(qty, item.unit || 'г');
          try {
           await updateRecipeItem(item.id, {
            quantityMilli: Math.round(normalized.quantity * 1000),
            unit: normalized.unit,
           });
          } catch (e) {
           toast.error('Не удалось обновить количество');
          }
         }}
        />
        <div className="w-16 text-sm text-muted-foreground">
         {Math.round(
          ingredientCostForRecipeItem({
           ingredientPrice: item.ingredient_price,
           ingredientUnit: item.ingredient_unit,
           recipeQuantity: item.quantity,
           recipeUnit: item.unit,
          })
         )} сом
        </div>
        <div className="w-6 flex justify-end">
         <DeleteButton variant="line" onClick={() => handleRemoveIngredient(item.id)} />
        </div>
       </div>
      ))}
      {showAddIngredient && (
       <div className="flex items-center py-1.5 gap-4">
        <IngredientPicker
         ingredients={filteredIngredients}
         valueId={selectedIngId || null}
         autoFocus
         onSelect={(ingredientId) => {
          const ing = ingredients.find((i) => i.id === ingredientId);
          setSelectedIngId(ingredientId);
          setIngredientSearch(ing?.name || '');
          setTimeout(() => document.getElementById('ing-qty')?.focus(), 0);
         }}
        />
        <div className="w-20 relative">
         <input
          id="ing-qty"
          ref={ingQtyRef}
          className="w-full pl-3 pr-8 py-2 border border-border rounded-lg text-sm text-right"
          placeholder="0"
          inputMode="decimal"
          value={newIngQty}
          onChange={(e) => setNewIngQty(sanitizeDecimalString(e.target.value))}
          onBlur={() => {
           if (selectedIngId && newIngQty) handleAddIngredient();
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAddIngredient()}
         />
         <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {selectedIngredientUnit}
         </span>
        </div>
        <div className="w-16 text-sm text-muted-foreground">
         {selectedIngredient && newIngQty
          ? `${Math.round(
            ingredientCostForRecipeItem({
             ingredientPrice: selectedIngredient.cost_price || 0,
             ingredientUnit: selectedIngredient.unit,
             recipeQuantity: parseDecimalField(newIngQty),
             recipeUnit: selectedIngredientUnit,
            })
           )} сом`
          : ''}
        </div>
        <div className="w-6 flex justify-end">
         <button onClick={() => { setShowAddIngredient(false); setIngredientSearch(''); setSelectedIngId(''); setNewIngQty(''); }} className="px-2.5 py-1 bg-secondary text-muted-foreground rounded text-sm font-medium hover:text-foreground transition-colors">Отмена</button>
        </div>
       </div>
      )}
      <button
       onClick={() => setShowAddIngredient(true)}
       className="py-1.5 mt-1 text-sm font-medium px-3 border rounded-md hover:bg-accent transition-colors"
      >
       Добавить
      </button>

      <div className="mt-2">
       <div className="border-t"></div>
       <div className="flex items-center pt-2 text-sm gap-4">
        <div className="w-40 text-muted-foreground">Выход: {outputWeightCalc} г</div>
        <div className="w-20"></div>
        <div className="font-medium whitespace-nowrap">Итого: {Math.round(costPrice)} сом</div>
       </div>
      </div>
     </div>
    )}
   </div>

   {/* Modifiers */}
   <div className="mb-6">
    <h3 className="text-base font-medium mb-4">Модификаторы</h3>
    {!currentDishId && (
     <p className="text-sm text-muted-foreground mb-3">
      Сохраните блюдо, чтобы добавить группы и модификаторы.
     </p>
    )}
    {!workshopId && (
     <p className="text-sm text-amber-700 mb-3">
      Выберите цех блюда, чтобы выбирать ингредиенты модификаторов по складам этого цеха.
     </p>
    )}

    {currentDishId && dishModGroups.map((group, gi) => (
     <div key={group.id} className="mb-4">
      {/* Group header */}
      <div className="flex items-center gap-2 mb-1">
       <div className="text-sm font-medium">{group.name}</div>
       {renderModSwitcher(group)}
       <DeleteButton variant="line" onClick={() => handleRemoveModGroup(group.id)} />
      </div>

      {/* Modifiers list */}
      {group.modifiers.map((mod) => (
       <div key={mod.id} className="flex items-center py-1.5 gap-4">
        <IngredientPicker
         ingredients={modifierIngredients}
         valueId={mod.ingredient_id}
         onSelect={(ingredientId) => handleUpdateModifierIngredient(mod.id, ingredientId)}
         disabled={!workshopId}
        />
        <InputWithSuffix
         suffix="сом"
         className="w-20"
         defaultValue={mod.price}
         onSave={async (val) => {
          try {
           await updateModifier_(mod.id, { priceTiyin: Math.round(val * 100) });
          } catch (e) {
           toast.error('Не удалось обновить цену модификатора');
          }
         }}
        />
        <InputWithSuffix
         suffix={mod.unit || 'мл'}
         className="w-20"
         defaultValue={mod.quantity || ''}
         onSave={async (_val) => {
          // Quantity not stored in InstantDB modifiers — no-op
         }}
        />
        <div className="w-6 flex justify-end">
         <DeleteButton variant="line" onClick={() => handleRemoveModifier(mod.id)} />
        </div>
       </div>
      ))}

      {/* Add modifier to this group */}
      {(addingModToGroup === group.id || group.modifiers.length === 0) && (
       <div className="flex items-center py-1.5 gap-4">
        <IngredientPicker
         ingredients={filteredModIngredients}
         valueId={modIngId || null}
         disabled={!workshopId}
         autoFocus
         onSelect={(ingredientId) => {
          const ing = modifierIngredients.find((i) => i.id === ingredientId);
          setModIngId(ingredientId);
          setModIngSearch(ing?.name || '');
          handleAddModifier(group.id, ingredientId);
         }}
        />
        <div className="w-20 relative">
         <input
          id="mod-price"
          className="w-full pl-3 pr-8 py-2 border border-border rounded-lg text-sm text-right"
          placeholder="0"
          inputMode="decimal"
          value={newModPrice}
          onChange={(e) => setNewModPrice(sanitizeDecimalString(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && handleAddModifier(group.id)}
          disabled={!workshopId}
         />
         <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">сом</span>
        </div>
        <div className="w-20 relative">
         <input
          className="w-full pl-3 pr-8 py-2 border border-border rounded-lg text-sm text-right"
          placeholder="0"
          inputMode="decimal"
          value={newModQty}
          onChange={(e) => setNewModQty(sanitizeDecimalString(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && handleAddModifier(group.id)}
          disabled={!workshopId}
         />
         <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{selectedModUnit}</span>
        </div>
        <div className="w-6 flex justify-end">
         <button onClick={() => { setAddingModToGroup(null); setModIngSearch(''); setModIngId(''); setNewModPrice(''); setNewModQty(''); }} className="px-2.5 py-1 bg-secondary text-muted-foreground rounded text-sm font-medium hover:text-foreground transition-colors">Отмена</button>
        </div>
       </div>
      )}
      <button
       onClick={() => { setAddingModToGroup(group.id); setModIngSearch(''); setModIngId(''); setNewModPrice(''); setNewModQty(''); }}
       className="py-1 text-sm font-medium px-3 border rounded-md hover:bg-accent transition-colors"
      >
       Добавить
      </button>
     </div>
    ))}

    {/* Add group: create new or pick existing */}
    {currentDishId && (showAddModGroup ? (
     <div className="mt-2">
      {/* Create new — always on top */}
      <div className="flex items-center gap-2 mb-2">
       <input
        className="flex-1 max-w-xs px-3 py-1.5 border border-border rounded-lg text-sm"
        ref={groupNameRef}
        placeholder="Название нового набора"
        value={newGroupName}
        onChange={(e) => setNewGroupName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCreateModGroup()}
        autoFocus
       />
       <div className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
        <button
         type="button"
         onClick={() => setNewGroupType('single')}
         className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${newGroupType === 'single' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >Только один</button>
        <button
         type="button"
         onClick={() => setNewGroupType('multi')}
         className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${newGroupType === 'multi' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >Любое количество</button>
       </div>
       <button onClick={handleCreateModGroup} className="px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors">Создать</button>
       <button onClick={() => { setShowAddModGroup(false); setNewGroupName(''); }} className="px-2.5 py-1.5 bg-secondary text-muted-foreground rounded-lg text-sm font-medium hover:text-foreground transition-colors">Отмена</button>
      </div>
     </div>
    ) : (
     <button
      onClick={() => setShowAddModGroup(true)}
      className="mt-2 px-3 py-2 bg-[#F2F2F7] rounded-lg text-sm font-medium hover:bg-[#E8E8ED] transition-colors"
     >
      Добавить набор
     </button>
    ))}
   </div>
  </EditPage>
 );
}

