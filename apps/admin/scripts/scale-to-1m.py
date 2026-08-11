"""
Scale demo data to ~1M som/month — Alto Coffee Bishkek.
Batch-inserts orders/shifts/deliveries/write-offs via Supabase REST API.
"""
import os, json, random, time, uuid, sys, subprocess
from datetime import datetime, timedelta, timezone, date

URL = os.environ["VITE_SUPABASE_URL"]
KEY = os.environ["VITE_SUPABASE_ANON_KEY"]
VENUE = "00000000-0000-0000-0000-000000000010"
ORG = "00000000-0000-0000-0000-000000000001"

def req(method, path, body=None):
    """Make a Supabase REST API request via curl."""
    url = f"{URL}/rest/v1/{path}"
    cmd = ["curl", "-s", "-X", method, url,
           "-H", f"apikey: {KEY}",
           "-H", f"Authorization: Bearer {KEY}",
           "-H", "Content-Type: application/json",
           "-H", "Prefer: return=minimal"]
    if body:
        cmd.extend(["-d", json.dumps(body)])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  curl error (exit {result.returncode}): {result.stderr[:200]}", flush=True)
            return None
        raw = result.stdout.strip()
        if not raw:
            return True  # Empty response = success (DELETE/POST with return=minimal)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            print(f"  JSON parse error: {raw[:200]}", flush=True)
            return None
    except Exception as e:
        print(f"  API error: {e}", flush=True)
        return None

def clear_all():
    """Skip clearing — we'll add to existing data instead."""
    print("Skipping clear — adding to existing data", flush=True)

def fetch(table, columns="*", extra="", use_venue=True):
    """Fetch all rows from a table."""
    path = f"{table}?select={columns}"
    if use_venue:
        path += f"&venue_id=eq.{VENUE}"
    if extra:
        path += f"&{extra}"
    return req("GET", path) or []

# ═══ MAIN ═══
print("Fetching reference data...")
dishes = [d for d in fetch("products", "id,name,price") if d.get("price", 0) > 0]
staff = fetch("users", "id,name,role", f"organization_id=eq.{ORG}", use_venue=False)
tables = fetch("tables", "id,number")
cashiers = [s for s in staff if s.get("role") == "cashier"]
waiters = [s for s in staff]

print(f"  {len(dishes)} dishes, {len(cashiers)} cashiers, {len(tables)} tables")

if not dishes or not cashiers or not tables:
    print("ERROR: Missing reference data. Run seed first.")
    sys.exit(1)

# ═══ WEIGHTS (popularity) ═══
name_weight = {
    "Капучино": 18, "Латте": 16, "Американо": 12, "Эспрессо": 8,
    "Раф": 7, "Флэт Уайт": 5, "Моккачино": 5, "Какао": 4,
    "Чай зелёный": 4, "Чай чёрный": 3, "Круассан": 8,
    "Сэндвич с курицей": 7, "Чизкейк": 6, "Брауни": 5,
    "Панкейки": 4, "Греческий салат": 3, "Смузи": 4, "Лимонад": 5,
}

def pick_weighted(items, weight_fn):
    total = sum(weight_fn(i) for i in items)
    r = random.random() * total
    for item in items:
        r -= weight_fn(item)
        if r <= 0:
            return item
    return items[-1]

# ═══ REGENERATE EVERYTHING ═══
today = date.today()
start_date = today - timedelta(days=30)

print(f"\nClearing existing data...")
clear_all()
time.sleep(1)

print(f"\nGenerating 30 days from {start_date}...")

total_orders = 0
total_shifts = 0
order_num = 10000  # Start high to avoid conflicts with existing
shift_ids = []
all_orders = []
all_items = []
all_events = []
all_payments = []
all_shifts = []
all_cash = []

BATCH_SIZE = 100  # Insert in batches (Supabase limit ~67KB)

