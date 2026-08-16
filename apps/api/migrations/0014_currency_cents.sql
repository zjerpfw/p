ALTER TABLE `deals` RENAME COLUMN `amount` TO `amount_cents`;
--> statement-breakpoint
ALTER TABLE `deals` RENAME COLUMN `original_price` TO `original_price_cents`;
--> statement-breakpoint
ALTER TABLE `deals` RENAME COLUMN `software_cost` TO `software_cost_cents`;
--> statement-breakpoint
ALTER TABLE `deals` RENAME COLUMN `tax_cost` TO `tax_cost_cents`;
--> statement-breakpoint
ALTER TABLE `deals` RENAME COLUMN `rebate_amount` TO `rebate_amount_cents`;
--> statement-breakpoint
ALTER TABLE `deals` RENAME COLUMN `net_profit` TO `net_profit_cents`;
--> statement-breakpoint
ALTER TABLE `deal_splits` RENAME COLUMN `split_amount` TO `split_amount_cents`;
--> statement-breakpoint

UPDATE `deals`
SET
	`amount_cents` = `amount_cents` * 100,
	`original_price_cents` = CASE
		WHEN `original_price_cents` IS NULL THEN NULL
		ELSE `original_price_cents` * 100
	END,
	`software_cost_cents` = CASE
		WHEN `software_cost_cents` IS NULL THEN NULL
		ELSE `software_cost_cents` * 100
	END,
	`tax_cost_cents` = CASE
		WHEN `tax_cost_cents` IS NULL THEN NULL
		ELSE `tax_cost_cents` * 100
	END,
	`rebate_amount_cents` = CASE
		WHEN `rebate_amount_cents` IS NULL THEN NULL
		ELSE `rebate_amount_cents` * 100
	END,
	`net_profit_cents` = CASE
		WHEN `net_profit_cents` IS NULL THEN NULL
		ELSE `net_profit_cents` * 100
	END;
--> statement-breakpoint

UPDATE `deal_splits`
SET `split_amount_cents` = `split_amount_cents` * 100;
