// LangChain tools for the direct deposit agent. Names, descriptions and input
// schemas come from the published tool definitions (see definitions.js); each
// file here supplies the handler for one tool, matched by name.
import { tool } from "langchain";
import { loadToolDefinitions } from "./definitions.js";
import { findPayrollAccounts } from "./find-payroll-accounts.js";
import { searchCompanies } from "./search-companies.js";
import { getCompanyDetails } from "./get-company-details.js";
import { getDepositConfig } from "./get-deposit-config.js";
import { checkEvents } from "./check-events.js";

export const HANDLERS = [
  findPayrollAccounts,
  searchCompanies,
  getCompanyDetails,
  getDepositConfig,
  checkEvents,
];

export const DEFINITIONS = await loadToolDefinitions();

// Where the app's Transact SDK should point. transactPath falls back to the
// SDK's default Transact UI when unset.
function defaultSdkEnvironment() {
  return {
    environment: "custom",
    apiPath: process.env.ATOMIC_API_BASE_URL,
    transactPath: process.env.ATOMIC_TRANSACT_URL || undefined,
  };
}

// Pairs each definition with its handler. Refuses to start when a definition
// has no handler or a handler has no definition, since either means the
// definitions and this code are out of step.
export function createTools({
  definitions = DEFINITIONS,
  newId = () => crypto.randomUUID(),
  sdkEnvironment = defaultSdkEnvironment(),
} = {}) {
  const deps = { newId, sdkEnvironment };
  const handlers = new Map(HANDLERS.map((h) => [h.name, h]));
  const names = new Set(definitions.tools.map((d) => d.name));
  const unhandled = [...names].filter((name) => !handlers.has(name));
  const undefinedHandlers = [...handlers.keys()].filter((name) => !names.has(name));
  if (unhandled.length || undefinedHandlers.length) {
    throw new Error(
      `Tool definitions ${definitions.version} from ${definitions.source} don't match the handlers.` +
        (unhandled.length ? ` No handler for: ${unhandled.join(", ")}.` : "") +
        (undefinedHandlers.length ? ` No definition for: ${undefinedHandlers.join(", ")}.` : ""),
    );
  }

  return definitions.tools.map(({ name, description, schema }) => {
    const def = handlers.get(name);
    return tool(
      async (input, runtime) => {
        // ctx comes from the server (agent.invoke's context), never the model.
        const { userIdentifier, conversationId } = runtime.context ?? {};
        if (!userIdentifier || !conversationId) {
          throw new Error(
            "userIdentifier and conversationId are required in the agent context",
          );
        }
        const started = Date.now();
        const tag = `[tool] ${def.name} user=${userIdentifier} conversation=${conversationId}`;
        console.log(`${tag} input=${JSON.stringify(input ?? {})}`);
        try {
          const result = await def.handler(
            input ?? {},
            { userIdentifier, conversationId },
            deps,
          );
          // A clientAction goes to the app as the tool message's artifact,
          // which the model never sees.
          const { output, clientAction } = def.returnsClientAction
            ? result
            : { output: result };
          const content = JSON.stringify(output);
          console.log(
            `${tag} ok ${Date.now() - started}ms output=${content}` +
              (clientAction
                ? ` clientAction=${clientAction.type}:${clientAction.id}`
                : ""),
          );
          return [content, clientAction ? { clientAction } : undefined];
        } catch (err) {
          // Let the model see the failure and respond, rather than crashing the turn.
          console.error(`${tag} failed ${Date.now() - started}ms`, err);
          return [
            JSON.stringify({ error: err.message, code: err.code ?? null }),
            undefined,
          ];
        }
      },
      {
        name,
        description,
        schema,
        responseFormat: "content_and_artifact",
      },
    );
  });
}
