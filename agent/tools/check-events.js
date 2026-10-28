import { getTaskStatusUpdatedEvents } from '../../server/db.js'

export const checkEvents = {
  name: 'check_events',

  description: `
Check where the user's recent direct deposit switches stand. Call this after a transact-finished or
transact-closed event, and when the user asks whether their switch went through. The system prompt
explains how to read the result and what to tell the user.
- now: the current time (UTC), to tell recent events from earlier ones. Only count an event as
  being about the switch the user just worked on if its company matches and it was received in the
  last 15 minutes; older events are from earlier switches.
- events: task-status-updated webhooks for the user's deposit tasks, newest first: the latest event
  for each task, where an event saying the task finished counts over a later 'processing' one. Each
  event has task_id (the task it's about), company_id, company_name, status ('processing',
  'completed', or 'failed'), reason (why it failed), distribution_type ('total', 'fixed', or
  'percent'), distribution_amount (dollars for 'fixed', a percentage for 'percent', empty for
  'total'), and received_at (UTC).`,

  schema: {
    type: "object",
    properties: {},
    additionalProperties: false
  },

  // ctx ({ userIdentifier, conversationId }) comes from the server, never the model.
  async handler(input, ctx) {
    return {
      now: new Date().toISOString(),
      events: getTaskStatusUpdatedEvents(ctx.userIdentifier, 10)
    }
  }
}
