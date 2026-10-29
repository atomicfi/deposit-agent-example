import { getTaskStatusUpdatedEvents } from '../../server/db.js'

export const checkEvents = {
  name: 'check_events',

  // ctx ({ userIdentifier, conversationId }) comes from the server, never the model.
  async handler(input, ctx) {
    return {
      now: new Date().toISOString(),
      events: getTaskStatusUpdatedEvents(ctx.userIdentifier, 10).map((e) => ({
        taskId: e.task_id,
        companyId: e.company_id,
        companyName: e.company_name,
        status: e.status,
        reason: e.reason,
        distributionType: e.distribution_type,
        distributionAmount: e.distribution_amount,
        receivedAt: e.received_at
      }))
    }
  }
}
