// Atomic webhooks. task-status-updated (for the deposit product) is stored and queued for the
// agent; other events are acknowledged so Atomic doesn't retry them.
import { Router } from "express";
import { saveTaskStatusUpdatedEvent } from "../db.js";
import { enqueueSystemEvent } from "../queue.js";

// Where Atomic sends this app's webhooks. index.js mounts this router at /webhooks.
export const WEBHOOK_PATH = "/webhooks/atomic/deposit-agent";

export const webhookRouter = Router();

webhookRouter.post("/atomic/deposit-agent", (req, res) => {
  const event = req.body ?? {};
  if (event.eventType === "task-status-updated" && event.product === "deposit") {
    handleTaskStatusUpdated(event);
  }
  res.sendStatus(204);
});

// Tells the agent when a deposit switch starts ('processing') and when it
// finishes ('completed' or 'failed').
// https://docs.atomicfi.com/reference/webhooks#tasks__task-status-updated
function handleTaskStatusUpdated(event) {
  const taskId = event.task;
  const userIdentifier = event.user?.identifier;
  const status = event.data?.status;
  const reason = event.data?.reason ?? null;

  const companyId = event.company?._id ?? null;
  const companyName = event.company?.name ?? null;
  // How much of the paycheck moves. distributionAmount is absent for 'total'.
  const distributionType = event.data?.distributionType ?? null;
  const distributionAmount = event.data?.distributionAmount ?? null;
  // Every event is stored, along with the raw webhook.
  saveTaskStatusUpdatedEvent({
    taskId,
    userIdentifier,
    companyId,
    companyName,
    status,
    reason,
    distributionType,
    distributionAmount,
    payload: event,
  });
  console.log(
    `[webhook] task=${taskId} user=${userIdentifier} company=${companyName} status=${status} reason=${reason} distribution=${distributionType}:${distributionAmount}`,
  );

  // Only these fields go to the agent: the raw webhook also carries the
  // user's public token, which the model shouldn't see.
  enqueueSystemEvent(userIdentifier, "task-status-updated", {
    companyId,
    companyName,
    status,
    reason,
    distributionType,
    distributionAmount,
  });
}
