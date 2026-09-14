CREATE TABLE `questionnaire_rule_evaluations` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`questionnaireSubmissionId` varchar(64) NOT NULL,
	`sourceOutboxEventId` varchar(64) NOT NULL,
	`submittedCaseStateVersion` int NOT NULL,
	`rulesetId` varchar(64) NOT NULL,
	`rulesetVersion` varchar(64) NOT NULL,
	`rulesetHash` varchar(64) NOT NULL,
	`inputSnapshotHash` varchar(64) NOT NULL,
	`status` enum('pending','succeeded','manual_review_required','failed') NOT NULL DEFAULT 'pending',
	`outcomeJson` json,
	`outcomeHash` varchar(64),
	`manualReviewRequired` boolean NOT NULL DEFAULT false,
	`failureCode` varchar(64),
	`startedAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `questionnaire_rule_evaluations_id` PRIMARY KEY(`id`),
	CONSTRAINT `questionnaire_rule_evaluations_source_outbox_uq` UNIQUE(`sourceOutboxEventId`),
	CONSTRAINT `questionnaire_rule_evaluations_submission_ruleset_uq` UNIQUE(`questionnaireSubmissionId`,`rulesetHash`),
	CONSTRAINT `questionnaire_rule_evaluations_id_owner_case_submission_uq` UNIQUE(`id`,`customerAccountId`,`diagnosticCaseId`,`questionnaireSubmissionId`),
	CONSTRAINT `chk_questionnaire_rule_evaluation_state_version_positive` CHECK(`questionnaire_rule_evaluations`.`submittedCaseStateVersion` > 0),
	CONSTRAINT `chk_questionnaire_rule_evaluation_hashes` CHECK((
      `questionnaire_rule_evaluations`.`rulesetHash` REGEXP '^[a-f0-9]{64}$'
      AND `questionnaire_rule_evaluations`.`inputSnapshotHash` REGEXP '^[a-f0-9]{64}$'
      AND (`questionnaire_rule_evaluations`.`outcomeHash` IS NULL OR `questionnaire_rule_evaluations`.`outcomeHash` REGEXP '^[a-f0-9]{64}$')
    )),
	CONSTRAINT `chk_questionnaire_rule_evaluation_lifecycle` CHECK((
      (`questionnaire_rule_evaluations`.`status` = 'pending' AND `questionnaire_rule_evaluations`.`outcomeJson` IS NULL AND `questionnaire_rule_evaluations`.`outcomeHash` IS NULL AND `questionnaire_rule_evaluations`.`manualReviewRequired` = false AND `questionnaire_rule_evaluations`.`failureCode` IS NULL AND `questionnaire_rule_evaluations`.`completedAt` IS NULL)
      OR (`questionnaire_rule_evaluations`.`status` = 'succeeded' AND `questionnaire_rule_evaluations`.`outcomeJson` IS NOT NULL AND `questionnaire_rule_evaluations`.`outcomeHash` IS NOT NULL AND `questionnaire_rule_evaluations`.`manualReviewRequired` = false AND `questionnaire_rule_evaluations`.`failureCode` IS NULL AND `questionnaire_rule_evaluations`.`completedAt` IS NOT NULL)
      OR (`questionnaire_rule_evaluations`.`status` = 'manual_review_required' AND `questionnaire_rule_evaluations`.`outcomeJson` IS NOT NULL AND `questionnaire_rule_evaluations`.`outcomeHash` IS NOT NULL AND `questionnaire_rule_evaluations`.`manualReviewRequired` = true AND `questionnaire_rule_evaluations`.`failureCode` IS NULL AND `questionnaire_rule_evaluations`.`completedAt` IS NOT NULL)
      OR (`questionnaire_rule_evaluations`.`status` = 'failed' AND `questionnaire_rule_evaluations`.`outcomeJson` IS NULL AND `questionnaire_rule_evaluations`.`outcomeHash` IS NULL AND `questionnaire_rule_evaluations`.`manualReviewRequired` = false AND `questionnaire_rule_evaluations`.`failureCode` IS NOT NULL AND `questionnaire_rule_evaluations`.`completedAt` IS NOT NULL)
    ))
);
--> statement-breakpoint
ALTER TABLE `outbox_events` ADD `leaseOwner` varchar(64);--> statement-breakpoint
ALTER TABLE `outbox_events` ADD `leaseVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `outbox_events` ADD `leaseExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `questionnaire_submissions` ADD `legalCoreReleaseId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `questionnaire_submissions` ADD `legalCoreVersion` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `questionnaire_submissions` ADD `rulesetId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `questionnaire_submissions` ADD `rulesetBundleHash` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `questionnaire_submissions` ADD CONSTRAINT `questionnaire_submissions_id_owner_case_uq` UNIQUE(`id`,`customerAccountId`,`diagnosticCaseId`);--> statement-breakpoint
ALTER TABLE `questionnaire_rule_evaluations` ADD CONSTRAINT `fk_questionnaire_rule_evaluation_owner` FOREIGN KEY (`customerAccountId`) REFERENCES `customer_accounts`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `questionnaire_rule_evaluations` ADD CONSTRAINT `fk_questionnaire_rule_evaluation_case_owner` FOREIGN KEY (`diagnosticCaseId`,`customerAccountId`) REFERENCES `diagnostic_cases`(`id`,`customerAccountId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `questionnaire_rule_evaluations` ADD CONSTRAINT `fk_questionnaire_rule_evaluation_submission_owner_case` FOREIGN KEY (`questionnaireSubmissionId`,`customerAccountId`,`diagnosticCaseId`) REFERENCES `questionnaire_submissions`(`id`,`customerAccountId`,`diagnosticCaseId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `questionnaire_rule_evaluations` ADD CONSTRAINT `fk_questionnaire_rule_evaluation_source_outbox` FOREIGN KEY (`sourceOutboxEventId`) REFERENCES `outbox_events`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX `questionnaire_rule_evaluations_owner_case_status_idx` ON `questionnaire_rule_evaluations` (`customerAccountId`,`diagnosticCaseId`,`status`,`createdAt`);--> statement-breakpoint
ALTER TABLE `outbox_events` ADD CONSTRAINT `chk_outbox_event_attempt_count_nonnegative` CHECK (`outbox_events`.`attemptCount` >= 0);--> statement-breakpoint
ALTER TABLE `outbox_events` ADD CONSTRAINT `chk_outbox_event_lease_version_nonnegative` CHECK (`outbox_events`.`leaseVersion` >= 0);--> statement-breakpoint
ALTER TABLE `outbox_events` ADD CONSTRAINT `chk_outbox_event_lease_lifecycle` CHECK ((
      (`outbox_events`.`status` = 'processing' AND `outbox_events`.`leaseOwner` IS NOT NULL AND `outbox_events`.`leaseExpiresAt` IS NOT NULL)
      OR (`outbox_events`.`status` <> 'processing' AND `outbox_events`.`leaseOwner` IS NULL AND `outbox_events`.`leaseExpiresAt` IS NULL)
    ));--> statement-breakpoint
ALTER TABLE `questionnaire_submissions` ADD CONSTRAINT `chk_questionnaire_submission_legal_core_identity` CHECK ((
      `questionnaire_submissions`.`legalCoreReleaseId` REGEXP '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
      AND `questionnaire_submissions`.`legalCoreVersion` REGEXP '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
      AND `questionnaire_submissions`.`rulesetId` REGEXP '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
      AND `questionnaire_submissions`.`rulesetBundleHash` REGEXP '^[a-f0-9]{64}$'
    ));--> statement-breakpoint
CREATE INDEX `outbox_events_lease_expiry_idx` ON `outbox_events` (`leaseExpiresAt`);