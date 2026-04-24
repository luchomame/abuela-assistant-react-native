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
  WhisperVadContext,
} from "whisper.rn/index.js";
import { initWhisper, initWhisperVad } from "whisper.rn/index.js";
import { RealtimeTranscriber } from "whisper.rn/realtime-transcription/RealtimeTranscriber.js";
import { AudioPcmStreamAdapter } from "whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default language for Whisper transcription.
 * NOTE: Using "auto" currently causes crashes in the native engine.
 * We stick to "en" (English) for medical visit recording.
 */
const DEFAULT_LANGUAGE = "auto";

// ---------------------------------------------------------------------------
// TranscriptionService
// ---------------------------------------------------------------------------
export class TranscriptionService {
  private ctx: WhisperContext;
  private vadCtx: WhisperVadContext;
  private startTime: number = 0;

  // allows us to cleanly start and stop it without passing reference to the UI components
  private transcriberInstance: RealtimeTranscriber | null = null;

  /**
   * Private Constructor to prevent initialization
   * @param ctx WhisperContext from init class
   * @returns none
   */
  private constructor(ctx: WhisperContext, vadCtx: WhisperVadContext) {
    this.ctx = ctx;
    this.vadCtx = vadCtx;
  }

  /**
   * Static factory method to handle the async init, keeping whisper.rn imports isolated here
   * @param modelPath Path in file system for the model
   * @returns Transcription service
   */
  // !NOTE: we are doing factory method here so on unmount the service unmounts as well. this can cause latency issues when coming back and trying to use the mic. can switch to singleton to prevent this but just leaving it as is for now
  static async create(
    modelPath: string,
    vadModelPath: string,
  ): Promise<TranscriptionService> {
    const normalizedPath = modelPath.replace(/^file:\/\//, "");
    const normalizedVadPath = vadModelPath.replace(/^file:\/\//, "");

    console.log(
      "[Transcriber] Initializing Whisper with model path:",
      normalizedPath,
    );
    const ctx = await initWhisper({ filePath: normalizedPath, useGpu: false });

    const vadCtx: WhisperVadContext = await initWhisperVad({
      filePath: normalizedVadPath,
    });
    console.log("[Transcriber] Whisper initialized");
    console.log("[Transcriber] CTX GPU Enabled?", ctx.gpu);
    console.log("[Transcriber] CTX Reason no GPU (if any):", ctx.reasonNoGPU);
    console.log("[Transcriber] VAD GPU Enabled?", vadCtx.gpu);
    console.log(
      "[Transcriber] VAD Reason no GPU (if any):",
      vadCtx.reasonNoGPU,
    );

    return new TranscriptionService(ctx, vadCtx);
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
      language: DEFAULT_LANGUAGE, // English medical speech
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
   * @deprecated
   */
  async transcribeRealtime(options?: TranscribeRealtimeOptions): Promise<{
    stop: () => Promise<void>;
    subscribe: (callback: (event: TranscribeRealtimeEvent) => void) => void;
  }> {
    console.log("[Transcriber] Starting real-time transcription");

    const { stop, subscribe } = await this.ctx.transcribeRealtime({
      language: DEFAULT_LANGUAGE,
      realtimeAudioSec: 30,
      // Use VAD to only transcribe when speech is detected
      useVad: true,
      ...options,
    });

    return { stop, subscribe };
  }

  /**
   * use init real time transcriber to shift the live audio stream management into javascript
   */
  async startRealtime(
    onTranscribe: (text: string) => void,
    options?: TranscribeRealtimeOptions,
  ): Promise<void> {
    console.log("[Transcriber] Initializing safe RealtimeTranscriber API...");

    if (this.transcriberInstance) {
      console.warn("[Transcriber] Realtime transcription is already running!");
      return;
    }

    const audioStream = new AudioPcmStreamAdapter();

    this.transcriberInstance = new RealtimeTranscriber(
      {
        whisperContext: this.ctx,
        audioStream: audioStream,
        vadContext: this.vadCtx,
      },
      {
        audioSliceSec: 30,
        transcribeOptions: {
          language: DEFAULT_LANGUAGE,
          ...options,
        },
      },
      {
        onTranscribe: (event: any) => {
          // standardize text extraction
          const text = event?.data?.result || event?.result;
          if (text && text.trim().length > 0) {
            onTranscribe(text.trim());
            console.log("[Transcriber] Chunk transcribed:", text.trim());
          }
        },
        onError: (error: any) => {
          console.error("[Transcriber] RealtimeTranscriber error:", error);
        },
      },
    );
    this.startTime = Date.now();
    console.log("[useWhisper] Starting realtime transcription", {
      timestamp: new Date().toISOString(),
    });

    await this.transcriberInstance.start();
    console.log("[Transcriber] Realtime transcription started");
  }

  /**
   * clean method to stop realtime transcriber
   */
  async stopRealtime(): Promise<void> {
    if (this.transcriberInstance) {
      console.log("[Transcriber] Stopping RealtimeTranscriber...");
      await this.transcriberInstance.stop();
      console.log("[Transcriber] RealtimeTranscriber stopped in", {
        duration: (Date.now() - this.startTime) / 1000,
      });
      this.transcriberInstance = null;
      // console.log("[Transcriber] RealtimeTranscriber stopped.");
    }
  }

  async release(): Promise<void> {
    await this.stopRealtime();

    // adding some secs to let whisper process last few secs of audio
    console.log("[Transcriber] Flushing in progress queue...");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (this.ctx) {
      await this.ctx.release();
      console.log("[Transcriber] Whisper context safely released from memory.");
    }

    if (this.vadCtx) {
      await this.vadCtx.release();
      console.log("[Transcriber] VAD context released from memory.");
    }
  }
}
