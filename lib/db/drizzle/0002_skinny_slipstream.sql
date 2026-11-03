CREATE TABLE IF NOT EXISTS "message_album_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"source_key" text NOT NULL,
	"telegram_message_id" integer NOT NULL,
	"media_kind" text NOT NULL,
	"media_data" "bytea" NOT NULL,
	"media_mime_type" text NOT NULL,
	"media_filename" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_group_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_data" "bytea";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_mime_type" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_filename" text;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_album_items_message_id_messages_id_fk' AND conrelid = 'message_album_items'::regclass) THEN
		ALTER TABLE "message_album_items" ADD CONSTRAINT "message_album_items_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_album_items_source_message_unique" ON "message_album_items" USING btree ("source_key","telegram_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_album_items_message_order" ON "message_album_items" USING btree ("message_id","telegram_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_album_group_unique" ON "messages" USING btree ("source_key","media_group_id");