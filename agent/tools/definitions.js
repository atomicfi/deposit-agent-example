// Tool names, descriptions and input schemas come from tools.json in Atomic's
// docs, the same file customers download. The handlers in this folder supply
// the behavior. TOOL_DEFINITIONS points at another copy, a path or URL, such as
// a docs branch under review.
import { readFile } from "node:fs/promises";

export const PUBLISHED_TOOL_DEFINITIONS =
  "https://docs.atomicfi.com/agent-tools/deposit/tools.json";

export async function loadToolDefinitions(
  source = process.env.TOOL_DEFINITIONS || PUBLISHED_TOOL_DEFINITIONS,
) {
  let text;
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Couldn't load tool definitions from ${source}: HTTP ${res.status}`);
    }
    text = await res.text();
  } else {
    text = await readFile(source, "utf8");
  }
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    // The docs site answers a path it doesn't have with its HTML page, not a 404.
    throw new Error(`${source} isn't a tools.json; check the path or URL`);
  }
  if (file.formatVersion !== 2) {
    throw new Error(
      `${source} has formatVersion ${file.formatVersion}; this example reads formatVersion 2`,
    );
  }
  return { source, version: file.version, tools: file.tools };
}
