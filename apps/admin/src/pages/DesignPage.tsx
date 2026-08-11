import { useState } from 'react';
import { Button } from '@/components/shadcn/button';
import { SearchInput } from '@/components/ui/SearchInput';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { EditButton } from '@/components/ui/EditButton';
import { DatePresetPicker } from '@/components/ui/DatePresetPicker';
import { AddButton } from '@/components/ui/ActionButtons';
import { Modal } from '@/components/ui/Modal';
import { IngredientPicker } from '@/components/ui/IngredientPicker';
import { EditPage } from '@/components/ui/EditPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';

// ─── helpers ───

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h3 className="text-sm text-muted-foreground mb-5">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-6 mb-3">
      {label && <span className="w-28 text-sm text-muted-foreground shrink-0">{label}</span>}
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

// ─── iOS-style SegmentTabs ───

function SegmentTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-150 ${
              active
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── page ───

export function DesignPage() {
  const [segVal2, setSegVal2] = useState('all');
  const [segVal4, setSegVal4] = useState('today');
  const [segVal3, setSegVal3] = useState('delivery');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8 max-w-5xl">

      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-1">Design System</h2>
        <p className="text-sm text-muted-foreground">Birman style — воздух, цвет в тексте, без карточек.</p>
      </div>

      {/* 1. Buttons */}
      <Section title="1. Buttons">
        <Row label="default">
          <Button>Default</Button>
          <Button disabled>Disabled</Button>
        </Row>
        <Row label="destructive">
          <Button variant="destructive">Destructive</Button>
          <Button variant="destructive" disabled>Disabled</Button>
        </Row>
        <Row label="outline">
          <Button variant="outline">Outline</Button>
          <Button variant="outline" disabled>Disabled</Button>
        </Row>
        <Row label="sizes">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="icon">X</Button>
        </Row>
        <Row label="text action">
          <button className="text-sm text-foreground hover:underline">Добавить блюдо →</button>
          <span className="text-sm text-muted-foreground">inline-действие, без кнопки</span>
        </Row>
      </Section>

      {/* 2. Delete */}
      <Section title="2. Delete">
        <Row label="row">
          <DeleteButton variant="row" onClick={() => {}} />
          <span className="text-sm text-muted-foreground">таблица</span>
        </Row>
        <Row label="line">
          <DeleteButton variant="line" onClick={() => {}} />
          <span className="text-sm text-muted-foreground">строка формы</span>
        </Row>
        <Row label="page">
          <DeleteButton label="Удалить" onClick={() => {}} />
        </Row>
      </Section>

      {/* 2.5. Edit */}
      <Section title="2.5. Edit">
        <Row label="row">
          <EditButton onClick={() => {}} />
          <span className="text-sm text-muted-foreground">таблица (Pencil)</span>
        </Row>
      </Section>

      {/* 3. Segment tabs */}
      <Section title="3. Segment tabs">
        <Row label="2 segments">
          <SegmentTabs
            options={[{ value: 'all', label: 'Все' }, { value: 'active', label: 'Активные' }]}
            value={segVal2}
            onChange={setSegVal2}
          />
        </Row>
        <Row label="4 segments">
          <SegmentTabs
            options={[
              { value: 'today', label: 'Сегодня' },
              { value: 'week', label: 'Неделя' },
              { value: 'month', label: 'Месяц' },
              { value: 'all', label: 'Всё' },
            ]}
            value={segVal4}
            onChange={setSegVal4}
          />
        </Row>
      </Section>

      {/* 4. Search & filter bar */}
      <Section title="4. Search & filters">
        <Row label="SearchInput">
          <SearchInput value={search} onChange={setSearch} />
        </Row>
        <Row label="Select">
          <select className="px-3 py-1.5 border rounded-lg text-sm bg-background outline-none min-w-[160px]">
            <option>Все категории</option>
            <option>Кофе</option>
          </select>
        </Row>
        <Row label="Filter bar">
          <div className="flex items-center gap-0">
            <SearchInput value="" onChange={() => {}} className="w-56" />
            <span className="w-px h-5 bg-border/30 mx-3" />
            <SegmentTabs
              options={[{ value: 'all', label: 'Все' }, { value: 'delivery', label: 'Поставки' }]}
              value="all"
              onChange={() => {}}
            />
            <span className="w-px h-5 bg-border/30 mx-3" />
            <select className="px-3 py-1.5 border rounded-lg text-sm bg-background outline-none">
              <option>Все склады</option>
            </select>
          </div>
        </Row>
      </Section>

      {/* 5. Table — без внешней рамки */}
      <Section title="5. Table">
        <table className="table-fixed border-separate border-spacing-0 w-full max-w-4xl">
          <thead>
            <tr className="text-sm text-muted-foreground">
              <th scope="col" className="text-left font-medium py-1.5 w-[40px]" />
              <th scope="col" className="text-left font-medium py-1.5 w-[180px]">Название</th>
              <th scope="col" className="text-left font-medium py-1.5 w-[140px]">Категория</th>
              <th scope="col" className="text-right font-medium py-1.5 w-[100px]">Цена</th>
              <th scope="col" className="text-right font-medium py-1.5 w-[90px]">Наценка</th>
              <th scope="col" className="w-[40px]" />
              <th scope="col" className="w-[40px]" />
            </tr>
          </thead>
          <tbody className="before:content-[''] before:block before:h-2">
            <tr className="group hover:bg-black/[0.03] transition-colors cursor-pointer">
              <td className="py-1.5 text-center"><div className="w-1.5 h-1.5 rounded-full bg-green-500 mx-auto" /></td>
              <td className="py-1.5 text-sm">Латте</td>
              <td className="py-1.5 text-sm text-muted-foreground">Кофе</td>
              <td className="py-1.5 text-sm text-right tabular-nums">350 сом</td>
              <td className="py-1.5 text-sm text-right tabular-nums"><span className="text-green-600">250%</span></td>
              <td className="py-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                <EditButton onClick={() => {}} />
              </td>
              <td className="py-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                <DeleteButton variant="row" onClick={() => {}} />
              </td>
            </tr>
            <tr className="group hover:bg-black/[0.03] transition-colors cursor-pointer">
              <td className="py-1.5 text-center"><div className="w-1.5 h-1.5 rounded-full bg-slate-300 mx-auto" /></td>
              <td className="py-1.5 text-sm text-muted-foreground">Сэндвич с лососем</td>
              <td className="py-1.5 text-sm text-muted-foreground">Завтраки</td>
              <td className="py-1.5 text-sm text-right tabular-nums">480 сом</td>
              <td className="py-1.5 text-sm text-right tabular-nums">140%</td>
              <td className="py-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                <DeleteButton variant="row" onClick={() => {}} />
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* 6. Empty states */}
      <Section title="6. Empty states">
        <div className="space-y-8">
          <div>
            <EmptyState
              title="Блюд пока нет"
              hint="Добавьте первое блюдо, чтобы начать составлять меню"
              action={{ label: 'Добавить блюдо', onClick: () => {} }}
            />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Ничего не найдено — попробуйте изменить поисковый запрос</p>
          </div>
          <div>
            <p className="text-sm text-red-600">Не удалось загрузить данные. Проверьте подключение.</p>
          </div>
        </div>
      </Section>

      {/* 7. Forms */}
      <Section title="7. Forms">
        <div className="max-w-xl space-y-4">
          <Field label="Название">
            <input
              className="w-full max-w-sm px-3 py-1.5 border border-border rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              placeholder="Название блюда"
              defaultValue="Латте"
            />
          </Field>
          <Field label="Категория">
            <select className="w-full max-w-sm px-3 py-1.5 border border-border rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
              <option>Кофе</option>
              <option>Десерты</option>
            </select>
          </Field>
          <Field label="Цена">
            <input
              className="w-full max-w-sm px-3 py-1.5 border border-border rounded-lg text-sm text-right tabular-nums bg-transparent focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              placeholder="0"
              defaultValue="350"
            />
          </Field>
          <div className="flex items-center justify-between pt-8">
            <DeleteButton label="Удалить" onClick={() => {}} />
            <button className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors">
              Обновить
            </button>
          </div>
        </div>
      </Section>

      {/* 8. Status — цвет в тексте, не бейджи */}
      <Section title="8. Status">
        <div className="flex items-center gap-8 text-sm">
          <span className="text-green-600">Доступно онлайн</span>
          <span className="text-muted-foreground">Скрыто</span>
          <span className="text-red-600">Стоп-лист</span>
        </div>
        <div className="flex items-center gap-6 mt-3">
          <span className="inline-flex items-center gap-1.5 text-sm"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Доступно</span>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Скрыто</span>
          <span className="inline-flex items-center gap-1.5 text-sm text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Стоп-лист</span>
        </div>
        <div className="flex items-center gap-3 mt-5">
          <span className="w-28 text-sm text-muted-foreground shrink-0">Badge</span>
          <Badge>Поставка</Badge>
          <Badge>Списание</Badge>
          <Badge>Перемещение</Badge>
        </div>
      </Section>

      {/* 9. Typography */}
      <Section title="9. Typography">
        <div className="space-y-4">
          <div className="flex items-baseline gap-4">
            <span className="w-28 text-sm text-muted-foreground shrink-0">Heading</span>
            <h2 className="text-2xl font-bold">Заголовок страницы</h2>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="w-28 text-sm text-muted-foreground shrink-0">Section</span>
            <h3 className="text-lg font-bold">Заголовок секции</h3>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="w-28 text-sm text-muted-foreground shrink-0">Data</span>
            <span className="text-sm">350 сом</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="w-28 text-sm text-muted-foreground shrink-0">Muted</span>
            <span className="text-sm text-muted-foreground">Категория</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="w-28 text-sm text-muted-foreground shrink-0">Status</span>
            <span className="text-sm text-green-600">Доступно</span>
            <span className="text-sm text-red-600">Стоп-лист</span>
          </div>
        </div>
      </Section>

      {/* 10. Expanded table row */}
      <Section title="10. Expanded row">
        <table className="table-fixed border-separate border-spacing-0 w-full max-w-4xl">
          <thead>
            <tr className="text-sm text-muted-foreground">
              <th scope="col" className="text-left font-medium py-1.5 w-[40px]" />
              <th scope="col" className="text-left font-medium py-1.5 w-[180px]">Название</th>
              <th scope="col" className="text-left font-medium py-1.5 w-[140px]">Категория</th>
              <th scope="col" className="text-right font-medium py-1.5 w-[100px]">Цена</th>
              <th scope="col" className="text-right font-medium py-1.5 w-[90px]">Наценка</th>
              <th scope="col" className="w-[40px]" />
            </tr>
          </thead>
          <tbody className="before:content-[''] before:block before:h-2">
            <tr className="group hover:bg-black/[0.03] transition-colors cursor-pointer">
              <td className="py-1.5 text-center"><div className="w-1.5 h-1.5 rounded-full bg-green-500 mx-auto" /></td>
              <td className="py-1.5 text-sm">Латте</td>
              <td className="py-1.5 text-sm text-muted-foreground">Кофе</td>
              <td className="py-1.5 text-sm text-right tabular-nums">350 сом</td>
              <td className="py-1.5 text-sm text-right tabular-nums"><span className="text-green-600">250%</span></td>
              <td className="py-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                <DeleteButton variant="row" onClick={() => {}} />
              </td>
            </tr>
            <tr className="bg-black/[0.03]">
              <td />
              <td colSpan={5} className="py-2 pl-8 pr-3">
                <table className="w-full max-w-md text-sm">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left font-medium py-0.5 pr-2">Ингредиент</th>
                      <th className="text-right font-medium py-0.5 px-2 w-16">Кол-во</th>
                      <th className="text-right font-medium py-0.5 pl-2 w-20">Себест.</th>
                    </tr>
                  </thead>
                  <tbody className="before:content-[''] before:block before:h-1">
                    <tr>
                      <td className="py-0.5 pr-2">Эспрессо</td>
                      <td className="py-0.5 px-2 text-right tabular-nums">30 г</td>
                      <td className="py-0.5 pl-2 text-right tabular-nums">80 сом</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-2">Молоко</td>
                      <td className="py-0.5 px-2 text-right tabular-nums">200 мл</td>
                      <td className="py-0.5 pl-2 text-right tabular-nums">45 сом</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* 11. Modifier groups */}
      <Section title="11. Modifier groups">
        <div className="max-w-xl space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">Молоко</span>
              <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">×</button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-36 text-muted-foreground">Миндальное</span>
                <span className="w-16 text-right text-muted-foreground tabular-nums">100 мл</span>
                <span className="w-16 text-right text-muted-foreground tabular-nums">+40 сом</span>
                <button className="text-muted-foreground hover:text-red-500 transition-colors">×</button>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-36 text-muted-foreground">Безлактозное</span>
                <span className="w-16 text-right text-muted-foreground tabular-nums">100 мл</span>
                <span className="w-16 text-right text-muted-foreground tabular-nums">+60 сом</span>
                <button className="text-muted-foreground hover:text-red-500 transition-colors">×</button>
              </div>
            </div>
            <button className="mt-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              + Добавить
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 max-w-xs px-3 py-1.5 border border-border rounded-lg text-sm"
                placeholder="Название нового набора"
                defaultValue=""
              />
              <span className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5">
                <button className="px-3 py-1 text-sm font-medium rounded-md bg-white text-foreground shadow-sm">Только один</button>
                <button className="px-3 py-1 text-sm font-medium rounded-md text-muted-foreground">Любое количество</button>
              </span>
              <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium">✓</button>
            </div>
          </div>
        </div>
      </Section>

      {/* 12. Inline add form */}
      <Section title="12. Inline add form">
        <div className="max-w-xl">
          <div className="flex items-center gap-3 mb-3">
            <input
              className="flex-1 max-w-xs px-3 py-1.5 border border-border rounded-lg text-sm"
              placeholder="Имя"
            />
            <input
              className="w-40 px-3 py-1.5 border border-border rounded-lg text-sm"
              placeholder="Email"
            />
            <select className="px-3 py-1.5 border border-border rounded-lg text-sm bg-background">
              <option>Кассир</option>
              <option>Официант</option>
            </select>
            <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
              Добавить
            </button>
          </div>
          <p className="text-sm text-muted-foreground">Форма прямо под таблицей, не в модалке.</p>
        </div>
      </Section>

      {/* 13. Modal */}
      <Section title="13. Modal">
        <Row label="default">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
          >
            Открыть модалку
          </button>
          <span className="text-sm text-muted-foreground">Radix dialog, фокус-ловушка, Escape</span>
        </Row>
        {showModal && (
          <Modal title="Пример модалки" onClose={() => setShowModal(false)}>
            <p className="text-sm text-muted-foreground">Содержимое модального окна.</p>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-1.5 border border-border rounded-lg text-sm font-medium">Отмена</button>
              <button onClick={() => setShowModal(false)} className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium">Сохранить</button>
            </div>
          </Modal>
        )}
      </Section>

      {/* 14. DatePresetPicker */}
      <Section title="14. DatePresetPicker">
        <Row label="presets + input">
          <DatePresetPicker value="" onChange={() => {}} />
          <span className="text-sm text-muted-foreground">Сегодня/Вчера/Неделя/Всё + дата</span>
        </Row>
      </Section>

      {/* 15. AddButton */}
      <Section title="15. AddButton">
        <Row label="default">
          <AddButton onClick={() => {}} />
          <span className="text-sm text-muted-foreground">основное действие на странице</span>
        </Row>
      </Section>

      {/* 16. IngredientPicker */}
      <Section title="16. IngredientPicker">
        <Row label="search select">
          <IngredientPicker
            ingredients={[{ id: '1', name: 'Мука' }, { id: '2', name: 'Сахар' }, { id: '3', name: 'Масло' }]}
            valueId={null}
            onSelect={() => {}}
          />
          <span className="text-sm text-muted-foreground">поиск ингредиента по названию</span>
        </Row>
      </Section>

      {/* 17. EditPage */}
      <Section title="17. EditPage">
        <Row label="shell">
          <span className="text-sm text-muted-foreground">
            Обёртка для форм создания/редактирования: header + back link + footer с кнопками.
            Используется в Deliveries, WriteOffs, Transfers, DishEdit, WarehouseAdmin.
          </span>
        </Row>
      </Section>

    </div>
  );
}
