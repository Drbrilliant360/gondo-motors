-- Gondo Motors — initial schema (Neon / Postgres 15+)
-- Money is always whole Tanzanian shillings stored as BIGINT. Nothing here stores card or mobile-money credentials.
-- Status columns use TEXT + CHECK (easier to extend in a later migration than ENUM types).

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                    BIGSERIAL PRIMARY KEY,
  role                  TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  name                  TEXT        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  email                 CITEXT      NOT NULL UNIQUE,
  phone                 TEXT,
  password_hash         TEXT        NOT NULL,                 -- bcrypt
  must_change_password  BOOLEAN     NOT NULL DEFAULT FALSE,   -- TRUE for the seeded admin and admin-created accounts
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at         TIMESTAMPTZ,
  created_by            BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_resets (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,                    -- SHA-256 of the emailed token; the raw token is never stored
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);

-- connect-pg-simple session store (its required shape)
CREATE TABLE "session" (
  sid     VARCHAR      NOT NULL PRIMARY KEY,
  sess    JSON         NOT NULL,
  expire  TIMESTAMP(6) NOT NULL
);
CREATE INDEX session_expire_idx ON "session" (expire);

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------
CREATE TABLE vehicles (
  id            BIGSERIAL PRIMARY KEY,                        -- existing listing ids are kept on import
  stock_no      TEXT        NOT NULL UNIQUE,
  slug          TEXT        NOT NULL UNIQUE,                  -- /car/<slug>.html, same URLs as today
  make          TEXT        NOT NULL,
  model         TEXT        NOT NULL,
  year          SMALLINT    CHECK (year BETWEEN 1950 AND 2100),
  body_style    TEXT        NOT NULL,
  model_code    TEXT,                                         -- e.g. AT211 (shown today as "Chassis code")
  mileage_km    INTEGER     CHECK (mileage_km >= 0),
  colour        TEXT,
  colour_hex    TEXT        CHECK (colour_hex ~ '^#[0-9a-fA-F]{6}$'),
  price_tzs     BIGINT      CHECK (price_tzs > 0),            -- NULL = "Price on request" (85 of today's 99 listings)
  source        TEXT        NOT NULL DEFAULT 'japan_auction' CHECK (source IN ('japan_auction', 'local')),
  auction_house TEXT,
  auction_date  DATE,
  status        TEXT        NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'in_transit', 'sold')),
  featured      BOOLEAN     NOT NULL DEFAULT FALSE,
  description   TEXT,
  sold_at       TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,                                  -- soft delete: vehicles on past orders must stay readable
  created_by    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicles_listing_idx ON vehicles (status, make, body_style) WHERE deleted_at IS NULL;
CREATE INDEX vehicles_price_idx   ON vehicles (price_tzs)                WHERE deleted_at IS NULL;

CREATE TABLE vehicle_photos (
  id          BIGSERIAL PRIMARY KEY,
  vehicle_id  BIGINT      NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL,                           -- Cloudinary URL, or /assets/img/cars/... for the imported photos
  thumb_url   TEXT        NOT NULL,
  public_id   TEXT,                                           -- Cloudinary id (NULL for imported local photos), needed to delete
  position    SMALLINT    NOT NULL DEFAULT 0,
  is_cover    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX        vehicle_photos_vehicle_idx ON vehicle_photos (vehicle_id, position);
CREATE UNIQUE INDEX vehicle_photos_cover_uq    ON vehicle_photos (vehicle_id) WHERE is_cover;

-- ---------------------------------------------------------------------------
-- Customer-side lists
-- ---------------------------------------------------------------------------
CREATE TABLE cart_items (                                     -- the "order list"
  user_id     BIGINT      NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  vehicle_id  BIGINT      NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, vehicle_id)
);

CREATE TABLE saved_cars (
  user_id     BIGINT      NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  vehicle_id  BIGINT      NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, vehicle_id)
);

