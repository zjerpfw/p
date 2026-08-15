CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`activity_id` text,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_file_key_unique` ON `attachments` (`file_key`);--> statement-breakpoint
CREATE INDEX `attachments_customer_id_idx` ON `attachments` (`customer_id`);--> statement-breakpoint
CREATE INDEX `attachments_activity_id_idx` ON `attachments` (`activity_id`);