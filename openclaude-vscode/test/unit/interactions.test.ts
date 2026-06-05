import { describe, it, expect, vi } from 'vitest';
import { routeControlRequest } from '../../src/process/controlRouter';

describe('routeControlRequest — elicitation', () => {
  it('routes elicitation control_request to webview with normalized schema fields', () => {
    const postMessage = vi.fn();
    const sendControlResponse = vi.fn();

    const controlRequest = {
      type: 'control_request' as const,
      request_id: 'elicit-001',
      request: {
        subtype: 'elicitation',
        message: 'Which environment should I deploy to?',
        requested_schema: {
          title: 'Choose deployment target',
          description: 'The AI is blocked and needs a clear environment decision.',
          submitLabel: 'Continue',
          cancelLabel: 'Not now',
          required: ['environment'],
          properties: {
            environment: {
              type: 'string',
              title: 'Environment',
              description: 'Pick the safest next step.',
              default: 'staging',
              oneOf: [
                { const: 'staging', title: 'Staging', description: 'Validate before prod.' },
                { const: 'production', title: 'Production', description: 'Go live immediately.' },
              ],
            },
          },
        },
      },
    };

    routeControlRequest(controlRequest as unknown as Record<string, unknown>, { postMessage, sendControlResponse });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'show_elicitation',
      requestId: 'elicit-001',
      message: 'Which environment should I deploy to?',
      fields: [
        {
          name: 'environment',
          label: 'Environment',
          required: true,
          default: 'staging',
          helperText: 'Pick the safest next step.',
          type: {
            type: 'select',
            options: [
              {
                value: 'staging',
                label: 'Staging',
                description: 'Validate before prod.',
                recommended: true,
                recommendationNote: 'Default choice from the requesting tool.',
              },
              {
                value: 'production',
                label: 'Production',
                description: 'Go live immediately.',
                recommended: false,
                recommendationNote: undefined,
              },
            ],
          },
        },
      ],
      title: 'Choose deployment target',
      helperText: 'The AI is blocked and needs a clear environment decision.',
      submitLabel: 'Continue',
      cancelLabel: 'Not now',
    });
  });

  it('routes elicitation cancel to webview', () => {
    const postMessage = vi.fn();
    const sendControlResponse = vi.fn();

    const cancelRequest = {
      type: 'control_cancel_request' as const,
      request_id: 'elicit-001',
    };

    routeControlRequest(cancelRequest as unknown as Record<string, unknown>, { postMessage, sendControlResponse });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'dismiss_elicitation',
      requestId: 'elicit-001',
    });
  });
});
