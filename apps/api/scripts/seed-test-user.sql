INSERT INTO users (id, name, avatar_url, role, pin_code)
VALUES ('zhangsan', '张三', NULL, 'sales', '123456')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  role = excluded.role,
  pin_code = excluded.pin_code;
