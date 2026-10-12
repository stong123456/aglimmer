CREATE TABLE `auth_identities` (
	`subject` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identities_user_id_unique` ON `auth_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_throttle` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_throttle_expiry` ON `auth_throttle` (`expires_at`);