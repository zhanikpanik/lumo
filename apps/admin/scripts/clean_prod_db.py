#!/usr/bin/env python3
"""Clean production DB: remove junk, deduplicate, fix stock quantities."""
import json
import ssl
import urllib.request
import urllib.error

URL = "https://gmigxjrvypqjakvualil.supabase.co"
KEY = "sb_publishable_bNXLWbJVGS5Dp2FUPywFkQ_9Cg_mPTu"
VENUE_ID = "00000000-0000-0000-0000-000000000010"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def api(method, path, body=None):
    """Call Supabase REST API."""
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        method=method,
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        data=json.dumps(body).encode() if body else None,
    )
    try:
        with urllib.request.urlopen(req, context=CTX) as resp:
            status = resp.status
            raw = resp.read()
            if raw:
                return json.loads(raw)
            return None
    except urllib.error.HTTPError as e:
        print(f"  ERROR {e.code}: {e.read().decode()[:200]}")
        return None

def get(path):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
    )
    try:
        with urllib.request.urlopen(req, context=CTX) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  GET ERROR {e.code}: {e.read().decode()[:200]}")
        return []

# ============================================================
# STEP 1: Delete junk dish "123" and its recipe items
# ============================================================
print("\n=== STEP 1: Delete junk dish '123' ===")
junk_dish = "b3069337-38ff-49b9-884c-a6a469d3ff3c"
api("DELETE", f"recipe_items?product_id=eq.{junk_dish}")
api("DELETE", f"products?id=eq.{junk_dish}")
print("  Done")

# ============================================================
# STEP 2: Delete profanity ingredients
# ============================================================
print("\n=== STEP 2: Delete profanity ingredients ===")
profanity = [
    ("58b073fe-3995-4f87-86b5-2214c330a1da", "хуй"),
    ("cff81bf1-32ab-46e9-b966-7ea2eaf75455", "пизда"),
]
for pid, name in profanity:
    api("DELETE", f"recipe_items?ingredient_id=eq.{pid}")
    api("DELETE", f"stock_items?product_id=eq.{pid}")
    # warehouse_products may not exist
    api("DELETE", f"products?id=eq.{pid}")
    print(f"  Deleted: {name}")

# ============================================================
# STEP 3: Delete unused milk variants
# ============================================================
print("\n=== STEP 3: Delete unused milk variants ===")
unused_milk = [
    ("3efbf95f-aa66-42f4-a9f7-f491098fdc7e", "Молоко безлактозное"),
    ("9266eb71-ab1c-490f-9379-62f573e7abea", "Молоко овсяное"),
    ("d2df5382-0820-41d7-9783-b65c3c24a2dc", "Молоко соевое"),
]
for pid, name in unused_milk:
    api("DELETE", f"stock_items?product_id=eq.{pid}")
    api("DELETE", f"modifiers?ingredient_id=eq.{pid}")
    api("DELETE", f"products?id=eq.{pid}")
    print(f"  Deleted: {name}")

# ============================================================
# STEP 4: Delete duplicate ingredients (not used in recipes)
# ============================================================
print("\n=== STEP 4: Delete duplicate ingredients ===")
dupes = [
    ("ece0aabc-8396-4669-bfc0-667deb00c372", "Говядина (Бар дубль)"),
    ("1123805e-8e92-4761-8d29-af7766628afc", "Картофель (Бар дубль)"),
    ("42a904b2-eacc-41b3-8a8a-be86ad9e21b2", "Куриное филе (Бар дубль)"),
]
for pid, name in dupes:
    api("DELETE", f"stock_items?product_id=eq.{pid}")
    api("DELETE", f"products?id=eq.{pid}")
    print(f"  Deleted: {name}")

# ============================================================
# STEP 5: Reset ALL stock_items to realistic quantities
# ============================================================
print("\n=== STEP 5: Reset stock quantities ===")

# Get all stock_items
items = get("stock_items?select=id,product_id,warehouse_id")
print(f"  Found {len(items)} stock items")

# Get products and their workshops
products = get("products?select=id,name,workshop_id&type=eq.ingredient&is_active=eq.true")
prod_map = {p["id"]: p for p in products}
print(f"  Found {len(products)} active ingredients")

# Get workshop -> warehouse mapping
ws_wh_list = get("workshop_warehouses?select=workshop_id,warehouse_id")
ws_wh = {}
for w in ws_wh_list:
    ws_wh[w["workshop_id"]] = w["warehouse_id"]

# Get warehouses (fallback)
wh_list = get("warehouses?select=id,name")
default_wh = wh_list[0]["id"] if wh_list else None
print(f"  Default warehouse: {default_wh}")

