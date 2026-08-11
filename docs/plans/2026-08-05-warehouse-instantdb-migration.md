# Warehouse → InstantDB — Migration Plan

**Дата:** 2026-08-05
**Статус:** Planning (v2 — после research)
**Исходная точка:** 7 warehouse-страниц на Supabase, **0 warehouse-сущностей** в InstantDB-схеме

---

## 0. Research Findings (2026-08-05)

| **Пагинация** | Cursor-based: `where: { createdAt: { $lt: cursor } }` + `order: { createdAt: 'desc' }` + `limit`. Offset тоже поддерживается. | Все query factories — cursor pagination для документов, offset для сессий. |
| **Атомарность `transact`** | Все операции в одном вызове — атомарны. + **`$inc` operator** для атомарных инкрементов без pre-read. Уже используется в `payments.ts` для `venueDailyStats`. | `db.tx.stockItems[id].update({ quantityMilli: { $inc: delta } })` — без гонок. |
| **Many-to-many links** | `.link()` / `.unlink()` на транзакции. `.update().link({ rel: id })` — цепочкой. | `warehouse_products` → прямой link `warehouses ←→ products`. `stockItems` → junction entity. |
| **Custom IDs** | UUID v5 через `deterministicId('kind', ...parts)` — уже в `@lumo/data`. Используется во всех commands. | `deterministicId('stock-item', warehouseId, productId)` для уникальности stockItems. |
| **Live vs one-shot** | `db.useQuery(...)` = live subscription. `db.queryOnce(...)` = snapshot. | Админка: `useQuery` для operational (AllOperations), `queryOnce` для exports. |
| **IndexedDB limits** | Chrome: ~60% диска, Safari: непредсказуемо, Private: может исчезнуть. | Пагинация обязательна. Глубина вложенных запросов ≤2 уровня. Сервер — source of truth. |
| **Unique constraints** | `i.string().unique()` на одном поле. Составных нет. | Для `stockItems` — deterministic ID. Для документов — `operationId.unique()`. |
| **Unit conversion** | Нет серверной логики. Всё на клиенте. | Все quantity в милли-единицах. Конвертация при вводе/отображении. |
| **Workshops (цеха)** | В InstantDB нет. В Supabase `workshop_id` — legacy. | Цеха не мигрируем. Страницы AddIngredients/EditIngredient → прямые links со складами. |
| **Period movements (Inventory)** | Supabase RPC → client-side `inventoryMovements` запрос + reduce. | `useQuery` за период, агрегация на клиенте. |
| **`$inc` оператор** | `db.tx.entity[id].update({ field: { $inc: N } })` — атомарно на уровне БД. Уже в коде: `payments.ts:190`. | Приёмка/списание/перемещение: status + `$inc` stock в одной транзакции, без pre-read. |
| **Транзакции с links** | `db.tx.entity[id].update({...}).link({ rel: targetId })` — цепочкой. Уже в коде: `orders.ts:140`, `payments.ts:155`. | Создание документа = `update({...}).link({ warehouse, venue, lines: [...] })`. |
| **Period movements (Inventory)** | Supabase RPC `admin_inventory_period_movements` считает движения между сессиями. | В InstantDB: client-side запрос `inventoryMovements` за период + reduce. |

---

## 1. Что есть сейчас

### InstantDB — только `inventoryMovements`
```ts
inventoryMovements: i.entity({
  operationId: i.string().unique().indexed(),
  quantityDeltaMilli: i.number(),
  unit: i.string(),
  // ...
})
```
Всё. Складов, документов, stock_items в схеме **нет**.

### Supabase warehouse — 13 таблиц

