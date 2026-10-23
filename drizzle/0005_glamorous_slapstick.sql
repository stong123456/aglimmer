CREATE TABLE `account_closures` (
	`user_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`requested_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`object_keys` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `closed_identities` (
	`subject_hash` text PRIMARY KEY NOT NULL,
	`closed_at` text NOT NULL
);
