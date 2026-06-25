CREATE TABLE `consent_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`consentType` enum('user_agreement','marketing') NOT NULL,
	`accepted` boolean NOT NULL,
	`documentVersion` varchar(32) NOT NULL,
	`acceptedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consent_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`name` varchar(255),
	`email` varchar(320) NOT NULL,
	`phone` varchar(64),
	`productName` varchar(255),
	`website` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `diagnostic_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionToken` varchar(128) NOT NULL,
	`status` enum('started','consented','contact_collected','in_progress','completed') NOT NULL DEFAULT 'started',
	`riskCategory` enum('low','moderate','high','critical'),
	`totalScore` int,
	`hasCriticalEvent` boolean DEFAULT false,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `diagnostic_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `diagnostic_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
--> statement-breakpoint
CREATE TABLE `questionnaire_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`questionId` varchar(64) NOT NULL,
	`answerId` varchar(64) NOT NULL,
	`answerText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `questionnaire_answers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scoring_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`riskCategory` enum('low','moderate','high','critical') NOT NULL,
	`totalScore` int NOT NULL,
	`hasCriticalEvent` boolean NOT NULL DEFAULT false,
	`criticalEvents` json,
	`significantRisks` json,
	`riskBlocks` json,
	`mainConclusion` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scoring_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `scoring_results_sessionId_unique` UNIQUE(`sessionId`)
);
