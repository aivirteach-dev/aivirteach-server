import { isIP } from 'node:net';

const TOOL_NAMES = ['get_vm_status', 'get_guest_agent_status'] as const;
const TOOL_STATUSES = ['ok', 'error', 'denied', 'cached'] as const;
const MAX_TOOLS = 6;
const MAX_EVIDENCE = 6;
const MAX_SUGGESTIONS = 4;
const MAX_RAW_TITLE_LENGTH = 200;
const MAX_RAW_DETAIL_LENGTH = 2_000;
const MAX_PUBLIC_TITLE_LENGTH = 1_000;
const MAX_PUBLIC_DETAIL_LENGTH = 10_000;

export type DiagnosisDetails = {
  tools: Array<{
    tool: (typeof TOOL_NAMES)[number];
    status: (typeof TOOL_STATUSES)[number];
    durationMs: number;
  }>;
  evidence: Array<{
    id: string;
    tool: (typeof TOOL_NAMES)[number];
    summary: string;
    capturedAt: string;
  }>;
  suggestions: Array<{ title: string; detail: string }>;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function boundedText(
  value: unknown,
  maxRawLength: number,
  maxPublicLength: number,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > maxRawLength) return undefined;
  const publicText = redactPublicText(text);
  return publicText.length <= maxPublicLength ? publicText : undefined;
}

function redactPublicText(value: string): string {
  return value
    .replace(
      /authorization\s*:\s*bearer\s+[^\s,;]+/gi,
      'Authorization: Bearer [REDACTED]',
    )
    .replace(
      /((?:password|passwd|token|api[_-]?key|secret)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(
      /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|127\.(?:\d{1,3}\.){2}\d{1,3}|169\.254\.(?:\d{1,3}\.)\d{1,3})\b/g,
      '[internal address]',
    )
    .replace(
      /(?<![\w])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w])/gi,
      (address) => (isIP(address) === 6 ? '[address]' : address),
    )
    .replace(
      /\b(?:localhost|[a-z0-9-]+\.(?:local|internal))\b/gi,
      '[internal host]',
    );
}

function allowedTool(value: unknown): value is (typeof TOOL_NAMES)[number] {
  return TOOL_NAMES.some((tool) => tool === value);
}

function allowedStatus(
  value: unknown,
): value is (typeof TOOL_STATUSES)[number] {
  return TOOL_STATUSES.some((status) => status === value);
}

function publicEvidenceSummary(
  tool: (typeof TOOL_NAMES)[number],
  summary: unknown,
): string | undefined {
  const known =
    tool === 'get_vm_status'
      ? 'VM status and reported IPv4 addresses were collected.'
      : summary === 'QEMU guest agent responded to guest-ping.' ||
          summary === 'QEMU guest agent did not respond.'
        ? summary
        : undefined;
  if (tool === 'get_vm_status' && summary !== known) return undefined;
  return known;
}

function sourceResponse(value: unknown): Record<string, unknown> | undefined {
  const root = record(value);
  return record(root?.response) ?? root;
}

/** Project the persisted Agent result into a bounded, learner-facing detail DTO. */
export function projectDiagnosisDetails(
  value: unknown,
): DiagnosisDetails | undefined {
  const response = sourceResponse(value);
  if (!response) return undefined;

  const tools = Array.isArray(response.tool_trace)
    ? response.tool_trace.slice(0, MAX_TOOLS).flatMap((entry) => {
        const item = record(entry);
        if (!item || !allowedTool(item.tool) || !allowedStatus(item.status))
          return [];
        if (
          typeof item.duration_ms !== 'number' ||
          !Number.isFinite(item.duration_ms) ||
          item.duration_ms < 0
        )
          return [];
        return [
          {
            tool: item.tool,
            status: item.status,
            durationMs: Math.min(Math.round(item.duration_ms), 86_400_000),
          },
        ];
      })
    : [];
  const evidence = Array.isArray(response.evidence)
    ? response.evidence.slice(0, MAX_EVIDENCE).flatMap((entry) => {
        const item = record(entry);
        if (!item || !allowedTool(item.tool) || typeof item.id !== 'string')
          return [];
        const summary = publicEvidenceSummary(item.tool, item.summary);
        if (!summary) return [];
        if (item.id.length > 80 || !/^obs-[A-Za-z0-9_-]+$/.test(item.id))
          return [];
        const date =
          typeof item.captured_at === 'string' ? item.captured_at : '';
        if (!date || !Number.isFinite(Date.parse(date))) return [];
        return [
          {
            id: item.id,
            tool: item.tool,
            summary,
            capturedAt: new Date(date).toISOString(),
          },
        ];
      })
    : [];
  const suggestions = Array.isArray(response.suggested_actions)
    ? response.suggested_actions.slice(0, MAX_SUGGESTIONS).flatMap((entry) => {
        const item = record(entry);
        const title = boundedText(
          item?.title,
          MAX_RAW_TITLE_LENGTH,
          MAX_PUBLIC_TITLE_LENGTH,
        );
        const detail = boundedText(
          item?.detail,
          MAX_RAW_DETAIL_LENGTH,
          MAX_PUBLIC_DETAIL_LENGTH,
        );
        return title && detail ? [{ title, detail }] : [];
      })
    : [];

  const result: DiagnosisDetails = { tools, evidence, suggestions };
  return tools.length || evidence.length || suggestions.length
    ? result
    : undefined;
}
