CREATE TABLE `access_grants` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`paymentRecordId` varchar(64) NOT NULL,
	`status` enum('active','revoked','expired') NOT NULL,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`revokedAt` timestamp,
	`revocationReasonCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_grants_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_grants_case_payment_uq` UNIQUE(`diagnosticCaseId`,`paymentRecordId`),
	CONSTRAINT `access_grants_payment_record_uq` UNIQUE(`paymentRecordId`)
);
--> statement-breakpoint
CREATE TABLE `case_consents` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`documentId` varchar(64) NOT NULL,
	`documentVersion` varchar(64) NOT NULL,
	`contentHash` varchar(64) NOT NULL,
	`consentType` enum('terms','data_processing','marketing') NOT NULL,
	`accepted` boolean NOT NULL,
	`actorCustomerSessionId` varchar(64) NOT NULL,
	`acceptedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `case_consents_id` PRIMARY KEY(`id`),
	CONSTRAINT `case_consents_assertion_uq` UNIQUE(`diagnosticCaseId`,`documentId`,`documentVersion`,`consentType`,`actorCustomerSessionId`)
);
--> statement-breakpoint
CREATE TABLE `payment_records` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`tariffSnapshotId` varchar(64) NOT NULL,
	`tariffCode` varchar(64) NOT NULL,
	`campaignId` varchar(64) NOT NULL,
	`sourceType` enum('promo') NOT NULL,
	`status` enum('promo_granted') NOT NULL,
	`chargedAmount` int NOT NULL DEFAULT 0,
	`currency` enum('RUB') NOT NULL,
	`correlationId` varchar(64) NOT NULL,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_records_redemption_scope_uq` UNIQUE(`customerAccountId`,`campaignId`,`tariffCode`),
	CONSTRAINT `payment_records_id_account_case_uq` UNIQUE(`id`,`customerAccountId`,`diagnosticCaseId`),
	CONSTRAINT `chk_payment_records_zero_charge` CHECK(`payment_records`.`chargedAmount` = 0)
);
--> statement-breakpoint
CREATE TABLE `tariff_snapshots` (
	`id` varchar(64) NOT NULL,
	`tariffCode` varchar(64) NOT NULL,
	`serviceTier` varchar(64) NOT NULL,
	`provenanceStatus` enum('draft_test_only') NOT NULL,
	`catalogVersion` varchar(64) NOT NULL,
	`currency` enum('RUB') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tariff_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_id_account_uq` UNIQUE(`id`,`customerAccountId`);--> statement-breakpoint
ALTER TABLE `diagnostic_cases` ADD CONSTRAINT `diagnostic_cases_id_account_uq` UNIQUE(`id`,`customerAccountId`);--> statement-breakpoint
ALTER TABLE `access_grants` ADD CONSTRAINT `fk_access_grant_payment_owner_case` FOREIGN KEY (`paymentRecordId`,`customerAccountId`,`diagnosticCaseId`) REFERENCES `payment_records`(`id`,`customerAccountId`,`diagnosticCaseId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `case_consents` ADD CONSTRAINT `fk_case_consent_case_owner` FOREIGN KEY (`diagnosticCaseId`,`customerAccountId`) REFERENCES `diagnostic_cases`(`id`,`customerAccountId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `case_consents` ADD CONSTRAINT `fk_case_consent_actor_owner` FOREIGN KEY (`actorCustomerSessionId`,`customerAccountId`) REFERENCES `customer_sessions`(`id`,`customerAccountId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `fk_payment_record_case_owner` FOREIGN KEY (`diagnosticCaseId`,`customerAccountId`) REFERENCES `diagnostic_cases`(`id`,`customerAccountId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `fk_payment_record_tariff_snapshot` FOREIGN KEY (`tariffSnapshotId`) REFERENCES `tariff_snapshots`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX `access_grants_owner_case_status_expiry_idx` ON `access_grants` (`customerAccountId`,`diagnosticCaseId`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `case_consents_owner_case_accepted_idx` ON `case_consents` (`customerAccountId`,`diagnosticCaseId`,`accepted`);--> statement-breakpoint
CREATE INDEX `case_consents_actor_idx` ON `case_consents` (`actorCustomerSessionId`);--> statement-breakpoint
CREATE INDEX `payment_records_owner_case_idx` ON `payment_records` (`customerAccountId`,`diagnosticCaseId`);
