import { TranscriptionService } from "@/lib/services/transcriber";
import { Asset } from "expo-asset";
import { useEffect, useRef, useState } from "react";

const modelAsset = require("@/assets/models/ggml-tiny.en.bin");

export function useWhisper() {
  // ref so instance persists across rerenders
  const transcriber = useRef<TranscriptionService | null>(null);
  const stopRealtimeRef = useRef<(() => Promise<void>) | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadModel() {
      try {
        const asset = Asset.fromModule(modelAsset);
        await asset.downloadAsync();

        if (!asset.localUri) {
          throw new Error("Failed to resolve local URI for the Whisper model.");
        }

        const filePath = asset.localUri.replace("file://", "");
        // initialize whisper
        const service = await TranscriptionService.create(filePath);

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
      if (transcriber.current) transcriber.current.release();
    };
  }, []);

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
      const { stop, subscribe } =
        await transcriber.current.transcribeRealtime();
      stopRealtimeRef.current = stop;

      subscribe((event: any) => {
        const text = event?.data?.result || event?.result;
        if (text) {
          onTranscribe(text);
        }
      });
    } catch (error) {
      console.error(
        "[useWhisper] Failed to start realtime transcription: ",
        error,
      );
      setIsTranscribing(false);
    }
  };

  const stopRealtime = async () => {
    if (stopRealtimeRef.current) {
      await stopRealtimeRef.current();
      stopRealtimeRef.current = null;
    }
    setIsTranscribing(false);
  };

  return {
    isReady,
    isTranscribing,
    transcribeFile,
    startRealtime,
    stopRealtime,
  };
}
