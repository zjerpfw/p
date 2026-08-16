ALTER TABLE `deals` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `deals_idempotency_key_unique` ON `deals` (`idempotency_key`);