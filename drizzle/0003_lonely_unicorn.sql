CREATE TABLE `paid_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paidSessionId` int NOT NULL,
	`blockId` int NOT NULL,
	`questionId` varchar(64) NOT NULL,
	`answerType` enum('single','multi','text','file') NOT NULL,
	`answerId` varchar(64),
	`answerIds` json,
	`answerText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paid_answers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paid_consent_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paidSessionId` int NOT NULL,
	`consentType` enum('user_agreement','marketing','data_processing') NOT NULL,
	`accepted` boolean NOT NULL,
	`documentVersion` varchar(32) NOT NULL,
	`acceptedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paid_consent_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paid_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paidSessionId` int NOT NULL,
	`blockId` int,
	`questionId` varchar(64),
	`fileName` varchar(512) NOT NULL,
	`fileSize` bigint,
	`mimeType` varchar(128),
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(1024) NOT NULL,
	`documentCategory` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paid_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paid_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paidSessionId` int NOT NULL,
	`riskCategory` enum('low','moderate','high','critical') NOT NULL,
	`keyFindings` json,
	`scopeAndLimitations` json,
	`factualInputs` json,
	`riskMap` json,
	`riskBlocks` json,
	`missingDocuments` json,
	`financialConsequences` json,
	`roadmap` json,
	`nextStep` json,
	`reportMarkdown` text,
	`criticalTriggers` json,
	`totalRiskScore` int,
	`generationModel` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paid_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `paid_reports_paidSessionId_unique` UNIQUE(`paidSessionId`)
);
--> statement-breakpoint
CREATE TABLE `paid_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionToken` varchar(128) NOT NULL,
	`freeSessionId` int,
	`contactName` varchar(255),
	`contactEmail` varchar(320) NOT NULL,
	`productName` varchar(255),
	`website` varchar(512),
	`paymentStatus` enum('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
	`paymentAmount` int DEFAULT 0,
	`paymentProvider` varchar(64),
	`paymentId` varchar(255),
	`paidAt` timestamp,
	`status` enum('created','payment_pending','paid','in_progress','completed','report_ready') NOT NULL DEFAULT 'created',
	`currentBlock` int DEFAULT 1,
	`currentQuestion` int DEFAULT 0,
	`anketaVersion` varchar(16) NOT NULL DEFAULT 'v1',
	`startedAt` timestamp,
	`completedAt` timestamp,
	`reportGeneratedAt` timestamp,
	`riskCategory` enum('low','moderate','high','critical'),
	`criticalTriggers` json,
	`userGoals` json,
	`urgencyDeadline` varchar(255),
	`criticalQuestion` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paid_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `paid_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
