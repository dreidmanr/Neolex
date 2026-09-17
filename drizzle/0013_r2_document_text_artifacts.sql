CREATE TABLE `r1_document_text_artifacts` (
	`id` varchar(64) NOT NULL,
	`documentManifestId` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`extractorVersion` varchar(64) NOT NULL,
	`status` enum('queued','processing','analyzed','manual_review_required','failed') NOT NULL DEFAULT 'queued',
	`storageKey` varchar(512),
	`textHashSha256` varchar(64),
	`byteSize` int,
	`attemptCount` int NOT NULL DEFAULT 0,
	`leaseOwner` varchar(128),
	`leaseExpiresAt` timestamp,
	`failureCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `r1_document_text_artifacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `r1_document_text_artifacts_document_version_uq` UNIQUE(`documentManifestId`,`extractorVersion`),
	CONSTRAINT `chk_r1_document_text_artifact_hash` CHECK((`r1_document_text_artifacts`.`textHashSha256` IS NULL OR `r1_document_text_artifacts`.`textHashSha256` REGEXP '^[a-f0-9]{64}$')),
	CONSTRAINT `chk_r1_document_text_artifact_attempts` CHECK(`r1_document_text_artifacts`.`attemptCount` >= 0 AND `r1_document_text_artifacts`.`attemptCount` <= 3),
	CONSTRAINT `chk_r1_document_text_artifact_size` CHECK((`r1_document_text_artifacts`.`byteSize` IS NULL OR (`r1_document_text_artifacts`.`byteSize` > 0 AND `r1_document_text_artifacts`.`byteSize` <= 2097152)))
);
--> statement-breakpoint
ALTER TABLE `r1_document_text_artifacts` ADD CONSTRAINT `fk_r1_document_text_artifact_manifest_owner_case` FOREIGN KEY (`documentManifestId`,`customerAccountId`,`diagnosticCaseId`) REFERENCES `r1_document_manifests`(`id`,`customerAccountId`,`diagnosticCaseId`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX `r1_document_text_artifacts_queue_idx` ON `r1_document_text_artifacts` (`status`,`leaseExpiresAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `r1_document_text_artifacts_owner_case_idx` ON `r1_document_text_artifacts` (`customerAccountId`,`diagnosticCaseId`,`status`);
