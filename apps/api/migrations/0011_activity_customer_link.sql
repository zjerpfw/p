PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`deal_id` text,
	`type` text NOT NULL,
	`notes` text,
	`check_in_lng` real,
	`check_in_lat` real,
	`check_in_address` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_activities` (`id`, `customer_id`, `deal_id`, `type`, `notes`, `check_in_lng`, `check_in_lat`, `check_in_address`, `created_by`, `created_at`)
SELECT `activities`.`id`, `deals`.`customer_id`, `activities`.`deal_id`, `activities`.`type`, `activities`.`notes`, `activities`.`check_in_lng`, `activities`.`check_in_lat`, `activities`.`check_in_address`, `activities`.`created_by`, `activities`.`created_at`
FROM `activities` INNER JOIN `deals` ON `activities`.`deal_id` = `deals`.`id`;
--> statement-breakpoint
DROP TABLE `activities`;
--> statement-breakpoint
ALTER TABLE `__new_activities` RENAME TO `activities`;
--> statement-breakpoint
CREATE INDEX `activities_customer_id_idx` ON `activities` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `activities_deal_id_idx` ON `activities` (`deal_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
