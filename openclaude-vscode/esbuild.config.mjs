import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
};

const ocrWorkerOptions = {
  entryPoints: ['node_modules/tesseract.js/src/worker-script/node/index.js'],
  bundle: true,
  outfile: 'dist/ocr-worker.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: false,
  minify: false,
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  const ocrCtx = await esbuild.context(ocrWorkerOptions);
  await ctx.watch();
  await ocrCtx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  await esbuild.build(ocrWorkerOptions);
  console.log('Extension built successfully');
}
