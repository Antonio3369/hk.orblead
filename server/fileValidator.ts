const ALLOWED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);
const MAX_BYTES = 50 * 1024 * 1024;

export interface UploadValidationResult {
  isValid: boolean;
  error?: string;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export function validateUploadFile(filename: string, buffer: Buffer): UploadValidationResult {
  const ext = extensionOf(filename);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { isValid: false, error: "僅支持 CSV、XLS、XLSX 文件" };
  }
  if (buffer.length === 0) {
    return { isValid: false, error: "文件為空" };
  }
  if (buffer.length > MAX_BYTES) {
    return { isValid: false, error: "文件大小不能超過 50MB" };
  }
  return { isValid: true };
}
