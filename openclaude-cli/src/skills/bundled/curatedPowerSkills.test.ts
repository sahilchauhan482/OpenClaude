import { afterEach, expect, test } from 'bun:test'

import { clearBundledSkills, getBundledSkills } from '../bundledSkills.js'
import { registerCuratedPowerSkills } from './curatedPowerSkills.js'

afterEach(() => {
  clearBundledSkills()
})

test('curated power skills register as bundled prompt commands', () => {
  registerCuratedPowerSkills()

  const names = getBundledSkills().map(command => command.name)

  expect(names).toContain('research-first-coding')
  expect(names).toContain('security-review-plus')
  expect(names).toContain('verification-loop-plus')
  expect(names).toContain('workspace-surface-audit')
  expect(names).toContain('frontend-premium-ux')
})

test('research-first-coding prompts evidence-first implementation behavior', async () => {
  registerCuratedPowerSkills()

  const skill = getBundledSkills().find(
    command => command.name === 'research-first-coding',
  )
  expect(skill).toBeDefined()

  const blocks = await skill!.getPromptForCommand('fix provider retry bug', {} as never)
  const text = (blocks[0] as { text: string }).text

  expect(text).toContain('# Research First Coding')
  expect(text).toContain('Inspect before editing')
  expect(text).toContain('Prefer primary sources')
  expect(text).toContain('fix provider retry bug')
})

test('security-review-plus requires severity-ranked findings', async () => {
  registerCuratedPowerSkills()

  const skill = getBundledSkills().find(
    command => command.name === 'security-review-plus',
  )
  const blocks = await skill!.getPromptForCommand('', {} as never)
  const text = (blocks[0] as { text: string }).text

  expect(text).toContain('# Security Review Plus')
  expect(text).toContain('severity: critical, high, medium, low')
  expect(text).toContain('command execution')
  expect(text).toContain('prompt-injection')
})

test('verification-loop-plus encodes adaptive command recovery', async () => {
  registerCuratedPowerSkills()

  const skill = getBundledSkills().find(
    command => command.name === 'verification-loop-plus',
  )
  const blocks = await skill!.getPromptForCommand('', {} as never)
  const text = (blocks[0] as { text: string }).text

  expect(text).toContain('# Verification Loop Plus')
  expect(text).toContain('Adaptive Command Recovery')
  expect(text).toContain('try the workspace-relative invocation')
  expect(text).toContain('Evidence Summary')
})

test('workspace and frontend skills cover repo mapping and UX noise control', async () => {
  registerCuratedPowerSkills()

  const workspaceSkill = getBundledSkills().find(
    command => command.name === 'workspace-surface-audit',
  )
  const frontendSkill = getBundledSkills().find(
    command => command.name === 'frontend-premium-ux',
  )

  const workspaceText = (
    (await workspaceSkill!.getPromptForCommand('', {} as never))[0] as {
      text: string
    }
  ).text
  const frontendText = (
    (await frontendSkill!.getPromptForCommand('', {} as never))[0] as {
      text: string
    }
  ).text

  expect(workspaceText).toContain('repository layout and package boundaries')
  expect(workspaceText).toContain('known failing or flaky checks')
  expect(frontendText).toContain('Keep the chat readable')
  expect(frontendText).toContain('Avoid Tailwind-only class names')
})
