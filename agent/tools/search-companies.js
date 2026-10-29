import { atomic } from '../../atomic/index.js'

// Enough candidates for the model to choose between, not enough to drown it.
const LIMIT = 10

export const searchCompanies = {
  name: 'search_companies',

  // ctx ({ userIdentifier, conversationId }) comes from the server, never the model.
  async handler({ query = '', tags, connectorId, franchiseParent }, ctx) {
    const { data } = await atomic.searchCompanies({ query, tags, connectorId, franchiseParent })
    // A compact, decision-shaped summary rather than the raw payload: the
    // logo and connector details go to the app from get_deposit_config.
    return {
      companies: data.slice(0, LIMIT).map((c) => ({
        _id: c._id,
        name: c.name,
        status: c.status,
        tags: c.tags,
        // True when the company runs more than one payroll system, so the user
        // has to say which one is theirs.
        hasAlternativeConnectors: (c.alternativeConnectors?.length ?? 0) > 0
      }))
    }
  }
}
