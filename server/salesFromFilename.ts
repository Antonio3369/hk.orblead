/** 从智付导出文件名识别销售（如 JasonLee4-6月、Alex202604-4月、z1145942502交易明细.xlsx） */
export function extractSalesFromFilename(filename: string): string | null {
  const base = filename.replace(/\.(xlsx|xls|csv)$/i, "");
  // 完整代理账号：Alex202604、z1145942502（字母开头 + 至少 4 位数字）
  const fullId = base.match(/^([A-Za-z][A-Za-z0-9]*\d{4,})/);
  if (fullId) return fullId[1];
  // 旧格式：JasonLee4-6月 → JasonLee
  const legacy = base.match(/^([A-Za-z]+)(?=\d)/);
  return legacy ? legacy[1] : null;
}
