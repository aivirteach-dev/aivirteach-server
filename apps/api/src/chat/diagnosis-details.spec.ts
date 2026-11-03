import { projectDiagnosisDetails } from './diagnosis-details';

describe('projectDiagnosisDetails', () => {
  it('returns no details for legacy, null, or malformed context references', () => {
    expect(projectDiagnosisDetails(null)).toBeUndefined();
    expect(projectDiagnosisDetails({ response: null })).toBeUndefined();
    expect(projectDiagnosisDetails('not-json')).toBeUndefined();
    expect(projectDiagnosisDetails({ answer: 'old row' })).toBeUndefined();
  });

  it('projects only the public allowlist and redacts sensitive text', () => {
    const details = projectDiagnosisDetails({
      request_id: 'private-id',
      answer: 'already visible answer',
      diagnosis: { probable_causes: ['private'] },
      tool_trace: [
        {
          tool: 'get_vm_status',
          status: 'ok',
          duration_ms: 12,
          arguments: { secret: 'hidden' },
          output: '10.0.0.1',
        },
      ],
      evidence: [
        {
          id: 'obs-001',
          tool: 'get_vm_status',
          summary: 'VM status and reported IPv4 addresses were collected.',
          captured_at: '2026-11-04T00:00:00Z',
          raw: 'private',
        },
      ],
      suggested_actions: [
        {
          title: 'Check service',
          detail:
            'Review the local service at 192.168.1.4, fd00::1 on node.local; token=abc123 password="fixture-only-credential"',
          command: 'private',
        },
      ],
      limitations: ['MODEL_PROVIDER_ERROR'],
    });

    expect(details).toEqual({
      tools: [{ tool: 'get_vm_status', status: 'ok', durationMs: 12 }],
      evidence: [
        {
          id: 'obs-001',
          tool: 'get_vm_status',
          summary: 'VM status and reported IPv4 addresses were collected.',
          capturedAt: '2026-11-04T00:00:00.000Z',
        },
      ],
      suggestions: [
        {
          title: 'Check service',
          detail:
            'Review the local service at [internal address], [address] on [internal host]; token=[REDACTED] password=[REDACTED]',
        },
      ],
    });
    expect(JSON.stringify(details)).not.toContain('private');
    expect(JSON.stringify(details)).not.toContain('secret');
    expect(JSON.stringify(details)).not.toContain('fixture-only-credential');
  });

  it('rejects unauthorized tools and unknown status values', () => {
    const details = projectDiagnosisDetails({
      tool_trace: [
        { tool: 'run_shell', status: 'ok', duration_ms: 1 },
        { tool: 'get_vm_status', status: 'timed_out', duration_ms: 1 },
      ],
      evidence: [
        {
          id: 'obs-001',
          tool: 'get_vm_status',
          summary: 'internal',
          captured_at: '2026-11-04T00:00:00Z',
        },
      ],
    });
    expect(details).toBeUndefined();
  });

  it('preserves durations while redacting IPv6 addresses', () => {
    const details = projectDiagnosisDetails({
      suggested_actions: [
        {
          title: 'Wait',
          detail: 'Wait 00:05:00 before checking fd00::1234 again.',
        },
      ],
    });
    expect(details?.suggestions[0].detail).toBe(
      'Wait 00:05:00 before checking [address] again.',
    );
  });

  it('bounds arrays and text length', () => {
    const details = projectDiagnosisDetails({
      tool_trace: Array.from({ length: 30 }, () => ({
        tool: 'get_vm_status',
        status: 'ok',
        duration_ms: 1,
      })),
      evidence: Array.from({ length: 20 }, (_, index) => ({
        id: `obs-${index}`,
        tool: 'get_vm_status',
        summary: 'VM status and reported IPv4 addresses were collected.',
        captured_at: '2026-11-04T00:00:00Z',
      })),
      suggested_actions: Array.from({ length: 20 }, () => ({
        title: 'title',
        detail: 'y'.repeat(1_900),
      })),
    });
    expect(details?.tools).toHaveLength(6);
    expect(details?.evidence).toHaveLength(6);
    expect(details?.suggestions).toHaveLength(4);
    expect(details?.suggestions[0].detail).toHaveLength(1_900);
  });
});
