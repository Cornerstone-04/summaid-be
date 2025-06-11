// summaid-backend/src/services/ocr.service.ts
import { createWorker, PSM } from "tesseract.js";

interface OCRResult {
  text: string;
  confidence: number;
}

class OCRService {
  private worker: Tesseract.Worker | null = null;
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize worker with proper error handling and configuration
   */
  private async initializeWorker(): Promise<void> {
    // If already initializing, wait for that to complete
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // If already initialized, return immediately
    if (this.worker && !this.isInitializing) {
      return Promise.resolve();
    }

    // Start initialization
    this.isInitializing = true;
    this.initializationPromise = this._doInitialization();

    try {
      await this.initializationPromise;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  private async _doInitialization(): Promise<void> {
    try {
      console.log("🔧 Initializing Tesseract.js worker...");

      // Clean up any existing worker first
      if (this.worker) {
        await this.closeWorker();
      }

      // Create worker with timeout protection
      const workerCreationPromise = createWorker("eng", 1, {
        logger: (m) => {
          // Only log important progress to reduce noise
          if (m.status === "recognizing text" && m.progress > 0) {
            console.log(`📝 OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
        errorHandler: (err) => {
          console.error("🚨 Tesseract worker error:", err);
        },
      });

      // Add timeout for worker creation
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Worker initialization timeout after 30 seconds"));
        }, 30000);
      });

      this.worker = await Promise.race([workerCreationPromise, timeoutPromise]);

      // Configure worker parameters for better performance
      await this.worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        tessedit_char_whitelist: "", // Allow all characters
        preserve_interword_spaces: "1",
        tessedit_do_invert: "0",
        // Improve performance settings
        classify_enable_learning: "0",
        classify_enable_adaptive_matcher: "1",
      });

      console.log("✅ Tesseract.js worker initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Tesseract.js worker:", error);
      this.worker = null;
      throw new Error(
        `OCR initialization failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate image data before processing
   */
  private validateImageData(imageData: Buffer, mimeType: string): void {
    if (!Buffer.isBuffer(imageData)) {
      throw new Error("Image data must be a Buffer");
    }

    if (imageData.length === 0) {
      throw new Error("Image data is empty");
    }

    if (imageData.length > 50 * 1024 * 1024) {
      // 50MB limit
      throw new Error("Image data too large (>50MB)");
    }

    const supportedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/bmp",
      "image/tiff",
      "application/pdf", // For PDF OCR fallback
    ];

    if (!supportedTypes.includes(mimeType.toLowerCase())) {
      console.warn(`⚠️ Potentially unsupported MIME type for OCR: ${mimeType}`);
    }
  }

  /**
   * Perform OCR on image data with comprehensive error handling
   */
  async performOCR(imageData: Buffer, mimeType: string): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      console.log(
        `🔍 Starting OCR for ${mimeType} (${imageData.length} bytes)`
      );

      // Validate input
      this.validateImageData(imageData, mimeType);

      // Ensure worker is ready
      await this.initializeWorker();

      if (!this.worker) {
        throw new Error("Tesseract.js worker is not available");
      }

      console.log(`🚀 Beginning OCR recognition...`);

      // Perform OCR with timeout
      const ocrPromise = this.worker.recognize(imageData);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("OCR recognition timeout after 120 seconds"));
        }, 120000); // 2 minutes timeout
      });

      const result = await Promise.race([ocrPromise, timeoutPromise]);

      const processingTime = Date.now() - startTime;
      const { text, confidence } = result.data;

      console.log(`✅ OCR completed in ${processingTime}ms`);
      console.log(
        `📊 Confidence: ${confidence?.toFixed(1)}%, Text length: ${
          text?.length || 0
        }`
      );

      // Validate OCR result
      if (!result.data) {
        throw new Error("OCR returned no data");
      }

      if (typeof text !== "string") {
        throw new Error(`OCR returned invalid text type: ${typeof text}`);
      }

      const cleanText = text.trim();
      const finalConfidence = confidence || 0;

      // Log quality metrics
      if (finalConfidence < 50) {
        console.warn(`⚠️ Low OCR confidence: ${finalConfidence.toFixed(1)}%`);
      }

      if (cleanText.length === 0) {
        console.warn(`⚠️ OCR extracted no text content`);
      } else if (cleanText.length < 10) {
        console.warn(`⚠️ OCR extracted very little text: "${cleanText}"`);
      }

      return {
        text: cleanText,
        confidence: finalConfidence,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ OCR failed after ${processingTime}ms:`, error);

      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes("timeout")) {
          throw new Error(`OCR timeout: Processing took longer than expected`);
        }
        if (error.message.includes("Worker")) {
          console.log(
            "🔄 Worker appears corrupted, will reinitialize on next attempt"
          );
          await this.closeWorker();
        }
        throw new Error(`OCR recognition failed: ${error.message}`);
      }

      throw new Error("OCR failed with unknown error");
    }
  }

  /**
   * Perform OCR with intelligent retry mechanism
   */
  async performOCRWithRetry(
    imageData: Buffer,
    mimeType: string,
    maxRetries: number = 3
  ): Promise<OCRResult> {
    let lastError: Error | null = null;
    let bestResult: OCRResult | null = null;

    console.log(`🔄 Starting OCR with up to ${maxRetries} attempts`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📝 OCR attempt ${attempt}/${maxRetries}`);

        const result = await this.performOCR(imageData, mimeType);

        // If we get a good result, return it immediately
        if (result.confidence >= 70 && result.text.length > 0) {
          console.log(
            `✅ OCR succeeded on attempt ${attempt} with high confidence`
          );
          return result;
        }

        // Keep track of the best result so far
        if (!bestResult || result.confidence > bestResult.confidence) {
          bestResult = result;
          console.log(
            `📊 New best result: ${result.confidence.toFixed(1)}% confidence`
          );
        }

        // If this is not the last attempt and we have a low-confidence result, retry
        if (attempt < maxRetries && result.confidence < 70) {
          console.log(
            `🔄 Low confidence (${result.confidence.toFixed(1)}%), retrying...`
          );
          await this.closeWorker(); // Fresh start for next attempt
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
          continue;
        }

        // If this is the last attempt, return the best result we have
        if (attempt === maxRetries && bestResult) {
          console.log(`✅ Returning best result after ${maxRetries} attempts`);
          return bestResult;
        }
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error("Unknown OCR error");
        console.warn(
          `⚠️ OCR attempt ${attempt}/${maxRetries} failed: ${lastError.message}`
        );

        if (attempt < maxRetries) {
          console.log(`🔄 Cleaning up before retry attempt ${attempt + 1}`);
          await this.closeWorker();
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    // If we have any result, return it even if confidence is low
    if (bestResult) {
      console.log(
        `⚠️ Returning low-confidence result: ${bestResult.confidence.toFixed(
          1
        )}%`
      );
      return bestResult;
    }

    // Complete failure
    const finalError =
      lastError || new Error("OCR failed after all retry attempts");
    console.error(
      `💥 OCR completely failed after ${maxRetries} attempts:`,
      finalError.message
    );
    throw finalError;
  }

  /**
   * Properly terminate the worker with error handling
   */
  async closeWorker(): Promise<void> {
    if (this.worker) {
      try {
        console.log("🛑 Terminating Tesseract.js worker...");
        await this.worker.terminate();
        console.log("✅ Tesseract.js worker terminated successfully");
      } catch (error) {
        console.warn("⚠️ Error terminating Tesseract.js worker:", error);
      } finally {
        this.worker = null;
        this.isInitializing = false;
        this.initializationPromise = null;
      }
    }
  }

  /**
   * Get detailed worker status for debugging
   */
  getWorkerStatus(): {
    status: string;
    isInitializing: boolean;
    hasWorker: boolean;
  } {
    return {
      status: this.isInitializing
        ? "initializing"
        : this.worker
        ? "ready"
        : "not_initialized",
      isInitializing: this.isInitializing,
      hasWorker: !!this.worker,
    };
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<boolean> {
    try {
      const status = this.getWorkerStatus();
      console.log("🏥 OCR Health Check:", status);

      if (!this.worker && !this.isInitializing) {
        await this.initializeWorker();
      }

      return !!this.worker;
    } catch (error) {
      console.error("🚨 OCR Health Check failed:", error);
      return false;
    }
  }
}

// Export singleton instance
export const ocrService = new OCRService();

// Graceful shutdown handlers
const gracefulShutdown = async (signal: string) => {
  console.log(`📪 Received ${signal}, closing OCR worker...`);
  try {
    await ocrService.closeWorker();
    console.log("✅ OCR worker closed successfully");
  } catch (error) {
    console.error("❌ Error closing OCR worker:", error);
  }
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle uncaught exceptions
process.on("uncaughtException", async (error) => {
  console.error("💥 Uncaught Exception:", error);
  await ocrService.closeWorker();
  process.exit(1);
});

process.on("unhandledRejection", async (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  await ocrService.closeWorker();
  process.exit(1);
});
