# Chat diagnosis details

Chat message history and the stream `complete` event may include an optional `diagnosisDetails` object on the tutor message:

```json
{
  "tools": [{ "tool": "get_vm_status", "status": "ok", "durationMs": 12 }],
  "evidence": [
    {
      "id": "obs-001",
      "tool": "get_vm_status",
      "summary": "VM status and reported IPv4 addresses were collected.",
      "capturedAt": "2026-11-04T00:00:00.000Z"
    }
  ],
  "suggestions": [
    { "title": "Check service", "detail": "Review the service status." }
  ]
}
```

Fields are projected from `contextRef`; evidence summaries must match the exact gateway-owned text for the corresponding approved tool. Unknown data and unapproved tools are omitted. Suggestion text is bounded and credential-like strings and private addresses are redacted. `limitations` is omitted until there are learner-facing values. Older messages and fallback replies omit `diagnosisDetails`.

Suggestion limits apply before and after redaction. The trimmed model title may contain at most 200 characters and detail at most 2,000 characters. The public DTO allows up to 1,000 title characters and 10,000 detail characters so redaction can expand text without losing the suggestion. Values over either raw or public limit are omitted whole; text is never truncated.
