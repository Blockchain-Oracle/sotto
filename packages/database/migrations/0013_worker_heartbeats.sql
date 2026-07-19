-- Up Migration
CREATE TABLE sotto.worker_heartbeats (
  worker_id text COLLATE "C" PRIMARY KEY,
  kind text COLLATE "C" NOT NULL,
  source_commit text COLLATE "C" NOT NULL,
  started_at timestamp with time zone NOT NULL,
  beat_at timestamp with time zone NOT NULL,
  CONSTRAINT worker_heartbeats_beat_after_start CHECK (beat_at >= started_at)
);

-- Down Migration
DROP TABLE sotto.worker_heartbeats;
