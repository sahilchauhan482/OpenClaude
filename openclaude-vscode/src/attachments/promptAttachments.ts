import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import type { ContentBlock } from '../types/messages';

export interface PromptAttachment {
  type: 'file' | 'image' | 'url' | 'text';
  name: string;
  content: string;
}

export interface ResolvedPromptAttachment {
  type: 'file' | 'image' | 'url' | 'text';
  name: string;
  text?: string;
  dataUrl?: string;
  mediaType?: string;
}

export interface ResolveAttachmentOptions {
  readFile?: typeof fs.readFile;
  stat?: typeof fs.stat;
  ocrImageText?: (imageSource: string) => Promise<string>;
  ocrRunner?: (imageSource: string, pageSegMode: string) => Promise<string>;
  ocrWorkerPath?: string;
  ocrLangPath?: string;
  ocrGzip?: boolean;
  skipOcr?: boolean;
}

export interface BuildPromptContentOptions {
  supportsImages: boolean;
  resolveAttachment: (attachment: PromptAttachment) => Promise<ResolvedPromptAttachment>;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.avif']);
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonc', '.js', '.jsx', '.ts', '.tsx',
  '.css', '.scss', '.sass', '.html', '.htm', '.xml', '.yaml', '.yml', '.csv',
  '.log', '.ini', '.conf', '.toml', '.env', '.sql', '.py', '.rb', '.go', '.rs',
  '.java', '.cs', '.php', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
]);

type OcrWorker = {
  recognize: (source: string) => Promise<{ data?: { text?: string } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<void>;
};

let ocrWorkerPromise: Promise<OcrWorker> | undefined;

const OCR_PAGE_SEGMENTATION_MODES = ['11', '6', '3'];

function isDataUrl(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function inferMediaType(name: string, fallback = 'image/png'): string {
  const ext = extname(name).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    case '.tif':
    case '.tiff':
      return 'image/tiff';
    case '.avif':
      return 'image/avif';
    default:
      return fallback;
  }
}

function isLikelyImageAttachment(attachment: PromptAttachment): boolean {
  const ext = extname(attachment.name || attachment.content).toLowerCase();
  return attachment.type === 'image'
    || IMAGE_EXTENSIONS.has(ext)
    || isDataUrl(attachment.content);
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function scoreOcrText(text: string): number {
  const normalized = normalizeOcrText(text);
  if (!normalized) return 0;
  const alphanumeric = (normalized.match(/[A-Za-z0-9]/g) ?? []).length;
  const lines = normalized.split('\n').filter(Boolean).length;
  return alphanumeric + (lines * 4) + Math.min(normalized.length, 200);
}

function isGoodEnoughOcrText(text: string): boolean {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;
  if (normalized.length >= 80) return true;
  const lines = normalized.split('\n').filter(Boolean).length;
  const words = normalized.split(/\s+/).filter(Boolean).length;
  return lines >= 2 && words >= 4;
}

function chooseBestOcrText(candidates: string[]): string {
  return candidates
    .map((candidate) => normalizeOcrText(candidate))
    .sort((a, b) => scoreOcrText(b) - scoreOcrText(a))[0] ?? '';
}

async function extractOcrText(
  imageSource: string,
  options: ResolveAttachmentOptions = {},
): Promise<string> {
  const { ocrImageText, ocrRunner } = options;
  if (ocrImageText) {
    try {
      return normalizeOcrText(await ocrImageText(imageSource));
    } catch {
      return '';
    }
  }

  try {
    if (!ocrWorkerPromise) {
      ocrWorkerPromise = (async () => {
        const { createWorker } = await import('tesseract.js');
        const workerPath = options.ocrWorkerPath ?? require.resolve('tesseract.js/src/worker-script/node/index.js');
        const langPath = options.ocrLangPath ?? 'https://tessdata.projectnaptha.com/4.0.0_fast';
        const worker = await createWorker('eng', 1, {
          workerPath,
          langPath,
          gzip: options.ocrGzip ?? !options.ocrLangPath,
          cacheMethod: options.ocrLangPath ? 'none' : undefined,
        });
        return worker as unknown as OcrWorker;
      })();
    }
    const worker = await ocrWorkerPromise;
    const { source, cleanup } = imageSource.startsWith('data:image/')
      ? await writeDataUrlToTempFile(imageSource)
      : { source: imageSource, cleanup: undefined as (() => Promise<void>) | undefined };
    try {
      const candidates: string[] = [];
      for (const psm of OCR_PAGE_SEGMENTATION_MODES) {
        const candidate = ocrRunner
          ? await ocrRunner(source, psm)
          : await (async () => {
            await worker.setParameters({
              tessedit_pageseg_mode: psm,
              preserve_interword_spaces: '1',
              user_defined_dpi: '300',
            });
            const result = await worker.recognize(source);
            return (result.data?.text as string | undefined) ?? '';
          })();
        candidates.push(candidate);
        if (isGoodEnoughOcrText(candidate)) {
          return normalizeOcrText(candidate);
        }
      }
      return chooseBestOcrText(candidates);
    } finally {
      if (cleanup) {
        await cleanup();
      }
    }
  } catch {
    ocrWorkerPromise = undefined;
    return '';
  }
}

async function writeDataUrlToTempFile(dataUrl: string): Promise<{ source: string; cleanup: () => Promise<void> }> {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (!match) return { source: dataUrl, cleanup: async () => undefined };

  const mediaType = match[1];
  const base64 = match[2];
  const extension =
    mediaType === 'image/jpeg' ? '.jpg'
      : mediaType === 'image/gif' ? '.gif'
        : mediaType === 'image/webp' ? '.webp'
          : mediaType === 'image/bmp' ? '.bmp'
            : mediaType === 'image/tiff' ? '.tiff'
              : mediaType === 'image/avif' ? '.avif'
                : '.png';
  const tempPath = join(tmpdir(), `openclaude-ocr-${randomUUID()}${extension}`);
  await fs.writeFile(tempPath, Buffer.from(base64, 'base64'));
  return {
    source: tempPath,
    cleanup: async () => {
      try {
        await fs.unlink(tempPath);
      } catch {
        // best effort
      }
    },
  };
}

export async function resolveAttachmentForPrompt(
  attachment: PromptAttachment,
  options: ResolveAttachmentOptions = {},
): Promise<ResolvedPromptAttachment> {
  const readFile = options.readFile ?? fs.readFile;
  const stat = options.stat ?? fs.stat;

  if (isLikelyImageAttachment(attachment)) {
    const imageSource = attachment.content;
    let dataUrl = imageSource;
    let mediaType = inferMediaType(attachment.name);

    if (!isDataUrl(imageSource)) {
      const buffer = await readFile(imageSource);
      dataUrl = `data:${mediaType};base64,${buffer.toString('base64')}`;
    } else {
      const match = imageSource.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
      if (match) {
        mediaType = match[1];
      }
    }

    const ocrText = options.skipOcr ? '' : await extractOcrText(imageSource, options);
    return {
      type: 'image',
      name: attachment.name,
      dataUrl,
      mediaType,
      text: ocrText || undefined,
    };
  }

  if (attachment.type === 'file') {
    const ext = extname(attachment.name || attachment.content).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        const fileStats = await stat(attachment.content);
        const raw = await readFile(attachment.content, 'utf8');
        const preview = raw.slice(0, 20_000).trim();
        return {
          type: 'file',
          name: attachment.name,
          text: preview
            ? `Path: ${attachment.content}\n\n${preview}`
            : `Path: ${attachment.content}\n\n(File is empty; size ${fileStats.size} bytes)`,
        };
      } catch {
        // Fall through to a path-only reference if the file cannot be read.
      }
    }

    return {
      type: 'file',
      name: attachment.name,
      text: `Attached file: ${attachment.name}\nPath: ${attachment.content}`,
    };
  }

  if (attachment.type === 'url') {
    return {
      type: 'url',
      name: attachment.name,
      text: `Attached URL: ${attachment.content}`,
    };
  }

  return {
    type: 'text',
    name: attachment.name,
    text: attachment.content,
  };
}

