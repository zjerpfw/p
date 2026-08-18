ALTER TABLE `customers` ADD `province` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `city` text;--> statement-breakpoint
CREATE INDEX `customers_region_idx` ON `customers` (`province`,`city`);