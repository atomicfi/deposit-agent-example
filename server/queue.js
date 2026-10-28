// In-memory message queue, one FIFO per thread. The agent takes a thread's
// messages one at a time, in order, so two agent turns never run on the same
// thread at once, and sends each reply to the thread's WebSockets. Different
// threads run independently.
import { createDepositAgent } from '../agent/index.js'
import { publish } from './bus.js'
import { getUser } from './db.js'

const { sendMessage } = createDepositAgent()
const pending = new Map() // threadId -> items not yet handled

// Each user has one thread, keyed by their user ID.
export const threadIdFor = (userId) => userId

// item: { source, userId, text }. text is what the agent sees: the user's
// message, or a <system_event>. source is where it came from, for logs.
export function enqueue(threadId, item) {
  const items = pending.get(threadId)
  if (items) {
    // A drain is already running for this thread and will pick this up.
    items.push(item)
    return
  }
  pending.set(threadId, [item])
  drain(threadId)
}

// Queues an event the agent sees as a <system_event> and the user never sees.
// source is where it came from, for logs: 'webhook' or 'app'.
export function enqueueSystemEvent(userIdentifier, type, payload, source = 'webhook') {
  if (!getUser(userIdentifier)) return
  enqueue(threadIdFor(userIdentifier), {
    source,
    userId: userIdentifier,
    text: `<system_event type="${type}">${JSON.stringify(payload)}</system_event>`
  })
}

async function drain(threadId) {
  const items = pending.get(threadId)
  while (items.length) {
    await runTurn(threadId, items[0])
    items.shift()
  }
  pending.delete(threadId)
}

// One agent turn. The reply goes to the thread's WebSockets.
async function runTurn(threadId, item) {
  console.log(`[agent] thread=${threadId} source=${item.source}`)
  publish(threadId, { type: 'busy', busy: true })
  try {
    const { reply, action } = await sendMessage(item.text, {
      threadId,
      userIdentifier: item.userId
    })
    // action: something for the app to do, such as { type: 'launch_transact', ... }, or null.
    publish(threadId, {
      type: 'message',
      message: { id: crypto.randomUUID(), role: 'agent', text: reply, action }
    })
  } catch (err) {
    console.error(`[agent] thread=${threadId} turn failed`, err)
    publish(threadId, { type: 'error', error: 'The agent failed to respond.' })
  } finally {
    publish(threadId, { type: 'busy', busy: false })
  }
}