| Таблица | Назначение | Строк (~Alto Coffee) |
|---|---|---|
| `warehouses` | Склады (Бар, Кухня) | ~3 |
| `stock_items` | Текущий остаток (warehouse+product) | ~50 |
| `warehouse_deliveries` + `_items` | Поставки | ~20/мес |
| `warehouse_write_offs` + `_items` | Списания | ~10/мес |
| `warehouse_transfers` + `_items` | Перемещения между складами | ~5/мес |
| `warehouse_inventory_sessions` + `_lines` | Инвентаризации | ~2/мес |
| `warehouse_products` | Привязка ингредиентов к складам | ~50 |
| `workshop_warehouses` | Привязка цехов к складам | ~5 |
| `workshop_stock` | Остатки по цехам (legacy) | ~30 |

### Страницы, которые надо мигрировать

| Страница | Сложность | Зависимости |
|---|---|---|
| `WarehousesAdmin` | ★ | warehouses CRUD |
| `AddIngredients` | ★ | warehouses, warehouse_products |
| `EditIngredient` | ★ | warehouses, warehouse_products |
| `AllOperations` | ★★★ | deliveries + write-offs + transfers + inventory (все 4 документа) |
| `NewDelivery` | ★★ | warehouses, products, create/update delivery |
| `NewWriteOff` | ★★ | warehouses, products, create/update write-off |
| `NewTransfer` | ★★ | warehouses, products, create/update transfer |
| `Inventory` | ★★★ | sessions, lines, counting grid, period movements |
| `WarehouseWorkspace` | ★ | warehouses + products (переиспользует AllOperations) |

---

## 2. План: 6 фаз

### 🔴 Фаза 1 — Схема (пакет `@lumo/data`)

**Файл:** `packages/data/src/instant.schema.ts`

Добавить 6 новых entity + 2 прямых many-to-many links:

**Entity:**
```ts
// Склады — venue-scoped через link
warehouses: i.entity({
  name: i.string(),
  createdAt: i.date().indexed(),
}),

// Текущий остаток — junction entity (warehouse × product × quantity)
// Уникальность через deterministic ID: deterministicId('stock-item', warehouseId, productId)
stockItems: i.entity({
  quantityMilli: i.number(),     // милли-единицы: г×1000, мл×1000, шт×1
  unit: i.string(),              // 'г', 'мл', 'шт'
  updatedAt: i.date().indexed(),
}),

// Поставки
deliveryDocuments: i.entity({
  operationId: i.string().unique().indexed(),
  supplier: i.string(),
  deliveryDate: i.date().indexed(),
  amountTiyin: i.number(),
  status: i.string().indexed(),  // 'draft' | 'in_transit' | 'received' | 'cancelled'
  source: i.string(),            // 'manual' | 'procurement_app'
  comment: i.string(),
  createdAt: i.date().indexed(),
}),

deliveryLines: i.entity({
  name: i.string(),
  quantityMilli: i.number(),
  unit: i.string(),
  priceTiyin: i.number(),
}),

// Списания
writeOffDocuments: i.entity({
  operationId: i.string().unique().indexed(),
  reasonSummary: i.string(),
  writeOffDate: i.date().indexed(),
  status: i.string().indexed(),  // 'draft' | 'posted' | 'cancelled'
  createdByName: i.string(),
  comment: i.string(),
  createdAt: i.date().indexed(),
}),

writeOffLines: i.entity({
  name: i.string(),
  quantityMilli: i.number(),
  unit: i.string(),
  reason: i.string(),
}),

// Перемещения
transferDocuments: i.entity({
  operationId: i.string().unique().indexed(),
  transferDate: i.date().indexed(),
  status: i.string().indexed(),  // 'draft' | 'posted' | 'cancelled'
  comment: i.string(),
  createdAt: i.date().indexed(),
}),

transferLines: i.entity({
  name: i.string(),
  quantityMilli: i.number(),
  unit: i.string(),
}),

// Инвентаризации
inventorySessions: i.entity({
  operationId: i.string().unique().indexed(),
  inventoryType: i.string(),     // 'full' | 'partial'
  conductedAt: i.date().indexed(),
  status: i.string().indexed(),  // 'draft' | 'posted' | 'cancelled'
  resultDeltaTiyin: i.number(),
  createdAt: i.date().indexed(),
}),

inventoryLines: i.entity({
  name: i.string(),
  unit: i.string(),
  theoreticalMilli: i.number(),
  actualMilli: i.number(),
  unitPriceTiyin: i.number(),
}),
```

