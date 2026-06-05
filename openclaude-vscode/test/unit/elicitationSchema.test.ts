import { describe, expect, it } from 'vitest';
import { normalizeElicitationRequest } from '../../src/utils/elicitationSchema';

describe('normalizeElicitationRequest', () => {
  it('builds select fields from oneOf schema with recommendations', () => {
    const request = normalizeElicitationRequest({
      requestedSchema: {
        title: 'Pick environment',
        description: 'Choose the safest rollout target.',
        submitLabel: 'Continue',
        cancelLabel: 'Stop',
        required: ['environment'],
        properties: {
          environment: {
            type: 'string',
            title: 'Deployment target',
            description: 'Where should the changes go?',
            default: 'staging',
            oneOf: [
              {
                const: 'staging',
                title: 'Staging',
                description: 'Safer validation path before prod.',
              },
              {
                const: 'production',
                title: 'Production',
                description: 'Ship to everyone immediately.',
              },
            ],
          },
        },
      },
    });

    expect(request.title).toBe('Pick environment');
    expect(request.helperText).toBe('Choose the safest rollout target.');
    expect(request.submitLabel).toBe('Continue');
    expect(request.cancelLabel).toBe('Stop');
    expect(request.fields).toEqual([
      {
        name: 'environment',
        label: 'Deployment target',
        required: true,
        default: 'staging',
        helperText: 'Where should the changes go?',
        type: {
          type: 'select',
          options: [
            {
              value: 'staging',
              label: 'Staging',
              description: 'Safer validation path before prod.',
              recommended: true,
              recommendationNote: 'Default choice from the requesting tool.',
            },
            {
              value: 'production',
              label: 'Production',
              description: 'Ship to everyone immediately.',
              recommended: false,
              recommendationNote: undefined,
            },
          ],
        },
      },
    ]);
  });

  it('builds multiselect fields from array anyOf schema', () => {
    const request = normalizeElicitationRequest({
      requestedSchema: {
        required: ['checks'],
        properties: {
          checks: {
            type: 'array',
            title: 'Verification steps',
            default: ['tests'],
            suggestedValues: ['tests'],
            items: {
              anyOf: [
                {
                  const: 'tests',
                  title: 'Run tests',
                  description: 'Fast confidence check.',
                },
                {
                  const: 'lint',
                  title: 'Run lint',
                  description: 'Catch style and type issues.',
                },
              ],
            },
          },
        },
      },
    });

    expect(request.fields).toEqual([
      {
        name: 'checks',
        label: 'Verification steps',
        required: true,
        default: ['tests'],
        helperText: undefined,
        type: {
          type: 'multiselect',
          options: [
            {
              value: 'tests',
              label: 'Run tests',
              description: 'Fast confidence check.',
              recommended: true,
              recommendationNote: 'Default choice from the requesting tool.',
            },
            {
              value: 'lint',
              label: 'Run lint',
              description: 'Catch style and type issues.',
              recommended: false,
              recommendationNote: undefined,
            },
          ],
        },
      },
    ]);
  });

  it('uses legacy fields when already provided', () => {
    const request = normalizeElicitationRequest({
      requestedSchema: {
        title: 'Legacy',
      },
      legacyFields: [
        {
          name: 'mode',
          label: 'Mode',
          required: true,
          type: {
            type: 'select',
            options: [{ value: 'fast', label: 'Fast' }],
          },
        },
      ],
    });

    expect(request.fields).toEqual([
      {
        name: 'mode',
        label: 'Mode',
        required: true,
        type: {
          type: 'select',
          options: [{ value: 'fast', label: 'Fast' }],
        },
      },
    ]);
    expect(request.title).toBe('Legacy');
  });
});