# Realistic stock: name -> (qty, unit)
stock_values = {
    "47f03fc4-dcc8-4bf1-b7ff-361c97140374": (5, "кг"),    # Говядина
    "afaf71dd-c4c3-4678-8bed-a98f28e7c5a0": (10, "кг"),   # Картофель
    "a2547725-b472-49ac-afd8-fc738935c04f": (2, "кг"),    # Кофе зерновой (Кухня)
    "12feb674-5dbb-41dc-9ed0-6424e981b4b6": (1, "кг"),    # Кофе зерновой (Бар)
    "f0c8f83b-f082-4bd1-9ea4-098a7b4992b1": (5, "кг"),    # Куриное филе
    "7de0e87d-99ac-48a3-940e-98ab170c1ca0": (3, "кг"),    # Лосось
    "b091bb2b-0f2c-4f4b-80c0-70c0be8b73e3": (5, "кг"),    # Лук
    "0c741e6a-43ac-4d2a-8379-0062f4eb0191": (2, "л"),     # Масло оливковое
    "9f5dbfb8-9e1d-455f-a069-b8dc183b31b2": (2, "кг"),    # Масло сливочное
    "38be8a23-3eb4-4b57-b8b9-5c4fbca3e652": (10, "л"),    # Молоко
    "974d73e1-6d75-4aaf-9e3a-22ea07d8aa23": (3, "л"),     # Молоко кокосовое
    "c4644952-185f-4e51-b808-e062431ad346": (3, "л"),     # Молоко миндальное
    "6d02386e-9d6a-483c-9ed5-c8c198a301bd": (10, "кг"),   # Мука
    "a304667b-687b-4d06-88e4-09f1391fcc2e": (5, "кг"),    # Огурцы
    "71980a7a-4a7e-4b63-b4e4-3099d8deba8f": (1, "кг"),    # Перец чёрный
    "69567c55-6d61-4819-96a2-5232317e3ce6": (8, "кг"),    # Помидоры
    "c1fa618a-d262-4e7f-a134-7a60781d6a0e": (10, "кг"),   # Рис
    "ce2f0bf3-a8ec-40fb-bfbd-6c69e2bb558f": (3, "кг"),    # Салат романо
    "e5036157-ae0a-41f8-8ccd-d7a02f56d9b7": (5, "кг"),    # Сахар
    "b7dd6e14-21bf-48a9-8283-8a6a3f377161": (8, "кг"),    # Свинина
    "f28d89d0-9b5e-43ee-8bc4-8b78ffc1b168": (2, "кг"),    # Соль
    "1ff4b6e7-3b36-4651-9efe-aa61dca43082": (5, "кг"),    # Сыр моцарелла
    "91174e21-f369-415a-92cd-e3ac5c12229e": (3, "кг"),    # Сыр пармезан
    "81736773-8790-421e-b800-2d231fd6008d": (1, "кг"),    # Чай листовой
    "22f5a42a-f05c-49b6-9705-971905671a4a": (1, "кг"),    # Чеснок
}

# Delete ALL existing stock_items one by one
for item in items:
    api("DELETE", f"stock_items?id=eq.{item['id']}")

deleted = len(items)
print(f"  Deleted {deleted} old stock items")

# Insert fresh stock items
inserted = 0
for pid, (qty, unit) in stock_values.items():
    if pid not in prod_map:
        print(f"  SKIP: {pid[:8]} not found in products")
        continue
    
    ws_id = prod_map[pid].get("workshop_id")
    wh_id = ws_wh.get(ws_id) if ws_id else default_wh
    if not wh_id:
        print(f"  SKIP: {pid[:8]} no warehouse for workshop {ws_id}")
        continue
    
    api("POST", "stock_items", {
        "product_id": pid,
        "warehouse_id": wh_id,
        "quantity": qty,
        "unit": unit,
    })
    inserted += 1

print(f"  Inserted {inserted} fresh stock items")

# ============================================================
# VERIFY
# ============================================================
print("\n=== VERIFY ===")
products = get("products?select=id,name,type,is_active&type=eq.ingredient&is_active=eq.true")
print(f"Ingredients: {len(products)}")
for p in products:
    print(f"  {p['name']}")

dishes = get("products?select=id,name,type,is_active&type=eq.dish&is_active=eq.true")
print(f"Dishes: {len(dishes)}")

stock = get("stock_items?select=product_id,quantity,unit")
print(f"Stock items: {len(stock)}")

print("\n=== ALL DONE ===")