def flush_batches():
    """Flush accumulated batches to API. SHIFTS FIRST (FK constraint)."""
    global all_items, all_events, all_payments, all_shifts, all_cash, all_orders
    
    # 1. Shifts MUST go first — orders reference them
    if all_shifts:
        print(f"  Flushing {len(all_shifts)} shifts, {len(all_cash)} cash movements...", flush=True)
        for i in range(0, len(all_shifts), BATCH_SIZE):
            req("POST", "shifts", all_shifts[i:i+BATCH_SIZE])
        for i in range(0, len(all_cash), BATCH_SIZE):
            req("POST", "cash_movements", all_cash[i:i+BATCH_SIZE])
        all_shifts = []
        all_cash = []
    
    # 2. Orders + children (items, events, payments)
    if all_orders:
        print(f"  Flushing {len(all_orders)} orders, {len(all_items)} items, {len(all_events)} events, {len(all_payments)} payments...", flush=True)
        for i in range(0, len(all_orders), BATCH_SIZE):
            req("POST", "orders", all_orders[i:i+BATCH_SIZE])
        for i in range(0, len(all_items), BATCH_SIZE):
            req("POST", "order_items", all_items[i:i+BATCH_SIZE])
        for i in range(0, len(all_events), BATCH_SIZE):
            req("POST", "order_events", all_events[i:i+BATCH_SIZE])
        for i in range(0, len(all_payments), BATCH_SIZE):
            req("POST", "payments", all_payments[i:i+BATCH_SIZE])
        
        all_orders = []
        all_items = []
        all_events = []
        all_payments = []

