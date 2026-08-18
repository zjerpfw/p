ALTER TABLE `deals` ADD `updated_at` integer NOT NULL DEFAULT 0;
UPDATE `deals` SET `updated_at` = `created_at` WHERE `updated_at` = 0;