**Замена `warehouse_products` таблицы — прямой many-to-many link:**
```ts
links: {
  warehouseProducts: {
    forward: { on: 'warehouses', has: 'many', label: 'products' },
    reverse: { on: 'products', has: 'many', label: 'warehouses' },
  },
}
// Запрос «все продукты на складе»:
// db.useQuery({ warehouses: { $: { where: { id: whId } }, products: {} } })
```

**Links (отношения) — все через InstantDB links, не через string-поля:**
- `warehouses` ← `venue` (many-to-one)
- `warehouses` ←→ `products` (many-to-many, прямой)
- `stockItems` → `warehouse` + `product` (junction, many-to-one each)
- `deliveryDocuments` → `warehouse` + `venue`; `deliveryLines` → `deliveryDocument` + `product`
- `writeOffDocuments` → `warehouse` + `venue`; `writeOffLines` → `writeOffDocument` + `product`
- `transferDocuments` → `fromWarehouse` + `toWarehouse` + `venue`; `transferLines` → `transferDocument` + `product`
- `inventorySessions` → `warehouse` + `venue`; `inventoryLines` → `inventorySession` + `product`

**Acceptance:** `pnpm typecheck` проходит для `@lumo/data`. Схема в `instant.schema.ts` содержит все 6 сущностей.

---

### 🔴 Фаза 2 — Пермишены (пакет `@lumo/data`)

**Файл:** `packages/data/src/instant.perms.ts`

По образу существующих:
```ts
stockItems: {
  allow: {
    view: "auth.id != null && isVenueMember(data.ref('warehouses.venueId'))",
    create: "isVenueAdmin(data.ref('warehouses.venueId'))",
    update: "isVenueAdmin(data.ref('warehouses.venueId'))",
  },
},
deliveryDocuments: {
  allow: {
    view: "auth.id != null && isVenueMember(data.ref('warehouses.venueId'))",
    create: "isVenueAdmin(data.ref('warehouses.venueId'))",
    update: "isVenueAdmin(data.ref('warehouses.venueId'))",
    // delete = soft-delete через status='cancelled' — не даём хард-делит
  },
},
// ... аналогично для остальных
```

**Acceptance:** `pnpm instant:verify:permissions:dev` проходит для warehouse-сущностей.

---

### 🟡 Фаза 3 — Query factories + typed commands (`@lumo/data`)

**Файл:** `packages/data/src/warehouseQueries.ts` (новый)
**Файл:** `packages/data/src/commands/warehouse.ts` (новый)

