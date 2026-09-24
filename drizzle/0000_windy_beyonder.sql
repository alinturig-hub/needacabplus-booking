CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`pickup` text NOT NULL,
	`destination` text NOT NULL,
	`pickup_note` text NOT NULL,
	`vehicle` text NOT NULL,
	`fare_pence` integer NOT NULL,
	`status` text DEFAULT 'test_confirmed' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bookings_created_at` ON `bookings` (`created_at`);--> statement-breakpoint
CREATE TABLE `tariffs` (
	`id` text PRIMARY KEY NOT NULL,
	`base_pence` integer NOT NULL,
	`per_mile_pence` integer NOT NULL,
	`minimum_pence` integer NOT NULL,
	`updated_at` text NOT NULL
);
