// LangChain agent wired to the Anthropic model, tools and system prompt.
import { HumanMessage, ToolMessage, createAgent } from 'langchain'
import { MemorySaver } from '@langchain/langgraph'
import { createModel } from '../model/index.js'
import { createTools } from '../tools/index.js'
import { SYSTEM_PROMPT } from './prompt.js'

export function createDepositAgent({
  model = createModel(),
  tools = createTools(),
  // Keeps conversation history in memory, keyed by thread_id.
  checkpointer = new MemorySaver()
} = {}) {
  const agent = createAgent({
    model,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    checkpointer
  })

  // One message in, one reply out, plus the client action (such as opening
  // Atomic's Transact SDK) a tool produced during this turn, or null.
  // userIdentifier is the Atomic user identifier; the thread doubles as the
  // conversation the tools scope to.
  async function sendMessage(message, { threadId, userIdentifier }) {
    const result = await agent.invoke(
      { messages: [{ role: 'user', content: message }] },
      {
        configurable: { thread_id: threadId },
        context: { userIdentifier, conversationId: threadId }
      }
    )
    // The history includes earlier turns; this turn starts at the last human message.
    const turnStart = result.messages.findLastIndex((m) => HumanMessage.isInstance(m))
    // If tools produced several this turn, the latest one wins.
    const action =
      result.messages
        .slice(turnStart + 1)
        .findLast((m) => ToolMessage.isInstance(m) && m.artifact?.clientAction)?.artifact
        .clientAction ?? null

    const last = result.messages.at(-1)
    const reply =
      typeof last.content === 'string'
        ? last.content
        : last.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('')
    return { reply, action }
  }

  return { agent, sendMessage }
}
