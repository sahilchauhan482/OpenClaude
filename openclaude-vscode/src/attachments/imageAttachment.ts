import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.avif',
]);

export function isImageFilePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function inferImageMediaType(filePath: string, fallback = 'image/png'): string {
  switch (path.extname(filePath).toLowerCase()) {
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

export async function filePathToDataUrl(filePath: string): Promise<string> {
  const mediaType = inferImageMediaType(filePath);
  const buffer = await fs.readFile(filePath);
  return `data:${mediaType};base64,${buffer.toString('base64')}`;
}
