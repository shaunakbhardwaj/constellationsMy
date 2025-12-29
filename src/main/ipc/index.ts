/**
 * IPC Handler Registration
 */

import { registerLLMHandlers } from './handlers/llm'
import { registerOntologyHandlers } from './handlers/ontology'

export function registerAllHandlers(): void {
  registerLLMHandlers()
  registerOntologyHandlers()
}
