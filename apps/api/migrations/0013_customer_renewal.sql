ALTER TABLE `customers` ADD `saas_expire_date` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `deal_type` text DEFAULT 'New' NOT NULL;--> statement-breakpoint
UPDATE `customers`
SET `saas_expire_date` = (
	SELECT MAX(`deals`.`expire_date`)
	FROM `deals`
	WHERE `deals`.`customer_id` = `customers`.`id`
		AND `deals`.`stage` = 'Won'
		AND `deals`.`is_deleted` = 0
);
