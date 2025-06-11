// summaid-backend/src/services/document.service.ts

import axios from "axios";
import * as https from "https";
import { db } from "../config/supabase";
import { ocrService } from "./ocr.service";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
// import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from "@langchain/google-genai"; // Uncomment if you switch to Google Gemini
import * as mammoth from "mammoth";
import * as pdfParse from "pdf-parse";
import {
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_CLOUD_NAME,
  OPENAI_API_KEY,
  GEMINI_API_KEY,
} from "../config/env";

// --- Interfaces ---
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
  id: string;
  user_id: string;
  files: CloudinaryFileDetail[];
  preferences: DocumentProcessingPreferences;
  status: string;
  summary?: string | null;
  flashcards?: Flashcard[];
  study_guide?: string | null;
  chat_history?: any[];
  error_message?: string;
  created_at?: string;
  processed_at?: string;
  total_text_length?: number;
  total_chunks?: number;
  successful_files?: string[];
  // Changed type to allow 'null' explicitly
  processing_errors?: string[] | null;
}

class DocumentProcessingService {
  private axiosInstance = axios.create({
    timeout: 90000,
    maxContentLength: 100 * 1024 * 1024,
    maxBodyLength: 100 * 1024 * 1024,
    httpsAgent: new https.Agent({
      rejectUnauthorized: false, // WARN: Set to true in production for security
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

  private chatModel = new ChatOpenAI({
    openAIApiKey: OPENAI_API_KEY,
    modelName: "gpt-4o",
    temperature: 0.7,
  });

  private embeddings = new OpenAIEmbeddings({
    openAIApiKey: OPENAI_API_KEY,
    modelName: "text-embedding-ada-002",
  });

  /**
   * Downloads a file from a given URL with retry logic.
   * This function expects a direct downloadable URL (e.g., a signed Cloudinary URL).
   * @param url The URL of the file to download.
   * @param fileName The name of the file for logging purposes.
   * @returns A Buffer containing the file's data.
   * @throws Error if all download strategies fail or file is empty.
   */
  private async _downloadFile(url: string, fileName: string): Promise<Buffer> {
    console.log(
      `🔄 Starting download for: ${fileName} from ${url.substring(0, 80)}...`
    );

    const strategies = [
      () => this.axiosInstance.get(url, { responseType: "arraybuffer" }),
      () => axios.get(url, { responseType: "arraybuffer", timeout: 90000 }),
    ];

    let lastError: Error | null = null;

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(
          `📥 Trying download strategy ${i + 1}/${
            strategies.length
          } for ${fileName}`
        );
        const response = await strategies[i]();

        if (response.data) {
          const size = response.data.length || response.data.byteLength;
          if (size === 0) {
            throw new Error(`Downloaded file is empty: ${fileName}`);
          }
          console.log(`✅ Successfully downloaded ${fileName} (${size} bytes)`);
          return Buffer.from(response.data);
        } else {
          throw new Error(`No data received for ${fileName}`);
        }
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error(`Strategy ${i + 1} failed`);
        console.warn(`❌ Download strategy ${i + 1} failed for ${fileName}:`, {
          message: lastError.message,
          status: (error as any)?.response?.status,
          statusText: (error as any)?.response?.statusText,
        });
        if (i < strategies.length - 1) {
          console.log(`⏳ Waiting 2 seconds before trying next strategy...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
    throw new Error(
      `All download strategies failed for ${fileName}. Last error: ${lastError?.message}`
    );
  }

  /**
   * Extracts text content from a given file buffer based on its MIME type.
   * Supports images (OCR), PDFs, Word documents, and PowerPoint files (OCR fallback).
   * @param fileBuffer The buffer containing the file data.
   * @param fileDetail The CloudinaryFileDetail object with fileName and mimeType.
   * @returns The extracted text as a string.
   * @throws Error if text extraction fails or no text is found.
   */
  private async _extractTextFromFile(
    fileBuffer: Buffer,
    fileDetail: CloudinaryFileDetail
  ): Promise<string> {
    const { fileName, mimeType } = fileDetail;
    console.log(`🔍 Extracting text from ${fileName} (${mimeType})`);

    let extractedText = "";

    try {
      if (mimeType.startsWith("image/")) {
        console.log(`🖼️ Performing OCR for image: ${fileName}`);
        const ocrResult = await ocrService.performOCRWithRetry(
          fileBuffer,
          mimeType,
          3
        );
        extractedText = ocrResult.text;
        if (extractedText.trim().length === 0) {
          throw new Error(`OCR extracted no text from ${fileName}`);
        }
        console.log(
          `✅ OCR successful for ${fileName}. Text length: ${extractedText.length}, Confidence: ${ocrResult.confidence}%`
        );
      } else if (mimeType === "application/pdf") {
        console.log(`📄 Processing PDF: ${fileName}`);
        try {
          const data = await pdfParse.default(fileBuffer);
          extractedText = data.text || "";
        } catch (pdfError) {
          console.warn(
            `⚠️ PDF native extraction failed for ${fileName}, attempting OCR fallback. Error: ${pdfError}`
          );
          const ocrResult = await ocrService.performOCRWithRetry(
            fileBuffer,
            mimeType,
            2
          );
          extractedText = ocrResult.text || "";
        }
        if (extractedText.trim().length === 0) {
          throw new Error(
            `No text or OCR text extracted from PDF: ${fileName}`
          );
        }
        console.log(
          `✅ PDF text extraction/OCR successful for ${fileName}. Text length: ${extractedText.length}`
        );
      } else if (
        mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mimeType === "application/msword"
      ) {
        console.log(`📝 Processing Word document: ${fileName}`);
        const result = await mammoth.extractRawText({
          arrayBuffer: fileBuffer.buffer.slice(
            fileBuffer.byteOffset,
            fileBuffer.byteOffset + fileBuffer.byteLength
          ),
        });
        extractedText = result.value || "";
        if (result.messages && result.messages.length > 0) {
          console.warn(
            `⚠️ DOCX processing warnings for ${fileName}:`,
            result.messages
          );
        }
        if (extractedText.trim().length === 0) {
          throw new Error(`No text extracted from Word document: ${fileName}`);
        }
        console.log(
          `✅ Word text extraction successful for ${fileName}. Text length: ${extractedText.length}`
        );
      } else if (
        mimeType ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        mimeType === "application/vnd.ms-powerpoint"
      ) {
        console.log(`📊 Processing PowerPoint (using OCR): ${fileName}`);
        const ocrResult = await ocrService.performOCRWithRetry(
          fileBuffer,
          mimeType,
          2
        );
        extractedText = ocrResult.text || "";
        if (extractedText.trim().length === 0) {
          throw new Error(
            `No text or OCR text extracted from PowerPoint: ${fileName}`
          );
        }
        console.log(
          `✅ PowerPoint OCR successful for ${fileName}. Text length: ${extractedText.length}`
        );
      } else if (mimeType.startsWith("text/")) {
        console.log(`📄 Processing plain text file: ${fileName}`);
        extractedText = fileBuffer.toString("utf8") || "";
        if (extractedText.trim().length === 0) {
          throw new Error(`Empty text file: ${fileName}`);
        }
        console.log(
          `✅ Plain text extraction successful for ${fileName}. Text length: ${extractedText.length}`
        );
      } else {
        console.warn(
          `⚠️ Unsupported MIME type: ${mimeType} for file ${fileName}. Attempting fallbacks.`
        );
        try {
          extractedText = fileBuffer.toString("utf8") || "";
          if (extractedText.trim().length === 0) {
            throw new Error("No text content found via plain text attempt.");
          }
          console.log(
            `✅ Successfully processed as plain text fallback. Length: ${extractedText.length}`
          );
        } catch (textAttemptError) {
          console.log(
            `🔄 Plain text fallback failed for ${fileName}, attempting OCR fallback...`
          );
          const ocrResult = await ocrService.performOCRWithRetry(
            fileBuffer,
            mimeType,
            2
          );
          extractedText = ocrResult.text || "";
          if (extractedText.trim().length === 0) {
            throw new Error(`OCR fallback also failed for ${fileName}.`);
          }
          console.log(
            `✅ OCR fallback successful for ${fileName}. Length: ${extractedText.length}`
          );
        }
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error(`No text content could be extracted from ${fileName}`);
      }

      console.log(
        `📝 Extracted text sample from ${fileName}: "${extractedText
          .substring(0, 200)
          .replace(/\n/g, " ")}..."`
      );
      return extractedText;
    } catch (error) {
      console.error(`❌ Text extraction failed for ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Generates summary, flashcards, and study guide using LLM based on extracted text.
   * @param fullText The combined extracted text from all documents.
   * @param preferences Document processing preferences.
   * @returns An object containing generated summary, flashcards, and study guide.
   */
  private async _generateContentWithLLM(
    fullText: string,
    preferences: DocumentProcessingPreferences
  ): Promise<{
    summary: string | null;
    flashcards: Flashcard[];
    studyGuide: string | null;
  }> {
    let summary: string | null = null;
    let flashcards: Flashcard[] = [];
    let studyGuide: string | null = null;

    if (preferences.generateSummary) {
      console.log("📋 Generating summary with LLM...");
      try {
        const summaryPrompt = `Please summarize the following lecture content:\n\n${fullText}\n\nProvide a concise summary.`;
        const summaryResponse = await this.chatModel.invoke(summaryPrompt);
        summary = summaryResponse.content as string;
        console.log("✅ Summary generated.");
      } catch (error) {
        console.error("❌ Error generating summary:", error);
        summary = "Error generating summary.";
      }
    }

    if (preferences.generateFlashcards) {
      console.log("🎴 Generating flashcards with LLM...");
      try {
        const flashcardPrompt = `From the following lecture content, generate 5-10 question-answer flashcards. Return them as a JSON array of objects, each with 'question' and 'answer' keys.
        Example:
        [
          {"question": "What is A?", "answer": "B"},
          {"question": "How does C work?", "answer": "D"}
        ]
        \n\nContent:\n\n${fullText}`;
        const flashcardResponse = await this.chatModel.invoke(flashcardPrompt);
        try {
          flashcards = JSON.parse(
            flashcardResponse.content as string
          ) as Flashcard[];
          console.log(`✅ ${flashcards.length} flashcards generated.`);
        } catch (parseError) {
          console.warn(
            "⚠️ Could not parse flashcards as JSON. Treating as plain text or empty.",
            parseError
          );
          flashcards = [
            {
              question: "Failed to parse flashcards.",
              answer: flashcardResponse.content as string,
            },
          ];
        }
      } catch (error) {
        console.error("❌ Error generating flashcards:", error);
        flashcards = [
          {
            question: "Error generating flashcards.",
            answer: "Please try again.",
          },
        ];
      }
    }

    if (preferences.generateStudyGuide) {
      console.log("📚 Generating study guide with LLM...");
      try {
        const studyGuidePrompt = `Create a detailed study guide from the following lecture content. Include key concepts, important terms, and potential discussion points:\n\n${fullText}\n\nProvide a comprehensive study guide.`;
        const studyGuideResponse = await this.chatModel.invoke(
          studyGuidePrompt
        );
        studyGuide = studyGuideResponse.content as string;
        console.log("✅ Study guide generated.");
      } catch (error) {
        console.error("❌ Error generating study guide:", error);
        studyGuide = "Error generating study guide.";
      }
    }

    return { summary, flashcards, studyGuide };
  }

  /**
   * Initiates the document processing workflow for a given session.
   * This includes downloading, text extraction, chunking, and content generation using LLMs.
   * Updates the session status and results in Supabase.
   * @param sessionId The ID of the session to process.
   * @param userId The ID of the user associated with the session.
   * @returns An object indicating the processing status and any errors.
   */
  async initiateProcessing(sessionId: string, userId: string) {
    console.log(
      `🚀 Starting processing for session: ${sessionId}, user: ${userId}`
    );

    try {
      console.log("📄 Fetching session document from Supabase...");
      const { data, error: fetchError } = await db
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch session: ${fetchError.message}`);
      }
      // Explicitly cast data to SessionDocument
      const sessionData: SessionDocument = data as unknown as SessionDocument;

      if (!sessionData) {
        throw new Error("Session not found.");
      }

      if (sessionData.user_id !== userId) {
        throw new Error("Unauthorized: Session does not belong to this user.");
      }

      console.log(
        `📁 Found ${sessionData.files.length} files to process for session ${sessionId}`
      );

      const { error: updateStatusError } = await db
        .from("sessions")
        .update({
          status: "processing",
          error_message: null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      if (updateStatusError) {
        console.error("❌ Failed to update session status:", updateStatusError);
        throw new Error(
          `Failed to update session status: ${updateStatusError.message}`
        );
      }
      console.log("🔄 Session status updated to 'processing'.");

      let fullExtractedText = "";
      const allTextChunks: { pageContent: string; metadata: any }[] = [];
      const processingErrors: string[] = [];
      const successfulFiles: string[] = [];

      for (let i = 0; i < sessionData.files.length; i++) {
        const fileDetail = sessionData.files[i];
        console.log(
          `\n📎 Processing file ${i + 1}/${sessionData.files.length}: ${
            fileDetail.fileName
          }`
        );

        try {
          const fileBuffer = await this._downloadFile(
            fileDetail.cloudStorageUrl,
            fileDetail.fileName
          );
          const fileText = await this._extractTextFromFile(
            fileBuffer,
            fileDetail
          );

          if (fileText && fileText.trim().length > 0) {
            fullExtractedText += fileText + "\n\n";
            successfulFiles.push(fileDetail.fileName);

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
            console.log(
              `✅ Successfully processed ${fileDetail.fileName} - ${fileChunks.length} chunks created.`
            );
          } else {
            throw new Error(
              `No text content extracted from ${fileDetail.fileName}.`
            );
          }
        } catch (fileError) {
          const errorMessage = `Failed to process ${fileDetail.fileName}: ${
            fileError instanceof Error ? fileError.message : "Unknown error"
          }`;
          console.error(`❌ ${errorMessage}`);
          processingErrors.push(errorMessage);
        }
      }

      console.log(`\n📊 Processing Summary:`);
      console.log(
        `  ✅ Successful files: ${successfulFiles.length}/${sessionData.files.length}`
      );
      console.log(
        `  ❌ Failed files: ${processingErrors.length}/${sessionData.files.length}`
      );
      console.log(
        `  📝 Total extracted text length: ${fullExtractedText.length} characters`
      );
      console.log(`  🧩 Total chunks created: ${allTextChunks.length}`);

      if (fullExtractedText.trim().length === 0) {
        throw new Error(
          `No text content could be extracted from any of the uploaded files. Errors: ${processingErrors.join(
            "; "
          )}`
        );
      }

      // Ensure sessionData.preferences is correctly typed before passing to _generateContentWithLLM
      const { summary, flashcards, studyGuide } =
        await this._generateContentWithLLM(
          fullExtractedText,
          sessionData.preferences as DocumentProcessingPreferences // Explicit cast
        );

      const finalStatus =
        processingErrors.length > 0 ? "completed_with_errors" : "completed";

      const updateData: Partial<SessionDocument> = {
        status: finalStatus,
        summary: summary,
        flashcards: flashcards,
        study_guide: studyGuide,
        processed_at: new Date().toISOString(),
        total_text_length: fullExtractedText.length,
        total_chunks: allTextChunks.length,
        successful_files: successfulFiles,
        processing_errors:
          processingErrors.length > 0 ? processingErrors : null,
      };

      const { error: finalUpdateError } = await db
        .from("sessions")
        .update(updateData)
        .eq("id", sessionId);

      if (finalUpdateError) {
        console.error(
          "❌ Failed to update session with results:",
          finalUpdateError
        );
        throw new Error(
          `Failed to update session: ${finalUpdateError.message}`
        );
      }

      console.log(
        `🎉 Session ${sessionId} processing completed. Status: ${finalStatus}`
      );

      return {
        status: "success",
        message: "Document processing completed successfully.",
        errors: processingErrors.length > 0 ? processingErrors : undefined,
        successfulFiles,
        totalTextLength: fullExtractedText.length,
      };
    } catch (error) {
      console.error(`💥 Failed to process session ${sessionId}:`, error);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown processing error.";
      try {
        const { error: errorUpdateError } = await db
          .from("sessions")
          .update({
            status: "failed",
            error_message: errorMessage,
            processed_at: new Date().toISOString(),
          })
          .eq("id", sessionId);

        if (errorUpdateError) {
          console.error(
            "❌ Failed to update session with error status:",
            errorUpdateError
          );
        }
      } catch (updateError) {
        console.error(
          "❌ Failed to update session status due to secondary error:",
          updateError
        );
      }

      throw error;
    }
  }
}

export const documentProcessingService = new DocumentProcessingService();
