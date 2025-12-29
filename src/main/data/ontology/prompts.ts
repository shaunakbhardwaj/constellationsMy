const ENTITY_TYPES = [
  'Person',
  'Organization',
  'Project',
  'Concept',
  'Location',
  'Date',
  'Other'
]

const RELATIONSHIP_TYPES = [
  'mentions',
  'works_with',
  'part_of',
  'related_to',
  'reports_to',
  'leads',
  'owns',
  'created_by',
  'located_in'
]

export const ONTOLOGY_SYSTEM_PROMPT = [
  'You are an information extraction system.',
  'Extract entities and relationships only from the provided text.',
  'Do not guess or fabricate.',
  'Return JSON with two arrays: entities and relationships.'
].join(' ')

export function buildExtractionPrompt(text: string): string {
  return [
    'Extract entities and relationships from the text below.',
    'Entities must include: name, type, confidence (0-1), and optional attributes.',
    `Allowed entity types: ${ENTITY_TYPES.join(', ')}.`,
    'Relationships must include: source, target, type, evidence, and optional confidence (0-1).',
    `Allowed relationship types: ${RELATIONSHIP_TYPES.join(', ')}.`,
    'Use short, canonical names for source and target.',
    'Text:',
    text
  ].join('\n')
}
