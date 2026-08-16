-- Test login password: 123456. Never replace this PBKDF2 hash with plaintext.
INSERT INTO users (id, name, avatar_url, role, pin_hash)
VALUES ('zhangsan', '张三', NULL, 'admin', 'pbkdf2-sha256$210000$X17gsnxmEtwbYMQEBzzw4g$uxu26XbjJsvXOeLKO34XErdryCo20i6xeao1SyOQJ2I')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  role = excluded.role,
  pin_hash = excluded.pin_hash;
