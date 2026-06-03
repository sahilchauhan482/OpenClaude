import { defineGateway } from '../define.js'

/**
 * Google Vertex AI has dedicated transport behavior that is not yet fully
 * normalized into the generic descriptor model. It relies on ambient GCP
 * credentials and uses a separate runtime path.
 *
 * Do not collapse this into generic OpenAI-compatible routing.
 */
export default defineGateway({
  id: 'vertex',
  label: 'Google Vertex AI',
  vendorId: 'anthropic',
  category: 'hosted',
  defaultBaseUrl: 'https://us-east5-aiplatform.googleapis.com/v1',
  defaultModel: 'claude-sonnet-4-6',
  supportsModelRouting: true,
  setup: {
    requiresAuth: true,
    authMode: 'adc',
  },
  transportConfig: {
    kind: 'vertex',
  },
  preset: {
    id: 'vertex',
    description: 'Google Vertex AI Claude API (ADC + GCP project required)',
    label: 'Google Vertex AI',
    name: 'Google Vertex AI',
    vendorId: 'anthropic',
    baseUrlEnvVars: ['ANTHROPIC_VERTEX_BASE_URL'],
    modelEnvVars: ['ANTHROPIC_MODEL'],
  },
  catalog: {
    source: 'static',
    models: [
      { id: 'vertex-claude-opus', apiName: 'claude-opus-4-6', label: 'Claude Opus (Vertex)', modelDescriptorId: 'claude-opus-4-6' },
    ],
  },
  usage: { supported: false },
})
