import { useEffect, useRef, useState } from "react";
import { InterpretationService } from "@/lib/services/interpreter";

export function useInterpreter(enabled = true) {
  const interpreterRef = useRef<InterpretationService | null>(null);
  const [isReady, setIsReady] = useState(false);

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
      } catch (error) {
        console.error(
          "[useInterpreter] Failed to load llama model info: ",
          error,
        );
      }
    }

    loadModel();

    return () => {
      isMounted = false;
      if (interpreterRef.current) interpreterRef.current.release();
    };
  }, [enabled]);

  return {
    isReady,
    interpreter: interpreterRef.current,
  };
}
