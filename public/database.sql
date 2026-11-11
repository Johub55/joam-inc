-- ==============================================================================
-- WERKDONALDS POS & WERKPAY BANK - UNIFIED SUPABASE DATABASE SCHEMA
-- Geschikt voor beide servers en applicaties in Supabase / PostgreSQL.
-- Voer dit bestand uit in de Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ==============================================================================

-- 1. TABELLEN AANMAKEN
-- ------------------------------------------------------------------------------

-- 1.1 WerkPay Bankrekeningen (Server 1: WerkPay Bank)
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  card_uid TEXT UNIQUE NOT NULL,
  pin_code TEXT NOT NULL DEFAULT '1234',
  balance NUMERIC(12, 2) NOT NULL DEFAULT 25.00,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.2 WerkPay Bank Transacties
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id BIGSERIAL PRIMARY KEY,
  from_account TEXT NOT NULL,
  to_account TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  label TEXT NOT NULL,
  note TEXT,
  order_no INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.3 Werkdonalds Bestellingen (Server 2: Werkdonalds POS, Keuken KDS, Afhaal TV)
CREATE TABLE IF NOT EXISTS public.orders (
  id BIGSERIAL PRIMARY KEY,
  order_no INTEGER NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  order_type TEXT NOT NULL DEFAULT 'dine_in',
  identifier TEXT,
  notes TEXT,
  payment_method TEXT NOT NULL DEFAULT 'workpay',
  payment_meta JSONB DEFAULT '{}'::jsonb,
  cashier TEXT DEFAULT 'Kassa',
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'done', 'archived', 'cancelled'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.4 Werkdonalds Menukaart & Producten
CREATE TABLE IF NOT EXISTS public.products (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  sale_price NUMERIC(10, 2) DEFAULT 0.00,
  on_sale BOOLEAN DEFAULT FALSE,
  cat TEXT NOT NULL DEFAULT 'Burgers & Wraps',
  emoji TEXT DEFAULT '🍔',
  in_stock BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.5 Voorraad & Magazijn (Grondstoffen)
CREATE TABLE IF NOT EXISTS public.inventory (
  id BIGSERIAL PRIMARY KEY,
  item_name TEXT NOT NULL,
  stock_qty INTEGER NOT NULL DEFAULT 100,
  min_qty INTEGER NOT NULL DEFAULT 20,
  unit TEXT NOT NULL DEFAULT 'stuks',
  cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0.50,
  supplier_name TEXT DEFAULT 'HAVI Logistics',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.6 Kortingscoupons
CREATE TABLE IF NOT EXISTS public.coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_val NUMERIC(10, 2) NOT NULL,
  min_subtotal NUMERIC(10, 2) DEFAULT 0.00,
  target_product_name TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.7 Cadeaubonnen
CREATE TABLE IF NOT EXISTS public.gift_cards (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  initial_balance NUMERIC(10, 2) NOT NULL,
  current_balance NUMERIC(10, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.8 POS Medewerkers & Rechten
CREATE TABLE IF NOT EXISTS public.pos_users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  perms JSONB NOT NULL DEFAULT '["pos","kitchen","pickup"]'::jsonb,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  session_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.10 Telefoon SMS Berichten (Live Synchronisatie via Supabase)
CREATE TABLE IF NOT EXISTS public.phone_messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  target_id TEXT NOT NULL,
  text TEXT NOT NULL,
  avatar TEXT DEFAULT '📱',
  role TEXT DEFAULT 'Gebruiker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 1.9 VEILIGHEIDS- EN COMPATIBILITEITSMIGRATIES (Voor als tabellen al eerder bestonden)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS on_sale BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cat TEXT NOT NULL DEFAULT 'Burgers & Wraps';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '🍔';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT TRUE;

ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS pin_code TEXT NOT NULL DEFAULT '1234';
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS identifier TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_meta JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier TEXT DEFAULT 'Kassa';

-- 2. INDEXEN VOOR SNELHEID
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_uid ON public.bank_accounts(card_uid);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_username ON public.bank_accounts(username);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_created ON public.bank_transactions(created_at DESC);

-- 3. STORED PROCEDURES / RPC FUNCTIES (KOPPELING TUSSEN BEIDE APPS)
-- ------------------------------------------------------------------------------

-- 3.1 WerkPay Login Verificatie
CREATE OR REPLACE FUNCTION public.werkpay_check_login(p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_acc public.bank_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_acc FROM public.bank_accounts 
  WHERE LOWER(username) = LOWER(p_username) AND (password = p_password OR pin_code = p_password)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ongeldige inloggegevens');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_acc.id,
    'username', v_acc.username,
    'account_holder', v_acc.account_holder,
    'card_uid', v_acc.card_uid,
    'balance', v_acc.balance,
    'is_admin', v_acc.is_admin
  );
END;
$$;

-- 3.2 WerkPay Betaling via Login (Kassa koppeling)
CREATE OR REPLACE FUNCTION public.werkpay_charge_by_login(
  p_username TEXT,
  p_password TEXT,
  p_amount NUMERIC,
  p_reference TEXT,
  p_cashier TEXT DEFAULT 'Kassa',
  p_order_no INTEGER DEFAULT NULL,
  p_brand TEXT DEFAULT 'Werkdonalds'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_acc public.bank_accounts%ROWTYPE;
  v_new_balance NUMERIC;
  v_brand_name TEXT := 'Werkdonalds';
  v_to_merchant TEXT;
  v_tx_label TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Bedrag moet groter dan 0 zijn');
  END IF;

  -- Bepaal merk (De Koekploeg vs Werkdonalds)
  IF p_brand ILIKE '%koek%' OR p_reference ILIKE '%koek%' OR p_cashier ILIKE '%koek%' THEN
    v_brand_name := 'De Koekploeg';
  ELSE
    v_brand_name := 'Werkdonalds';
  END IF;

  v_to_merchant := v_brand_name || ' Kassa';
  v_tx_label := v_brand_name || ' Bestelling #' || COALESCE(p_order_no::text, '?');

  SELECT * INTO v_acc FROM public.bank_accounts 
  WHERE LOWER(username) = LOWER(p_username) AND (password = p_password OR pin_code = p_password)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Onjuiste gebruikersnaam of wachtwoord');
  END IF;

  IF NOT v_acc.is_admin AND v_acc.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'message', 'Onvoldoende WerkPay saldo (Huidig: €' || v_acc.balance || ')');
  END IF;

  IF NOT v_acc.is_admin THEN
    v_new_balance := v_acc.balance - p_amount;
    UPDATE public.bank_accounts SET balance = v_new_balance WHERE id = v_acc.id;
  ELSE
    v_new_balance := v_acc.balance;
  END IF;

  -- Transactie wegschrijven in WerkPay bankrekeningoverzicht
  INSERT INTO public.bank_transactions (from_account, to_account, amount, label, note, order_no)
  VALUES (v_acc.username, v_to_merchant, p_amount, v_tx_label, p_reference, p_order_no);

  RETURN jsonb_build_object(
    'success', true,
    'username', v_acc.username,
    'account_holder', v_acc.account_holder,
    'charged_amount', p_amount,
    'balance_after', v_new_balance,
    'brand', v_brand_name,
    'reference', p_reference
  );
END;
$$;

-- 3.3 WerkPay Betaling via Kaart-UID & Pincode (Digitale Pas / RFID)
CREATE OR REPLACE FUNCTION public.werkpay_charge_by_card(
  p_card_uid TEXT,
  p_pin TEXT,
  p_amount NUMERIC,
  p_reference TEXT,
  p_cashier TEXT DEFAULT 'Kassa',
  p_order_no INTEGER DEFAULT NULL,
  p_brand TEXT DEFAULT 'Werkdonalds'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_acc public.bank_accounts%ROWTYPE;
  v_clean_uid TEXT;
  v_new_balance NUMERIC;
  v_brand_name TEXT := 'Werkdonalds';
  v_to_merchant TEXT;
  v_tx_label TEXT;
BEGIN
  v_clean_uid := REPLACE(p_card_uid, ' ', '');

  IF p_brand ILIKE '%koek%' OR p_reference ILIKE '%koek%' OR p_cashier ILIKE '%koek%' THEN
    v_brand_name := 'De Koekploeg';
  ELSE
    v_brand_name := 'Werkdonalds';
  END IF;

  v_to_merchant := v_brand_name || ' Kassa';
  v_tx_label := 'Pasbetaling ' || v_brand_name || ' #' || COALESCE(p_order_no::text, '?');

  SELECT * INTO v_acc FROM public.bank_accounts 
  WHERE REPLACE(card_uid, ' ', '') = v_clean_uid AND (pin_code = p_pin OR password = p_pin)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ongeldige kaart-UID of pincode');
  END IF;

  IF NOT v_acc.is_admin AND v_acc.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'message', 'Onvoldoende saldo op deze WerkPay pas');
  END IF;

  IF NOT v_acc.is_admin THEN
    v_new_balance := v_acc.balance - p_amount;
    UPDATE public.bank_accounts SET balance = v_new_balance WHERE id = v_acc.id;
  ELSE
    v_new_balance := v_acc.balance;
  END IF;

  INSERT INTO public.bank_transactions (from_account, to_account, amount, label, note, order_no)
  VALUES (v_acc.username, v_to_merchant, p_amount, v_tx_label, p_reference, p_order_no);

  RETURN jsonb_build_object(
    'success', true,
    'username', v_acc.username,
    'account_holder', v_acc.account_holder,
    'brand', v_brand_name,
    'balance_after', v_new_balance
  );
END;
$$;

-- 3.4 AUTOMATISCHE TRIGGER VOOR REALTIME BESTELLINGEN NAAR WERKPAY BANK
CREATE OR REPLACE FUNCTION public.trg_fn_process_order_bank_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_brand_name TEXT := 'Werkdonalds';
  v_from_user TEXT;
  v_meta JSONB;
BEGIN
  IF NEW.payment_method = 'workpay' AND NEW.total > 0 THEN
    v_meta := COALESCE(NEW.payment_meta, '{}'::jsonb);
    v_from_user := COALESCE(v_meta->>'account', v_meta->>'username', NEW.cashier, 'Klant Kassa');

    IF (
      NEW.identifier ILIKE '%koekploeg%' 
      OR NEW.notes ILIKE '%koekploeg%' 
      OR v_meta->>'brand' = 'koekploeg' 
      OR NEW.cashier ILIKE '%koek%'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.items) item 
        WHERE (item->>'name') ILIKE '%stroopwafel%' 
           OR (item->>'name') ILIKE '%koek%' 
           OR (item->>'name') ILIKE '%bokkenpoot%'
      )
    ) THEN
      v_brand_name := 'De Koekploeg';
    ELSE
      v_brand_name := 'Werkdonalds';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.bank_transactions WHERE order_no = NEW.order_no) THEN
      INSERT INTO public.bank_transactions (
        from_account,
        to_account,
        amount,
        label,
        note,
        order_no
      ) VALUES (
        v_from_user,
        v_brand_name || ' Kassa',
        NEW.total,
        v_brand_name || ' Bestelling #' || NEW.order_no,
        'Realtime betaling via ' || COALESCE(v_meta->>'mode', 'WerkPay'),
        NEW.order_no
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_bank_payment ON public.orders;
CREATE TRIGGER trg_orders_bank_payment
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_process_order_bank_payment();

-- 3.4 POS Order Aanmaken
CREATE OR REPLACE FUNCTION public.create_pos_order(
  p_session_token TEXT,
  p_order JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_id BIGINT;
BEGIN
  INSERT INTO public.orders (
    order_no,
    items,
    total,
    discount,
    order_type,
    identifier,
    notes,
    payment_method,
    payment_meta,
    cashier,
    status
  ) VALUES (
    (p_order->>'order_no')::int,
    COALESCE(p_order->'items', '[]'::jsonb),
    COALESCE((p_order->>'total')::numeric, 0.00),
    COALESCE((p_order->>'discount')::numeric, 0.00),
    COALESCE(p_order->>'order_type', 'dine_in'),
    COALESCE(p_order->>'identifier', ''),
    COALESCE(p_order->>'notes', ''),
    COALESCE(p_order->>'payment_method', 'workpay'),
    COALESCE(p_order->'payment_meta', '{}'::jsonb),
    COALESCE(p_order->>'cashier', 'Kassa'),
    COALESCE(p_order->>'status', 'new')
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'order_id', v_new_id);
END;
$$;

-- 3.5 POS Medewerker Inloggen
CREATE OR REPLACE FUNCTION public.login_pos_user(p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_u public.pos_users%ROWTYPE;
  v_token TEXT;
BEGIN
  SELECT * INTO v_u FROM public.pos_users
  WHERE LOWER(username) = LOWER(p_username) AND password = p_password
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_token := 'wd_sess_' || md5(random()::text || clock_timestamp()::text);
  UPDATE public.pos_users SET session_token = v_token WHERE id = v_u.id;

  RETURN jsonb_build_object(
    'id', v_u.id,
    'name', v_u.name,
    'username', v_u.username,
    'perms', v_u.perms,
    'is_admin', v_u.is_admin,
    'session_token', v_token
  );
END;
$$;

-- 4. ROW LEVEL SECURITY (RLS) & RECHTEN (ANON & AUTHENTICATED)
-- ------------------------------------------------------------------------------
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Public full access bank_accounts" ON public.bank_accounts;
  CREATE POLICY "Public full access bank_accounts" ON public.bank_accounts FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public full access bank_transactions" ON public.bank_transactions;
  CREATE POLICY "Public full access bank_transactions" ON public.bank_transactions FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public full access orders" ON public.orders;
  CREATE POLICY "Public full access orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public full access products" ON public.products;
  CREATE POLICY "Public full access products" ON public.products FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public full access inventory" ON public.inventory;
  CREATE POLICY "Public full access inventory" ON public.inventory FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public full access coupons" ON public.coupons;
  CREATE POLICY "Public full access coupons" ON public.coupons FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public full access gift_cards" ON public.gift_cards;
  CREATE POLICY "Public full access gift_cards" ON public.gift_cards FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Public full access pos_users" ON public.pos_users;
  CREATE POLICY "Public full access pos_users" ON public.pos_users FOR ALL USING (true) WITH CHECK (true);
END $$;


-- 4.2 Rechten toekennen aan anon (publiek) en authenticated rollen (Supabase API)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- 5. REALTIME AANZETTEN (LIVE SYNCHRONISATIE TUSSEN KASSA, KEUKEN, TELEFOON, USERS EN WERKPAY)
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.bank_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.bank_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.pos_users REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.inventory REPLICA IDENTITY FULL;
ALTER TABLE public.cash_requests REPLICA IDENTITY FULL;
ALTER TABLE public.phone_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_transactions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_users; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.products; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.phone_messages; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_requests; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 6. STANDAARD DEMO DATA
-- ------------------------------------------------------------------------------

-- 6.1 WerkPay Accounts
INSERT INTO public.bank_accounts (username, password, account_holder, card_uid, pin_code, balance, is_admin)
VALUES 
  ('joas', 'admin123', 'Joas Thorig', '4129 8831 5504 9012', '0000', 999999.00, TRUE)
ON CONFLICT (username) DO UPDATE SET
  password = EXCLUDED.password,
  account_holder = EXCLUDED.account_holder,
  card_uid = EXCLUDED.card_uid,
  pin_code = EXCLUDED.pin_code,
  balance = EXCLUDED.balance,
  is_admin = EXCLUDED.is_admin;

-- 6.2 POS Medewerkers
INSERT INTO public.pos_users (name, username, password, perms, is_admin)
VALUES 
  ('Joas Thorig', 'joas', 'admin123', '["pos","cash_pay","kitchen","pickup","inventory","manager","users","products","coupons","orders_manage","reset"]'::jsonb, TRUE),
  ('Kassa Medewerker', 'kassa1', '1234', '["pos","cash_pay","kitchen","pickup"]'::jsonb, FALSE),
  ('Keuken Chef', 'keuken1', '1234', '["kitchen"]'::jsonb, FALSE)
ON CONFLICT (username) DO UPDATE SET
  password = EXCLUDED.password,
  perms = EXCLUDED.perms,
  is_admin = EXCLUDED.is_admin;

-- 6.3 Cadeaubonnen
INSERT INTO public.gift_cards (code, initial_balance, current_balance, is_active)
VALUES
  ('WERK10', 10.00, 10.00, TRUE),
  ('WERK25', 25.00, 25.00, TRUE),
  ('WERK50', 50.00, 50.00, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 6.4 Coupons
INSERT INTO public.coupons (code, discount_type, discount_val, min_subtotal, is_active)
VALUES
  ('WERKBURGER50', 'percent', 50.00, 0.00, TRUE),
  ('WERKBLAUW20', 'percent', 20.00, 0.00, TRUE),
  ('WELKOM10', 'percent', 10.00, 0.00, TRUE),
  ('FAMILIE5', 'fixed', 5.00, 20.00, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 6.5 Voorraad
INSERT INTO public.inventory (item_name, stock_qty, min_qty, unit, cost_price, supplier_name)
VALUES
  ('🍔 Burger Broodjes (Sesam)', 150, 30, 'stuks', 0.35, 'Bakkerij Bakkersland'),
  ('🥩 100% Rundvlees Patties', 120, 25, 'stuks', 0.65, 'Vleesbedrijf Van Loon'),
  ('🍗 Krokante Kip Patties', 80, 20, 'stuks', 0.55, 'Pluimvee Verbeek'),
  ('🍟 Franse Friet (Dozen 10kg)', 25, 5, 'dozen', 4.50, 'Aviko Potato'),
  ('🧀 Cheddar Kaas Plakjes', 200, 40, 'stuks', 0.15, 'FrieslandCampina'),
  ('🥤 Coca-Cola Siroop (Tanks)', 10, 2, 'stuks', 18.50, 'Coca-Cola Europacific'),
  ('🎁 Happy Meal Speeltjes', 100, 20, 'stuks', 0.80, 'Toy Logistics Europe')
ON CONFLICT DO NOTHING;

-- 6.6 Werkdonalds Menukaart (Alle 138 Werkdonalds Producten - Geen McCafé, Alles "Werk")
-- Bevat alle 8 categorieën en alle 138 officiële Werkdonalds artikelen.
INSERT INTO public.products (id, name, price, sale_price, on_sale, cat, emoji, in_stock)
VALUES
  (0, '✨ Bouw je Eigen WerkBurger', 6.95, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (1, 'WerkPay Classic Burger', 6.25, 3.95, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (2, 'Double WerkBurger', 8.25, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (3, 'Triple WerkBurger Extra Beef', 9.45, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (4, 'Giga WerkBurger 4-Dubbel', 10.95, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (5, 'WerkTasty Bacon & Cheese', 7.65, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (6, 'Double WerkTasty Bacon', 9.15, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (7, 'WerkPounder Royal', 6.45, 4.25, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (8, 'Double WerkPounder Royal', 7.95, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (9, 'BBQ WerkRib Burger', 6.75, 0.00, FALSE, 'Burgers & Wraps', '🥩', TRUE),
  (10, 'WerkChicken', 5.95, 3.50, FALSE, 'Burgers & Wraps', '🍗', TRUE),
  (11, 'Spicy WerkChicken', 6.15, 0.00, FALSE, 'Burgers & Wraps', '🌶️', TRUE),
  (12, 'Crispy WerkChicken Deluxe', 6.95, 0.00, FALSE, 'Burgers & Wraps', '🍗', TRUE),
  (13, 'WerkChicken Mozzarella & Bacon', 7.45, 0.00, FALSE, 'Burgers & Wraps', '🍗', TRUE),
  (14, 'WerkFish Burger Krokant', 5.45, 0.00, FALSE, 'Burgers & Wraps', '🐟', TRUE),
  (15, 'Double WerkFish Deluxe', 6.95, 0.00, FALSE, 'Burgers & Wraps', '🐟', TRUE),
  (16, 'WerkKroket Burger', 4.25, 2.50, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (17, 'Double WerkKroket Speciaal', 5.75, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (18, 'Cheeseburger', 2.50, 0.00, FALSE, 'Burgers & Wraps', '🧀', TRUE),
  (19, 'Double Cheeseburger', 4.25, 0.00, FALSE, 'Burgers & Wraps', '🧀', TRUE),
  (20, 'Triple Cheeseburger', 5.45, 0.00, FALSE, 'Burgers & Wraps', '🧀', TRUE),
  (21, 'Hamburger', 2.10, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (22, 'WerkPlant Vegan Burger', 6.35, 0.00, FALSE, 'Burgers & Wraps', '🌱', TRUE),
  (23, 'Double WerkPlant Vegan', 7.85, 0.00, FALSE, 'Burgers & Wraps', '🌱', TRUE),
  (24, 'WerkMaster Angus Beef Burger', 8.50, 0.00, FALSE, 'Burgers & Wraps', '🍔', TRUE),
  (25, 'WerkBacon Cheese Deluxe', 6.85, 0.00, FALSE, 'Burgers & Wraps', '🥓', TRUE),
  (26, 'WerkCrispy Onion BBQ Burger', 7.20, 0.00, FALSE, 'Burgers & Wraps', '🧅', TRUE),
  (27, 'WerkTruffel & Parmezaan Burger', 7.95, 0.00, FALSE, 'Burgers & Wraps', '🍄', TRUE),
  (28, 'WerkJalapeño Smash Burger', 6.95, 0.00, FALSE, 'Burgers & Wraps', '🌶️', TRUE),
  (29, 'WerkBoerenburger met Ei & Spek', 7.50, 0.00, FALSE, 'Burgers & Wraps', '🍳', TRUE),
  (30, 'Chili Cheese WerkBurger', 5.95, 0.00, FALSE, 'Burgers & Wraps', '🧀', TRUE),
  (31, 'Crispy WerkWrap Honing-Mosterd', 6.45, 0.00, FALSE, 'Burgers & Wraps', '🌯', TRUE),
  (32, 'Crispy WerkWrap Sweet Chili', 6.45, 0.00, FALSE, 'Burgers & Wraps', '🌯', TRUE),
  (33, 'Spicy WerkWrap Jalapeño', 6.65, 0.00, FALSE, 'Burgers & Wraps', '🌯', TRUE),
  (34, 'WerkWrap Truffel Kip', 6.95, 0.00, FALSE, 'Burgers & Wraps', '🌯', TRUE),
  (35, 'Veggie WerkWrap Avocado', 6.45, 0.00, FALSE, 'Burgers & Wraps', '🥑', TRUE),
  (36, '4 WerkNuggets', 3.95, 0.00, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (37, '6 WerkNuggets', 5.35, 3.25, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (38, '9 WerkNuggets', 6.95, 0.00, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (39, '12 WerkNuggets Portie', 8.45, 0.00, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (40, '20 WerkNuggets Deelbox', 11.95, 8.95, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (41, '40 WerkNuggets Party Bucket', 21.50, 17.50, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (42, '6 Spicy WerkNuggets', 5.65, 0.00, FALSE, 'Chicken & Snacks', '🌶️', TRUE),
  (43, '9 Spicy WerkNuggets', 7.25, 0.00, FALSE, 'Chicken & Snacks', '🌶️', TRUE),
  (44, '20 Spicy WerkNuggets Deelbox', 12.95, 0.00, FALSE, 'Chicken & Snacks', '🌶️', TRUE),
  (45, 'WerkFamily ShareBox (20 Nuggets + 6 Tenders)', 17.50, 14.50, FALSE, 'Chicken & Snacks', '🎁', TRUE),
  (46, 'Crispy WerkTenders 3st', 5.75, 0.00, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (47, 'Crispy WerkTenders 5st', 8.25, 0.00, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (48, 'Crispy WerkTenders Box 8st', 11.25, 0.00, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (49, 'Crispy WerkTenders Deelbox 12st', 15.95, 0.00, FALSE, 'Chicken & Snacks', '🍗', TRUE),
  (50, 'WerkKaas Tops (Chili Cheese) 6st', 4.25, 2.95, FALSE, 'Chicken & Snacks', '🧀', TRUE),
  (51, 'WerkKaas Tops (Chili Cheese) 9st', 5.95, 0.00, FALSE, 'Chicken & Snacks', '🧀', TRUE),
  (52, 'WerkKaas Tops Emmer 15st', 8.95, 0.00, FALSE, 'Chicken & Snacks', '🧀', TRUE),
  (53, 'Mozzarella WerkSticks 4st', 3.95, 0.00, FALSE, 'Chicken & Snacks', '🧀', TRUE),
  (54, 'Mozzarella WerkSticks 8st', 6.75, 0.00, FALSE, 'Chicken & Snacks', '🧀', TRUE),
  (55, 'Hot WerkWings 5st', 5.85, 0.00, FALSE, 'Chicken & Snacks', '🌶️', TRUE),
  (56, 'Hot WerkWings 8st', 8.75, 0.00, FALSE, 'Chicken & Snacks', '🌶️', TRUE),
  (57, 'Hot WerkWings Bucket 15st', 14.50, 0.00, FALSE, 'Chicken & Snacks', '🌶️', TRUE),
  (58, 'WerkBitterballen Kalfsvlees 6st', 4.45, 0.00, FALSE, 'Chicken & Snacks', '🧆', TRUE),
  (59, 'WerkKip Popcorn Beker', 4.25, 0.00, FALSE, 'Chicken & Snacks', '🍿', TRUE),
  (60, 'Krokante Uienringen 8st', 3.95, 0.00, FALSE, 'Chicken & Snacks', '🧅', TRUE),
  (61, 'Krokante Kaasstengels 6st', 4.35, 0.00, FALSE, 'Chicken & Snacks', '🧀', TRUE),
  (62, 'Kleine Franse WerkFriet', 2.85, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (63, 'Medium Franse WerkFriet', 3.65, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (64, 'Grote Franse WerkFriet', 4.15, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (65, 'Twister WerkFriet (Krulfriet) Medium', 4.25, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (66, 'Twister WerkFriet (Krulfriet) Groot', 4.85, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (67, 'Zoete Aardappel WerkFriet', 4.75, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (68, 'WerkFriet Oorlog (Saté + Mayo + Ui)', 4.65, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (69, 'WerkFriet Truffel & Parmezaan', 4.95, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (70, 'Loaded WerkFriet Cheddar & Bacon', 5.65, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (71, 'Loaded WerkFriet Pulled Chicken BBQ', 5.95, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (72, 'Boeren WerkFriet Mayo & Bieslook', 4.45, 0.00, FALSE, 'Friet & Sides', '🍟', TRUE),
  (73, 'WerkSalade Krokante Kip', 5.95, 0.00, FALSE, 'Friet & Sides', '🥗', TRUE),
  (74, 'WerkSalade Caesar & Kaas', 5.75, 0.00, FALSE, 'Friet & Sides', '🥗', TRUE),
  (75, 'Frisse Side Salad', 3.25, 0.00, FALSE, 'Friet & Sides', '🥗', TRUE),
  (76, 'Appelpartjes Fris & Knapperig', 2.10, 0.00, FALSE, 'Friet & Sides', '🍏', TRUE),
  (77, 'Coca-Cola Zero', 3.35, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🥤', TRUE),
  (78, 'Coca-Cola Regular', 3.35, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🥤', TRUE),
  (79, 'Fanta Orange', 3.35, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🥤', TRUE),
  (80, 'Fanta Cassis', 3.35, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍇', TRUE),
  (81, 'Sprite Zero', 3.35, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🥤', TRUE),
  (82, 'Fuze Tea Sparkling Black', 3.35, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🥤', TRUE),
  (83, 'Fuze Tea Green Tea', 3.35, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🥤', TRUE),
  (84, 'Fuze Tea Mango Chamomile', 3.45, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🥤', TRUE),
  (85, 'Fernandes Rood (Cherry Bouquet)', 3.25, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍒', TRUE),
  (86, 'Fernandes Groen (Green Punch)', 3.25, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍈', TRUE),
  (87, 'Spa Blauw Mineraalwater', 2.95, 0.00, FALSE, 'Koude Dranken & WerkShakes', '💧', TRUE),
  (88, 'Spa Rood Bruiswater', 2.95, 0.00, FALSE, 'Koude Dranken & WerkShakes', '💧', TRUE),
  (89, 'Verse Gekoelde Jus d''Orange', 3.75, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍊', TRUE),
  (90, 'Chocomel Koud & Romig', 3.25, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍫', TRUE),
  (91, 'Fristi Rood Fruit', 3.25, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍓', TRUE),
  (92, 'WerkShake Aardbei', 4.10, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍓', TRUE),
  (93, 'WerkShake Chocolade', 4.10, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍫', TRUE),
  (94, 'WerkShake Vanille', 4.10, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🥛', TRUE),
  (95, 'WerkShake Banaan', 4.10, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍌', TRUE),
  (96, 'WerkShake Karamel Zeezout', 4.35, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍮', TRUE),
  (97, 'WerkShake Mango Passievrucht', 4.35, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🥭', TRUE),
  (98, 'WerkShake Oreo Cookies & Cream', 4.50, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🍪', TRUE),
  (99, 'WerkShake Witte Chocolade & Bosbes', 4.50, 0.00, FALSE, 'Koude Dranken & WerkShakes', '🫐', TRUE),
  (100, 'WerkFlurry Oreo', 4.35, 2.95, FALSE, 'Desserts & IJs', '🍨', TRUE),
  (101, 'WerkFlurry M&M''s Choco', 4.35, 0.00, FALSE, 'Desserts & IJs', '🍦', TRUE),
  (102, 'WerkFlurry Biscoff Lotus', 4.50, 0.00, FALSE, 'Desserts & IJs', '🍪', TRUE),
  (103, 'WerkFlurry Stroopwafel & Kaneel', 4.50, 0.00, FALSE, 'Desserts & IJs', '🧇', TRUE),
  (104, 'WerkFlurry Karamel Crunch', 4.50, 0.00, FALSE, 'Desserts & IJs', '🍮', TRUE),
  (105, 'WerkFlurry Witte Choco & Framboos', 4.60, 0.00, FALSE, 'Desserts & IJs', '🍓', TRUE),
  (106, 'WerkFlurry Smarties Kleurenfeest', 4.40, 0.00, FALSE, 'Desserts & IJs', '🍬', TRUE),
  (107, 'WerkFlurry Pistache & Witte Chocolade', 4.75, 0.00, FALSE, 'Desserts & IJs', '🥜', TRUE),
  (108, 'WerkSundae Aardbeiensaus', 3.60, 0.00, FALSE, 'Desserts & IJs', '🍓', TRUE),
  (109, 'WerkSundae Warme Chocoladesaus', 3.60, 0.00, FALSE, 'Desserts & IJs', '🍫', TRUE),
  (110, 'WerkSundae Warme Karamelsaus', 3.60, 0.00, FALSE, 'Desserts & IJs', '🍮', TRUE),
  (111, 'WerkSundae Pistache Crunch', 3.85, 0.00, FALSE, 'Desserts & IJs', '🥜', TRUE),
  (112, 'Warme Werk Apple Pie', 2.20, 1.50, FALSE, 'Desserts & IJs', '🥧', TRUE),
  (113, 'Warme Werk Choco Pie', 2.40, 0.00, FALSE, 'Desserts & IJs', '🍫', TRUE),
  (114, 'Warme Werk Kersen Pie', 2.40, 0.00, FALSE, 'Desserts & IJs', '🍒', TRUE),
  (115, 'Werk Softijs Hoorntje', 1.95, 0.00, FALSE, 'Desserts & IJs', '🍦', TRUE),
  (116, 'Werk Softijs Dip Chocolade', 2.35, 0.00, FALSE, 'Desserts & IJs', '🍦', TRUE),
  (117, 'WerkDonut Roze Glazuur', 2.25, 0.00, FALSE, 'Desserts & IJs', '🍩', TRUE),
  (118, 'WerkDonut Choco Hazelnoot', 2.45, 0.00, FALSE, 'Desserts & IJs', '🍩', TRUE),
  (119, 'WerkMeal Hamburger Menu', 5.95, 0.00, FALSE, 'WerkMeal Kids', '🎁', TRUE),
  (120, 'WerkMeal Cheeseburger Menu', 5.95, 0.00, FALSE, 'WerkMeal Kids', '🎁', TRUE),
  (121, 'WerkMeal 4 WerkNuggets Menu', 5.95, 0.00, FALSE, 'WerkMeal Kids', '🎁', TRUE),
  (122, 'WerkMeal Krokante Kip Burger Menu', 5.95, 0.00, FALSE, 'WerkMeal Kids', '🎁', TRUE),
  (123, 'WerkMeal Mini WerkWrap Menu', 5.95, 0.00, FALSE, 'WerkMeal Kids', '🎁', TRUE),
  (124, 'WerkMeal Visburger Menu', 5.95, 0.00, FALSE, 'WerkMeal Kids', '🎁', TRUE),
  (125, 'WerkMeal Mini Pannenkoekjes (6st)', 5.95, 0.00, FALSE, 'WerkMeal Kids', '🥞', TRUE),
  (126, 'WerkFritessaus Romig', 0.80, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (127, 'Echte Zaanse Mayonaise', 0.80, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (128, 'WerkSaus Signature Dip', 0.90, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (129, 'Zoetzure Saus', 0.80, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (130, 'Smokey Barbecue Saus', 0.80, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (131, 'Curry Gewürz Saus', 0.80, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (132, 'WerkChili Sweet & Hot Saus', 0.85, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (133, 'Honing-Mosterd Dip', 0.85, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (134, 'Truffel Mayonaise Dip', 0.95, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (135, 'Samurai Pittige Saus', 0.85, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (136, 'Knoflook-Kruiden Saus', 0.85, 0.00, FALSE, 'Sauzen & WerkDips', '🥫', TRUE),
  (137, 'Warme Satésaus', 1.10, 0.00, FALSE, 'Sauzen & WerkDips', '🥜', TRUE)
ON CONFLICT (id) DO NOTHING;