CREATE TABLE saved_comparisons (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  vehicle_ids  BIGINT[]    NOT NULL CHECK (cardinality(vehicle_ids) BETWEEN 2 AND 3),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX saved_comparisons_user_idx ON saved_comparisons (user_id);

-- ---------------------------------------------------------------------------
-- Clients (created when an order is confirmed, or by hand for phone / walk-in customers)
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      UNIQUE REFERENCES users(id) ON DELETE SET NULL,  -- NULL for customers without a website account
  name        TEXT        NOT NULL,
  phone       TEXT,
  email       CITEXT,
  region      TEXT,
  address     TEXT,
  notes       TEXT,
  created_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_name_idx ON clients (lower(name));

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
-- Gapless yearly numbering for GM-2026-00042 (orders) and RC-2026-00017 (receipts).
-- Incremented with UPDATE ... RETURNING inside the same transaction that inserts the row.
CREATE TABLE counters (
  key    TEXT     NOT NULL,
  year   SMALLINT NOT NULL,
  value  INTEGER  NOT NULL DEFAULT 0,
  PRIMARY KEY (key, year)
);

CREATE TABLE orders (
  id                  BIGSERIAL PRIMARY KEY,
  ref                 TEXT        NOT NULL UNIQUE,            -- GM-YYYY-NNNNN
  user_id             BIGINT      REFERENCES users(id)   ON DELETE SET NULL,  -- NULL for manual sales
  client_id           BIGINT      REFERENCES clients(id) ON DELETE RESTRICT,  -- set on confirmation
  channel             TEXT        NOT NULL DEFAULT 'website' CHECK (channel IN ('website', 'whatsapp', 'phone', 'walk_in')),
  -- one lifecycle column: pending -> confirmed -> (bid_won -> shipped -> at_port -> clearance ->) ready -> delivered, or cancelled
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'bid_won', 'shipped', 'at_port', 'clearance', 'ready', 'delivered', 'cancelled')),
  -- customer details as they were when the order was placed (the WhatsApp text can be edited; this cannot)
  customer_name       TEXT        NOT NULL,
  customer_phone      TEXT,
  customer_email      CITEXT,
  customer_note       TEXT,
  whatsapp_message    TEXT,                                   -- exact message generated for wa.me
  cancel_reason       TEXT,
  confirmed_at        TIMESTAMPTZ,
  confirmed_by        BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at        TIMESTAMPTZ,
  -- purchase details
  balance_due_date    DATE,                                   -- drives "overdue balances" on the dashboard
  delivery_region     TEXT,
  delivery_address    TEXT,
  expected_delivery   DATE,
  actual_delivery     DATE,
  vessel              TEXT,
  bill_of_lading_no   TEXT,
  shipping_eta        DATE,
  internal_notes      TEXT,                                   -- never sent to the customer
  created_by          BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL),
  CHECK (status IN ('pending', 'cancelled') OR client_id IS NOT NULL)
);
CREATE INDEX orders_user_idx    ON orders (user_id, created_at DESC);
CREATE INDEX orders_client_idx  ON orders (client_id);
CREATE INDEX orders_status_idx  ON orders (status, created_at DESC);

CREATE TABLE order_items (
  id                BIGSERIAL PRIMARY KEY,
  order_id          BIGINT   NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
  vehicle_id        BIGINT   NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  -- snapshot of the listing at order time, so later edits to the vehicle don't rewrite history
  title             TEXT     NOT NULL,                         -- "Subaru Forester 2019 — SUV"
  stock_no          TEXT     NOT NULL,
  mileage_km        INTEGER,
  colour            TEXT,
  listed_price_tzs  BIGINT   CHECK (listed_price_tzs > 0),     -- NULL when the car was "Price on request"
  agreed_price_tzs  BIGINT   CHECK (agreed_price_tzs > 0),     -- set by the admin after negotiation
  -- per-vehicle purchase details (an order can hold several cars, so these live on the item)
  vin               TEXT,
  engine_no         TEXT,
  registration_no   TEXT,
  UNIQUE (order_id, vehicle_id)
);
CREATE INDEX order_items_vehicle_idx ON order_items (vehicle_id);