function formatTextFallbackSection(attachment: ResolvedPromptAttachment, index: number): string {
  const title = `${index + 1}. Attached ${attachment.type}: ${attachment.name}`;
  const lines = [title];

  if (attachment.type === 'image') {
    if (attachment.mediaType) {
      lines.push(`Type: ${attachment.mediaType}`);
    }
    if (attachment.text?.trim()) {
      lines.push('OCR text:');
      lines.push(attachment.text.trim());
    } else {
      lines.push('OCR text: (none extracted)');
    }
    return lines.join('\n');
  }

  if (attachment.text?.trim()) {
    lines.push(attachment.text.trim());
  }
  return lines.join('\n');
}

export async function buildPromptContent(
  text: string,
  attachments: PromptAttachment[],
  options: BuildPromptContentOptions,
): Promise<string | ContentBlock[]> {
  const trimmedText = text.trim();
  const resolvedAttachments = await Promise.all(
    attachments.map((attachment) => options.resolveAttachment(attachment)),
  );

  if (options.supportsImages) {
    const blocks: ContentBlock[] = [];
    if (trimmedText) {
      blocks.push({ type: 'text', text: trimmedText });
    }

    for (const attachment of resolvedAttachments) {
      if (attachment.type === 'image' && attachment.dataUrl) {
        const match = attachment.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
        const mediaType = attachment.mediaType ?? match?.[1] ?? inferMediaType(attachment.name);
        const data = match?.[2] ?? attachment.dataUrl;
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data,
          },
        });
        continue;
      }

      if (attachment.text?.trim()) {
        blocks.push({ type: 'text', text: formatTextFallbackSection(attachment, blocks.length) });
      }
    }

    return blocks.length > 0 ? blocks : (trimmedText || '[message]');
  }

  const sections: string[] = [];
  if (trimmedText) {
    sections.push(trimmedText);
  }

  if (resolvedAttachments.length > 0) {
    sections.push('');
    sections.push('Attached content:');
    resolvedAttachments.forEach((attachment, index) => {
      sections.push(formatTextFallbackSection(attachment, index));
      sections.push('');
    });
  }

  return sections.join('\n').trim() || '[message]';
}
