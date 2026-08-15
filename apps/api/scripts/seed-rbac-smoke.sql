-- apps/api/scripts/seed-rbac-smoke.sql
-- Local-only smoke data for pagination and owner-based RBAC verification.
DELETE FROM activities WHERE created_by IN ('smoke_admin', 'smoke_sales_a', 'smoke_sales_b');
DELETE FROM deal_splits WHERE user_id IN ('smoke_admin', 'smoke_sales_a', 'smoke_sales_b');
DELETE FROM deals WHERE customer_id LIKE 'smoke_customer_%';
DELETE FROM customers WHERE id LIKE 'smoke_customer_%';
DELETE FROM users WHERE id IN ('smoke_admin', 'smoke_sales_a', 'smoke_sales_b');

INSERT INTO users (id, name, role, pin_code) VALUES
  ('smoke_admin', '测试管理员', 'admin', '123456'),
  ('smoke_sales_a', '销售A', 'sales', '123456'),
  ('smoke_sales_b', '销售B', 'sales', '123456');

INSERT INTO customers (id, name, contact_phone, status, owner_id, created_at, updated_at) VALUES
  ('smoke_customer_a01', '销售A客户01', '13800000001', 'Active', 'smoke_sales_a', unixepoch('now', '-1 day'), unixepoch('now')),
  ('smoke_customer_a02', '销售A客户02', '13800000002', 'Active', 'smoke_sales_a', unixepoch('now', '-2 day'), unixepoch('now')),
  ('smoke_customer_a03', '销售A客户03', '13800000003', 'Active', 'smoke_sales_a', unixepoch('now', '-3 day'), unixepoch('now')),
  ('smoke_customer_a04', '销售A客户04', '13800000004', 'Active', 'smoke_sales_a', unixepoch('now', '-4 day'), unixepoch('now')),
  ('smoke_customer_a05', '销售A客户05', '13800000005', 'Active', 'smoke_sales_a', unixepoch('now', '-5 day'), unixepoch('now')),
  ('smoke_customer_a06', '销售A客户06', '13800000006', 'Active', 'smoke_sales_a', unixepoch('now', '-6 day'), unixepoch('now')),
  ('smoke_customer_a07', '销售A客户07', '13800000007', 'Inactive', 'smoke_sales_a', unixepoch('now', '-7 day'), unixepoch('now')),
  ('smoke_customer_a08', '销售A客户08', '13800000008', 'Inactive', 'smoke_sales_a', unixepoch('now', '-8 day'), unixepoch('now')),
  ('smoke_customer_a09', '销售A客户09', '13800000009', 'Inactive', 'smoke_sales_a', unixepoch('now', '-9 day'), unixepoch('now')),
  ('smoke_customer_a10', '销售A客户10', '13800000010', 'Active', 'smoke_sales_a', unixepoch('now', '-10 day'), unixepoch('now')),
  ('smoke_customer_a11', '销售A客户11', '13800000011', 'Active', 'smoke_sales_a', unixepoch('now', '-11 day'), unixepoch('now')),
  ('smoke_customer_a12', '销售A客户12', '13800000012', 'Active', 'smoke_sales_a', unixepoch('now', '-12 day'), unixepoch('now')),
  ('smoke_customer_b01', '销售B客户01', '13900000001', 'Active', 'smoke_sales_b', unixepoch('now', '-1 day'), unixepoch('now')),
  ('smoke_customer_b02', '销售B客户02', '13900000002', 'Active', 'smoke_sales_b', unixepoch('now', '-2 day'), unixepoch('now')),
  ('smoke_customer_b03', '销售B客户03', '13900000003', 'Inactive', 'smoke_sales_b', unixepoch('now', '-3 day'), unixepoch('now'));

INSERT INTO deals (id, customer_id, amount, stage, expected_close_date, created_at, net_profit) VALUES
  ('smoke_deal_a01', 'smoke_customer_a01', 120000, 'Leads', unixepoch('now', '+30 day'), unixepoch('now'), NULL),
  ('smoke_deal_a02', 'smoke_customer_a02', 240000, 'Qualified', unixepoch('now', '+20 day'), unixepoch('now'), NULL),
  ('smoke_deal_a03', 'smoke_customer_a03', 360000, 'Won', unixepoch('now', '+10 day'), unixepoch('now'), 90000),
  ('smoke_deal_b01', 'smoke_customer_b01', 480000, 'Leads', unixepoch('now', '+15 day'), unixepoch('now'), NULL),
  ('smoke_deal_b02', 'smoke_customer_b02', 600000, 'Won', unixepoch('now', '+5 day'), unixepoch('now'), 150000);
