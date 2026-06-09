import type { Command } from '../../types/command.js'

const peers = {
  type: 'local',
  name: 'peers',
  description: 'Peer commands are unavailable in this build snapshot',
  isEnabled: () => false,
  supportsNonInteractive: true,
  load: async () => ({
    call: async () => ({
      type: 'text' as const,
      value: 'Peer commands are unavailable in this build snapshot.',
    }),
  }),
} satisfies Command

export default peers
