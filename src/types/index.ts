export interface Flashcard {
  question: string;
  answer: string;
}

export interface DocumentProcessingPreferences {
  generateFlashcards: boolean;
  generateStudyGuide: boolean;
  generateSummary: boolean;
}

export interface CloudinaryFileDetail {
  fileName: string;
  cloudStorageUrl: string;
  mimeType: string;
  size: number;
  publicId?: string;
}

export interface SessionDocument {
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
  processing_errors?: string[] | null;
}
