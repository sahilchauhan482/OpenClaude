export type NotebookCellOutput = any
export type NotebookCellSource = any
export type NotebookCellSourceOutput = any
export type NotebookOutputImage = any

export type NotebookCellType = 'code' | 'markdown' | 'raw'

export type NotebookCell = {
  id?: string
  cell_type: NotebookCellType
  source: string | string[]
  outputs?: unknown[]
  metadata?: Record<string, unknown>
  execution_count?: number | null
}

export type NotebookContent = {
  cells: NotebookCell[]
  metadata?: Record<string, unknown>
  nbformat?: number
  nbformat_minor?: number
}
