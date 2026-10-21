CREATE TABLE "admin_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destination_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"last_error" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destination_channels_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"destination_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"last_error" text,
	"last_message_at" timestamp with time zone,
	"last_message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_channels_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" integer NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"destination_id" integer,
	"destination_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"translation_status" text DEFAULT 'not_requested' NOT NULL,
	"rendered_text" text,
	"send_plan" jsonb,
	"error" text,
	"telegram_message_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer,
	"source_key" text NOT NULL,
	"telegram_message_id" integer NOT NULL,
	"text" text NOT NULL,
	"has_photo" boolean DEFAULT false NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_prices" (
	"symbol" text PRIMARY KEY NOT NULL,
	"price" double precision NOT NULL,
	"previous_price" double precision,
	"provider" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_source_id_source_channels_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_destination_id_destination_channels_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destination_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_delivery_id_message_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."message_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_destination_id_destination_channels_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destination_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_source_id_source_channels_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "routing_unique" ON "routing_rules" USING btree ("source_id","destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_dedup" ON "message_deliveries" USING btree ("message_id","destination_key");--> statement-breakpoint
CREATE INDEX "deliveries_queue" ON "message_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_dedup" ON "messages" USING btree ("source_key","telegram_message_id");