**Queries — с пагинацией (учимся на ошибках audit'а):**
```ts
// Всегда с лимитом. По умолчанию — последние 50 документов.
export function warehouseDeliveriesQuery(venueId: string, limit = 50) { ... }
export function warehouseWriteOffsQuery(venueId: string, limit = 50) { ... }
export function warehouseTransfersQuery(venueId: string, limit = 50) { ... }
export function inventorySessionsQuery(venueId: string, limit = 20) { ... }

// Scoped: один склад, с пагинацией через курсор (createdAt)
export function warehouseDocumentsByWarehouseQuery(
  warehouseId: string, cursor?: string, limit = 50
) { ... }

// Текущие остатки — bounded (количество ингредиентов конечно)
export function stockItemsByWarehouseQuery(warehouseId: string) { ... }

// Один документ с lines
export function deliveryDetailQuery(deliveryId: string) { ... }
```

**Typed commands — мутации через транзакции:**
```ts
// Поставки
export function createDelivery(db, input: CreateDeliveryInput): Promise<void>
export function updateDelivery(db, id: string, patch: UpdateDeliveryPatch): Promise<void>
export function receiveDelivery(db, id: string): Promise<void>  // stock + status
export function cancelDelivery(db, id: string): Promise<void>   // reverse stock

// Списания
export function createWriteOff(db, input): Promise<void>
export function postWriteOff(db, id: string): Promise<void>     // stock + status
// ...

// Перемещения
export function createTransfer(db, input): Promise<void>
export function postTransfer(db, id: string): Promise<void>     // from- / to+ stock
// ...

// Инвентаризации
export function createInventorySession(db, input): Promise<void>
export function postInventorySession(db, id: string): Promise<void> // stock = actual
// ...

// Склады
export function createWarehouse(db, input): Promise<void>

**Пример: `receiveDelivery` — атомарный приём поставки:**
```ts
export async function receiveDelivery(db: CommandDatabase, deliveryId: string) {
  const now = new Date().toISOString();
  // Получаем delivery + lines (queryOnce — не нужен live query для мутации)
  const { data } = await db.queryOnce({
    deliveryDocuments: {
      $: { where: { id: deliveryId } },
      deliveryLines: {},
    },
  });
  const delivery = data?.deliveryDocuments?.[0];
  if (!delivery || delivery.status !== 'draft') throw new DomainError('DELIVERY_NOT_DRAFT');

  const stockOps = delivery.deliveryLines.map((line) => {
    const stockId = deterministicId('stock-item', delivery.warehouseId, line.productId);
    return db.tx.stockItems[stockId].update({
      quantityMilli: { $inc: line.quantityMilli },
      unit: line.unit,
      updatedAt: now,
    });
  });

  await db.transact([
    db.tx.deliveryDocuments[deliveryId].update({ status: 'received' }),
    ...stockOps,
  ]);
}
```

**Acceptance:** Все query factories и commands типизированы. `pnpm typecheck` проходит.

---

### 🟡 Фаза 4 — Admin хуки (11 файлов)

**Создать:**
- `useInstantWarehouses.ts` — список складов
- `useInstantStockItems.ts` — остатки по складу
- `useInstantDeliveries.ts` — deliveries + delivery detail
- `useInstantWriteOffs.ts` — write-offs + detail
- `useInstantTransfers.ts` — transfers + detail
- `useInstantInventorySessions.ts` — сессии + lines
- `useInstantDeliveryMutations.ts` — create/update/receive/cancel
- `useInstantWriteOffMutations.ts` — create/update/post/cancel
- `useInstantTransferMutations.ts` — create/update/post/cancel
- `useInstantInventoryMutations.ts` — create/save lines/post/cancel
- `useInstantWarehouseMutations.ts` — create/rename/delete

**Паттерн для всех query-хуков:**
```ts
export function useInstantDeliveries(warehouseId?: string, limit = 50) {
  const db = getInstantClient();
  const query = warehouseId
    ? warehouseDocumentsByWarehouseQuery(warehouseId, undefined, limit)
    : warehouseDeliveriesQuery(useVenueId(), limit);
  return db.useQuery(query);
}
```

**Паттерн для mutation-хуков:**
```ts
export function useInstantReceiveDelivery() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);
  const receive = async (id: string) => {
    setLoading(true);
    try {
      await receiveDelivery(db, id);
    } catch (e) {
      toast.error(domainErrorMessage(e));
      throw e;
    } finally {
      setLoading(false);
    }
  };
  return { receive, loading };
}
```

**Acceptance:** Все хуки типизированы, `pnpm typecheck` для admin проходит.

---

### 🔵 Фаза 5 — Миграция страниц (по одной)

**Порядок:** от простого к сложному.

#### 5.1 `WarehousesAdmin` → InstantDB
Замена: `useMenuData.useWarehouses` → `useInstantWarehouses`
Плюс мутации: create/rename/delete склада.

#### 5.2 `AddIngredients` + `EditIngredient` → InstantDB
Замена: `useMenuData.useWorkshops/useWarehouses` → `useInstantWarehouses`
Добавление ингредиента на склад — link product → warehouse.

#### 5.3 `AllOperations` → InstantDB
Замена 20+ Supabase-хуков на 4 InstantDB-хука:
- `useWarehouseDeliveries` → `useInstantDeliveries`
- `useWarehouseWriteOffs` → `useInstantWriteOffs`
- `useWarehouseTransfers` → `useInstantTransfers`
- `useWarehouseInventorySessions` → `useInstantInventorySessions`
- Все `useStatusMutation` → новые `useInstant*Mutations`

**Риск:** `mergeOps` создаёт `UnifiedOp[]` из 4 источников + считает стоимость через `resolveProductCost` (дополнительный Supabase-запрос). При миграции — product cost из InstantDB (поле `costTiyin` в `products`).

#### 5.4 `NewDelivery` / `NewWriteOff` / `NewTransfer` → InstantDB
Замена: `useWarehouse.useCreateDelivery/useUpdateDelivery` → `useInstantDeliveryMutations`
Формы остаются те же — меняется только data layer.

**Риск:** `useFormMachine` — internal хук для черновиков форм. Не зависит от БД, остаётся как есть.

#### 5.5 `Inventory` → InstantDB
Самая сложная. Два режима:
1. **History** — список сессий (`useInstantInventorySessions`)
2. **Counting** — создание сессии, заполнение линий (`theoretical` из `stockItems`, `actual` вводится), проведение (`postInventorySession` → обновляет `stockItems`)

`fetchAdminInventoryPeriodMovements` (история движений между сессиями) → замена на `useInstantInventoryMovements` (уже есть в схеме).

**Acceptance для каждой страницы:** страница открывается, данные грузятся из InstantDB, мутации работают, Supabase-импорты удалены.

---

### ⚪ Фаза 6 — Чистка

- Удалить старые Supabase-хуки: `useWarehouse.ts`, `useMenuData.ts`, `useWarehouseLines.ts`
- Удалить `useShiftsData.ts`, `useStaffData.ts` (уже заменены InstantDB-хуками)
- Удалить `warehouse_*` таблицы из Supabase (DROp миграцией)
- Удалить `VENUE_ID` direct usage из warehouse-страниц
- `pnpm typecheck && pnpm build` — admin

---

## 3. Оценка трудозатрат

| Фаза | Что | Часов |
|---|---|---|
| 1 | Схема (6 entities + links) | 2 |
| 2 | Пермишены | 1 |
| 3 | Query factories + typed commands | 4 |
| 4 | Admin хуки (11 файлов) | 3 |
| 5.1-5.2 | WarehousesAdmin + Add/EditIngredient | 2 |
| 5.3 | AllOperations | 4 |
| 5.4 | NewDelivery/WriteOff/Transfer | 3 |
| 5.5 | Inventory | 4 |
| 6 | Чистка | 2 |
| **Итого** | | **25** |

## 4. Что НЕ входит

- Аналитика (Analytics, AnalyticsNew, AnalyticsProfit) — не operational
- Settings, Import, Login — не warehouse
- FloorPlan writes — отдельная задача
- Backfill данных из Supabase в InstantDB — отдельный скрипт (после миграции)
- POS warehouse integration (списание при продаже уже в InstantDB через `payOrder`)

## 5. Ключевые риски

1. **InstantDB upsert на удалённых строках** ([#2769](https://github.com/instantdb/instant/issues/2769)) — при проведении документа нельзя гарантировать upsert, если строка удалена через Explorer. **Митигация:** использовать `operationId` + unique constraint, ловить конфликты.

2. **Пагинация** — InstantDB не поддерживает SQL-курсоры. **Митигация:** лимит + сортировка по `createdAt`, "Load more" кнопка. Для текущих остатков пагинация не нужна (ингредиентов < 500).

3. **Атомарность stock + status** — в Supabase это RPC в одной транзакции. В InstantDB — `db.transact()` с несколькими операциями. **Митигация:** проверить, что `db.transact` атомарно (должно быть, это их примитив).

4. **`useFormMachine`** — кастомный хук для черновиков, может иметь неявные зависимости от Supabase. **Митигация:** аудит перед фазой 5.
