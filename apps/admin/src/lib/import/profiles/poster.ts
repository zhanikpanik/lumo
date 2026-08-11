import type { ImportProfile } from '../types';
import { detectByMarkers } from '../columnMatcher';

/**
 * Poster POS — XLSX export profile.
 *
 * Poster exports typically contain these sheets (names vary by locale/version):
 *   - Товары / Products — dishes and simple products
 *   - Категории / Categories — menu categories
 *   - Ингредиенты / Ingredients — stock ingredients
 *   - Тех. карты / Tech cards — recipe items (ingredient → dish mapping)
 *   - Цеха / Workshops — production workshops
 *
 * Prices in Poster are stored in **kopecks** (1/100 of main currency),
 * so all price fields are divided by 100.
 */

export const posterProfile: ImportProfile = {
  id: 'poster',
  name: 'Poster POS (XLSX)',
  description: 'Импорт из экспорта Poster. Цены конвертируются из копеек.',

  detect: (sheets) =>
    detectByMarkers(sheets, [
      'название товара',
      'категория',
      'цена продажи',
      'product_name',
      'menu_category',
    ]),

  globalTransforms: {
    priceDivider: 100, // Poster stores prices in kopecks
  },

  entities: {
    categories: {
      sheetPattern: /категор|катэгор|categor/i,
      matchers: {
        name: [
          'Название категории',
          'Категория',
          'Название',
          'Имя категории',
          'Category name',
          'Category',
          'Name',
        ],
        color_hex: [
          'Цвет',
          'Цвет категории',
          'Color',
          'Category color',
        ],
        sort_order: [
          'Порядок',
          'Сортировка',
          'Порядок сортировки',
          'Sort order',
          'Order',
        ],
      },
    },

    dishes: {
      sheetPattern: /товар|продукт|блюд|product|dish|menu/i,
      matchers: {
        name: [
          'Название товара',
          'Название',
          'Товар',
          'Блюдо',
          'Наименование',
          'Имя товара',
          'Product name',
          'Name',
          'Dish',
          'Название блюда',
        ],
        price: [
          'Цена продажи',
          'Цена',
          'Цена в меню',
          'Price',
          'Selling price',
          'Menu price',
        ],
        cost_price: [
          'Себестоимость',
          'Закупочная цена',
          'Себестоимость товара',
          'Cost price',
          'Cost',
          'Purchase price',
        ],
        category_name: [
          'Категория',
          'Категория товара',
          'Группа',
          'Category',
          'Product category',
          'Group',
        ],
        workshop_name: [
          'Цех',
          'Цех приготовления',
          'Workshop',
          'Production workshop',
          'Место приготовления',
        ],
        is_active: [
          'Скрыт',
          'Видимость',
          'Активен',
          'Hidden',
          'Visible',
          'Active',
          'Доступен',
        ],
        sort_order: [
          'Порядок',
          'Сортировка',
          'Порядок сортировки',
          'Sort order',
          'Order',
        ],
        output_weight: [
          'Выход',
          'Выход блюда',
          'Вес выхода',
          'Output weight',
          'Вес',
          'Вес блюда',
        ],
      },
      transforms: {
        // Poster: hidden=1 means hidden/disabled → is_active = !hidden
        is_active: {
          transform: (v: string) => {
            const n = Number(v);
            if (!isNaN(n)) return n === 0; // 0=visible, 1=hidden
            const lower = v.toLowerCase().trim();
            if (lower === 'да' || lower === 'yes' || lower === 'true') return true;
            if (lower === 'нет' || lower === 'no' || lower === 'false') return false;
            return v === '1' || v === '0' ? v === '0' : true;
          },
        },
      },
    },

    ingredients: {
      sheetPattern: /ингредиент|ingredient|склад|stock|продукт.*склад/i,
      matchers: {
        name: [
          'Название ингредиента',
          'Ингредиент',
          'Название',
          'Наименование',
          'Ingredient name',
          'Ingredient',
          'Name',
          'Продукт',
        ],
        unit: [
          'Ед. изм.',
          'Единица измерения',
          'Единица',
          'Unit',
          'Measurement unit',
          'Ед.',
        ],
        stock_quantity: [
          'Остаток',
          'Остаток на складе',
          'Количество',
          'Stock',
          'Ingredient left',
          'Quantity',
          'Остаток ингредиента',
        ],
        price: [
          'Цена закупки',
          'Цена',
          'Закупочная цена',
          'Purchase price',
          'Price',
          'Стоимость',
          'Себестоимость',
        ],
        workshop_name: [
          'Цех',
          'Цех ингредиента',
          'Workshop',
          'Склад',
          'Место хранения',
        ],
      },
    },

    recipeItems: {
      sheetPattern: /тех.*карт|рецепт|recipe|структур|structur|состав/i,
      matchers: {
        dish_name: [
          'Блюдо',
          'Тех. карта',
          'Название блюда',
          'Товар',
          'Продукт',
          'Dish',
          'Tech card',
          'Product',
          'Название тех. карты',
        ],
        ingredient_name: [
          'Ингредиент',
          'Название ингредиента',
          'Ingredient',
          'Ингредиент название',
          'Состав',
        ],
        quantity: [
          'Брутто',
          'Количество',
          'Вес брутто',
          'Brutto',
          'Quantity',
          'Amount',
          'Кол-во',
          'Расход',
        ],
        unit: [
          'Ед. изм.',
          'Единица измерения',
          'Единица',
          'Unit',
          'Measurement',
          'Ед.',
        ],
      },
    },

    workshops: {
      sheetPattern: /цех|workshop|производств/i,
      matchers: {
        name: [
          'Название цеха',
          'Цех',
          'Название',
          'Наименование цеха',
          'Workshop name',
          'Workshop',
          'Name',
        ],
      },
    },
  },
};
