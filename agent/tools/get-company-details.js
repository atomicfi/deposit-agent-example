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
