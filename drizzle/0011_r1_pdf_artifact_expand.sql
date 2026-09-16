CREATE TABLE `report_pdf_artifacts` (
  `id` varchar(64) NOT NULL,
  `customerAccountId` varchar(64) NOT NULL,
  `diagnosticCaseId` varchar(64) NOT NULL,
  `reportSnapshotId` varchar(64) NOT NULL,
  `rendererVersion` varchar(64) NOT NULL,
  `status` enum('pending','ready','failed') NOT NULL DEFAULT 'pending',
  `storageKey` varchar(512),
  `contentHash` varchar(64),
  `byteSize` int,
  `failureCode` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp,
  CONSTRAINT `report_pdf_artifacts_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_report_pdf_artifact_snapshot_owner_case` FOREIGN KEY (`reportSnapshotId`,`customerAccountId`,`diagnosticCaseId`) REFERENCES `report_snapshots`(`id`,`customerAccountId`,`diagnosticCaseId`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_report_pdf_artifact_hash` CHECK (`contentHash` IS NULL OR `contentHash` REGEXP '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_pdf_artifacts_snapshot_renderer_uq` ON `report_pdf_artifacts` (`reportSnapshotId`,`rendererVersion`);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_pdf_artifacts_id_owner_case_uq` ON `report_pdf_artifacts` (`id`,`customerAccountId`,`diagnosticCaseId`);
--> statement-breakpoint
CREATE INDEX `report_pdf_artifacts_owner_case_status_idx` ON `report_pdf_artifacts` (`customerAccountId`,`diagnosticCaseId`,`status`);
