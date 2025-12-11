-- Tracks every file/folder in ~/Work/brain
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  relative_path TEXT NOT NULL,
  type TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  checksum TEXT,
  created_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  last_indexed_at INTEGER,
  indexed_status TEXT DEFAULT 'pending',
  error_message TEXT
);

-- Tracks individual chunks/embeddings
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  char_start INTEGER,
  char_end INTEGER,
  token_count INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(indexed_status);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
