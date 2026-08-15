ALTER TABLE `customers` ADD `is_deleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `is_deleted` integer DEFAULT false NOT NULL;