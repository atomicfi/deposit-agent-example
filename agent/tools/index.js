// LangChain tools for the direct deposit agent. Each tool lives in its own file
// with its name, description, schemas and handler.
import { tool } from "langchain";
import { findPayrollAccounts } from "./find-payroll-accounts.js";
import { searchCompanies } from "./search-companies.js";
import { getCompanyDetails } from "./get-company-details.js";
import { getDepositConfig } from "./get-deposit-config.js";
import { checkEvents } from "./check-events.js";

export const TOOLS = [
  findPayrollAccounts,
  searchCompanies,
  getCompanyDetails,
  getDepositConfig,
  checkEvents,
];

// Where the app's Transact SDK should point. transactPath falls back to the
// SDK's default Transact UI when unset.
function defaultSdkEnvironment() {
  return {
    environment: "custom",
    apiPath: process.env.ATOMIC_API_BASE_URL,
    transactPath: process.env.ATOMIC_TRANSACT_URL || undefined,
  };
}

export function createTools({
  newId = () => crypto.randomUUID(),
  sdkEnvironment = defaultSdkEnvironment(),
} = {}) {
  const deps = { newId, sdkEnvironment };

  return TOOLS.map((def) =>
    tool(
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
        name: def.name,
        description: def.description,
        schema: def.schema,
        responseFormat: "content_and_artifact",
      },
    ),
  );
}
