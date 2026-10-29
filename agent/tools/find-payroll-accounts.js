import { atomic } from '../../atomic/index.js'
import { getUserIdentity } from '../../server/db.js'

// Lookup results that say nothing about the user: the partner isn't enabled
// for this app.
const IGNORED = new Set(['PARTNER_DISABLED'])

export const findPayrollAccounts = {
  name: 'find_payroll_accounts',

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
