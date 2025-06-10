// summaid-backend/src/services/ocr.service.ts
import { createWorker, PSM } from "tesseract.js";

interface OCRResult {
  text: string;
  confidence: number;
}

class OCRService {
  private worker: Tesseract.Worker | null = null;
  private isInitializing: boolean = false;

  /**
   * Initialize worker with proper error handling and configuration
   */
  private async initializeWorker(): Promise<void> {
    // Prevent multiple initialization attempts
    if (this.worker || this.isInitializing) {
      return;
    }

    this.isInitializing = true;

    try {
      console.log("Initializing Tesseract.js worker...");

      // Create worker with proper configuration
      this.worker = await createWorker("eng", 1, {
        logger: (m) => {
          // Only log important messages to reduce noise
          if (m.status === "recognizing text" || m.progress === 1) {
            console.log(
              `OCR Progress: ${m.status} - ${Math.round(m.progress * 100)}%`
            );
          }
        },
        // Add error handler
        errorHandler: (err) => {
          console.error("Tesseract worker error:", err);
        },
      });

      // Set parameters for better OCR performance
      await this.worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        tessedit_char_whitelist: "", // Allow all characters
        preserve_interword_spaces: "1",
      });

      console.log("Tesseract.js worker initialized successfully.");
    } catch (error) {
      console.error("Failed to initialize Tesseract.js worker:", error);
      this.worker = null;
      throw new Error(
        `OCR initialization failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Perform OCR on image data with better error handling and timeout
   */
  async performOCR(imageData: Buffer, mimeType: string): Promise<OCRResult> {
    try {
      // Ensure worker is initialized
      await this.initializeWorker();

      if (!this.worker) {
        throw new Error("Tesseract.js worker failed to initialize.");
      }

      console.log(
        `Starting OCR for ${mimeType} image (${imageData.length} bytes)`
      );

      // Add timeout to prevent hanging
      const ocrPromise = this.worker.recognize(imageData);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("OCR timeout after 60 seconds")),
          60000
        );
      });

      const result = await Promise.race([ocrPromise, timeoutPromise]);

      const { text, confidence } = result.data;

      console.log(
        `OCR completed. Confidence: ${confidence}%, Text length: ${text.length}`
      );

      // Validate result
      if (typeof text !== "string") {
        throw new Error("Invalid OCR result: text is not a string");
      }

      return {
        text: text.trim(),
        confidence: confidence || 0,
      };
    } catch (error) {
      console.error("OCR recognition failed:", error);

      // Re-initialize worker if it seems to be corrupted
      if (error instanceof Error && error.message.includes("Worker")) {
        console.log("Attempting to reinitialize OCR worker...");
        await this.closeWorker();
        // Don't retry automatically to avoid infinite loops
      }

      throw new Error(
        `OCR failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Perform OCR with retry mechanism
   */
  async performOCRWithRetry(
    imageData: Buffer,
    mimeType: string,
    maxRetries: number = 2
  ): Promise<OCRResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`OCR attempt ${attempt}/${maxRetries}`);
        return await this.performOCR(imageData, mimeType);
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error("Unknown OCR error");
        console.warn(`OCR attempt ${attempt} failed:`, lastError.message);

        if (attempt < maxRetries) {
          // Close and reinitialize worker before retry
          await this.closeWorker();
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
        }
      }
    }

    throw lastError || new Error("OCR failed after all retry attempts");
  }

  /**
   * Properly terminate the worker
   */
  async closeWorker(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
        console.log("Tesseract.js worker terminated successfully.");
      } catch (error) {
        console.warn("Error terminating Tesseract.js worker:", error);
      } finally {
        this.worker = null;
        this.isInitializing = false;
      }
    }
  }

  /**
   * Get worker status for debugging
   */
  getWorkerStatus(): string {
    if (this.isInitializing) return "initializing";
    if (this.worker) return "ready";
    return "not_initialized";
  }
}

// Export singleton instance
export const ocrService = new OCRService();

// Gracefully close worker on process exit
process.on("SIGINT", async () => {
  console.log("Received SIGINT, closing OCR worker...");
  await ocrService.closeWorker();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, closing OCR worker...");
  await ocrService.closeWorker();
  process.exit(0);
});
