import axios from "axios";
import * as https from "https";
import { db } from "../config/firebase";
import { ocrService } from "./ocr.service";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import * as mammoth from "mammoth";
import * as pdfParse from "pdf-parse";

interface Flashcard {
  question: string;
  answer: string;
}

interface DocumentProcessingPreferences {
  generateFlashcards: boolean;
  generateStudyGuide: boolean;
  generateSummary: boolean;
}

interface CloudinaryFileDetail {
  fileName: string;
  cloudStorageUrl: string;
  mimeType: string;
  size: number;
  publicId?: string;
}

interface SessionDocument {
  userId: string;
  files: CloudinaryFileDetail[];
  preferences: DocumentProcessingPreferences;
  status: string;
}

class DocumentProcessingService {
  private axiosInstance = axios.create({
    timeout: 30000,
    maxContentLength: 50 * 1024 * 1024, // 50MB
    maxBodyLength: 50 * 1024 * 1024,
    // Configure HTTPS agent to handle SSL issues
    httpsAgent: new https.Agent({
      rejectUnauthorized: false, // Only for development/testing
      secureProtocol: "TLSv1_2_method",
      ciphers: [
        "ECDHE-RSA-AES128-GCM-SHA256",
        "ECDHE-RSA-AES256-GCM-SHA384",
        "ECDHE-RSA-AES128-SHA256",
        "ECDHE-RSA-AES256-SHA384",
        "DHE-RSA-AES128-GCM-SHA256",
        "DHE-RSA-AES256-GCM-SHA384",
        "DHE-RSA-AES128-SHA256",
        "DHE-RSA-AES256-SHA256",
        "AES128-GCM-SHA256",
        "AES256-GCM-SHA384",
        "AES128-SHA256",
        "AES256-SHA256",
        "HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA",
      ].join(":"),
    }),
    headers: {
      "User-Agent": "SummAid-Backend/1.0",
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
    },
  });

