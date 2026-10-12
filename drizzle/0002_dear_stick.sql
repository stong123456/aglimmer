CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`topic` text NOT NULL,
	`kind` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`signature` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text NOT NULL,
	`media_key` text,
	`mime` text,
	`size` integer DEFAULT 0 NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_channel` ON `messages` (`topic`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_owner` ON `messages` (`owner_id`);