import { getTaskStatusUpdatedEvents } from '../../server/db.js'

export const checkEvents = {
  name: 'check_events',

  description: `
Check where the user's direct deposit switches stand. Call this after a transact-finished event,
and when the user asks whether their switch went through. The system prompt explains how to read
the result and what to tell the user.
- events: one entry per deposit task, newest first, with the task's current status. Each has taskId,
  companyId, companyName, status ('processing', 'completed', or 'failed'), reason (why it failed),
  distributionType ('total', 'fixed', or 'percent'), distributionAmount (dollars for 'fixed', a
  percentage from 0 to 100 for 'percent', null for 'total'), and receivedAt (UTC).
- The switch the user just worked on is the event whose taskId matches the taskId from the
  transact-finished or transact-closed event. Other events are from earlier switches, possibly in
  earlier conversations; now (UTC) tells you how long ago they were.`,

  schema: {
    type: "object",
    properties: {},
    additionalProperties: false
  },

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
