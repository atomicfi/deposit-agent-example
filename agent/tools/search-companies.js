import { atomic } from '../../atomic/index.js'

// Enough candidates for the model to choose between, not enough to drown it.
const LIMIT = 10

export const searchCompanies = {
  name: 'search_companies',

  description: `
Search Atomic's directory of employers, payroll providers, and gig platforms by name. Only
companies where a direct deposit can be switched are returned.
- Matching is fuzzy, so partial and misspelled names work. Categories match nothing: 'grocery store'
  or 'hospital' finds nothing where 'Kroger' or 'Providence Health' finds the employer.
- Pass tags ['payroll-provider'] when the user names a payroll system rather than their employer.
- Pass connectorId to search only the employers who run on one payroll system, and franchiseParent
  to search only the franchisees under one brand.
- Each result has _id (pass it as companyId to other tools), name, status ('operational',
  'under-maintenance', or 'disabled'), tags, and hasAlternativeConnectors. The system prompt says
  what the tags and hasAlternativeConnectors mean for what to do next.`,

  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        maxLength: 50,
        description:
          "The name of one employer, payroll provider, or payroll portal, such as 'Kroger', 'ADP', or 'Workday'. Never a category or description. Leave it empty only to list a franchise parent's locations."
      },
      tags: {
        type: 'array',
        items: { enum: ['payroll-provider', 'gig-economy', 'unemployment'] },
        description:
          "Optional. Narrow the search, such as ['payroll-provider'] when the user names a payroll system."
      },
      connectorId: {
        type: 'string',
        description:
          "Optional. A payroll system's connector _id, from get_company_details, to find the user's employer among the employers on that system."
      },
      franchiseParent: {
        type: 'string',
        description:
          'Optional. The _id of a franchise parent, to search only the franchisees operating under it.'
      }
    },
    additionalProperties: false
  },

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
