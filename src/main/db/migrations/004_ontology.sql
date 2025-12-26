-- Migration: 004_ontology
-- Description: Ontology tables for entity and relationship storage

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  canonical_name_normalized TEXT NOT NULL UNIQUE,
  types TEXT NOT NULL,
  attributes TEXT,
  source_chunk_ids TEXT NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entities_canonical_name ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_mention_count ON entities(mention_count);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_chunk_ids TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  UNIQUE (source_entity_id, target_entity_id, type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);
