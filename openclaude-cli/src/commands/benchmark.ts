import type { LocalJSXCommandContext, Command } from '../types/command.js'
import {
  benchmarkMultipleModels,
  formatBenchmarkResults,
  isBenchmarkSupported,
} from '../utils/model/benchmark.js'
import { getCachedOllamaModelOptions } from '../utils/model/ollamaModels.js'

async function runBenchmark(
  model?: string,
  writeOutput?: (s: string) => void,
): Promise<string> {
  if (!isBenchmarkSupported()) {
    return (
      'Benchmark not supported for this provider.\n' +
      'Supported: OpenAI-compatible endpoints (Ollama, NVIDIA NIM)\n'
    )
  }

  let modelsToBenchmark: string[]

  if (model) {
    modelsToBenchmark = [model]
  } else {
    const ollamaModels = getCachedOllamaModelOptions()
    modelsToBenchmark = ollamaModels.slice(0, 3).map((m) => m.value as string)
  }

  writeOutput?.(`Benchmarking ${modelsToBenchmark.length} model(s)...\n`)

  const results = await benchmarkMultipleModels(
    modelsToBenchmark,
    (completed, total, result) => {
      writeOutput?.(
        `[${completed}/${total}] ${result.model}: ` +
          `${result.success ? result.tokensPerSecond.toFixed(1) + ' tps' : 'FAILED'}\n`,
      )
    },
  )

  return '\n' + formatBenchmarkResults(results) + '\n'
}

export const benchmark: Command = {
  type: 'local',
  name: 'benchmark',
  description: 'Benchmark model performance',
  supportsNonInteractive: true,
  load: () =>
    Promise.resolve({
      call: async (args: string, _context: LocalJSXCommandContext) => {
        const model = args.trim() || undefined
        const output = await runBenchmark(model)
        return { type: 'text', value: output }
      },
    }),
}
