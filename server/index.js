import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

// Load the env before importing anything that reads it, such as the Atomic client.
const envPath = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

// The app doesn't work without these; .env.example says what each one is for.
// USER_IDENTIFIER is the user every chat acts as, and the identifier Atomic
// knows them by.
const REQUIRED_ENV = [
  "ANTHROPIC_API_KEY",
  "ATOMIC_API_BASE_URL",
  "ATOMIC_API_KEY",
  "ATOMIC_API_SECRET",
  "USER_IDENTIFIER",
  "NGROK_AUTHTOKEN",
];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnv.join(", ")}. ` +
      "Add them to .env; see .env.example.",
  );
}

const { getCurrentUser } = await import("./db.js");
const { subscribe } = await import("./bus.js");
const { threadIdFor } = await import("./queue.js");
const { userMessageRouter } = await import("./routes/user-message.js");
const { transactEventsRouter } = await import("./routes/transact-events.js");
const { webhookRouter } = await import("./routes/webhooks.js");
const { setupNgrokTunnel, setWebhooks, removeWebhooks } = await import("./webhook-config.js");
const { DEFINITIONS } = await import("../agent/tools/index.js");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// The user's chat messages, at /user-message.
app.use("/user-message", userMessageRouter);

// Transact SDK onFinish and onClose events from the app, at /transact-events.
app.use("/transact-events", transactEventsRouter);

// Atomic webhooks, at /webhooks/atomic/deposit-agent.
app.use("/webhooks", webhookRouter);

// Once listening, open the ngrok tunnel and point Atomic's webhooks at it.
const server = app.listen(port, async () => {
  console.log(`Listening on http://localhost:${port}`);
  console.log(`Tool definitions ${DEFINITIONS.version} from ${DEFINITIONS.source}`);
  const tunnelUrl = await setupNgrokTunnel(port);
  if (tunnelUrl) await setWebhooks(tunnelUrl);
});

// On Ctrl+C, or when node --watch restarts the server, delete this run's
// webhook endpoint before exiting.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await removeWebhooks();
    process.exit(0);
  });
}

// The app listens here for the agent's messages on the user's thread.
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  subscribe(threadIdFor(getCurrentUser().id), ws);
});
