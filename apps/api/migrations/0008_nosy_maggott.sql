ALTER TABLE `users` ADD `username` text;--> statement-breakpoint
ALTER TABLE `users` ADD `wechat_userid` text;--> statement-breakpoint
ALTER TABLE `users` ADD `created_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_wechat_userid_unique` ON `users` (`wechat_userid`);