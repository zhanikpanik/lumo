#!/usr/bin/env python3
"""
Import Poster POS data into r_keeper Supabase.
Run: python3 imports/import_poster.py
"""
import json, os, sys, uuid, time, requests
from datetime import datetime, timedelta

# ── Config ──
SUPABASE_URL = "https://gmigxjrvypqjakvualil.supabase.co"
SUPABASE_KEY = "sb_publishable_bNXLWbJVGS5Dp2FUPywFkQ_9Cg_mPTu"
VENUE_ID = "00000000-0000-0000-0000-000000000010"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

BASE = f"{SUPABASE_URL}/rest/v1"
IMPORT_DIR = os.path.join(os.path.dirname(__file__) or ".", "")

# ── Helpers ──
def api(method, table, data=None, params=None):
    url = f"{BASE}/{table}"
    r = requests.request(method, url, json=data, params=params, headers=HEADERS)
    if r.status_code >= 400:
        print(f"  ERROR {r.status_code}: {r.text[:200]}")
        return None
    return r

def api_select(table, params=None):
    """Select with return=representation to get rows back."""
    h = {**HEADERS, "Prefer": "return=representation"}
    r = requests.get(f"{BASE}/{table}", params=params, headers=h)
    if r.status_code >= 400:
        print(f"  ERROR {r.status_code}: {r.text[:200]}")
        return []
    return r.json()

def load_json(filename):
    path = os.path.join(IMPORT_DIR, filename)
    with open(path) as f:
        return json.load(f)

# ── Unit mapping ──
UNIT_MAP = {
    "kg": "кг", "g": "г", "l": "л", "ml": "мл",
    "p": "шт", "pcs": "шт", "port": "порц",
    None: "шт", "": "шт",
}

def map_unit(u):
    return UNIT_MAP.get(u, u or "шт")

# ═══════════════════════════════════════════════════════════
# PHASE 1: Categories
# ═══════════════════════════════════════════════════════════
def import_categories():
    print("\n── Phase 1: Categories ──")
    menu = load_json("poster_menu.json")
    products = menu.get("response", [])

    # Collect unique categories
    seen = set()
    cats = []
    for p in products:
        name = p.get("category_name", "Без категории")
        mid = str(p.get("menu_category_id", ""))
        if name not in seen:
            seen.add(name)
            cats.append({"name": name, "menu_category_id": mid})

    # Delete existing
    print(f"  Clearing existing categories...")
    api("DELETE", f"categories?venue_id=eq.{VENUE_ID}")

    # Insert
    count = 0
    for i, c in enumerate(cats):
        data = {
            "venue_id": VENUE_ID,
            "name": c["name"],
            "sort_order": i,
            "external_id": c["menu_category_id"],
            "external_source": "poster",
        }
        r = api("POST", "categories", data)
        if r: count += 1

    print(f"  Imported {count} categories")
    return {c["name"]: c for c in cats}


# ═══════════════════════════════════════════════════════════
# PHASE 2: Products (dishes + goods + ingredients)
# ═══════════════════════════════════════════════════════════
def import_products():
    print("\n── Phase 2: Products ──")
    menu = load_json("poster_menu.json")
    ingredients = load_json("poster_ingredients.json")

    products = menu.get("response", [])
    ings = ingredients.get("response", [])

    # Get category UUIDs from DB
    cat_rows = api_select("categories", {"venue_id": f"eq.{VENUE_ID}", "select": "id,name"})
    cat_map = {c["name"]: c["id"] for c in cat_rows}

    # Delete existing
    print(f"  Clearing existing products...")
    api("DELETE", f"products?venue_id=eq.{VENUE_ID}")

    count = 0

    # A. Dishes (type=2 in Poster → type='dish' in r_keeper)
    dishes = [p for p in products if str(p.get("type")) == "2"]
    print(f"  Importing {len(dishes)} dishes...")
    for p in dishes:
        price_kop = 0
        spots = p.get("spots", [])
        if spots:
            price_kop = int(float(spots[0].get("price", 0)))
        price_som = round(price_kop / 100, 2)

        data = {
            "venue_id": VENUE_ID,
            "category_id": cat_map.get(p.get("category_name")),
            "name": p.get("product_name", "?"),
            "price": price_som,
            "cost_price": round(int(float(p.get("cost", 0))) / 100, 2),
            "type": "dish",
            "sort_order": int(p.get("sort_order", 0)),
            "external_id": str(p.get("product_id")),
            "external_source": "poster",
        }
        r = api("POST", "products", data)
        if r: count += 1

    # B. Goods (type=3 in Poster → type='ingredient' in r_keeper)
    goods = [p for p in products if str(p.get("type")) == "3"]
    print(f"  Importing {len(goods)} goods as ingredients...")
    for p in goods:
        price_kop = 0
        spots = p.get("spots", [])
        if spots:
            price_kop = int(float(spots[0].get("price", 0)))
        price_som = round(price_kop / 100, 2)

        data = {
            "venue_id": VENUE_ID,
            "category_id": cat_map.get(p.get("category_name")),
            "name": p.get("product_name", "?"),
            "price": price_som,
            "cost_price": round(int(float(p.get("cost", 0))) / 100, 2),
            "type": "ingredient",
            "sort_order": int(p.get("sort_order", 0)),
            "external_id": str(p.get("product_id")),
            "external_source": "poster",
        }
        r = api("POST", "products", data)
        if r: count += 1

    # C. Pure ingredients (from menu.getIngredients)
    print(f"  Importing {len(ings)} pure ingredients...")
    for ing in ings:
        data = {
            "venue_id": VENUE_ID,
            "name": ing.get("ingredient_name", "?"),
            "price": 0,
            "cost_price": round(int(float(ing.get("prime_cost", 0))) / 100, 2),
            "type": "ingredient",
            "external_id": str(ing.get("ingredient_id")),
            "external_source": "poster",
        }
        r = api("POST", "products", data)
        if r: count += 1

    print(f"  Total products imported: {count}")
    return True


