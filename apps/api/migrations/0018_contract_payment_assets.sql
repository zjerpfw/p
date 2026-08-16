CREATE TABLE `attachment_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`deal_id` text NOT NULL,
	`contract_id` text,
	`invoice_id` text,
	`payment_id` text,
	`asset_type` text NOT NULL,
	`upload_status` text DEFAULT 'Pending' NOT NULL,
	`bucket` text NOT NULL,
	`object_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer,
	`content_hash` text,
	`version` integer DEFAULT 1 NOT NULL,
	`uploaded_by` text NOT NULL,
	`uploaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachment_assets_object_key_unique` ON `attachment_assets` (`object_key`);--> statement-breakpoint
CREATE INDEX `attachment_assets_customer_id_idx` ON `attachment_assets` (`customer_id`);--> statement-breakpoint
CREATE INDEX `attachment_assets_deal_id_idx` ON `attachment_assets` (`deal_id`);--> statement-breakpoint
CREATE INDEX `attachment_assets_contract_id_idx` ON `attachment_assets` (`contract_id`);--> statement-breakpoint
CREATE INDEX `attachment_assets_invoice_id_idx` ON `attachment_assets` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `attachment_assets_payment_id_idx` ON `attachment_assets` (`payment_id`);--> statement-breakpoint
CREATE INDEX `attachment_assets_status_idx` ON `attachment_assets` (`upload_status`);--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`deal_id` text NOT NULL,
	`contract_number` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`total_amount_cents` integer NOT NULL,
	`signed_at` integer,
	`effective_start_date` integer,
	`effective_end_date` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contracts_contract_number_unique` ON `contracts` (`contract_number`);--> statement-breakpoint
CREATE INDEX `contracts_customer_id_idx` ON `contracts` (`customer_id`);--> statement-breakpoint
CREATE INDEX `contracts_deal_id_idx` ON `contracts` (`deal_id`);--> statement-breakpoint
CREATE INDEX `contracts_status_idx` ON `contracts` (`status`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`deal_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`invoice_number` text,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`amount_cents` integer NOT NULL,
	`tax_amount_cents` integer DEFAULT 0 NOT NULL,
	`issued_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `invoices_customer_id_idx` ON `invoices` (`customer_id`);--> statement-breakpoint
CREATE INDEX `invoices_deal_id_idx` ON `invoices` (`deal_id`);--> statement-breakpoint
CREATE INDEX `invoices_contract_id_idx` ON `invoices` (`contract_id`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`deal_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`invoice_id` text,
	`payment_number` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`paid_at` integer,
	`note` text,
	`claimed_by` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claimed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_payment_number_unique` ON `payments` (`payment_number`);--> statement-breakpoint
CREATE INDEX `payments_customer_id_idx` ON `payments` (`customer_id`);--> statement-breakpoint
CREATE INDEX `payments_deal_id_idx` ON `payments` (`deal_id`);--> statement-breakpoint
CREATE INDEX `payments_contract_id_idx` ON `payments` (`contract_id`);--> statement-breakpoint
CREATE INDEX `payments_invoice_id_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `payments_status_paid_at_idx` ON `payments` (`status`,`paid_at`);