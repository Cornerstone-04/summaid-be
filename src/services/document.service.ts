import axios from "axios";
import * as https from "https";
import { db } from "../config/supabase";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { OPENAI_API_KEY } from "../config/env";
import type { SessionDocument } from "../types"; // Assume you extract types into this file

import {
  downloadFile,
  extractTextFromFile,
  generateContentWithLLM,
} from "../utils/document.utils";

class DocumentProcessingService {
  private axiosInstance = axios.create({
    timeout: 90000,
    maxContentLength: 100 * 1024 * 1024,
    maxBodyLength: 100 * 1024 * 1024,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
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

  async initiateProcessing(sessionId: string, userId: string) {
    try {
      const { data, error } = await db
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (error) throw new Error(`Failed to fetch session: ${error.message}`);

      const sessionData = data as unknown as SessionDocument;
      if (sessionData.user_id !== userId) throw new Error("Unauthorized");

      await db
        .from("sessions")
        .update({
          status: "processing",
          error_message: null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      let fullText = "";
      const allChunks = [];
      const errors: string[] = [];
      const successfulFiles: string[] = [];

      for (const file of sessionData.files) {
        try {
          const buffer = await downloadFile(file);
          const text = await extractTextFromFile(buffer, file);

          if (text.trim()) {
            fullText += text + "\n\n";
            successfulFiles.push(file.fileName);
            const splitter = new RecursiveCharacterTextSplitter({
              chunkSize: 1000,
              chunkOverlap: 200,
            });
            const chunks = await splitter.createDocuments([text]);
            allChunks.push(...chunks);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          errors.push(`Failed to process ${file.fileName}: ${message}`);
        }
      }

      if (!fullText.trim())
        throw new Error(`No text extracted. Errors: ${errors.join("; ")}`);

      const results = await generateContentWithLLM(
        fullText,
        sessionData.preferences
      );

      await db
        .from("sessions")
        .update({
          status: errors.length > 0 ? "completed_with_errors" : "completed",
          summary: results.summary,
          flashcards: results.flashcards,
          study_guide: results.studyGuide,
          processed_at: new Date().toISOString(),
          total_text_length: fullText.length,
          total_chunks: allChunks.length,
          successful_files: successfulFiles,
          processing_errors: errors.length ? errors : null,
        })
        .eq("id", sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await db
        .from("sessions")
        .update({
          status: "failed",
          error_message: message,
          processed_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      throw error;
    }
  }
}

export const documentProcessingService = new DocumentProcessingService();
