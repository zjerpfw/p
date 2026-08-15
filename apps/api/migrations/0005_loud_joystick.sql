CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `customers_owner_id_idx` ON `customers` (`owner_id`);--> statement-breakpoint
CREATE INDEX `deals_customer_id_idx` ON `deals` (`customer_id`);--> statement-breakpoint
CREATE INDEX `deals_stage_idx` ON `deals` (`stage`);