# ═══════════════════════════════════════════════════════════
# PHASE 3: Recipe items (dish → ingredients)
# ═══════════════════════════════════════════════════════════
def import_recipes():
    print("\n── Phase 3: Recipe Items ──")
    menu = load_json("poster_menu.json")
    products = menu.get("response", [])

    # Get product UUIDs by external_id
    rows = api_select("products", {"venue_id": f"eq.{VENUE_ID}", "select": "id,external_id"})
    prod_map = {r["external_id"]: r["id"] for r in rows if r.get("external_id")}

    # Delete existing
    print(f"  Clearing existing recipe_items...")
    api("DELETE", "recipe_items?product_id=not.is.null")  # crude but works

    count = 0
    dishes = [p for p in products if str(p.get("type")) == "2" and p.get("ingredients")]
    print(f"  Processing {len(dishes)} dishes with recipes...")

    for dish in dishes:
        dish_uuid = prod_map.get(str(dish.get("product_id")))
        if not dish_uuid:
            continue

        for ing in dish.get("ingredients", []):
            ing_id = str(ing.get("ingredient_id"))
            ing_uuid = prod_map.get(ing_id)
            if not ing_uuid:
                continue

            brutto = float(ing.get("structure_brutto", 0))
            netto = float(ing.get("structure_netto", 0))
            qty = netto if netto > 0 else brutto
            unit = map_unit(ing.get("structure_unit"))

            data = {
                "product_id": dish_uuid,
                "ingredient_id": ing_uuid,
                "quantity": round(qty, 3),
                "unit": unit,
            }
            r = api("POST", "recipe_items", data)
            if r: count += 1

    print(f"  Imported {count} recipe items")


