import type {
  AgentDefinition,
  CustomAgentDefinition,
} from '../../../tools/AgentTool/loadAgentsDir.js'
import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'
import type { AgentMemoryScope } from '../../../tools/AgentTool/agentMemory.js'
import type { SettingSource } from '../../../utils/settings/constants.js'
import type { EffortValue } from '../../../utils/effort.js'

export type NewAgentLocation = Exclude<SettingSource, 'flagSettings'>

export type DraftCustomAgent = CustomAgentDefinition & {
  color?: AgentColorName
  model?: string
  memory?: AgentMemoryScope | null
  effort?: EffortValue
}

export type GeneratedAgentDraft = {
  identifier: string
  whenToUse: string
  systemPrompt: string
}

export type AgentWizardData = {
  location?: NewAgentLocation
  wasGenerated?: boolean
  generationPrompt?: string
  generatedAgent?: GeneratedAgentDraft
  isGenerating?: boolean
  agentType?: string
  whenToUse?: string
  systemPrompt?: string
  selectedTools?: string[]
  selectedModel?: string
  selectedColor?: AgentColorName
  selectedMemory?: AgentMemoryScope | null
  finalAgent?: DraftCustomAgent
}
