export interface ImportResult {
  ok?: boolean;
  error?: string;
  imported?: number;
  skipped?: number;
  failuresImported?: number;
  failuresSkipped?: number;
  message?: string;
}

export function uploadImportFile(
  file: File,
  mode: string,
  scope: string | undefined,
  token: string,
  onUploadProgress: (percent: number) => void,
  salesName?: string
): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", mode);
    if (scope) fd.append("scope", scope);
    if (salesName?.trim()) fd.append("salesName", salesName.trim());

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/import");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        onUploadProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    });

    xhr.addEventListener("load", () => {
      let data: ImportResult = {};
      try {
        data = JSON.parse(xhr.responseText) as ImportResult;
      } catch {
        const snippet = xhr.responseText.slice(0, 120).replace(/\s+/g, " ");
        reject(
          new Error(
            `伺服器返回異常（HTTP ${xhr.status}${snippet ? `：${snippet}` : ""}）`
          )
        );
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(`${file.name}：${data.error ?? "上傳失敗"}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error(`${file.name}：網絡錯誤`)));
    xhr.addEventListener("abort", () => reject(new Error(`${file.name}：已取消`)));
    xhr.send(fd);
  });
}

export interface LimitImportResult {
  ok?: boolean;
  error?: string;
  imported?: number;
  updated?: number;
  message?: string;
  details?: string[];
}

export function uploadLimitFile(
  file: File,
  kind: "card" | "scan",
  token: string,
  onUploadProgress: (percent: number) => void
): Promise<LimitImportResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/import/limits");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        onUploadProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    });

    xhr.addEventListener("load", () => {
      let data: LimitImportResult = {};
      try {
        data = JSON.parse(xhr.responseText) as LimitImportResult;
      } catch {
        reject(new Error("伺服器返回異常"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(`${file.name}：${data.error ?? "上傳失敗"}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error(`${file.name}：網絡錯誤`)));
    xhr.addEventListener("abort", () => reject(new Error(`${file.name}：已取消`)));
    xhr.send(fd);
  });
}