for day_offset in range(30):
    day = start_date + timedelta(days=day_offset)
    is_weekend = day.weekday() >= 5
    
    # ~2.5× volume: weekday 85-140, weekend 150-220
    num_orders = random.randint(150, 220) if is_weekend else random.randint(85, 140)
    
    # ── MORNING SHIFT (08:00-16:00) ──
    shift_id = str(uuid.uuid4())
    shift_start = datetime.combine(day, datetime.min.time()) + timedelta(hours=8, minutes=random.randint(0, 14))
    shift_end = datetime.combine(day, datetime.min.time()) + timedelta(hours=16, minutes=random.randint(0, 29))
    cashier_id = random.choice(cashiers)["id"]
    shift_revenue = 0
    shift_orders = 0
    shift_cash = 0
    
    morning_orders = int(num_orders * 0.55)
    
    for _ in range(morning_orders):
        order_num += 1
        order_id = str(uuid.uuid4())
        
        # Peak hours bias
        if random.random() < 0.7:
            hour = 8 + random.randint(0, 1)
        else:
            hour = 8 + random.randint(0, 7)
        
        minute = random.randint(0, 58)
        opened = datetime.combine(day, datetime.min.time()) + timedelta(hours=hour, minutes=minute)
        closed = opened + timedelta(minutes=random.randint(10, 45))
        
        status = "cancelled" if random.random() < 0.05 else "paid"
        waiter_id = random.choice(waiters)["id"]
        table = random.choice(tables)
        
        items_count = 3 if random.random() < 0.25 else (2 if random.random() < 0.85 else 1)
        order_total = 0
        used_names = set()
        
        for _ in range(items_count):
            available = [d for d in dishes if d["name"] not in used_names]
            if not available:
                break
            dish = pick_weighted(available, lambda d: name_weight.get(d["name"], 3))
            used_names.add(dish["name"])
            price = dish["price"]
            order_total += price
            
            all_items.append({
                "order_id": order_id, "product_id": dish["id"],
                "product_name": dish["name"], "product_price": price, "quantity": 1,
            })
            all_events.append({
                "order_id": order_id, "action": "item_added",
                "product_id": dish["id"], "product_name": dish["name"],
                "quantity": 1, "unit_price": price,
                "occurred_at": opened.isoformat(), "venue_id": VENUE,
            })
        
        all_orders.append({
            "id": order_id, "venue_id": VENUE, "shift_id": shift_id,
            "waiter_id": waiter_id, "table_id": table["id"],
            "number": str(order_num), "status": status,
            "total_amount": order_total, "opened_at": opened.isoformat(),
            "closed_at": closed.isoformat(),
            "guest_count": random.randint(1, 3), "table_number": table["number"],
        })
        
        if status == "paid":
            method = "cash" if random.random() < 0.6 else "card"
            all_payments.append({
                "order_id": order_id, "shift_id": shift_id,
                "venue_id": VENUE, "method": method,
                "amount": order_total, "created_at": closed.isoformat(),
            })
            shift_revenue += order_total
            shift_orders += 1
            if method == "cash":
                shift_cash += order_total
        
        if len(all_orders) >= BATCH_SIZE:
            flush_batches()
    
    total_orders += morning_orders
    
    starting_cash = 3000 + random.randint(0, 2000)
    diff = random.randint(-500, 500) if random.random() < 0.15 else 0
    expected = starting_cash + int(shift_cash * 0.6) + diff
    
    all_shifts.append({
        "id": shift_id, "venue_id": VENUE, "cashier_id": cashier_id,
        "opened_at": shift_start.isoformat(), "closed_at": shift_end.isoformat(),
        "starting_cash": starting_cash, "total_orders": shift_orders,
        "total_revenue": shift_revenue, "cash_total": int(shift_revenue * 0.6),
        "card_total": int(shift_revenue * 0.4 + 0.99),
        "expected_cash_at_close": expected,
        "cash_difference_at_close": diff, "cash_collections_total": 0,
    })
    
    shift_ids.append(shift_id)
    
    all_cash.append({
        "venue_id": VENUE, "shift_id": shift_id,
        "movement_type": "float_in", "amount": starting_cash,
        "note": "opening_balance", "occurred_at": shift_start.isoformat(),
    })
    
    # 2-4 cash movements per shift
    for _ in range(random.randint(2, 4)):
        note = random.choice(["payment_insert", "Расход на продукты", "Курьер", "Хозтовары", "Расходники"])
        all_cash.append({
            "venue_id": VENUE, "shift_id": shift_id,
            "movement_type": "float_out",
            "amount": random.randint(200, 2200),
            "note": note,
            "occurred_at": (shift_start + timedelta(hours=random.randint(1, 6))).isoformat(),
        })
    
    # ── EVENING SHIFT (16:00-00:00) ──
    shift_id = str(uuid.uuid4())
    shift_start = datetime.combine(day, datetime.min.time()) + timedelta(hours=16, minutes=random.randint(0, 14))
    shift_end = datetime.combine(day, datetime.min.time()) + timedelta(hours=23, minutes=random.randint(0, 29))
    cashier_id = random.choice(cashiers)["id"]
    shift_revenue = 0
    shift_orders = 0
    shift_cash = 0
    
    evening_orders = num_orders - morning_orders
    
    for _ in range(evening_orders):
        order_num += 1
        order_id = str(uuid.uuid4())
        
        if random.random() < 0.7:
            hour = 16 + random.randint(0, 1)
        else:
            hour = 16 + random.randint(0, 7)
        
        minute = random.randint(0, 58)
        opened = datetime.combine(day, datetime.min.time()) + timedelta(hours=hour, minutes=minute)
        closed = opened + timedelta(minutes=random.randint(10, 45))
        
        status = "cancelled" if random.random() < 0.05 else "paid"
        waiter_id = random.choice(waiters)["id"]
        table = random.choice(tables)
        
        items_count = 3 if random.random() < 0.25 else (2 if random.random() < 0.85 else 1)
        order_total = 0
        used_names = set()
        
        for _ in range(items_count):
            available = [d for d in dishes if d["name"] not in used_names]
            if not available:
                break
            dish = pick_weighted(available, lambda d: name_weight.get(d["name"], 3))
            used_names.add(dish["name"])
            price = dish["price"]
            order_total += price
            
            all_items.append({
                "order_id": order_id, "product_id": dish["id"],
                "product_name": dish["name"], "product_price": price, "quantity": 1,
            })
            all_events.append({
                "order_id": order_id, "action": "item_added",
                "product_id": dish["id"], "product_name": dish["name"],
                "quantity": 1, "unit_price": price,
                "occurred_at": opened.isoformat(), "venue_id": VENUE,
            })
        
        all_orders.append({
            "id": order_id, "venue_id": VENUE, "shift_id": shift_id,
            "waiter_id": waiter_id, "table_id": table["id"],
            "number": str(order_num), "status": status,
            "total_amount": order_total, "opened_at": opened.isoformat(),
            "closed_at": closed.isoformat(),
            "guest_count": random.randint(1, 3), "table_number": table["number"],
        })
        
        if status == "paid":
            method = "cash" if random.random() < 0.6 else "card"
            all_payments.append({
                "order_id": order_id, "shift_id": shift_id,
                "venue_id": VENUE, "method": method,
                "amount": order_total, "created_at": closed.isoformat(),
            })
            shift_revenue += order_total
            shift_orders += 1
            if method == "cash":
                shift_cash += order_total
        
        if len(all_orders) >= BATCH_SIZE:
            flush_batches()
    
    total_orders += evening_orders
    
    starting_cash = 3000 + random.randint(0, 2000)
    diff = random.randint(-500, 500) if random.random() < 0.15 else 0
    expected = starting_cash + int(shift_cash * 0.6) + diff
    
    all_shifts.append({
        "id": shift_id, "venue_id": VENUE, "cashier_id": cashier_id,
        "opened_at": shift_start.isoformat(), "closed_at": shift_end.isoformat(),
        "starting_cash": starting_cash, "total_orders": shift_orders,
        "total_revenue": shift_revenue, "cash_total": int(shift_revenue * 0.6),
        "card_total": int(shift_revenue * 0.4 + 0.99),
        "expected_cash_at_close": expected,
        "cash_difference_at_close": diff, "cash_collections_total": 0,
    })
    
    all_cash.append({
        "venue_id": VENUE, "shift_id": shift_id,
        "movement_type": "float_in", "amount": starting_cash,
        "note": "opening_balance", "occurred_at": shift_start.isoformat(),
    })
    
    for _ in range(random.randint(2, 4)):
        note = random.choice(["payment_insert", "Расход на продукты", "Курьер", "Хозтовары", "Расходники"])
        all_cash.append({
            "venue_id": VENUE, "shift_id": shift_id,
            "movement_type": "float_out",
            "amount": random.randint(200, 2200),
            "note": note,
            "occurred_at": (shift_start + timedelta(hours=random.randint(1, 6))).isoformat(),
        })
    
    total_shifts += 2
    
    if (day_offset + 1) % 5 == 0:
        print(f"  Day {day_offset + 1}/30: {total_orders} orders so far...")

