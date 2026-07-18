// Codex `--json` JSONL event parsing.
// Schema derived from a real capture against codex-cli 0.144.5 (see README.md):
//   {"type":"thread.started","thread_id":"..."}
//   {"type":"turn.started"}
//   {"type":"item.started"|"item.completed","item":{"id","type",...}}
//     item.type "agent_message":     {text}
//     item.type "command_execution": {command, aggregated_output, exit_code, status}
//     item.type "file_change":       {changes:[{path,kind}], status}
//   {"type":"turn.completed","usage":{input_tokens,cached_input_tokens,output_tokens,...}}
// The parser stays tolerant: unknown types/fields are preserved in `raw`, never fatal.

export interface CodexFileChange {
  path: string;
  kind: string;
}

export interface CodexItem {
  id?: string;
  type?: string;
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
  changes?: CodexFileChange[];
}

export interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

export interface CodexEvent {
  type: string;
  threadId?: string;
  item?: CodexItem;
  usage?: CodexUsage;
  raw: unknown;
}

/** Parses one JSONL line. Returns null for blank or non-JSON lines. */
export function parseCodexEventLine(line: string): CodexEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  return {
    type: typeof obj.type === 'string' ? obj.type : 'unknown',
    threadId: typeof obj.thread_id === 'string' ? obj.thread_id : undefined,
    item: typeof obj.item === 'object' && obj.item !== null ? (obj.item as CodexItem) : undefined,
    usage: typeof obj.usage === 'object' && obj.usage !== null ? (obj.usage as CodexUsage) : undefined,
    raw: parsed,
  };
}
