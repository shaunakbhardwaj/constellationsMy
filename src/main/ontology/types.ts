/**
 * Ontology types for entity and relationship extraction/storage.
 */

export type EntityType =
  | 'Person'
  | 'Organization'
  | 'Project'
  | 'Concept'
  | 'Location'
  | 'Date'
  | 'Other'

export type RelationshipType =
  | 'mentions'
  | 'works_with'
  | 'part_of'
  | 'related_to'
  | 'reports_to'
  | 'leads'
  | 'owns'
  | 'created_by'
  | 'located_in'

export interface ExtractedEntity {
  name: string
  type: EntityType
  confidence: number
  attributes?: Record<string, unknown>
}

export interface ExtractedRelationship {
  source: string
  target: string
  type: RelationshipType
  evidence: string
  confidence?: number
}

export interface ExtractionResult {
  entities: ExtractedEntity[]
  relationships: ExtractedRelationship[]
}

export interface EntityRow {
  id: string
  canonical_name: string
  canonical_name_normalized: string
  types: string
  attributes: string | null
  source_chunk_ids: string
  mention_count: number
  first_seen_at: number
  last_seen_at: number
}

export interface RelationshipRow {
  id: string
  source_entity_id: string
  target_entity_id: string
  type: string
  confidence: number
  evidence_chunk_ids: string | null
  created_at: number
}

export interface TypeAssignment {
  type: EntityType
  confidence: number
}

export interface Entity {
  id: string
  canonicalName: string
  types: TypeAssignment[]
  attributes: Record<string, unknown>
  sourceChunkIds: string[]
  mentionCount: number
  firstSeenAt: number
  lastSeenAt: number
}

export interface Relationship {
  id: string
  sourceEntityId: string
  targetEntityId: string
  type: RelationshipType
  confidence: number
  evidenceChunkIds: string[]
  createdAt: number
}

export interface OntologyChunk {
  id: string
  text: string
  fileId?: string
  chunkIndex?: number
}

export interface OntologySearchResult {
  chunkId: string
  text: string
  score: number
  entityPath?: string[]
}
