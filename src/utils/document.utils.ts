import axios from "axios";
import { ocrService } from "../services/ocr.service";
import * as mammoth from "mammoth";
import * as pdfParse from "pdf-parse";
import type {
  CloudinaryFileDetail,
  DocumentProcessingPreferences,
  Flashcard,
} from "../types";
import { getSignedCloudinaryUrl } from "../config/cloudinary";
import { ChatOpenAI } from "@langchain/openai";
import { OPENAI_API_KEY } from "../config/env";

const chatModel = new ChatOpenAI({
  openAIApiKey: OPENAI_API_KEY,
  modelName: "gpt-4o",
  temperature: 0.7,
});

export async function downloadFile(
  fileDetail: CloudinaryFileDetail
): Promise<Buffer> {
  const { fileName, publicId, mimeType, cloudStorageUrl } = fileDetail;
  let downloadUrl = cloudStorageUrl;

  if (publicId) {
    try {
      downloadUrl = getSignedCloudinaryUrl(publicId);
    } catch (err) {
      if (!downloadUrl) throw new Error("No valid download URL available.");
    }
  } else if (!downloadUrl) {
    throw new Error("Missing both publicId and cloudStorageUrl.");
  }

  const strategies = [
    () => axios.get(downloadUrl, { responseType: "arraybuffer" }),
    () =>
      axios.get(downloadUrl, { responseType: "arraybuffer", timeout: 90000 }),
  ];

  for (let i = 0; i < strategies.length; i++) {
    try {
      const response = await strategies[i]();
      if (response.data) {
        const size = response.data.length || response.data.byteLength;
        if (size === 0)
          throw new Error(`Downloaded file is empty: ${fileName}`);
        return Buffer.from(response.data);
      }
    } catch (error) {
      if (i === strategies.length - 1) throw error;
    }
  }

  throw new Error(`All download strategies failed for ${fileName}`);
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  fileDetail: CloudinaryFileDetail
): Promise<string> {
  const { fileName, mimeType } = fileDetail;
  let text = "";

  if (mimeType.startsWith("image/")) {
    const result = await ocrService.performOCRWithRetry(
      fileBuffer,
      mimeType,
      3
    );
    text = result.text;
  } else if (mimeType === "application/pdf") {
    try {
      const result = await pdfParse.default(fileBuffer);
      text = result.text || "";
    } catch {
      const result = await ocrService.performOCRWithRetry(
        fileBuffer,
        mimeType,
        2
      );
      text = result.text || "";
    }
  } else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const result = await mammoth.extractRawText({
      arrayBuffer: fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength
      ),
    });
    text = result.value || "";
  } else if (mimeType.startsWith("text/")) {
    text = fileBuffer.toString("utf8");
  } else {
    try {
      text = fileBuffer.toString("utf8");
    } catch {
      const result = await ocrService.performOCRWithRetry(
        fileBuffer,
        mimeType,
        2
      );
      text = result.text || "";
    }
  }

  if (!text.trim())
    throw new Error(`No text content extracted from ${fileName}`);
  return text;
}

export async function generateContentWithLLM(
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
    try {
      const res = await chatModel.invoke(
        `Summarize this content:\n\n${fullText}`
      );
      summary = res.content as string;
    } catch (e) {
      summary = "Error generating summary.";
    }
  }

  if (preferences.generateFlashcards) {
    try {
      const res = await chatModel.invoke(
        `From this content, generate 5-10 flashcards as JSON:\n\n${fullText}`
      );
      try {
        flashcards = JSON.parse(res.content as string);
      } catch {
        flashcards = [
          { question: "Parse failed", answer: res.content as string },
        ];
      }
    } catch {
      flashcards = [
        { question: "Error generating flashcards", answer: "Please retry." },
      ];
    }
  }

  if (preferences.generateStudyGuide) {
    try {
      const res = await chatModel.invoke(
        `Create a study guide from this content:\n\n${fullText}`
      );
      studyGuide = res.content as string;
    } catch {
      studyGuide = "Error generating study guide.";
    }
  }

  return { summary, flashcards, studyGuide };
}
