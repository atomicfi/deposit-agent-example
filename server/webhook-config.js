// Makes sure Atomic's webhooks reach this app while you run it. Nothing here is part of the
// integration itself: it's done automatically as a convenience, so you don't have to open a
// tunnel or set up a webhook endpoint in the Atomic console by hand. index.js calls
// setupNgrokTunnel, then setWebhooks with the tunnel's URL, and removeWebhooks on shutdown.
import ngrok from "@ngrok/ngrok";
import { atomic } from "../atomic/index.js";
import { WEBHOOK_PATH } from "./routes/webhooks.js";

// The webhook endpoint setWebhooks created for this run, so removeWebhooks can delete it.
let endpointId;

// Opens a public ngrok tunnel to this server, so Atomic's webhooks can reach it. Reads
// NGROK_AUTHTOKEN from the environment. The URL changes on every start, unless NGROK_DOMAIN is
// set to a domain reserved on a paid ngrok plan. Resolves to the tunnel's public URL, or null if
// it couldn't be opened.
export async function setupNgrokTunnel(port) {
  try {
    const listener = await ngrok.forward({
      addr: port,
      authtoken_from_env: true,
      domain: process.env.NGROK_DOMAIN || undefined,
    });
    console.log(`[ngrok] Tunnel open at ${listener.url()}`);
    return listener.url();
  } catch (err) {
    console.error(
      `[ngrok] Error: couldn't open a tunnel (${err.message}). ` +
        "Atomic's webhooks can't reach this server, so the app won't work properly.",
    );
    return null;
  }
}

// Points Atomic's webhooks at this server at startup. tunnelUrl is the public
// ngrok URL for this run, which changes every time, so it creates an endpoint at
// tunnelUrl for task-status-updated. The app doesn't work properly without these
// webhooks: the agent never hears when a deposit switch finishes.
export async function setWebhooks(tunnelUrl) {
  const url = `${tunnelUrl}${WEBHOOK_PATH}`;
  try {
    // Atomic signs webhooks with one of the account's API secrets: the one
    // named "default", or else the first.
    const {
      data: { secrets },
    } = await atomic.listSecrets();
    const secret = secrets.find((s) => s.name === "default") ?? secrets[0];
    if (!secret) throw new Error("the account has no API secrets");

    const {
      data: { endpoint },
    } = await atomic.createWebhookEndpoint({
      url,
      secretId: secret._id,
      eventTypes: ["task-status-updated"],
    });
    endpointId = endpoint._id;
    console.log(`[webhooks] Atomic sends task-status-updated to ${url}`);
  } catch (err) {
    console.error(
      `[webhooks] Error: couldn't set up Atomic's webhook endpoint at ${url} (${err.message}). ` +
        "The app won't work properly without task-status-updated webhooks.",
    );
  }
}

// Deletes the endpoint setWebhooks created, when the server shuts down. It gives
// Atomic 2 seconds, so a slow or unreachable API can't hold up shutdown. If the
// process is killed outright, the endpoint stays in Atomic until you delete it.
export async function removeWebhooks() {
  if (!endpointId) return;
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timed out after 2 seconds")), 2000),
  );
  try {
    await Promise.race([atomic.deleteWebhookEndpoint(endpointId), timeout]);
    console.log("[webhooks] Deleted this run's webhook endpoint");
  } catch (err) {
    console.error(`[webhooks] Couldn't delete this run's webhook endpoint (${err.message})`);
  }
}
