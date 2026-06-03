export interface AttachmentItem {
  type: 'file' | 'image' | 'url' | 'text';
  name: string;
  content: string; // base64/data URL for images, path for files, raw for text/url
}
