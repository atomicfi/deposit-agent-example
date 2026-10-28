// Backend client. The simulator shares the Mac's network, so localhost works
// there; a physical device needs the Mac's LAN IP in EXPO_PUBLIC_API_URL.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

// Queues a message for the agent. The reply arrives on the WebSocket (see connect).
export function sendMessage(message) {
  return post('/user-message', { message })
}

// Forwards a Transact SDK event to the agent: event is 'finish' (onFinish) or
// 'close' (onClose), data is the fields of the SDK's payload the agent uses. The
// agent's follow-up arrives on the WebSocket.
export function sendTransactEvent(event, data) {
  return post('/transact-events', { event, data })
}

async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Server error ${res.status}`)
  }
}

// Listens on the user's thread and reconnects when the connection drops.
// onEvent gets each server event:
//   { type: 'message', message }   an agent message: { id, role, text, action }
//   { type: 'busy', busy }         whether the agent is working on a turn
//   { type: 'error', error }       the agent failed to respond
// onConnectedChange gets true or false as the connection opens and drops.
// Returns a function that closes the connection for good.
export function connect(onEvent, onConnectedChange) {
  let ws
  let retry
  let closed = false

  function open() {
    ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws`)
    ws.onopen = () => onConnectedChange?.(true)
    ws.onmessage = (e) => onEvent(JSON.parse(e.data))
    ws.onclose = () => {
      onConnectedChange?.(false)
      if (!closed) retry = setTimeout(open, 1000)
    }
  }

  open()
  return () => {
    closed = true
    clearTimeout(retry)
    ws.close()
  }
}
