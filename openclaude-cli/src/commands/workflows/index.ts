import type { Command } from '../../types/command.js'

const workflows = {
  type: 'local',
  name: 'workflows',
  description: 'Workflow scripts are unavailable in this build snapshot',
  isEnabled: () => false,
  supportsNonInteractive: true,
  load: async () => ({
    call: async () => ({
      type: 'text' as const,
      value: 'Workflow scripts are unavailable in this build snapshot.',
    }),
  }),
} satisfies Command

export default workflows
