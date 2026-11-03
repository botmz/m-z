CREATE TABLE IF NOT EXISTS "message_translations" (
	"message_id" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"target_language" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" text NOT NULL,
	"translated_text" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_translations_key" PRIMARY KEY("message_id","provider","model","target_language","input_hash")
);
--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN IF NOT EXISTS "hide_source_link" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN IF NOT EXISTS "content_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_kind" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_translations_message_id_messages_id_fk' AND conrelid = 'message_translations'::regclass) THEN
		ALTER TABLE "message_translations" ADD CONSTRAINT "message_translations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;