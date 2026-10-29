import { atomic } from '../../atomic/index.js'
import { getUserIdentity } from '../../server/db.js'

// Lookup results that say nothing about the user: the partner isn't enabled
// for this app.
const IGNORED = new Set(['PARTNER_DISABLED'])

export const findPayrollAccounts = {
  name: 'find_payroll_accounts',

  description: `
Look the user up in the payroll systems Atomic can reach with CoAuth (ADP today), using identity
details this bank already has. When one finds them, the user can switch their deposit there by
confirming a code the payroll system sends them, instead of signing in with a password.
- Call it once the user has said they want to move their direct deposit, and before asking who pays
  them. The payroll partners require that the user asked first, so never call it before that.
- It takes no input. The server supplies the identity; you never see it and must never ask for it.
- accounts: one entry per payroll system checked, each with companyId, companyName, connectorId,
  connectorName and userStatus. 'VERIFIED_PAYROLL': the user has an account there that can be
  switched. 'NOT_FOUND': they weren't found there. 'UNSUPPORTED_PAYROLL': they were found, but their
  employer doesn't allow a switch through this payroll system.
- available false: this bank has no identity details for the user, so carry on without CoAuth.
- A found account is a payroll system, not the user's employer, and the user may have other jobs.
  Ask whether it's the paycheck they want to move before offering a button.`,

  schema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },

  // ctx ({ userIdentifier, conversationId }) comes from the server, never the model.
  async handler(input, ctx) {
    const identity = getUserIdentity(ctx.userIdentifier)
    if (!identity) return { available: false }
    const { data } = await atomic.preScreen(ctx.userIdentifier, identity)
    return {
      available: true,
      accounts: (data.incomeSources ?? [])
        .filter((s) => !IGNORED.has(s.data?.userStatus))
        .map((s) => ({
          companyId: s.company?._id,
          companyName: s.company?.name,
          connectorId: s.connector?._id,
          connectorName: s.connector?.name,
          userStatus: s.data?.userStatus
        }))
    }
  }
}
