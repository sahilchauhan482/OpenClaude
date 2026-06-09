import type { MemoryHeader } from './memoryScan.js'

export function logMemoryWriteShape(
  _toolName: string,
  _toolInput: unknown,
  _filePath: string,
  _scope?: string,
): void {}

export function logMemoryRecallShape(
  _allMemories: MemoryHeader[],
  _selectedMemories: MemoryHeader[],
): void {}
