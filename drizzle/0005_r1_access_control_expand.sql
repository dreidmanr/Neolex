CREATE TABLE `audit_events` (
	`id` varchar(64) NOT NULL,
	`actorType` enum('customer_account','customer_session','admin_user','service','migration') NOT NULL,
	`actorId` varchar(64) NOT NULL,
	`aggregateType` varchar(64) NOT NULL,
	`aggregateId` varchar(64) NOT NULL,
	`eventType` varchar(128) NOT NULL,
	`fromStatus` varchar(64),
	`toStatus` varchar(64),
	`outcome` enum('succeeded','denied','failed') NOT NULL,
	`reasonCode` varchar(64),
	`requestId` varchar(64),
	`correlationId` varchar(64),
	`idempotencyKeyHash` varchar(128),
	`privacySafeMetadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_account_identities` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`identityType` enum('email') NOT NULL,
	`identityHash` varchar(128) NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `customer_account_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_account_identities_type_hash_uq` UNIQUE(`identityType`,`identityHash`)
);
--> statement-breakpoint
CREATE TABLE `customer_accounts` (
	`id` varchar(64) NOT NULL,
	`status` enum('active','suspended','closed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`status` enum('active','revoked','expired') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`revocationReasonCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_sessions_token_hash_uq` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `diagnostic_cases` (
	`id` varchar(64) NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`serviceTier` varchar(64) NOT NULL,
	`status` enum('draft','access_granted','in_progress','submitted','scoring','manual_review_required','report_ready','failed','archived') NOT NULL DEFAULT 'draft',
	`stateVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `diagnostic_cases_id` PRIMARY KEY(`id`),
	CONSTRAINT `diagnostic_cases_public_id_uq` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`scope` varchar(64) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`requestHash` varchar(128) NOT NULL,
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`responseJson` json,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `idempotency_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `idempotency_records_account_scope_key_uq` UNIQUE(`customerAccountId`,`scope`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `legacy_ownership_cases` (
	`id` varchar(64) NOT NULL,
	`sourceTable` varchar(64) NOT NULL,
	`sourcePrimaryKey` varchar(128) NOT NULL,
	`status` enum('unassigned','claim_pending','claimed','quarantined','manual_review','excluded_by_retention','migration_error') NOT NULL DEFAULT 'unassigned',
	`customerAccountId` varchar(64),
	`permittedClaimChannel` varchar(64),
	`claimEvidenceReference` varchar(128),
	`decisionActorId` varchar(64),
	`reasonCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`decidedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `legacy_ownership_cases_id` PRIMARY KEY(`id`),
	CONSTRAINT `legacy_ownership_cases_source_uq` UNIQUE(`sourceTable`,`sourcePrimaryKey`)
);
--> statement-breakpoint
CREATE TABLE `legacy_resource_links` (
	`id` varchar(64) NOT NULL,
	`sourceTable` varchar(64) NOT NULL,
	`sourcePrimaryKey` varchar(128) NOT NULL,
	`targetType` varchar(64) NOT NULL,
	`targetId` varchar(64) NOT NULL,
	`phase` varchar(64) NOT NULL,
	`mappingVersion` varchar(64) NOT NULL,
	`migrationRunId` varchar(64),
	`correlationId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `legacy_resource_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `legacy_resource_links_source_target_type_uq` UNIQUE(`sourceTable`,`sourcePrimaryKey`,`targetType`)
);
--> statement-breakpoint
CREATE TABLE `migration_reconciliation_records` (
	`id` varchar(64) NOT NULL,
	`migrationRunId` varchar(64) NOT NULL,
	`resourceType` varchar(64) NOT NULL,
	`status` enum('pending','matched','mismatch','failed') NOT NULL DEFAULT 'pending',
	`dryRun` boolean NOT NULL DEFAULT true,
	`sourceCount` int NOT NULL DEFAULT 0,
	`targetCount` int NOT NULL DEFAULT 0,
	`matchedCount` int NOT NULL DEFAULT 0,
	`missingCount` int NOT NULL DEFAULT 0,
	`duplicateCount` int NOT NULL DEFAULT 0,
	`orphanCount` int NOT NULL DEFAULT 0,
	`sourceHash` varchar(128),
	`targetHash` varchar(128),
	`summaryHash` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `migration_reconciliation_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `migration_reconciliation_records_run_resource_uq` UNIQUE(`migrationRunId`,`resourceType`)
);
--> statement-breakpoint
CREATE TABLE `migration_runs` (
	`id` varchar(64) NOT NULL,
	`phase` varchar(64) NOT NULL,
	`status` enum('planned','running','succeeded','failed','cancelled') NOT NULL DEFAULT 'planned',
	`dryRun` boolean NOT NULL DEFAULT true,
	`sourceCount` int NOT NULL DEFAULT 0,
	`targetCount` int NOT NULL DEFAULT 0,
	`matchedCount` int NOT NULL DEFAULT 0,
	`anomalyCount` int NOT NULL DEFAULT 0,
	`sourceManifestHash` varchar(128),
	`targetManifestHash` varchar(128),
	`correlationId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `migration_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` varchar(64) NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`dedupeKey` varchar(128) NOT NULL,
	`aggregateType` varchar(64) NOT NULL,
	`aggregateId` varchar(64) NOT NULL,
	`eventType` varchar(128) NOT NULL,
	`privacySafePayload` json,
	`status` enum('pending','processing','published','failed','cancelled') NOT NULL DEFAULT 'pending',
	`attemptCount` int NOT NULL DEFAULT 0,
	`nextAttemptAt` timestamp,
	`lastAttemptAt` timestamp,
	`publishedAt` timestamp,
	`lastErrorCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outbox_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `outbox_events_event_id_uq` UNIQUE(`eventId`),
	CONSTRAINT `outbox_events_dedupe_key_uq` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
ALTER TABLE `customer_account_identities` ADD CONSTRAINT `fk_customer_identity_account` FOREIGN KEY (`customerAccountId`) REFERENCES `customer_accounts`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `customer_sessions` ADD CONSTRAINT `fk_customer_session_account` FOREIGN KEY (`customerAccountId`) REFERENCES `customer_accounts`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `diagnostic_cases` ADD CONSTRAINT `fk_diagnostic_case_account` FOREIGN KEY (`customerAccountId`) REFERENCES `customer_accounts`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `idempotency_records` ADD CONSTRAINT `fk_idempotency_account` FOREIGN KEY (`customerAccountId`) REFERENCES `customer_accounts`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `legacy_ownership_cases` ADD CONSTRAINT `fk_legacy_ownership_account` FOREIGN KEY (`customerAccountId`) REFERENCES `customer_accounts`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `legacy_resource_links` ADD CONSTRAINT `fk_legacy_link_migration_run` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `migration_reconciliation_records` ADD CONSTRAINT `fk_migration_recon_run` FOREIGN KEY (`migrationRunId`) REFERENCES `migration_runs`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX `audit_events_aggregate_created_idx` ON `audit_events` (`aggregateType`,`aggregateId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_created_idx` ON `audit_events` (`actorType`,`actorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_events_event_created_idx` ON `audit_events` (`eventType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `customer_account_identities_account_status_idx` ON `customer_account_identities` (`customerAccountId`,`status`);--> statement-breakpoint
CREATE INDEX `customer_accounts_status_updated_idx` ON `customer_accounts` (`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `customer_sessions_account_status_expiry_idx` ON `customer_sessions` (`customerAccountId`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `diagnostic_cases_owner_status_updated_idx` ON `diagnostic_cases` (`customerAccountId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `idempotency_records_expiry_idx` ON `idempotency_records` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `legacy_ownership_cases_status_created_idx` ON `legacy_ownership_cases` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `legacy_ownership_cases_account_status_idx` ON `legacy_ownership_cases` (`customerAccountId`,`status`);--> statement-breakpoint
CREATE INDEX `legacy_resource_links_target_idx` ON `legacy_resource_links` (`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `legacy_resource_links_run_idx` ON `legacy_resource_links` (`migrationRunId`);--> statement-breakpoint
CREATE INDEX `migration_reconciliation_records_status_created_idx` ON `migration_reconciliation_records` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `migration_runs_status_created_idx` ON `migration_runs` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `migration_runs_phase_created_idx` ON `migration_runs` (`phase`,`createdAt`);--> statement-breakpoint
CREATE INDEX `outbox_events_status_next_attempt_idx` ON `outbox_events` (`status`,`nextAttemptAt`);--> statement-breakpoint
CREATE INDEX `outbox_events_aggregate_created_idx` ON `outbox_events` (`aggregateType`,`aggregateId`,`createdAt`);