import { createWorker, PSM } from "tesseract.js";
import * as path from "path"; // Node.js path module
import * as os from "os"; // Node.js os module
import * as fs from "fs/promises"; // Node.js file system promises API

interface OCRResult {
  text: string;
  confidence: number;
  // Add other relevant data you want to return
}

class OCRService {
  private worker: Tesseract.Worker | null = null;
  private workerInitialized: Promise<void> | null = null;

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    // This function ensures the Tesseract.js worker is ready.
    // It's important to reuse the worker for performance.
    if (!this.workerInitialized) {
      this.workerInitialized = (async () => {
        try {
          this.worker = await createWorker({
            // langPath: path.join(__dirname, '..', '..', 'tessdata'), // Optional: if you bundle your own tessdata
            logger: (m) => {
              /* console.log(m); */
            }, // Optional: Log worker progress
            // Tesseract.js will download language data to os.homedir()/.cache/tesseract.js-data by default
            // Set TESS_DEVELOPMENT_LOGGING=1 environment variable for detailed logs
          });

          // Load language and set recognition parameters
          await this.worker.load("eng"); // Load English language

          await this.worker.setParameters({
            // PSM.SINGLE_BLOCK: Assume a single uniform block of text.
            // PSM.AUTO_OSD: Automatic page segmentation with orientation and script detection.
            // Choose based on your expected document layout.
            // For general documents, PSM.AUTO_OSD is often a good start.
            // PSM.AUTO: Automatic page segmentation, but no OSD.
            // PSM.RAW_LINE: Treat the image as a single text line.
            // PSM.SPARSE_TEXT: Find as much text as possible in no particular order.
            // PSM.SPARSE_TEXT_OSD: Sparse text with orientation and script detection.
            // For general documents, PSM.AUTO is often a good start.
            // For structured docs, you might try PSM.SINGLE_BLOCK.
            // For images with just a few words, PSM.SINGLE_WORD or PSM.SPARSE_TEXT_OSD.
            // Let's use a general purpose one:
            // PSM.AUTO_OSD is good for general document scans
            // PSM.AUTO is also common. Let's use PSM.AUTO for broader use.
            tessedit_pageseg_mode: PSM.AUTO, // Page segmentation mode
          });
          console.log("Tesseract.js worker initialized.");
        } catch (error) {
          console.error("Failed to initialize Tesseract.js worker:", error);
          this.workerInitialized = null; // Allow re-initialization attempt
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

    // Tesseract.js can work with various image inputs (base64, ImageData, File, Blob, Buffer)
    // Here we assume imageData is a Buffer (e.g., from an image file)
    const {
      data: { text, confidence },
    } = await this.worker.recognize(imageData);

    return { text, confidence };
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

// Optional: If you need to bundle tessdata for specific hosting environments or offline use
// You can put .traineddata files in summaid-backend/dist/tessdata
// and configure worker creation: createWorker({ langPath: path.join(__dirname, '..', 'tessdata') })
// For dynamic downloading, the default Tesseract.js behavior is often fine.