# Final flush
flush_batches()

print(f"\n✅ DONE: {total_orders} orders, {total_shifts} shifts")
print(f"   Orders batch-inserted via REST API")

# ═══ DELIVERIES & WRITE-OFFS ═══
print("\nGenerating deliveries & write-offs...")

suppliers = fetch("suppliers", "id,name")
warehouses = fetch("warehouses", "id,name")
ingredients = [i for i in fetch("products", "id,name,cost_price,unit") if i.get("price", 0) == 0 and i.get("unit")]

if suppliers and warehouses and ingredients:
    all_dels = []
    all_del_items = []
    
    for day_offset in range(0, 30, 2):  # Every 2 days
        day = start_date + timedelta(days=day_offset)
        num_dels = 2 if random.random() < 0.4 else 1
        
        for _ in range(num_dels):
            del_id = str(uuid.uuid4())
            supplier = random.choice(suppliers)
            wh = random.choice(warehouses)
            created = datetime.combine(day, datetime.min.time()) + timedelta(
                hours=random.randint(9, 14), minutes=random.randint(0, 59))
            
            del_amount = 0
            num_items = random.randint(3, 7)
            chosen = random.sample(ingredients, min(num_items, len(ingredients)))
            
            for ing in chosen:
                cost = (ing.get("cost_price") or 0) / 100
                unit = ing.get("unit", "кг")
                qty = random.randint(5, 25) if unit == "кг" else random.randint(10, 50)
                del_amount += qty * cost
                
                all_del_items.append({
                    "delivery_id": del_id, "product_id": ing["id"],
                    "name": ing["name"], "quantity": qty,
                    "unit": unit, "price": int(cost),
                })
            
            all_dels.append({
                "id": del_id, "venue_id": VENUE, "warehouse_id": wh["id"],
                "supplier": supplier["name"], "delivery_date": day.isoformat(),
                "amount": round(del_amount, 2), "status": "received",
                "created_at": created.isoformat(),
            })
    
    print(f"  Inserting {len(all_dels)} deliveries...")
    for i in range(0, len(all_dels), BATCH_SIZE):
        req("POST", "warehouse_deliveries", all_dels[i:i+BATCH_SIZE])
    for i in range(0, len(all_del_items), BATCH_SIZE):
        req("POST", "warehouse_delivery_items", all_del_items[i:i+BATCH_SIZE])
    
    # Write-offs: every 3 days
    all_wos = []
    all_wo_items = []
    
    for day_offset in range(0, 30, 3):
        day = start_date + timedelta(days=day_offset)
        wo_id = str(uuid.uuid4())
        wh = random.choice(warehouses)
        created = datetime.combine(day, datetime.min.time()) + timedelta(
            hours=random.randint(20, 23), minutes=random.randint(0, 59))
        
        num_items = random.randint(1, 3)
        chosen = random.sample(ingredients, min(num_items, len(ingredients)))
        
        for ing in chosen:
            unit = ing.get("unit", "кг")
            qty = round(random.uniform(0.1, 2.0), 2) if unit in ("кг", "л") else random.randint(1, 5)
            all_wo_items.append({
                "write_off_id": wo_id, "product_id": ing["id"],
                "name": ing["name"], "quantity": qty,
                "unit": unit,
                "reason": random.choice(["Истёк срок", "Порча", "Бой", "Просрочка", "Брак"]),
            })
        
        all_wos.append({
            "id": wo_id, "venue_id": VENUE, "warehouse_id": wh["id"],
            "reason_summary": random.choice([
                "Списание порчи", "Истекшие продукты", "Еженедельное списание",
                "Бой посуды", "Списание брака",
            ]),
            "write_off_date": day.isoformat(),
            "status": "posted", "created_at": created.isoformat(),
        })
    
    print(f"  Inserting {len(all_wos)} write-offs...")
    for i in range(0, len(all_wos), BATCH_SIZE):
        req("POST", "warehouse_write_offs", all_wos[i:i+BATCH_SIZE])
    for i in range(0, len(all_wo_items), BATCH_SIZE):
        req("POST", "warehouse_write_off_items", all_wo_items[i:i+BATCH_SIZE])

