export { OcrWorkerSession } from './ocrWorkerSession';

export function shouldUseDeepOcr(text: string, confidence: number, candidateCount: number) {
  return !text.trim() || confidence < 0.55 || candidateCount === 0;
}
