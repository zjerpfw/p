-- This migration must only run after POST /api/users/migrate-hashes returns complete: true.
-- Abort without altering the table when any legacy account still lacks a PBKDF2 hash.
CREATE TABLE `__pin_hash_precheck` (
	`pin_hash` text NOT NULL CHECK (`pin_hash` <> '')
);
--> statement-breakpoint
INSERT INTO `__pin_hash_precheck` (`pin_hash`)
SELECT COALESCE(`pin_hash`, '') FROM `users`;
--> statement-breakpoint
DROP TABLE `__pin_hash_precheck`;
--> statement-breakpoint

PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`username` text,
	`wechat_userid` text,
	`avatar_url` text,
	`role` text NOT NULL,
	`pin_hash` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_users` (`id`, `name`, `username`, `wechat_userid`, `avatar_url`, `role`, `pin_hash`, `created_at`)
SELECT `id`, `name`, `username`, `wechat_userid`, `avatar_url`, `role`, `pin_hash`, `created_at`
FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_wechat_userid_unique` ON `users` (`wechat_userid`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
