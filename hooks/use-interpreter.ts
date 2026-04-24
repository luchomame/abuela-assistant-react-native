import { DatabaseManager } from "@/lib/database/manager";
import {
  ExtractionResult,
  InterpretationService,
} from "@/lib/services/interpreter";
import { useCallback, useEffect, useRef, useState } from "react";

export function useInterpreter(
  dbManager?: DatabaseManager | null,
  enabled = true,
) {
  const interpreterRef = useRef<InterpretationService | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    async function loadModel() {
      try {
        const service = await InterpretationService.create();
        if (isMounted) {
          interpreterRef.current = service;
          setIsReady(true);
        }
      } catch (e) {
        console.error(
          "[useInterpreter] Failed to load llama model info: ",
          e,
        );
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    loadModel();

    return () => {
      isMounted = false;
      if (interpreterRef.current) interpreterRef.current.release();
    };
  }, [enabled]);

  const processAndSave = useCallback(
    async (text: string): Promise<number | undefined> => {
      if (!interpreterRef.current || !dbManager) {
        setError("Interpreter or DB Manager not ready.");
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        // 1. Extract summary, action items, etc. from the text
        const extractionResult: ExtractionResult =
          await interpreterRef.current.extractSummary(text);

        // 2. Generate an embedding for the English summary
        const embedding = await interpreterRef.current.embedSummary(
          extractionResult.english_summary,
        );

        // 3. Prepare data for insertion
        const summary = {
          english_transcript: extractionResult.english_summary,
          summary_vector: embedding,
        };

        const translation = {
          translated_language: "Spanish", // Assuming Spanish for now
          translated_text: extractionResult.spanish_summary,
        };

        // 4. Insert the complete visit record into the database
        const summaryId = await dbManager.insertVisit(
          summary,
          extractionResult.action_items,
          translation,
        );

        console.log(
          `[useInterpreter] Successfully processed and saved visit. Summary ID: ${summaryId}`,
        );
        return summaryId;
      } catch (e) {
        console.error("[useInterpreter] Failed to process and save:", e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsProcessing(false);
      }
    },
    [dbManager],
  );

  return {
    isReady,
    isProcessing,
    error,
    processAndSave,
  };
}