CREATE TABLE order_costs (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL CHECK (kind IN ('shipping', 'port_clearance', 'tra_duty', 'registration', 'delivery', 'other')),
  label       TEXT,
  amount_tzs  BIGINT      NOT NULL CHECK (amount_tzs > 0),
  created_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_costs_order_idx ON order_costs (order_id);

CREATE TABLE order_status_history (
  id           BIGSERIAL PRIMARY KEY,
  order_id     BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT        NOT NULL,
  note         TEXT,
  changed_by   BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, created_at);

CREATE TABLE order_documents (
  id                   BIGSERIAL PRIMARY KEY,
  order_id             BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind                 TEXT        NOT NULL CHECK (kind IN ('invoice', 'export_certificate', 'bill_of_lading', 'tra_document', 'registration_card', 'other')),
  filename             TEXT        NOT NULL,
  -- Stored as a Cloudinary "authenticated" asset: no public URL exists. The server checks the session,
  -- then issues a short-lived signed URL, so documents are neither listable nor guessable.
  cloud_public_id      TEXT        NOT NULL,
  cloud_resource_type  TEXT        NOT NULL DEFAULT 'image',
  visible_to_customer  BOOLEAN     NOT NULL DEFAULT FALSE,
  uploaded_by          BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_documents_order_idx ON order_documents (order_id);

-- ---------------------------------------------------------------------------
-- Payments (recorded by an admin after money arrives offline)
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id                     BIGSERIAL PRIMARY KEY,
  receipt_no             TEXT        NOT NULL UNIQUE,         -- RC-YYYY-NNNNN
  order_id               BIGINT      NOT NULL REFERENCES orders(id)  ON DELETE RESTRICT,
  client_id              BIGINT      NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  amount_tzs             BIGINT      NOT NULL CHECK (amount_tzs > 0),
  received_on            DATE        NOT NULL,
  method                 TEXT        NOT NULL CHECK (method IN ('bank_transfer', 'mpesa', 'tigo_pesa', 'airtel_money', 'cash', 'cheque', 'other')),
  reference              TEXT,                                -- bank / mobile-money transaction number
  paid_by                TEXT        NOT NULL,
  received_by            BIGINT      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- the admin, set by the server
  proof_public_id        TEXT,                                -- private Cloudinary asset, same access rule as order_documents
  proof_resource_type    TEXT,
  notes                  TEXT,
  overpayment_confirmed  BOOLEAN     NOT NULL DEFAULT FALSE,
  voided_at              TIMESTAMPTZ,
  voided_by              BIGINT      REFERENCES users(id) ON DELETE RESTRICT,
  void_reason            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL)),
  CHECK ((voided_at IS NULL) = (voided_by IS NULL))
);
CREATE INDEX payments_order_idx    ON payments (order_id);
CREATE INDEX payments_client_idx   ON payments (client_id);
CREATE INDEX payments_received_idx ON payments (received_on DESC);

-- Payments are a ledger: rows can be voided but never deleted, and the money fields never change.
CREATE FUNCTION payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payments cannot be deleted; void the payment instead';
  END IF;
  IF NEW.amount_tzs <> OLD.amount_tzs OR NEW.order_id <> OLD.order_id OR NEW.client_id <> OLD.client_id
     OR NEW.receipt_no <> OLD.receipt_no OR NEW.received_by <> OLD.received_by THEN
    RAISE EXCEPTION 'Payment amount, order, client, receipt number and receiver cannot be changed; void and re-enter';
  END IF;
  IF OLD.voided_at IS NOT NULL AND NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
    RAISE EXCEPTION 'A voided payment cannot be restored';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION payments_guard();

