import type { UUID } from 'crypto'

export type QueueOperation = 'enqueue' | 'dequeue' | 'clear' | 'popAll' | 'remove'

export type QueueOperationMessage = {
  type: 'queue-operation'
  operation: QueueOperation
  timestamp: string
  sessionId: UUID | string
  content?: string
}
