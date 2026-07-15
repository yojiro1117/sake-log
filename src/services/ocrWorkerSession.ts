import type { Worker } from 'tesseract.js';

export class OcrWorkerSession {
  private workerPromise?: Promise<Worker>;
  private terminated = false;
  private logger?: (message: { status: string; progress: number }) => void;
  constructor(private readonly languages = 'jpn+eng') {}

  setLogger(logger?: (message: { status: string; progress: number }) => void) { this.logger = logger; }

  async getWorker() {
    if (this.terminated) throw new Error('OCRセッションは終了しています。');
    if (!this.workerPromise) {
      this.workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker(this.languages, 1, {
        logger: (message) => this.logger?.({ status: message.status, progress: message.progress })
      }));
    }
    return this.workerPromise;
  }

  async terminate() {
    if (this.terminated) return;
    this.terminated = true;
    const worker = await this.workerPromise?.catch(() => undefined);
    await worker?.terminate().catch(() => undefined);
  }
}
