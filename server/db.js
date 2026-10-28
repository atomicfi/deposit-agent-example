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

// Stores one event. reason says why a failed task failed. Atomic retries
// deliveries, so the same status can arrive more than once, and a late
// 'processing' can arrive after the task finished. Returns whether the task had
// already finished (completed or failed) before this event.
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
  const alreadyFinished = Boolean(
    db.prepare(`
      SELECT 1 FROM task_status_update_events
      WHERE task_id = ? AND status IN ('completed', 'failed')
      LIMIT 1
    `).get(taskId)
  )
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
  return { alreadyFinished }
}

// The latest event for each of the user's tasks, newest first. Once a task has
// finished, its finished event wins over any late 'processing' retry.
export function getTaskStatusUpdatedEvents(userIdentifier, limit = 10) {
  return db.prepare(`
    WITH ranked AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY task_id
        ORDER BY status IN ('completed', 'failed') DESC, id DESC
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
