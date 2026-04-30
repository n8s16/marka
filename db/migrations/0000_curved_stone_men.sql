CREATE TABLE `bill` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`expected_amount` integer NOT NULL,
	`frequency` text NOT NULL,
	`interval_months` integer,
	`due_day` integer NOT NULL,
	`start_period` text NOT NULL,
	`default_wallet_id` text NOT NULL,
	`reminder_offset_days` integer NOT NULL,
	`reminder_time` text NOT NULL,
	`auto_forecast` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`default_wallet_id`) REFERENCES `wallet`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `bill_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`wallet_id` text NOT NULL,
	`amount` integer NOT NULL,
	`paid_date` text NOT NULL,
	`period` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bill`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallet`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_payment_bill_id_period_unique` ON `bill_payment` (`bill_id`,`period`);--> statement-breakpoint
CREATE INDEX `bill_payment_paid_date_idx` ON `bill_payment` (`paid_date`);--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expense` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`amount` integer,
	`category_id` text NOT NULL,
	`wallet_id` text NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallet`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `expense_date_idx` ON `expense` (`date`);--> statement-breakpoint
CREATE INDEX `expense_wallet_id_date_idx` ON `expense` (`wallet_id`,`date`);--> statement-breakpoint
CREATE TABLE `transfer` (
	`id` text PRIMARY KEY NOT NULL,
	`from_wallet_id` text NOT NULL,
	`to_wallet_id` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`from_wallet_id`) REFERENCES `wallet`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_wallet_id`) REFERENCES `wallet`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `transfer_from_wallet_id_date_idx` ON `transfer` (`from_wallet_id`,`date`);--> statement-breakpoint
CREATE INDEX `transfer_to_wallet_id_date_idx` ON `transfer` (`to_wallet_id`,`date`);--> statement-breakpoint
CREATE TABLE `wallet` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`icon` text,
	`type` text NOT NULL,
	`show_balance` integer DEFAULT false NOT NULL,
	`opening_balance` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