-- Totals and payment status are always derived, never typed in.
--   vehicles_total = agreed price where set, otherwise the listed price
--   grand_total    = vehicles_total + extra costs
--   payment_status = unpaid | deposit_paid (one payment, balance left) | partially_paid (2+ payments, balance left) | fully_paid
CREATE VIEW order_totals AS
SELECT o.id AS order_id,
       i.listed_total_tzs,
       i.vehicles_total_tzs,
       i.unpriced_items,
       c.extras_total_tzs,
       i.vehicles_total_tzs + c.extras_total_tzs                      AS grand_total_tzs,
       p.paid_tzs,
       p.payment_count,
       p.last_payment_on,
       i.vehicles_total_tzs + c.extras_total_tzs - p.paid_tzs         AS balance_tzs,
       CASE
         WHEN p.paid_tzs = 0 THEN 'unpaid'
         WHEN i.unpriced_items = 0 AND p.paid_tzs >= i.vehicles_total_tzs + c.extras_total_tzs THEN 'fully_paid'
         WHEN p.payment_count = 1 THEN 'deposit_paid'
         ELSE 'partially_paid'
       END AS payment_status
FROM orders o
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(listed_price_tzs), 0)::BIGINT                             AS listed_total_tzs,
         COALESCE(SUM(COALESCE(agreed_price_tzs, listed_price_tzs)), 0)::BIGINT AS vehicles_total_tzs,
         COUNT(*) FILTER (WHERE COALESCE(agreed_price_tzs, listed_price_tzs) IS NULL) AS unpriced_items
  FROM order_items WHERE order_id = o.id
) i
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(amount_tzs), 0)::BIGINT AS extras_total_tzs FROM order_costs WHERE order_id = o.id
) c
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(amount_tzs), 0)::BIGINT AS paid_tzs, COUNT(*) AS payment_count, MAX(received_on) AS last_payment_on
  FROM payments WHERE order_id = o.id AND voided_at IS NULL
) p;

-- ---------------------------------------------------------------------------
-- Enquiries and "Ask us to find your car" requests
-- ---------------------------------------------------------------------------
CREATE TABLE enquiries (
  id            BIGSERIAL PRIMARY KEY,
  type          TEXT        NOT NULL CHECK (type IN ('contact', 'car_request')),
  user_id       BIGINT      REFERENCES users(id)    ON DELETE SET NULL,
  vehicle_id    BIGINT      REFERENCES vehicles(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,
  phone         TEXT,
  email         CITEXT,
  message       TEXT        NOT NULL,
  wanted_make   TEXT,                                         -- car_request only
  wanted_model  TEXT,
  year_from     SMALLINT,
  year_to       SMALLINT,
  budget_tzs    BIGINT      CHECK (budget_tzs > 0),
  status        TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'closed')),
  admin_notes   TEXT,
  handled_by    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX enquiries_status_idx ON enquiries (status, created_at DESC);
CREATE INDEX enquiries_user_idx   ON enquiries (user_id);

-- ---------------------------------------------------------------------------
-- Settings, editable content, activity log
-- ---------------------------------------------------------------------------
-- Key/value: whatsapp_number, usd_rate, business (name, address, TIN shown on receipts),
-- and the editable content blocks: content.banners, content.faq, content.how_to_buy, content.contact.
CREATE TABLE settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_log (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  actor_name   TEXT        NOT NULL,                          -- kept even if the account is later removed
  action       TEXT        NOT NULL,                          -- e.g. order.confirmed, payment.recorded, payment.voided
  entity_type  TEXT        NOT NULL,
  entity_id    BIGINT,
  summary      TEXT        NOT NULL,                          -- human-readable line shown in the log
  meta         JSONB       NOT NULL DEFAULT '{}',             -- before/after values for price and status changes
  ip           INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_created_idx ON activity_log (created_at DESC);
CREATE INDEX activity_log_entity_idx  ON activity_log (entity_type, entity_id);

COMMIT;
