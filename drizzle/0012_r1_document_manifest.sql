CREATE TABLE `r1_document_manifests` (
	`id` varchar(64) NOT NULL,
	`customerAccountId` varchar(64) NOT NULL,
	`diagnosticCaseId` varchar(64) NOT NULL,
	`accessGrantId` varchar(64) NOT NULL,
	`categoryId` varchar(64) NOT NULL,
	`fileName` varchar(180) NOT NULL,
	`format` enum('pdf','docx') NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`byteSize` int NOT NULL,
	`contentHashSha256` varchar(64) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`status` enum('uploaded','extracting','analyzed','manual_review_required','failed','deleted') NOT NULL DEFAULT 'uploaded',
	`trustedContent` boolean NOT NULL DEFAULT false,
	`promptInjectionRisk` enum('untrusted_document_content') NOT NULL DEFAULT 'untrusted_document_content',
	`failureCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deletedAt` timestamp,
	CONSTRAINT `r1_document_manifests_id` PRIMARY KEY(`id`),
	CONSTRAINT `r1_document_manifests_id_owner_case_uq` UNIQUE(`id`,`customerAccountId`,`diagnosticCaseId`),
	CONSTRAINT `r1_document_manifests_case_hash_uq` UNIQUE(`diagnosticCaseId`,`contentHashSha256`),
	CONSTRAINT `chk_r1_document_manifest_hash` CHECK(`r1_document_manifests`.`contentHashSha256` REGEXP '^[a-f0-9]{64}$'),
	CONSTRAINT `chk_r1_document_manifest_size` CHECK(`r1_document_manifests`.`byteSize` > 0 AND `r1_document_manifests`.`byteSize` <= 26214400)
);
--> statement-breakpoint
ALTER TABLE `r1_document_manifests` ADD CONSTRAINT `fk_r1_document_manifest_case_owner` FOREIGN KEY (`diagnosticCaseId`,`customerAccountId`) REFERENCES `diagnostic_cases`(`id`,`customerAccountId`) ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
ALTER TABLE `r1_document_manifests` ADD CONSTRAINT `fk_r1_document_manifest_grant_owner_case` FOREIGN KEY (`accessGrantId`) REFERENCES `access_grants`(`id`) ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
CREATE INDEX `r1_document_manifests_owner_case_status_idx` ON `r1_document_manifests` (`customerAccountId`,`diagnosticCaseId`,`status`);
