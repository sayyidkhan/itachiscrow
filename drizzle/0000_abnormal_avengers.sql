CREATE TABLE `usage_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`minute` integer NOT NULL,
	`minute_count` integer NOT NULL,
	`hour` integer NOT NULL,
	`hour_count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `usage_limits_expires` ON `usage_limits` (`expires`);