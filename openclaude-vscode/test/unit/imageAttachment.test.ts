import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { filePathToDataUrl, inferImageMediaType, isImageFilePath } from '../../src/attachments/imageAttachment';

describe('imageAttachment helpers', () => {
  it('detects image file paths by extension', () => {
    expect(isImageFilePath('C:\\shots\\screen.png')).toBe(true);
    expect(isImageFilePath('C:\\shots\\screen.txt')).toBe(false);
  });

  it('infers the correct media type from the file extension', () => {
    expect(inferImageMediaType('screen.png')).toBe('image/png');
    expect(inferImageMediaType('screen.jpg')).toBe('image/jpeg');
    expect(inferImageMediaType('screen.avif')).toBe('image/avif');
  });

  it('converts an image file into a data URL', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaude-image-'));
    const filePath = path.join(tempDir, 'screen.png');
    fs.writeFileSync(filePath, Buffer.from('fakepngbytes'));

    const dataUrl = await filePathToDataUrl(filePath);

    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl).toContain(Buffer.from('fakepngbytes').toString('base64'));
  });
});
