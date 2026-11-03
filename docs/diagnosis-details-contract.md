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
