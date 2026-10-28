// The user's chat messages, from the app.
import { Router } from "express";
import { getCurrentUser } from "../db.js";
import { enqueue, threadIdFor } from "../queue.js";

export const userMessageRouter = Router();

// Queues the user's message for the agent. The reply arrives on the WebSocket.
userMessageRouter.post("/", (req, res) => {
  const { message } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  const user = getCurrentUser();
  const threadId = threadIdFor(user.id);
  enqueue(threadId, { source: "user", userId: user.id, text: message });
  res.sendStatus(202);
});
