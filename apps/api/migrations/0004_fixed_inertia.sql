CREATE TABLE `system_configs` (
	`config_key` text PRIMARY KEY NOT NULL,
	`config_value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
