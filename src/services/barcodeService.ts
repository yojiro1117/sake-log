type NativeBarcode = { rawValue?: string; format?: string };
type NativeDetector = new (options?: { formats?: string[] }) => { detect(source: ImageBitmapSource): Promise<NativeBarcode[]> };

export interface BarcodeReadResult { values: string[]; engine: 'barcode-detector' | 'zxing' | 'none'; warnings: string[] }

export async function readProductBarcodes(blob: Blob): Promise<BarcodeReadResult> {
  const Detector = (globalThis as unknown as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
  if (Detector) {
    try {
      const bitmap = await createImageBitmap(blob);
      const detected = await new Detector({ formats:['ean_13','ean_8','upc_a','upc_e','qr_code'] }).detect(bitmap);
      bitmap.close();
      const values = detected.map((item) => item.rawValue ?? '').filter(isPlausibleCode);
      if (values.length) return { values:[...new Set(values)], engine:'barcode-detector', warnings:[] };
    } catch { /* ZXing fallback */ }
  }
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader();
    const url = URL.createObjectURL(blob);
    try {
      const result = await reader.decodeFromImageUrl(url);
      const value = result.getText();
      return { values:isPlausibleCode(value) ? [value] : [], engine:'zxing', warnings:isPlausibleCode(value) ? [] : ['コード形式を確認できませんでした'] };
    } finally { URL.revokeObjectURL(url); }
  } catch {
    return { values:[], engine:'none', warnings:['JAN/EANを検出できませんでした'] };
  }
}

export function isPlausibleCode(value: string) {
  if (!/^(?:\d{8}|\d{12,13})$/.test(value)) return false;
  if (value.length !== 8 && value.length !== 13) return true;
  const digits = [...value].map(Number); const check = digits.pop();
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === check;
}
