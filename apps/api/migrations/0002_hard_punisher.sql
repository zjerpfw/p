CREATE TABLE `deal_splits` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`split_amount` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `deals` ADD `start_date` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `duration_years` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `expire_date` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `renewal_reminder_days` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `software_cost` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `tax_cost` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `rebate_amount` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `net_profit` integer;