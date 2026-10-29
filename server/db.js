// Single-file SQLite database using Node's built-in node:sqlite.
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const dbPath = fileURLToPath(new URL('../data.db', import.meta.url))

export const db = new DatabaseSync(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    firstname TEXT NOT NULL,
    lastname TEXT NOT NULL
  )
`)

// Seed the user from USER_IDENTIFIER so there is someone to chat as.
db.prepare(
  'INSERT OR IGNORE INTO users (id, firstname, lastname) VALUES (?, ?, ?)'
).run(process.env.USER_IDENTIFIER, 'Test', 'User')

export function getUser(id) {
  return db.prepare('SELECT id, firstname, lastname FROM users WHERE id = ?').get(id)
}

// No login yet: every request from the app acts as the seeded test user.
export function getCurrentUser() {
  return getUser(process.env.USER_IDENTIFIER)
}

// The bank accounts the user's paycheck can be switched to. A real app would
// look up the user's own accounts at your bank; this returns Atomic's example
// account, which works in the sandbox, for every user. Atomic shows title in
// Transact.
// https://docs.atomicfi.com/reference/api#access-token__create-access-token
export function getUserAccounts(userId) {
  return [
    {
      accountNumber: '220000000',
      routingNumber: '110000000',
      type: 'checking',
      title: 'Premier Plus Checking'
    }
  ]
}

// Every task-status-updated webhook for the deposit product, one row per event,
// so a task's whole history is kept. payload is the webhook exactly as Atomic
// sent it. distribution_type is how much of the paycheck moves: 'total',
// 'fixed' (a dollar distribution_amount), or 'percent' (a percentage).
db.exec(`
  CREATE TABLE IF NOT EXISTS task_status_update_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    user_identifier TEXT,
    company_id TEXT,
    company_name TEXT,
    status TEXT,
    reason TEXT,
    distribution_type TEXT,
    distribution_amount REAL,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)
db.exec(`
  CREATE INDEX IF NOT EXISTS task_status_update_events_by_user
    ON task_status_update_events (user_identifier, task_id)
`)

// Stores one event. reason says why a failed task failed. Atomic sends each
// task two events: 'processing' when it starts, then 'completed' or 'failed'.
export function saveTaskStatusUpdatedEvent({
  taskId,
  userIdentifier,
  companyId,
  companyName,
  status,
  reason,
  distributionType,
  distributionAmount,
  payload
}) {
  db.prepare(`
    INSERT INTO task_status_update_events
      (task_id, user_identifier, company_id, company_name, status, reason,
       distribution_type, distribution_amount, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    userIdentifier ?? null,
    companyId ?? null,
    companyName ?? null,
    status ?? null,
    reason ?? null,
    distributionType ?? null,
    distributionAmount ?? null,
    JSON.stringify(payload)
  )
}

// A task's status as the agent should see it: a final status ('completed' or 'failed') wins over
// 'processing', since Atomic can deliver a task's events out of order. null when none has arrived.
export function getTaskStatus(taskId) {
  return db.prepare(`
    SELECT status FROM task_status_update_events
    WHERE task_id = ?
    ORDER BY status IN ('completed', 'failed') DESC, id DESC
    LIMIT 1
  `).get(taskId)?.status ?? null
}

// Whether any webhook has arrived for the task.
export function hasTaskStatusUpdatedEvents(taskId) {
  return Boolean(
    db.prepare('SELECT 1 FROM task_status_update_events WHERE task_id = ? LIMIT 1').get(taskId)
  )
}

// The latest event for each of the user's tasks, newest first. A final status wins over a
// 'processing' that arrived after it.
export function getTaskStatusUpdatedEvents(userIdentifier, limit = 10) {
  return db.prepare(`
    WITH ranked AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY task_id ORDER BY status IN ('completed', 'failed') DESC, id DESC
      ) AS rank
      FROM task_status_update_events
      WHERE user_identifier = ?
    )
    SELECT task_id, company_id, company_name, status, reason,
      distribution_type, distribution_amount, received_at
    FROM ranked
    WHERE rank = 1
    ORDER BY id DESC
    LIMIT ?
  `).all(userIdentifier, limit)
}
