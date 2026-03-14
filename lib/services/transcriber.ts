/**
 * transcriber.ts — Service layer for audio transcription.
 *
 * Port of Python services/transcriber.py.
 * Wraps whisper.rn to provide a clean interface for both
 * file-based and real-time transcription.
 */

import type {
  WhisperContext,
  TranscribeFileOptions,
  TranscribeRealtimeOptions,
  TranscribeRealtimeEvent,
  TranscribeResult,
} from 'whisper.rn';

// ---------------------------------------------------------------------------
// TranscriptionService
// ---------------------------------------------------------------------------
export class TranscriptionService {
  private ctx: WhisperContext;

  /**
   * @param ctx - A pre-initialized WhisperContext from whisper.rn's initWhisper().
   *              The caller is responsible for loading the model first.
   */
  constructor(ctx: WhisperContext) {
    this.ctx = ctx;
  }

  /**
   * Transcribes a pre-recorded audio file.
   * Mirrors Python's TranscriptionService.transcribe().
   *
   * @param audioPath - Path to the audio file on the device filesystem
   * @param options   - Optional whisper.rn transcription options
   * @returns The transcribed text as a trimmed string
   */
  async transcribe(
    audioPath: string,
    options?: TranscribeFileOptions,
  ): Promise<string> {
    console.log('[Transcriber] Starting transcription:', audioPath);

    const { promise } = this.ctx.transcribe(audioPath, {
      language: 'en',  // English medical speech
      ...options,
    });

    const result: TranscribeResult = await promise;
    const text = result.result.trim();

    console.log('[Transcriber] Transcription complete, length:', text.length);
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
    console.log('[Transcriber] Starting real-time transcription');

    const { stop, subscribe } = await this.ctx.transcribeRealtime({
      language: 'en',
      // Process audio in 30-second chunks (whisper.cpp hard constraint)
      realtimeAudioSec: 30,
      // Use VAD to only transcribe when speech is detected
      useVad: true,
      ...options,
    });

    return { stop, subscribe };
  }
}
