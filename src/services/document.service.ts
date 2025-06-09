import axios from "axios";
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

      for (const fileDetail of sessionData.files) {
        console.log(`Fetching and processing file: ${fileDetail.fileName}`);

        const response = await axios.get(fileDetail.cloudStorageUrl, {
          responseType: "arraybuffer",
        });
        const fileBuffer = Buffer.from(response.data);

        let fileText = "";

        if (fileDetail.mimeType.startsWith("image/")) {
          console.log(`Performing OCR on image: ${fileDetail.fileName}`);
          const ocrResult = await ocrService.performOCR(
            fileBuffer,
            fileDetail.mimeType
          );
          fileText = ocrResult.text;
          console.log(
            `OCR complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
          );
        } else if (fileDetail.mimeType === "application/pdf") {
          console.log(`Extracting text from PDF: ${fileDetail.fileName}`);
          try {
            const data = await pdfParse.default(fileBuffer);
            fileText = data.text;
            console.log(
              `PDF text extraction complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
            );
          } catch (pdfError) {
            console.warn(
              `PDF text extraction failed for ${fileDetail.fileName}, attempting OCR fallback:`,
              pdfError
            );
            const ocrResult = await ocrService.performOCR(
              fileBuffer,
              fileDetail.mimeType
            );
            fileText = ocrResult.text;
            console.log(
              `PDF OCR fallback complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
            );
          }
        } else if (
          fileDetail.mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          console.log(`Extracting text from DOCX: ${fileDetail.fileName}`);
          const result = await mammoth.extractRawText({
            arrayBuffer: fileBuffer,
          });
          fileText = result.value;
          console.log(
            `DOCX text extraction complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
          );
        } else if (
          fileDetail.mimeType ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ) {
          console.warn(
            `PPTX text extraction is not directly supported by current libraries (mammoth.js). You might need a specialized library or resort to OCR.`
          );

          console.log(
            `Attempting OCR fallback for PPTX: ${fileDetail.fileName}`
          );
          const ocrResult = await ocrService.performOCR(
            fileBuffer,
            fileDetail.mimeType
          );
          fileText = ocrResult.text;
          console.log(
            `PPTX OCR fallback complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
          );
        } else if (fileDetail.mimeType.startsWith("text/")) {
          fileText = fileBuffer.toString("utf8");
          console.log(
            `Plain text extraction complete for ${fileDetail.fileName}. Text length: ${fileText.length}`
          );
        } else {
          console.warn(
            `Unsupported MIME type for text extraction: ${fileDetail.mimeType} for file ${fileDetail.fileName}. Skipping.`
          );
          continue;
        }

        fullExtractedText += fileText + "\n\n";

        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        });
        const fileChunks = await textSplitter.createDocuments(
          [fileText],
          [{ source: fileDetail.fileName }]
        );
        allTextChunks.push(...fileChunks);
      }

      console.log(`Total extracted text length: ${fullExtractedText.length}`);
      console.log(`Total chunks created: ${allTextChunks.length}`);

      console.log("Embeddings generation and storage placeholder.");

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

      await sessionRef.update({
        status: "completed",
        summary: summaryContent,
        flashcards: flashcardsContent,
        studyGuide: studyGuideContent,
      });

      console.log(
        `Session ${sessionId} processing finished. Status updated to 'completed'.`
      );
      return {
        status: "success",
        message: "Document processing completed successfully.",
      };
    } catch (error) {
      console.error(`Failed to process session ${sessionId}:`, error);
      await sessionRef.update({
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown processing error.",
      });
      throw error;
    }
  }
}

export const documentProcessingService = new DocumentProcessingService();