  /**
   * Download file with multiple fallback strategies
   */
  private async downloadFileWithFallbacks(
    url: string,
    fileName: string
  ): Promise<Buffer> {
    const strategies = [
      // Strategy 1: Use configured axios instance
      () => this.axiosInstance.get(url, { responseType: "arraybuffer" }),

      // Strategy 2: Use basic axios with minimal config
      () =>
        axios.get(url, {
          responseType: "arraybuffer",
          timeout: 30000,
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
        }),

      // Strategy 3: Use fetch with node-fetch if available
      () => this.downloadWithFetch(url),

      // Strategy 4: Use axios with completely insecure settings (last resort)
      () =>
        axios.get(url, {
          responseType: "arraybuffer",
          timeout: 30000,
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
            checkServerIdentity: () => undefined,
          }),
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        }),
    ];

    let lastError: Error | null = null;

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(
          `Downloading ${fileName} using strategy ${i + 1}/${strategies.length}`
        );
        const response = await strategies[i]();

        if (response.data) {
          console.log(
            `Successfully downloaded ${fileName} (${
              response.data.length || response.data.byteLength
            } bytes)`
          );
          return Buffer.from(response.data);
        }
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error(`Strategy ${i + 1} failed`);
        console.warn(
          `Download strategy ${i + 1} failed for ${fileName}:`,
          lastError.message
        );

        // Wait a bit before trying next strategy
        if (i < strategies.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw new Error(
      `All download strategies failed for ${fileName}. Last error: ${lastError?.message}`
    );
  }

  /**
   * Alternative download using fetch (if available)
   */
  private async downloadWithFetch(url: string): Promise<{ data: ArrayBuffer }> {
    try {
      // Try to use fetch if available
      const fetch = (await import("node-fetch")).default;
      const response = await fetch(url, {
        // timeout: 30000,

        headers: {
          "User-Agent": "SummAid-Backend/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return { data: arrayBuffer };
    } catch (error) {
      // If node-fetch is not available or fails, throw error
      throw new Error(
        `Fetch strategy failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate and sanitize URL
   */
  private validateAndSanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // Ensure it's HTTPS for security
      if (urlObj.protocol !== "https:") {
        console.warn(`Non-HTTPS URL detected: ${url}`);
      }

      // Basic validation for Cloudinary URLs
      if (url.includes("cloudinary.com")) {
        return url;
      }

      // For other URLs, ensure they're properly formatted
      return urlObj.toString();
    } catch (error) {
      throw new Error(`Invalid URL format: ${url}`);
    }
  }

  /**
   * Initiates the full processing pipeline for a given session.
   * @param sessionId The ID of the session document in Firestore.
   * @param userId The UID of the authenticated user.
   */
  async initiateProcessing(sessionId: string, userId: string) {
    console.log(
      `Starting processing for session: ${sessionId}, user: ${userId}`
    );

    const sessionRef = db.collection("sessions").doc(sessionId);

    try {
      const sessionDoc = await sessionRef.get();
      if (!sessionDoc.exists) {
        throw new Error("Session not found.");
      }
      const sessionData = sessionDoc.data() as SessionDocument;

      if (sessionData.userId !== userId) {
        throw new Error("Unauthorized: Session does not belong to this user.");
      }

      await sessionRef.update({ status: "processing" });

      let fullExtractedText = "";
      const allTextChunks: { pageContent: string; metadata: any }[] = [];
      const processingErrors: string[] = [];

      for (const fileDetail of sessionData.files) {
        console.log(
          `Processing file: ${fileDetail.fileName} (${fileDetail.mimeType})`
        );

        try {
          // Validate URL first
          const sanitizedUrl = this.validateAndSanitizeUrl(
            fileDetail.cloudStorageUrl
          );

          // Download file with fallback strategies
          const fileBuffer = await this.downloadFileWithFallbacks(
            sanitizedUrl,
            fileDetail.fileName
          );

          if (!fileBuffer || fileBuffer.length === 0) {
            throw new Error(`Downloaded file is empty: ${fileDetail.fileName}`);
          }

          let fileText = "";

          if (fileDetail.mimeType.startsWith("image/")) {
            console.log(`Performing OCR on image: ${fileDetail.fileName}`);

            try {
              const ocrResult = await ocrService.performOCRWithRetry(
                fileBuffer,
                fileDetail.mimeType,
                2
              );
              fileText = ocrResult.text;

              console.log(
                `OCR complete for ${fileDetail.fileName}. Text length: ${fileText.length}, Confidence: ${ocrResult.confidence}%`
              );

              if (ocrResult.confidence < 70) {
                console.warn(
                  `Low OCR confidence (${ocrResult.confidence}%) for ${fileDetail.fileName}`
                );
              }
            } catch (ocrError) {
              const errorMsg = `OCR failed for ${fileDetail.fileName}: ${
                ocrError instanceof Error ? ocrError.message : "Unknown error"
              }`;
              console.error(errorMsg);
              processingErrors.push(errorMsg);
              continue;
            }
          } else if (fileDetail.mimeType === "application/pdf") {
            console.log(`Extracting text from PDF: ${fileDetail.fileName}`);
            try {
              const data = await pdfParse.default(fileBuffer, {
                max: 0,
                version: "v1.10.100",
              });
              fileText = data.text;
              console.log(
                `PDF text extraction complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
              );
            } catch (pdfError) {
              console.warn(
                `PDF text extraction failed for ${fileDetail.fileName}, attempting OCR fallback:`,
                pdfError
              );

              try {
                const ocrResult = await ocrService.performOCRWithRetry(
                  fileBuffer,
                  fileDetail.mimeType,
                  2
                );
                fileText = ocrResult.text;
                console.log(
                  `PDF OCR fallback complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
                );
              } catch (ocrFallbackError) {
                const errorMsg = `Both PDF extraction and OCR failed for ${fileDetail.fileName}`;
                console.error(errorMsg, ocrFallbackError);
                processingErrors.push(errorMsg);
                continue;
              }
            }
          } else if (
            fileDetail.mimeType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ) {
            console.log(`Extracting text from DOCX: ${fileDetail.fileName}`);
            try {
              const result = await mammoth.extractRawText({
                arrayBuffer: fileBuffer,
              });
              fileText = result.value;

              if (result.messages && result.messages.length > 0) {
                console.warn(
                  `DOCX processing warnings for ${fileDetail.fileName}:`,
                  result.messages
                );
              }

              console.log(
                `DOCX text extraction complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
              );
            } catch (docxError) {
              const errorMsg = `DOCX extraction failed for ${
                fileDetail.fileName
              }: ${
                docxError instanceof Error ? docxError.message : "Unknown error"
              }`;
              console.error(errorMsg);
              processingErrors.push(errorMsg);
              continue;
            }
          } else if (
            fileDetail.mimeType ===
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          ) {
            console.warn(
              `PPTX text extraction not directly supported. Attempting OCR for: ${fileDetail.fileName}`
            );

            try {
              const ocrResult = await ocrService.performOCRWithRetry(
                fileBuffer,
                fileDetail.mimeType,
                2
              );
              fileText = ocrResult.text;
              console.log(
                `PPTX OCR complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
              );
            } catch (ocrError) {
              const errorMsg = `PPTX OCR failed for ${fileDetail.fileName}: ${
                ocrError instanceof Error ? ocrError.message : "Unknown error"
              }`;
              console.error(errorMsg);
              processingErrors.push(errorMsg);
              continue;
            }
          } else if (fileDetail.mimeType.startsWith("text/")) {
            try {
              fileText = fileBuffer.toString("utf8");
              console.log(
                `Plain text extraction complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
              );
            } catch (textError) {
              const errorMsg = `Text file processing failed for ${
                fileDetail.fileName
              }: ${
                textError instanceof Error ? textError.message : "Unknown error"
              }`;
              console.error(errorMsg);
              processingErrors.push(errorMsg);
              continue;
            }
          } else {
            const warningMsg = `Unsupported MIME type: ${fileDetail.mimeType} for file ${fileDetail.fileName}. Skipping.`;
            console.warn(warningMsg);
            processingErrors.push(warningMsg);
            continue;
          }

          // Process extracted text
          if (fileText && fileText.trim().length > 0) {
            fullExtractedText += fileText + "\n\n";

            const textSplitter = new RecursiveCharacterTextSplitter({
              chunkSize: 1000,
              chunkOverlap: 200,
              separators: ["\n\n", "\n", ". ", " ", ""],
            });

            const fileChunks = await textSplitter.createDocuments(
              [fileText],
              [{ source: fileDetail.fileName, mimeType: fileDetail.mimeType }]
            );
            allTextChunks.push(...fileChunks);
          } else {
            const warningMsg = `No text extracted from ${fileDetail.fileName}`;
            console.warn(warningMsg);
            processingErrors.push(warningMsg);
          }
        } catch (fileProcessingError) {
          const errorMsg = `Failed to process file ${fileDetail.fileName}: ${
            fileProcessingError instanceof Error
              ? fileProcessingError.message
              : "Unknown error"
          }`;
          console.error(errorMsg);
          processingErrors.push(errorMsg);
          continue;
        }
      }

      console.log(`Total extracted text length: ${fullExtractedText.length}`);
      console.log(`Total chunks created: ${allTextChunks.length}`);

      if (processingErrors.length > 0) {
        console.warn(
          `Processing completed with ${processingErrors.length} errors:`,
          processingErrors
        );
      }

      if (fullExtractedText.trim().length === 0) {
        throw new Error(
          "No text content could be extracted from any of the uploaded files."
        );
      }

      // Generate content based on preferences
      let summaryContent = null;
      let flashcardsContent: Flashcard[] = [];
      let studyGuideContent = null;

      if (sessionData.preferences.generateSummary) {
        console.log("Generating summary (placeholder)...");
        summaryContent = "Placeholder summary generated from documents.";
      }
      if (sessionData.preferences.generateFlashcards) {
        console.log("Generating flashcards (placeholder)...");
        flashcardsContent = [
          { question: "What is AI?", answer: "Artificial Intelligence." },
        ];
      }
      if (sessionData.preferences.generateStudyGuide) {
        console.log("Generating study guide (placeholder)...");
        studyGuideContent = "Placeholder study guide generated.";
      }

      const updateData: any = {
        status:
          processingErrors.length > 0 ? "completed_with_errors" : "completed",
        summary: summaryContent,
        flashcards: flashcardsContent,
        studyGuide: studyGuideContent,
        processedAt: new Date().toISOString(),
        totalTextLength: fullExtractedText.length,
        totalChunks: allTextChunks.length,
      };

      if (processingErrors.length > 0) {
        updateData.processingErrors = processingErrors;
      }

      await sessionRef.update(updateData);

      console.log(
        `Session ${sessionId} processing finished. Status: ${updateData.status}`
      );

      return {
        status: "success",
        message: "Document processing completed successfully.",
        errors: processingErrors.length > 0 ? processingErrors : undefined,
      };
    } catch (error) {
      console.error(`Failed to process session ${sessionId}:`, error);

      await sessionRef.update({
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown processing error.",
        failedAt: new Date().toISOString(),
      });

      throw error;
    }
  }
}

export const documentProcessingService = new DocumentProcessingService();