# ═══ STOCK ═══
print("\nRegenerating stock...")
all_dels = []
all_wos = []
all_stock = []
for ing in ingredients:
    wh = random.choice(warehouses)
    unit = ing.get("unit", "кг")
    qty = 0
    if unit == "кг":
        qty = random.randint(50, 150)
    elif unit == "л":
        qty = random.randint(80, 200)
    else:
        qty = random.randint(120, 300)
    all_stock.append({
        "product_id": ing["id"], "warehouse_id": wh["id"],
        "quantity": qty, "unit": unit,
    })

for i in range(0, len(all_stock), BATCH_SIZE):
    req("POST", "stock_items", all_stock[i:i+BATCH_SIZE])

# ═══ SHIFT DATES ═══
print("\nShifting dates to today...")
result = req("POST", "rpc/demo_shift_dates", {"p_venue_id": VENUE, "p_target_date": today.isoformat()})
print(f"  {result}")

print(f"\n{'='*50}")
print(f"✅ ALL DONE!")
print(f"   Orders: {total_orders}")
print(f"   Shifts: {total_shifts}")
print(f"   Deliveries: {len(all_dels)}")
print(f"   Write-offs: {len(all_wos)}")
print(f"   Stock items: {len(all_stock)}")
print(f"   Dashboard: http://localhost:5173")
