CREATE TABLE `notification_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`reference_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`reminder_date` text NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_logs_dedupe_unique` ON `notification_logs` (`type`,`reference_id`,`recipient_user_id`,`reminder_date`);--> statement-breakpoint
CREATE INDEX `notification_logs_reference_idx` ON `notification_logs` (`reference_id`);