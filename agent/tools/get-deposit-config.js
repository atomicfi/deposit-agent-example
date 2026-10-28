import { atomic } from '../../atomic/index.js'
import { getUserAccounts } from '../../server/db.js'

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
  screen, and confirms. They choose how much of their paycheck to move there, when their payroll
  system allows a choice. The paycheck goes to their account at this bank; you never need their
  account or routing number.
- Never ask for the user's password. Atomic collects sign-in details itself.
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
  async handler({ companyId, connectorId }, ctx, { newId, sdkEnvironment }) {
    // The name and logo for the button come from Atomic rather than the model,
    // which could misspell one or invent a logo URL.
    const { data: company } = await atomic.getCompanyDetails(companyId)

    // The model can name a connector the company doesn't have. Deeplinking to
    // it would fail in Transact, so drop it: the user then sees the company's
    // default payroll system, or picks one in Transact.
    const connectorIds = [company.connector, ...(company.alternativeConnectors ?? [])]
      .filter(Boolean)
      .map((c) => String(c._id))
    if (connectorId && !connectorIds.includes(connectorId)) {
      console.warn(`[tool] get_deposit_config dropped connector ${connectorId} not on company ${companyId}`)
      connectorId = undefined
    }

    // The accounts the paycheck can go to, from the app's own records.
    const accounts = getUserAccounts(ctx.userIdentifier)
    const { data } = await atomic.createAccessToken(ctx.userIdentifier, { accounts })
    return {
      output: { state: 'ready', company: company.name },
      clientAction: {
        type: 'launch_transact',
        id: newId(),
        label: 'Update Deposit',
        finishedLabel: `${company.name} deposit update submitted`,
        logo: company.branding?.logo?.url ? company.branding.logo : undefined,
        config: {
          scope: 'user-link',
          publicToken: data.publicToken,
          tasks: [{ operation: 'deposit' }],
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
