import { atomic } from '../../atomic/index.js'
import { getUserAccounts, getUserIdentity } from '../../server/db.js'
import { allowedDistributionTypes, getDepositSettings } from '../../server/deposit-settings.js'

export const getDepositConfig = {
  name: 'get_deposit_config',

  description: `
Prepare Atomic's Transact SDK to switch the user's direct deposit at one company. The app shows an
"Update Deposit" button that opens Transact straight on that company's sign-in.
- Call it only once you know the company the user can sign in to as themselves: one specific
  employer, or a payroll system that needs nothing further. See the system prompt.
- Pass the company's _id as companyId. Pass connectorId only when the user chose one of the
  company's alternativeConnectors, or when you found their employer by searching a payroll system
  that requiresEmployerName (pass that system's connector._id); otherwise leave it out and the
  company's own payroll system is used.
- Nothing changes until the user taps the button, signs in to their payroll account in the Atomic
  screen, and confirms. The paycheck goes to their account at this bank; you never need their
  account or routing number.
- distribution: how much of the paycheck moves, once the user has confirmed it with you: type
  'total' (the whole paycheck), 'fixed' with amount in dollars, or 'percent' with amount from 1 to
  100. Only a type in the payroll system's distributionTypes from get_company_details. Leave it out
  when the user hasn't settled on an amount or you don't know which payroll system they'll sign in
  to; they then choose in the Atomic screen if the payroll system allows a choice.
- The result echoes the distribution set on the button, and amountCanChange says whether the user
  can still change it in the Atomic screen. Its distributionTypes are what the payroll system the
  button opens on allows; missing when the Atomic screen will ask which payroll system they use.
  Without a distribution, don't say the user can move part of their paycheck unless
  distributionTypes includes 'fixed' or 'percent'.
- Errors about the amount: 'distribution-not-allowed' (that kind of split isn't allowed; the result
  lists distributionTypes), 'amount-invalid', and 'payroll-system-unknown' (find out which payroll
  system they use first, or leave distribution out).
- Never ask for the user's password. Atomic collects sign-in details itself.
- For an account find_payroll_accounts found ('VERIFIED_PAYROLL'), pass its companyId and
  connectorId. The Atomic screen then verifies the user with a code from their payroll system
  instead of a password.
- If it returns an error instead of state 'ready', there's no button: the error says why. Don't tell
  the user to tap anything.
- After calling, tell the user to tap the button to continue. When they leave the Atomic screen, you
  get a transact-finished or transact-closed event, and Atomic's webhooks tell you when the switch
  starts and finishes.
- The app shows only the newest button, so a new one replaces any earlier button; never tell the
  user to tap an earlier one.`,

  schema: {
    type: 'object',
    properties: {
      companyId: {
        type: 'string',
        description: "The company's _id, from search_companies."
      },
      connectorId: {
        type: 'string',
        description:
          "Optional. The _id of the payroll system the user chose from the company's alternativeConnectors, or of the payroll system you found their employer through."
      },
      distribution: {
        type: 'object',
        description: 'Optional. The amount the user confirmed with you.',
        properties: {
          type: { enum: ['total', 'fixed', 'percent'] },
          amount: {
            type: 'number',
            description: "Dollars for 'fixed', a percentage from 1 to 100 for 'percent'. Leave it out for 'total'."
          }
        },
        required: ['type'],
        additionalProperties: false
      }
    },
    required: ['companyId'],
    additionalProperties: false
  },

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
