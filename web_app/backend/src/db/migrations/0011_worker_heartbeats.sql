CREATE TABLE "worker_heartbeats" (
	"key" text PRIMARY KEY NOT NULL,
	"tick_at" timestamp with time zone NOT NULL,
	"expired" integer DEFAULT 0 NOT NULL,
	"claimed" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"retried" integer DEFAULT 0 NOT NULL,
	"cleaned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
