-- This migration must only run after all legacy accounts have a PBKDF2 hash.
-- Cloudflare D1 cannot safely rebuild `users` while many production tables reference it.
-- Retain the legacy column for physical-schema compatibility, but irreversibly redact every
-- plaintext value. Application code exclusively authenticates against `pin_hash`.
CREATE TABLE `__pin_hash_precheck` (
	`pin_hash` text NOT NULL CHECK (`pin_hash` <> '')
);
--> statement-breakpoint
INSERT INTO `__pin_hash_precheck` (`pin_hash`)
SELECT COALESCE(`pin_hash`, '') FROM `users`;
--> statement-breakpoint
DROP TABLE `__pin_hash_precheck`;
--> statement-breakpoint
UPDATE `users` SET `pin_code` = '__REDACTED__';
