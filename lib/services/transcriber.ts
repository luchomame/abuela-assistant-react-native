/**
 * transcriber.ts — Service layer for audio transcription.
 *
 * Port of Python services/transcriber.py.
 * Wraps whisper.rn to provide a clean interface for both
 * file-based and real-time transcription.
 */

import type {
  TranscribeFileOptions,
  TranscribeRealtimeEvent,
  TranscribeRealtimeOptions,
  TranscribeResult,
  WhisperContext,
} from "whisper.rn/index.js";
import { initWhisper } from "whisper.rn/index.js";

// ---------------------------------------------------------------------------
// TranscriptionService
// ---------------------------------------------------------------------------
export class TranscriptionService {
  private ctx: WhisperContext;

  /**
   * Private Constructor to prevent initialization
   * @param ctx WhisperContext from init class
   * @returns none
   */
  private constructor(ctx: WhisperContext) {
    this.ctx = ctx;
  }

  /**
   * Static factory method to handle the async init, keeping whisper.rn imports isolated here
   * @param modelPath Path in file system for the model
   * @returns Transcription service
   */
  // !NOTE: we are doing factory method here so on unmount the service unmounts as well. this can cause latency issues when coming back and trying to use the mic. can switch to singleton to prevent this but just leaving it as is for now
  static async create(modelPath: string): Promise<TranscriptionService> {
    console.log("[Transcriber] Initializing Whisper with mode: ", modelPath);
    const ctx = await initWhisper({ filePath: modelPath });
    console.log("[Transcriber] Whisper initialized");
    return new TranscriptionService(ctx);
  }

  /**
   * Transcribes a pre-recorded audio file.
   * Mirrors Python's TranscriptionService.transcribe().
   *
   * @param audioPath - Path to the audio file on the device filesystem
   * @param options   - Optional whisper.rn transcription options
   * @returns The transcribed text as a trimmed string
   * @throws Error if the transcriber is not initialized
   */
  async transcribe(
    audioPath: string,
    options?: TranscribeFileOptions,
  ): Promise<string> {
    if (!this.ctx)
      throw new Error("Transcriber not initialized. Call init() first");

    console.log("[Transcriber] Starting transcription:", audioPath);

    const { promise } = this.ctx.transcribe(audioPath, {
      language: "en", // English medical speech
      ...options,
    });

    const result: TranscribeResult = await promise;
    console.log("[Transcriber] Result is ", result);
    const text = result.result.trim();

    console.log("[Transcriber] Transcription complete, length:", text.length);
    return text;
  }

  /**
   * Starts real-time transcription from the device microphone.
   * This is used for Scribe mode (live doctor visit recording).
   *
   * Returns a control object with:
   *   - stop()      → stops the recording and returns final text
   *   - subscribe() → listen for incremental transcription events
   *
   * @param options - Optional real-time transcription options
   */
  async transcribeRealtime(options?: TranscribeRealtimeOptions): Promise<{
    stop: () => Promise<void>;
    subscribe: (callback: (event: TranscribeRealtimeEvent) => void) => void;
  }> {
    console.log("[Transcriber] Starting real-time transcription");

    const { stop, subscribe } = await this.ctx.transcribeRealtime({
      language: "en",
      // Process audio in 30-second chunks (whisper.cpp hard constraint)
      realtimeAudioSec: 10,
      // Use VAD to only transcribe when speech is detected
      useVad: false,
      ...options,
    });

    return { stop, subscribe };
  }

  /**
   * Optional: cleanup method to free up memory
   */
  async release(): Promise<void> {
    if (this.ctx) {
      await this.ctx.release();
      console.log("[Transcriber] whisper released");
    }
  }
}
