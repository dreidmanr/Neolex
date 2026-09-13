CREATE TABLE `auth_rate_limit_buckets` (
	`id` varchar(64) NOT NULL,
	`scope` varchar(64) NOT NULL,
	`bucketHash` varchar(128) NOT NULL,
	`windowStartedAt` timestamp NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`blockedUntil` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auth_rate_limit_buckets_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_rate_limit_scope_bucket_window_uq` UNIQUE(`scope`,`bucketHash`,`windowStartedAt`)
);
--> statement-breakpoint
CREATE TABLE `email_deliveries` (
	`id` varchar(64) NOT NULL,
	`magicLinkTokenId` varchar(64) NOT NULL,
	`customerAccountIdentityId` varchar(64) NOT NULL,
	`deliveryKind` varchar(64) NOT NULL,
	`status` enum('queued','sending','sent','failed','suppressed') NOT NULL DEFAULT 'queued',
	`dedupeKey` varchar(128) NOT NULL,
	`attemptCount` int NOT NULL DEFAULT 0,
	`leaseOwner` varchar(64),
	`leaseVersion` int NOT NULL DEFAULT 0,
	`leaseExpiresAt` timestamp,
	`nextAttemptAt` timestamp,
	`lastAttemptAt` timestamp,
	`sentAt` timestamp,
	`terminalAt` timestamp,
	`lastErrorCode` varchar(64),
	`templateVersion` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_deliveries_token_uq` UNIQUE(`magicLinkTokenId`),
	CONSTRAINT `email_deliveries_dedupe_key_uq` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `magic_link_tokens` (
	`id` varchar(64) NOT NULL,
	`customerAccountIdentityId` varchar(64) NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`requestScope` enum('magic_login') NOT NULL,
	`tokenKeyVersion` int NOT NULL,
	`status` enum('active','consumed','revoked','expired') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`revokedAt` timestamp,
	`revocationReasonCode` varchar(64),
	`consumedByCustomerSessionId` varchar(64),
	`correlationId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `magic_link_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `magic_link_tokens_token_hash_uq` UNIQUE(`tokenHash`),
	CONSTRAINT `magic_link_tokens_session_uq` UNIQUE(`consumedByCustomerSessionId`),
	CONSTRAINT `magic_link_tokens_id_identity_uq` UNIQUE(`id`,`customerAccountIdentityId`)
);
--> statement-breakpoint
ALTER TABLE `email_deliveries` ADD CONSTRAINT `fk_email_delivery_token_identity` FOREIGN KEY (`magicLinkTokenId`,`customerAccountIdentityId`) REFERENCES `magic_link_tokens`(`id`,`customerAccountIdentityId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `fk_magic_token_identity` FOREIGN KEY (`customerAccountIdentityId`) REFERENCES `customer_account_identities`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `fk_magic_token_session` FOREIGN KEY (`consumedByCustomerSessionId`) REFERENCES `customer_sessions`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX `auth_rate_limit_buckets_expiry_idx` ON `auth_rate_limit_buckets` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `email_deliveries_status_next_idx` ON `email_deliveries` (`status`,`nextAttemptAt`);--> statement-breakpoint
CREATE INDEX `email_deliveries_lease_expiry_idx` ON `email_deliveries` (`leaseExpiresAt`);--> statement-breakpoint
CREATE INDEX `email_deliveries_identity_created_idx` ON `email_deliveries` (`customerAccountIdentityId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `magic_link_tokens_identity_status_expiry_idx` ON `magic_link_tokens` (`customerAccountIdentityId`,`status`,`expiresAt`);