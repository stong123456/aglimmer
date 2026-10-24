CREATE TABLE `backup_deletions` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`resource_id` text NOT NULL,
	`deleted_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maintenance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL,
	`summary` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_health` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`checked_at` text NOT NULL,
	`next_check_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`http_status` integer
);
