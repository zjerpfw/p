CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`deal_id` text,
	`title` text NOT NULL,
	`description` text,
	`assignee_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`completed_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_customer_id_idx` ON `tasks` (`customer_id`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_status_due_idx` ON `tasks` (`assignee_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_deal_id_idx` ON `tasks` (`deal_id`);