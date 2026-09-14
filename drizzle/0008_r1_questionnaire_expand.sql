CREATE TABLE `questionnaire_answer_revisions` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`questionnaireDraftId` varchar(64) NOT NULL,
	`questionId` varchar(64) NOT NULL,
	`draftRevision` int NOT NULL,
	`valueJson` json,
	`answerState` enum('active','inactive') NOT NULL,
	`source` enum('customer','system_branch_recompute') NOT NULL,
	`clientMutationIdHash` varchar(128) NOT NULL,
	`deactivationReasonCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `questionnaire_answer_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `questionnaire_answer_revisions_draft_question_revision_uq` UNIQUE(`questionnaireDraftId`,`questionId`,`draftRevision`),
	CONSTRAINT `questionnaire_answer_revisions_draft_mutation_uq` UNIQUE(`questionnaireDraftId`,`clientMutationIdHash`),
	CONSTRAINT `chk_questionnaire_answer_revision_positive` CHECK(`questionnaire_answer_revisions`.`draftRevision` > 0)
);
--> statement-breakpoint
CREATE TABLE `questionnaire_drafts` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`questionnaireReleaseId` varchar(64) NOT NULL,
	`questionnaireVersion` varchar(64) NOT NULL,
	`questionnaireContentHash` varchar(64) NOT NULL,
	`status` enum('open','submitted') NOT NULL DEFAULT 'open',
	`draftRevision` int NOT NULL DEFAULT 0,
	`currentQuestionId` varchar(64),
	`visibleQuestionIds` json NOT NULL,
	`visibleSetHash` varchar(64) NOT NULL,
	`manualFollowUpRequired` boolean NOT NULL DEFAULT false,
	`manualFollowUpTriggerIds` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `questionnaire_drafts_id` PRIMARY KEY(`id`),
	CONSTRAINT `questionnaire_drafts_case_uq` UNIQUE(`diagnosticCaseId`),
	CONSTRAINT `questionnaire_drafts_id_owner_case_uq` UNIQUE(`id`,`customerAccountId`,`diagnosticCaseId`),
	CONSTRAINT `chk_questionnaire_draft_revision_nonnegative` CHECK(`questionnaire_drafts`.`draftRevision` >= 0)
);
--> statement-breakpoint
CREATE TABLE `questionnaire_submissions` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`questionnaireDraftId` varchar(64) NOT NULL,
	`submissionVersion` int NOT NULL,
	`questionnaireReleaseId` varchar(64) NOT NULL,
	`questionnaireVersion` varchar(64) NOT NULL,
	`questionnaireContentHash` varchar(64) NOT NULL,
	`visibleQuestionIds` json NOT NULL,
	`visibleSetHash` varchar(64) NOT NULL,
	`manualFollowUpRequired` boolean NOT NULL,
	`manualFollowUpTriggerIds` json NOT NULL,
	`inputSnapshotJson` json NOT NULL,
	`inputSnapshotHash` varchar(64) NOT NULL,
	`submittedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `questionnaire_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `questionnaire_submissions_case_version_uq` UNIQUE(`diagnosticCaseId`,`submissionVersion`),
	CONSTRAINT `questionnaire_submissions_case_input_hash_uq` UNIQUE(`diagnosticCaseId`,`inputSnapshotHash`),
	CONSTRAINT `chk_questionnaire_submission_version_positive` CHECK(`questionnaire_submissions`.`submissionVersion` > 0)
);
--> statement-breakpoint
ALTER TABLE `questionnaire_answer_revisions` ADD CONSTRAINT `fk_questionnaire_answer_revision_draft_owner_case` FOREIGN KEY (`questionnaireDraftId`,`customerAccountId`,`diagnosticCaseId`) REFERENCES `questionnaire_drafts`(`id`,`customerAccountId`,`diagnosticCaseId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `questionnaire_drafts` ADD CONSTRAINT `fk_questionnaire_draft_case_owner` FOREIGN KEY (`diagnosticCaseId`,`customerAccountId`) REFERENCES `diagnostic_cases`(`id`,`customerAccountId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `questionnaire_submissions` ADD CONSTRAINT `fk_questionnaire_submission_draft_owner_case` FOREIGN KEY (`questionnaireDraftId`,`customerAccountId`,`diagnosticCaseId`) REFERENCES `questionnaire_drafts`(`id`,`customerAccountId`,`diagnosticCaseId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX `questionnaire_answer_revisions_draft_question_revision_idx` ON `questionnaire_answer_revisions` (`questionnaireDraftId`,`questionId`,`draftRevision`);--> statement-breakpoint
CREATE INDEX `questionnaire_answer_revisions_case_revision_idx` ON `questionnaire_answer_revisions` (`diagnosticCaseId`,`draftRevision`);--> statement-breakpoint
CREATE INDEX `questionnaire_drafts_owner_case_status_updated_idx` ON `questionnaire_drafts` (`customerAccountId`,`diagnosticCaseId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `questionnaire_submissions_owner_case_submitted_idx` ON `questionnaire_submissions` (`customerAccountId`,`diagnosticCaseId`,`submittedAt`);
