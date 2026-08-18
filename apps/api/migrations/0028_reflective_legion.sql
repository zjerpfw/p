ALTER TABLE `deals` ADD `won_at` integer;--> statement-breakpoint
UPDATE `deals` SET `won_at` = `expected_close_date` WHERE `stage` = 'Won' AND `won_at` IS NULL;--> statement-breakpoint
CREATE INDEX `deals_stage_won_at_idx` ON `deals` (`stage`,`won_at`);
