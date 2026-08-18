ALTER TABLE `notification_logs` ADD COLUMN `status` text NOT NULL DEFAULT 'Pending';
--> statement-breakpoint
ALTER TABLE `notification_logs` ADD COLUMN `last_error` text;
--> statement-breakpoint
ALTER TABLE `notification_logs` ADD COLUMN `attempt_count` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `notification_logs`
SET `status` = CASE WHEN `sent_at` IS NULL THEN 'Pending' ELSE 'Sent' END,
    `attempt_count` = CASE WHEN `sent_at` IS NULL THEN 0 ELSE 1 END;
--> statement-breakpoint
CREATE INDEX `notification_logs_status_created_at_idx` ON `notification_logs` (`status`, `created_at`);
