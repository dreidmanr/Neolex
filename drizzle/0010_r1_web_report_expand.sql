CREATE TABLE `credit_entitlements` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`sourcePaymentRecordId` varchar(64) NOT NULL,
	`sourceReportSnapshotId` varchar(64) NOT NULL,
	`sourceTariffId` varchar(64) NOT NULL,
	`sourceTariffVersion` varchar(64) NOT NULL,
	`policyId` varchar(64) NOT NULL,
	`policyVersion` varchar(64) NOT NULL,
	`amountRub` int NOT NULL,
	`currency` enum('RUB') NOT NULL,
	`eligibleProductCode` enum('start_product','safe_sales','rights_and_ip','data_and_infrastructure','enterprise_readiness') NOT NULL,
	`issuedAt` timestamp(3) NOT NULL,
	`expiresAt` timestamp(3) NOT NULL,
	`businessTimeZone` enum('Europe/Moscow') NOT NULL,
	`status` enum('available','expired','revoked') NOT NULL DEFAULT 'available',
	`automaticRedemptionEnabled` boolean NOT NULL DEFAULT false,
	`revokedAt` timestamp(3),
	`revocationReasonCode` varchar(64),
	`createdAt` timestamp(3) NOT NULL,
	`updatedAt` timestamp(3) NOT NULL,
	CONSTRAINT `credit_entitlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `credit_entitlements_source_identity_uq` UNIQUE(`sourcePaymentRecordId`,`sourceReportSnapshotId`,`policyId`),
	CONSTRAINT `credit_entitlements_report_uq` UNIQUE(`sourceReportSnapshotId`),
	CONSTRAINT `chk_credit_entitlement_amount` CHECK(`credit_entitlements`.`amountRub` = 6900),
	CONSTRAINT `chk_credit_entitlement_policy` CHECK(`credit_entitlements`.`policyId` = 'base-diagnostic-credit-6900-rub-v1'
        AND `credit_entitlements`.`sourceTariffId` = 'lexy-advanced-diagnostic'
        AND `credit_entitlements`.`businessTimeZone` = 'Europe/Moscow'
        AND `credit_entitlements`.`automaticRedemptionEnabled` = false),
	CONSTRAINT `chk_credit_entitlement_expiry` CHECK(`credit_entitlements`.`expiresAt` > `credit_entitlements`.`issuedAt`),
	CONSTRAINT `chk_credit_entitlement_lifecycle` CHECK((
        (`credit_entitlements`.`status` IN ('available', 'expired')
          AND `credit_entitlements`.`revokedAt` IS NULL
          AND `credit_entitlements`.`revocationReasonCode` IS NULL)
        OR (`credit_entitlements`.`status` = 'revoked'
          AND `credit_entitlements`.`revokedAt` IS NOT NULL
          AND `credit_entitlements`.`revocationReasonCode` REGEXP '^[a-z][a-z0-9_]{0,63}$')
      ))
);
--> statement-breakpoint
CREATE TABLE `report_snapshots` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`questionnaireSubmissionId` varchar(64) NOT NULL,
	`questionnaireRuleEvaluationId` varchar(64) NOT NULL,
	`sourceOutboxEventId` varchar(64) NOT NULL,
	`reportVersion` int NOT NULL,
	`generationReason` enum('initial_evaluation') NOT NULL DEFAULT 'initial_evaluation',
	`templateVersion` varchar(64) NOT NULL,
	`inputSnapshotHash` varchar(64) NOT NULL,
	`outcomeHash` varchar(64) NOT NULL,
	`rulesetBundleHash` varchar(64) NOT NULL,
	`status` enum('pending','processing','ready','failed','superseded') NOT NULL DEFAULT 'pending',
	`generationMode` enum('template') NOT NULL DEFAULT 'template',
	`readySlot` int,
	`leaseOwner` varchar(64),
	`leaseVersion` int NOT NULL DEFAULT 0,
	`leaseExpiresAt` timestamp,
	`attemptCount` int NOT NULL DEFAULT 0,
	`payloadJson` json,
	`payloadHash` varchar(64),
	`contentHash` varchar(64),
	`failureCode` varchar(64),
	`lastAttemptAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `report_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `report_snapshots_case_version_uq` UNIQUE(`diagnosticCaseId`,`reportVersion`),
	CONSTRAINT `report_snapshots_case_input_reason_uq` UNIQUE(`diagnosticCaseId`,`inputSnapshotHash`,`generationReason`),
	CONSTRAINT `report_snapshots_id_owner_case_uq` UNIQUE(`id`,`customerAccountId`,`diagnosticCaseId`),
	CONSTRAINT `report_snapshots_evaluation_uq` UNIQUE(`questionnaireRuleEvaluationId`),
	CONSTRAINT `report_snapshots_source_outbox_uq` UNIQUE(`sourceOutboxEventId`),
	CONSTRAINT `report_snapshots_case_ready_uq` UNIQUE(`diagnosticCaseId`,`readySlot`),
	CONSTRAINT `chk_report_snapshot_version` CHECK(`report_snapshots`.`reportVersion` > 0),
	CONSTRAINT `chk_report_snapshot_template_version` CHECK(`report_snapshots`.`templateVersion` REGEXP '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
	CONSTRAINT `chk_report_snapshot_hashes` CHECK((
      `report_snapshots`.`inputSnapshotHash` REGEXP '^[a-f0-9]{64}$'
      AND `report_snapshots`.`outcomeHash` REGEXP '^[a-f0-9]{64}$'
      AND `report_snapshots`.`rulesetBundleHash` REGEXP '^[a-f0-9]{64}$'
      AND (`report_snapshots`.`payloadHash` IS NULL OR `report_snapshots`.`payloadHash` REGEXP '^[a-f0-9]{64}$')
      AND (`report_snapshots`.`contentHash` IS NULL OR `report_snapshots`.`contentHash` REGEXP '^[a-f0-9]{64}$')
    )),
	CONSTRAINT `chk_report_snapshot_counters` CHECK(`report_snapshots`.`attemptCount` >= 0 AND `report_snapshots`.`leaseVersion` >= 0),
	CONSTRAINT `chk_report_snapshot_failure_code_safe` CHECK(`report_snapshots`.`failureCode` IS NULL OR `report_snapshots`.`failureCode` REGEXP '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT `chk_report_snapshot_lifecycle` CHECK((
      (`report_snapshots`.`status` = 'pending'
        AND `report_snapshots`.`readySlot` IS NULL
        AND `report_snapshots`.`leaseOwner` IS NULL
        AND `report_snapshots`.`leaseExpiresAt` IS NULL
        AND `report_snapshots`.`leaseVersion` = 0
        AND `report_snapshots`.`attemptCount` = 0
        AND `report_snapshots`.`lastAttemptAt` IS NULL
        AND `report_snapshots`.`payloadJson` IS NULL
        AND `report_snapshots`.`payloadHash` IS NULL
        AND `report_snapshots`.`contentHash` IS NULL
        AND `report_snapshots`.`failureCode` IS NULL
        AND `report_snapshots`.`completedAt` IS NULL)
      OR (`report_snapshots`.`status` = 'processing'
        AND `report_snapshots`.`readySlot` IS NULL
        AND `report_snapshots`.`leaseOwner` IS NOT NULL
        AND `report_snapshots`.`leaseExpiresAt` IS NOT NULL
        AND `report_snapshots`.`leaseVersion` > 0
        AND `report_snapshots`.`attemptCount` > 0
        AND `report_snapshots`.`lastAttemptAt` IS NOT NULL
        AND `report_snapshots`.`leaseExpiresAt` > `report_snapshots`.`lastAttemptAt`
        AND `report_snapshots`.`payloadJson` IS NULL
        AND `report_snapshots`.`payloadHash` IS NULL
        AND `report_snapshots`.`contentHash` IS NULL
        AND `report_snapshots`.`failureCode` IS NULL
        AND `report_snapshots`.`completedAt` IS NULL)
      OR (`report_snapshots`.`status` = 'ready'
        AND `report_snapshots`.`readySlot` = 1
        AND `report_snapshots`.`leaseOwner` IS NULL
        AND `report_snapshots`.`leaseExpiresAt` IS NULL
        AND `report_snapshots`.`leaseVersion` > 0
        AND `report_snapshots`.`attemptCount` > 0
        AND `report_snapshots`.`lastAttemptAt` IS NOT NULL
        AND `report_snapshots`.`payloadJson` IS NOT NULL
        AND `report_snapshots`.`payloadHash` IS NOT NULL
        AND `report_snapshots`.`contentHash` IS NOT NULL
        AND `report_snapshots`.`failureCode` IS NULL
        AND `report_snapshots`.`completedAt` IS NOT NULL
        AND `report_snapshots`.`completedAt` >= `report_snapshots`.`lastAttemptAt`)
      OR (`report_snapshots`.`status` = 'failed'
        AND `report_snapshots`.`readySlot` IS NULL
        AND `report_snapshots`.`leaseOwner` IS NULL
        AND `report_snapshots`.`leaseExpiresAt` IS NULL
        AND `report_snapshots`.`leaseVersion` > 0
        AND `report_snapshots`.`attemptCount` > 0
        AND `report_snapshots`.`lastAttemptAt` IS NOT NULL
        AND `report_snapshots`.`payloadJson` IS NULL
        AND `report_snapshots`.`payloadHash` IS NULL
        AND `report_snapshots`.`contentHash` IS NULL
        AND `report_snapshots`.`failureCode` IS NOT NULL
        AND `report_snapshots`.`completedAt` IS NOT NULL
        AND `report_snapshots`.`completedAt` >= `report_snapshots`.`lastAttemptAt`)
      OR (`report_snapshots`.`status` = 'superseded'
        AND `report_snapshots`.`readySlot` IS NULL
        AND `report_snapshots`.`leaseOwner` IS NULL
        AND `report_snapshots`.`leaseExpiresAt` IS NULL
        AND `report_snapshots`.`leaseVersion` > 0
        AND `report_snapshots`.`attemptCount` > 0
        AND `report_snapshots`.`lastAttemptAt` IS NOT NULL
        AND `report_snapshots`.`payloadJson` IS NOT NULL
        AND `report_snapshots`.`payloadHash` IS NOT NULL
        AND `report_snapshots`.`contentHash` IS NOT NULL
        AND `report_snapshots`.`failureCode` IS NULL
        AND `report_snapshots`.`completedAt` IS NOT NULL
        AND `report_snapshots`.`completedAt` >= `report_snapshots`.`lastAttemptAt`)
    ))
);
--> statement-breakpoint
ALTER TABLE `credit_entitlements` ADD CONSTRAINT `fk_credit_entitlement_owner` FOREIGN KEY (`customerAccountId`) REFERENCES `customer_accounts`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `credit_entitlements` ADD CONSTRAINT `fk_credit_entitlement_case_owner` FOREIGN KEY (`diagnosticCaseId`,`customerAccountId`) REFERENCES `diagnostic_cases`(`id`,`customerAccountId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `credit_entitlements` ADD CONSTRAINT `fk_credit_entitlement_payment_owner_case` FOREIGN KEY (`sourcePaymentRecordId`,`customerAccountId`,`diagnosticCaseId`) REFERENCES `payment_records`(`id`,`customerAccountId`,`diagnosticCaseId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `credit_entitlements` ADD CONSTRAINT `fk_credit_entitlement_report_owner_case` FOREIGN KEY (`sourceReportSnapshotId`,`customerAccountId`,`diagnosticCaseId`) REFERENCES `report_snapshots`(`id`,`customerAccountId`,`diagnosticCaseId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `report_snapshots` ADD CONSTRAINT `fk_report_snapshot_owner` FOREIGN KEY (`customerAccountId`) REFERENCES `customer_accounts`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `report_snapshots` ADD CONSTRAINT `fk_report_snapshot_case_owner` FOREIGN KEY (`diagnosticCaseId`,`customerAccountId`) REFERENCES `diagnostic_cases`(`id`,`customerAccountId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `report_snapshots` ADD CONSTRAINT `fk_report_snapshot_submission_owner_case` FOREIGN KEY (`questionnaireSubmissionId`,`customerAccountId`,`diagnosticCaseId`) REFERENCES `questionnaire_submissions`(`id`,`customerAccountId`,`diagnosticCaseId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `report_snapshots` ADD CONSTRAINT `fk_report_snapshot_evaluation_owner_case_submission` FOREIGN KEY (`questionnaireRuleEvaluationId`,`customerAccountId`,`diagnosticCaseId`,`questionnaireSubmissionId`) REFERENCES `questionnaire_rule_evaluations`(`id`,`customerAccountId`,`diagnosticCaseId`,`questionnaireSubmissionId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `report_snapshots` ADD CONSTRAINT `fk_report_snapshot_source_outbox` FOREIGN KEY (`sourceOutboxEventId`) REFERENCES `outbox_events`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `report_snapshots` ADD CONSTRAINT `fk_report_snapshot_evaluation_source_outbox` FOREIGN KEY (`sourceOutboxEventId`) REFERENCES `questionnaire_rule_evaluations`(`sourceOutboxEventId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX `credit_entitlements_owner_case_status_expiry_idx` ON `credit_entitlements` (`customerAccountId`,`diagnosticCaseId`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `report_snapshots_owner_case_status_version_idx` ON `report_snapshots` (`customerAccountId`,`diagnosticCaseId`,`status`,`reportVersion`);--> statement-breakpoint
CREATE INDEX `report_snapshots_status_lease_created_idx` ON `report_snapshots` (`status`,`leaseExpiresAt`,`createdAt`);