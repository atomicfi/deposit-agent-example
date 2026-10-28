import { createAtomicClient } from './client.js'

export { AtomicApiError, UNKNOWN_USER, createAtomicClient } from './client.js'

// The app's one Atomic client. Reads its settings from the environment, so
// the env must be loaded before this module is first imported.
export const atomic = createAtomicClient()