# ═══════════════════════════════════════════════════════════
# PHASE 4: Orders + Order Items + Payments
# ═══════════════════════════════════════════════════════════
def import_orders():
    print("\n── Phase 4: Orders & Payments ──")
    t1 = load_json("poster_transactions_p1.json")
    t2 = load_json("poster_transactions_p2.json")

    all_tx = t1.get("response", {}).get("data", []) + t2.get("response", {}).get("data", [])
    print(f"  Total transactions: {len(all_tx)}")

    # Get product UUIDs
    rows = api_select("products", {"venue_id": f"eq.{VENUE_ID}", "select": "id,external_id"})
    prod_map = {r["external_id"]: r["id"] for r in rows if r.get("external_id")}

    # Delete existing orders (cascade will delete items & payments)
    print(f"  Clearing existing orders...")
    api("DELETE", f"orders?venue_id=eq.{VENUE_ID}")

    order_count = 0
    item_count = 0
    pay_count = 0
    batch_size = 100

    for batch_start in range(0, len(all_tx), batch_size):
        batch = all_tx[batch_start:batch_start + batch_size]

        for tx in batch:
            tx_id = tx.get("transaction_id")
            date_close = tx.get("date_close", "2026-01-01 00:00:00")
            total = float(tx.get("sum", 0))

            # Create order
            order_uuid = str(uuid.uuid4())
            order_data = {
                "id": order_uuid,
                "venue_id": VENUE_ID,
                "number": str(tx_id),
                "status": "paid",
                "total_amount": total,
                "opened_at": date_close,
                "closed_at": date_close,
                "table_number": str(tx.get("table_id", "")),
            }
            r = api("POST", "orders", order_data)
            if not r:
                continue
            order_count += 1

            # Create order items
            for prod in tx.get("products", []):
                prod_id = str(prod.get("product_id"))
                prod_uuid = prod_map.get(prod_id)
                item_data = {
                    "order_id": order_uuid,
                    "product_id": prod_uuid or "00000000-0000-0000-0000-000000000010",
                    "product_name": f"product_{prod_id}",
                    "product_price": round(float(prod.get("product_sum", 0)) / max(float(prod.get("num", 1)), 1), 2),
                    "quantity": int(float(prod.get("num", 1))),
                }
                r2 = api("POST", "order_items", item_data)
                if r2:
                    item_count += 1

            # Create payments
            payed_cash = float(tx.get("payed_cash", 0))
            payed_card = float(tx.get("payed_card", 0))
            payed_cert = float(tx.get("payed_cert", 0))
            payed_bonus = float(tx.get("payed_bonus", 0))

            for method, amount in [("cash", payed_cash), ("card", payed_card), ("other", payed_cert), ("other", payed_bonus)]:
                if amount > 0:
                    pay_data = {
                        "order_id": order_uuid,
                        "venue_id": VENUE_ID,
                        "method": method,
                        "amount": amount,
                    }
                    r3 = api("POST", "payments", pay_data)
                    if r3:
                        pay_count += 1

            # Handle unpaid/comped checks
            if total == 0 and payed_cash == 0 and payed_card == 0:
                reason = {1: "Гость ушёл", 2: "За счёт заведения", 3: "Ошибка официанта"}.get(
                    int(tx.get("reason", 0)), None
                )
                if reason:
                    pay_data = {
                        "order_id": order_uuid,
                        "venue_id": VENUE_ID,
                        "method": "none",
                        "amount": 0,
                        "close_reason": reason,
                    }
                    r3 = api("POST", "payments", pay_data)
                    if r3:
                        pay_count += 1

        print(f"  Batch {batch_start//batch_size + 1}: {order_count} orders, {item_count} items, {pay_count} payments")

    print(f"  TOTAL: {order_count} orders, {item_count} order_items, {pay_count} payments")


# ═══════════════════════════════════════════════════════════
# PHASE 5: Stock items (warehouse leftovers)
# ═══════════════════════════════════════════════════════════
def import_stock():
    print("\n── Phase 5: Stock ──")
    leftovers = load_json("poster_leftovers.json")
    items = leftovers.get("response", [])

    # Get product UUIDs and warehouses
    rows = api_select("products", {"venue_id": f"eq.{VENUE_ID}", "select": "id,external_id"})
    prod_map = {r["external_id"]: r["id"] for r in rows if r.get("external_id")}

    wh_rows = api_select("warehouses", {"venue_id": f"eq.{VENUE_ID}", "select": "id,name"})
    if not wh_rows:
        print("  No warehouses found, creating default...")
        wh_data = {"venue_id": VENUE_ID, "name": "Основной склад"}
        r = api("POST", "warehouses", wh_data)
        wh_rows = api_select("warehouses", {"venue_id": f"eq.{VENUE_ID}", "select": "id,name"})

    wh_id = wh_rows[0]["id"] if wh_rows else None
    if not wh_id:
        print("  ERROR: Cannot create warehouse")
        return

    # Delete existing
    print(f"  Clearing existing stock_items...")
    api("DELETE", f"stock_items?warehouse_id=eq.{wh_id}")

    count = 0
    for item in items:
        ing_id = str(item.get("ingredient_id"))
        ing_uuid = prod_map.get(ing_id)
        if not ing_uuid:
            continue

        qty = float(item.get("ingredient_left", 0))
        unit = map_unit(item.get("ingredient_unit"))

        data = {
            "warehouse_id": wh_id,
            "product_id": ing_uuid,
            "quantity": round(qty, 3),
            "unit": unit,
        }
        r = api("POST", "stock_items", data)
        if r:
            count += 1

    print(f"  Imported {count} stock items to warehouse {wh_id}")


# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════
if __name__ == "__main__":
    phases = sys.argv[1:] if len(sys.argv) > 1 else ["all"]

    if "all" in phases or "categories" in phases:
        import_categories()
    if "all" in phases or "products" in phases:
        import_products()
    if "all" in phases or "recipes" in phases:
        import_recipes()
    if "all" in phases or "orders" in phases:
        import_orders()
    if "all" in phases or "stock" in phases:
        import_stock()

    print("\n✅ Import complete!")
