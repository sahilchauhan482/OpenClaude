export async function logHandler(_logId?: string | number): Promise<void> {}
export async function errorHandler(_number?: number): Promise<void> {}
export async function exportHandler(_source: string, _outputFile: string): Promise<void> {}
export async function taskCreateHandler(_subject: string, _opts: Record<string, unknown>): Promise<void> {}
export async function taskListHandler(_opts: Record<string, unknown>): Promise<void> {}
export async function taskGetHandler(_id: string, _opts: Record<string, unknown>): Promise<void> {}
export async function taskUpdateHandler(_id: string, _opts: Record<string, unknown>): Promise<void> {}
export async function taskDirHandler(_opts: Record<string, unknown>): Promise<void> {}
export async function completionHandler(_shell: string, _opts: Record<string, unknown>, _program: unknown): Promise<void> {}
