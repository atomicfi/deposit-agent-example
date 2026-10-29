import { atomic } from '../../atomic/index.js'
import { allowedDistributionTypes } from '../../server/deposit-settings.js'

function describeConnector(connector) {
  return {
    _id: connector._id,
    name: connector.name,
    supportsDepositSwitch: connector.availableProducts?.includes('deposit') ?? false,
    distributionTypes: allowedDistributionTypes(connector)
  }
}

export const getCompanyDetails = {
  name: 'get_company_details',

  description: `
Look up one company by its _id from search_companies. Call it when a search result is tagged
'franchise-parent' or 'payroll-provider', or has hasAlternativeConnectors, and when the user asks a
follow-up about a company you found. Don't call it on every turn.
- supportsDepositSwitch: whether a direct deposit can be switched there.
- status and underMaintenanceProductsAndActions: 'under-maintenance' with 'deposit' in the list, or
  with the list null, means a switch can't start right now.
- distributionTypes: how much of the paycheck can move through the company's own payroll system, as
  this bank allows it. 'total' alone means the whole paycheck has to move together; 'fixed' (a dollar
  amount) and 'percent' mean part of it can go to the new account. Each alternativeConnector has its
  own distributionTypes.
- isFranchiseParent: a brand, not an employer. The franchisee running the user's location pays them.
- requiresEmployerName: a payroll system whose sign-in differs for each employer, such as Workday.
  Find the employer by searching with this system's connector._id as connectorId. If the user can't
  say, the button still works: the Atomic screen asks them for their employer.
- connector: the payroll system the company uses by default.
- alternativeConnectors: other payroll systems behind this company. When present, only the user
  knows which one pays them. If they don't know, the Atomic screen asks them.`,

  schema: {
    type: 'object',
    properties: {
      companyId: {
        type: 'string',
        description: "The company's _id, from search_companies."
      }
    },
    required: ['companyId'],
    additionalProperties: false
  },

  // ctx ({ userIdentifier, conversationId }) comes from the server, never the model.
  async handler({ companyId }, ctx) {
    const { data: company } = await atomic.getCompanyDetails(companyId)
    const alternatives = company.alternativeConnectors ?? []
    return {
      name: company.name,
      status: company.status,
      underMaintenanceProductsAndActions: company.underMaintenanceProductsAndActions ?? null,
      supportsDepositSwitch: company.availableProducts?.includes('deposit') ?? false,
      distributionTypes: allowedDistributionTypes(company.connector),
      isFranchiseParent: company.tags?.includes('franchise-parent') ?? false,
      requiresEmployerName: company.isConfigurableConnector ?? false,
      connector: company.connector?._id ? describeConnector(company.connector) : null,
      ...(alternatives.length && { alternativeConnectors: alternatives.map(describeConnector) })
    }
  }
}
