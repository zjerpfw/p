CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`position` text,
	`phone` text,
	`email` text,
	`wechat` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contacts_customer_id_idx` ON `contacts` (`customer_id`);--> statement-breakpoint
CREATE INDEX `contacts_customer_primary_idx` ON `contacts` (`customer_id`,`is_primary`);