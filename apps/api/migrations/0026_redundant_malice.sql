CREATE TABLE `customer_tag_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `customer_tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_tag_assignments_unique` ON `customer_tag_assignments` (`customer_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `customer_tag_assignments_tag_customer_idx` ON `customer_tag_assignments` (`tag_id`,`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_tags_name_unique` ON `customer_tags` (`name`);