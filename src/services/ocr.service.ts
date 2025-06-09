// summaid-backend/src/services/ocr.service.ts
import { createWorker, PSM } from "tesseract.js";

interface OCRResult {
  text: string;
  confidence: number;
}

class OCRService {
  private worker: Tesseract.Worker | null = null;
  private workerInitialized: Promise<void> | null = null;

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    if (!this.workerInitialized) {
      this.workerInitialized = (async () => {
        try {
          this.worker = await createWorker("eng", 1, {
            logger(m) {
              console.log(m);
            },
          });

          await this.worker.setParameters({
            tessedit_pageseg_mode: PSM.AUTO,
          });

          console.log("Tesseract.js worker initialized.");
        } catch (error) {
          console.error("Failed to initialize Tesseract.js worker:", error);
          this.workerInitialized = null;
          this.worker = null;
          throw error;
        }
      })();
    }
    return this.workerInitialized;
  }

  async performOCR(imageData: Buffer, mimeType: string): Promise<OCRResult> {
    await this.initializeWorker();
    if (!this.worker) {
      throw new Error("Tesseract.js worker is not available.");
    }

    try {
      const {
        data: { text, confidence },
      } = await this.worker.recognize(imageData);
      return { text, confidence };
    } catch (error) {
      console.error("OCR recognition failed:", error);
      throw new Error(
        `OCR failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async closeWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.workerInitialized = null;
      console.log("Tesseract.js worker terminated.");
    }
  }
}

export const ocrService = new OCRService();
