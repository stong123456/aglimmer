CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`voice_id` text NOT NULL,
	`action` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`user_id` text NOT NULL,
	`voice_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `voice_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`voice_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_voice` ON `reports` (`voice_id`);--> statement-breakpoint
CREATE TABLE `voices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`signature` text NOT NULL,
	`recorded_at` text NOT NULL,
	`created_at` text NOT NULL,
	`mood` text NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`duration` integer NOT NULL,
	`size` integer NOT NULL,
	`audio_key` text NOT NULL,
	`mime` text NOT NULL,
	`visibility` text NOT NULL,
	`status` text NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`future_year` integer,
	`parent_id` text,
	`review_note` text DEFAULT '' NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	FOREIGN KEY (`owner_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `voices_public` ON `voices` (`status`,`featured`,`created_at`);--> statement-breakpoint
CREATE INDEX `voices_owner` ON `voices` (`owner_id`,`created_at`);