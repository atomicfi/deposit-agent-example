import { atomic } from '../../atomic/index.js'
import { getUserAccounts, getUserIdentity } from '../../server/db.js'
import { allowedDistributionTypes, getDepositSettings } from '../../server/deposit-settings.js'

export const getDepositConfig = {
  name: 'get_deposit_config',

  // Besides its output for the model, this tool returns a clientAction: the
  // config the app needs to open Atomic's Transact SDK. The public token in it
  // goes to the app only, never to the model.
  returnsClientAction: true,

  // ctx ({ userIdentifier, conversationId }) comes from the server, never the model.
  async handler({ companyId, connectorId, distribution }, ctx, { newId, sdkEnvironment }) {
    // The name and logo for the button come from Atomic rather than the model,
    // which could misspell one or invent a logo URL.
    const { data: company } = await atomic.getCompanyDetails(companyId)

    // Transact would show an error for a company or payroll system without
    // deposit, or for a connector the company doesn't have. Tell the model,
    // so it doesn't promise a button that opens on the wrong payroll system.
    if (!company.availableProducts?.includes('deposit')) {
      return { output: { error: 'deposit-not-supported', company: company.name } }
    }
    const connectors = [company.connector, ...(company.alternativeConnectors ?? [])].filter(Boolean)
    // The payroll system the button opens on: the one the model chose, or the company's own when it
    // has no others. Unknown when Transact will ask the user to pick.
    let chosen = company.alternativeConnectors?.length ? null : company.connector
    if (connectorId) {
      chosen = connectors.find((c) => String(c._id) === connectorId)
      if (!chosen) {
        return {
          output: {
            error: 'connector-not-on-company',
            company: company.name,
            connectors: connectors.map((c) => ({ _id: c._id, name: c.name }))
          }
        }
      }
      if (!chosen.availableProducts?.includes('deposit')) {
        return { output: { error: 'deposit-not-supported', company: company.name, connector: chosen.name } }
      }
    }

    // The amount has to be one the bank and the payroll system allow. Transact
    // would otherwise fail the switch, after the user has signed in.
    const allowed = chosen ? allowedDistributionTypes(chosen) : null
    if (distribution) {
      const { type, amount } = distribution
      const problem =
        type === 'total' ? null
        : !allowed ? 'payroll-system-unknown'
        : !allowed.includes(type) ? 'distribution-not-allowed'
        : type !== 'total' && !(amount > 0 && (type !== 'percent' || amount <= 100)) ? 'amount-invalid'
        : null
      if (problem) {
        return { output: { error: problem, company: company.name, ...(allowed && { distributionTypes: allowed }) } }
      }
    }
    const { canUpdateAmount } = getDepositSettings()

    // The accounts the paycheck can go to, and the user's identity for CoAuth,
    // from the app's own records. With identity, Transact uses CoAuth on a
    // partner payroll system and links the token to find_payroll_accounts'
    // lookup, which used the same user identifier.
    const accounts = getUserAccounts(ctx.userIdentifier)
    const identity = getUserIdentity(ctx.userIdentifier) ?? undefined
    const { data } = await atomic.createAccessToken(ctx.userIdentifier, { accounts, identity })
    return {
      output: {
        state: 'ready',
        company: company.name,
        ...(allowed && { distributionTypes: allowed }),
        ...(distribution && { distribution, amountCanChange: canUpdateAmount })
      },
      clientAction: {
        type: 'launch_transact',
        id: newId(),
        label: 'Update Deposit',
        finishedLabel: `${company.name} deposit update submitted`,
        logo: company.branding?.logo?.url ? company.branding.logo : undefined,
        config: {
          scope: 'user-link',
          publicToken: data.publicToken,
          tasks: [
            {
              operation: 'deposit',
              // Without canUpdate, the user can't change it in Transact.
              ...(distribution && {
                distribution: {
                  type: distribution.type,
                  ...(distribution.type !== 'total' && { amount: distribution.amount }),
                  canUpdate: canUpdateAmount
                }
              })
            }
          ],
          // Opens Transact on the company's sign-in, skipping its own search.
          // https://docs.atomicfi.com/guides/deeplink-to-login
          deeplink: {
            step: 'login-company',
            companyId,
            ...(connectorId && { connectorId })
          }
        },
        environment: sdkEnvironment
      }
    }
  }
}
