CREATE TABLE `feedbacks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionToken` varchar(64),
	`rating` int NOT NULL,
	`usefulnessRating` int,
	`wouldRecommend` boolean,
	`comment` text,
	`foundAccurate` boolean,
	`interestedInPaid` boolean,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feedbacks_id` PRIMARY KEY(`id`)
);
