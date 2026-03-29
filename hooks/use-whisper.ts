import {
  getVadModelUri,
  getWhisperModelUri,
} from "@/lib/services/model-manager";
import { TranscriptionService } from "@/lib/services/transcriber";
import { useEffect, useRef, useState } from "react";

export function useWhisper(enabled = true) {
  // ref so instance persists across rerenders
  const transcriber = useRef<TranscriptionService | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    async function loadModel() {
      try {
        const modelUri = getWhisperModelUri();
        const filePath = modelUri.replace("file://", "");

        const vadModelUri = getVadModelUri();
        const vadFilePath = vadModelUri.replace("file://", "");

        const service = await TranscriptionService.create(
          filePath,
          vadFilePath,
        );

        if (isMounted) {
          transcriber.current = service;
          setIsReady(true);
        }
      } catch (error) {
        console.error("[useWhisper] Failed to load whisper model: ", error);
      }
    }

    loadModel();

    return () => {
      isMounted = false;
      // cleanup on unmount
      void release();
    };
  }, [enabled]);

  const release = async () => {
    if (!transcriber.current) {
      return;
    }

    try {
      await transcriber.current.release();
    } catch (error) {
      console.error("[useWhisper] Failed to release whisper model: ", error);
    } finally {
      transcriber.current = null;
      setIsReady(false);
      setIsTranscribing(false);
    }
  };

  const transcribeFile = async (uri: string): Promise<string | null> => {
    if (!transcriber.current) {
      console.warn("Transcriber is not ready yet.");
      return null;
    }

    setIsTranscribing(true);
    try {
      const filePath = uri.replace("file://", "");
      console.log("[useWhisper] Transcribing file: ", filePath);
      const text = await transcriber.current.transcribe(filePath);
      return text;
    } catch (error) {
      console.error("[useWhisper] Failed to transcribe file: ", error);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRealtime = async (onTranscribe: (text: string) => void) => {
    if (!transcriber.current) return;

    setIsTranscribing(true);
    try {
      console.log("[useWhisper] Booting realtime API...");
      await transcriber.current.startRealtime(onTranscribe);
    } catch (error) {
      console.error(
        "[useWhisper] Failed to start realtime transcription: ",
        error,
      );
      setIsTranscribing(false);
    }
  };

  const stopRealtime = async () => {
    if (!transcriber.current) return;

    try {
      await transcriber.current.stopRealtime();
    } catch (error) {
      console.error(
        "[useWhisper] Error while stopping realtime transcription: ",
        error,
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  return {
    isReady,
    isTranscribing,
    transcribeFile,
    startRealtime,
    stopRealtime,
    release,
  };
}
