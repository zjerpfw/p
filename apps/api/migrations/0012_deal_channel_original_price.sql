ALTER TABLE `deals` ADD `channel` text;
--> statement-breakpoint
ALTER TABLE `deals` ADD `original_price` integer;
--> statement-breakpoint
UPDATE `deals` SET `original_price` = `amount` WHERE `original_price` IS NULL;
