CREATE TABLE IF NOT EXISTS "sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "status" text DEFAULT 'running' NOT NULL,
  "rows_processed" integer,
  "error_message" text,
  "stats" jsonb,
  "attempt" integer DEFAULT 1 NOT NULL,
  "duration_ms" integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_runs_source_started" ON "sync_runs" USING btree ("source","started_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_runs_status" ON "sync_runs" USING btree ("status");
