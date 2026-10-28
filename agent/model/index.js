// Anthropic chat model used by the agent.
import { ChatAnthropic } from '@langchain/anthropic'

export const DEFAULT_MODEL = 'claude-opus-5-5'

// Reads ANTHROPIC_API_KEY from the environment.
export function createModel({
  model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
  maxTokens = 16000,
  // claude-opus-5-5 defaults to "medium"; set it explicitly.
  effort = 'medium'
} = {}) {
  return new ChatAnthropic({
    model,
    maxTokens,
    outputConfig: { effort }
  })
}
