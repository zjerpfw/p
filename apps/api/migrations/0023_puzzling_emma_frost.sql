ALTER TABLE `deals` ADD `probability` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `lost_reason` text;--> statement-breakpoint
UPDATE `deals` SET `probability` = CASE `stage` WHEN 'Leads' THEN 10 WHEN 'Qualified' THEN 35 WHEN 'Proposal' THEN 65 WHEN 'Won' THEN 100 WHEN 'Lost' THEN 0 ELSE 10 END;--> statement-breakpoint
UPDATE `deals` SET `lost_reason` = NULL WHERE `stage` <> 'Lost';
