// Transact SDK events from the app, so the agent can follow up when the user
// finishes in the Atomic screen. Closing Transact isn't sent: if a switch
// started, Atomic's webhooks report on it.
import { Router } from "express";
import { getCurrentUser } from "../db.js";
import { enqueueSystemEvent } from "../queue.js";

export const transactEventsRouter = Router();

// event is 'finish' (onFinish); data is the fields of the SDK's payload the
// agent uses, which the app picks out. It goes to the agent as is.
const EVENT_TYPES = { finish: "transact-finished" };

transactEventsRouter.post("/", (req, res) => {
  const { event, data = {} } = req.body ?? {};
  const type = EVENT_TYPES[event];
  if (!type) {
    return res.status(400).json({ error: "event must be 'finish'" });
  }
  const user = getCurrentUser();
  enqueueSystemEvent(user.id, type, data, "app");
  console.log(`[transact] user=${user.id} event=${event} ${JSON.stringify(data)}`);
  res.sendStatus(202);
});
