// Transact SDK events from the app, so the agent can follow up when the user
// leaves the Atomic screen.
import { Router } from "express";
import { getCurrentUser, hasTaskStatusUpdatedEvents } from "../db.js";
import { enqueueSystemEvent } from "../queue.js";

export const transactEventsRouter = Router();

// event is 'finish' (onFinish) or 'close' (onClose); data is the fields of the
// SDK's payload the agent uses, which the app picks out: taskId, when Transact
// created a task. It goes to the agent as is.
const EVENT_TYPES = { finish: "transact-finished", close: "transact-closed" };

transactEventsRouter.post("/", (req, res) => {
  const { event, data = {} } = req.body ?? {};
  const type = EVENT_TYPES[event];
  if (!type) {
    return res.status(400).json({ error: "event must be 'finish' or 'close'" });
  }
  const user = getCurrentUser();
  console.log(`[transact] user=${user.id} event=${event} ${JSON.stringify(data)}`);

  // If a webhook for the task already arrived, the agent told the user about
  // it then, so a close has nothing to add. 204 tells the app no reply is coming.
  if (event === "close" && data.taskId && hasTaskStatusUpdatedEvents(data.taskId)) {
    return res.sendStatus(204);
  }
  enqueueSystemEvent(user.id, type, data, "app");
  res.sendStatus(202);
});
