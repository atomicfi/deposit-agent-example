// Sends events to every WebSocket listening on a thread.
import { WebSocket } from 'ws'

const sockets = new Map() // threadId -> Set<WebSocket>

export function subscribe(threadId, ws) {
  if (!sockets.has(threadId)) sockets.set(threadId, new Set())
  sockets.get(threadId).add(ws)
  ws.on('close', () => sockets.get(threadId)?.delete(ws))
}

export function publish(threadId, event) {
  const data = JSON.stringify(event)
  for (const ws of sockets.get(threadId) ?? []) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data)
  }
}
