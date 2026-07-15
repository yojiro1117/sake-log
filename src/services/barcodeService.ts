type NativeBarcode = { rawValue?: string; format?: string };
type NativeDetector = new (options?: { formats?: string[] }) => { detect(source: ImageBitmapSource): Promise<NativeBarcode[]> };

export interface BarcodeDetection { codeType: string; rawValue: string; confidence: number; preprocessingId: string; durationMs: number }
export interface BarcodeReadResult { values: string[]; engine: 'barcode-detector' | 'zxing' | 'none'; warnings: string[]; detections: BarcodeDetection[] }

export async function readProductBarcodes(blob: Blob): Promise<BarcodeReadResult> {
  const started = performance.now();
  const Detector = (globalThis as unknown as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
  if (Detector) {
    try {
      const bitmap = await createImageBitmap(blob);
      const detected = await new Detector({ formats:['ean_13','ean_8','upc_a','upc_e','qr_code'] }).detect(bitmap);
      bitmap.close();
      const values = detected.map((item) => item.rawValue ?? '').filter(isPlausibleCode);
      if (values.length) return { values:[...new Set(values)], engine:'barcode-detector', warnings:[], detections: values.map((rawValue) => ({ codeType:'native', rawValue, confidence:0.98, preprocessingId:'original', durationMs:performance.now() - started })) };
    } catch { /* ZXing fallback */ }
  }
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const detections: BarcodeDetection[] = [];
    for (const variant of await barcodeVariants(blob)) {
      const reader = new BrowserMultiFormatReader();
      const url = URL.createObjectURL(variant.blob);
      try {
        const result = await reader.decodeFromImageUrl(url);
        const value = result.getText();
        if (isPlausibleCode(value)) detections.push({ codeType:String(result.getBarcodeFormat()), rawValue:value, confidence:0.9, preprocessingId:variant.id, durationMs:performance.now() - started });
      } catch { /* Try the next rotation. */ }
      finally { URL.revokeObjectURL(url); }
      if (detections.length) break;
    }
    const values = [...new Set(detections.map((item) => item.rawValue))];
    return { values, engine:'zxing', warnings:values.length ? [] : ['JAN/EANを検出できませんでした'], detections };
  } catch {
    return { values:[], engine:'none', warnings:['JAN/EANを検出できませんでした'], detections:[] };
  }
}

export function isPlausibleCode(value: string) {
  if (!/^(?:\d{8}|\d{12,13})$/.test(value)) return false;
  if (value.length !== 8 && value.length !== 13) return true;
  const digits = [...value].map(Number); const check = digits.pop();
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === check;
}

async function barcodeVariants(blob: Blob) {
  const variants = [{ id:'original', blob }];
  try {
    const bitmap = await createImageBitmap(blob);
    for (const degrees of [90, 180, 270]) {
      const quarter = degrees % 180 !== 0;
      const canvas = new OffscreenCanvas(quarter ? bitmap.height : bitmap.width, quarter ? bitmap.width : bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(degrees * Math.PI / 180);
      context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      variants.push({ id:`rotate-${degrees}`, blob:await canvas.convertToBlob({ type:'image/jpeg', quality:0.9 }) });
    }
    bitmap.close();
  } catch { /* The original still remains available. */ }
  return variants;
}
