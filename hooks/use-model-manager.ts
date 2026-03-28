import { useCallback, useEffect, useState } from "react";
import {
  downloadModel,
  type ModelAvailability,
  MODEL_INFOS,
  type ModelInfo,
  checkModelsAvailable,
} from "@/lib/services/model-manager";

export interface ModelManagerState {
  availability: ModelAvailability | null;
  isLoading: boolean;
  isDownloading: boolean;
  downloadingModel: ModelInfo | null;
  downloadProgress: number;
  error: string | null;
}

export function useModelManager() {
  const [state, setState] = useState<ModelManagerState>({
    availability: null,
    isLoading: true,
    isDownloading: false,
    downloadingModel: null,
    downloadProgress: 0,
    error: null,
  });

  const refreshAvailability = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const availability = await checkModelsAvailable();
      setState((prev) => ({
        ...prev,
        availability,
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        availability: {
          whisper: false,
          llama: false,
        },
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify model availability.",
      }));
    }
  }, []);

  const download = useCallback(
    async (model: ModelInfo) => {
      setState((prev) => ({
        ...prev,
        isDownloading: true,
        downloadingModel: model,
        downloadProgress: 0,
        error: null,
      }));

      try {
        await downloadModel(model, (progress) => {
          setState((prev) => ({
            ...prev,
            downloadProgress: progress,
          }));
        });

        await refreshAvailability();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "Failed to download model.",
        }));
      } finally {
        setState((prev) => ({
          ...prev,
          isDownloading: false,
          downloadingModel: null,
          downloadProgress: 0,
        }));
      }
    },
    [refreshAvailability],
  );

  useEffect(() => {
    refreshAvailability();
  }, [refreshAvailability]);

  return {
    ...state,
    isReady: !!state.availability?.llama && !!state.availability?.whisper,
    missingModels: MODEL_INFOS.filter((model) =>
      state.availability ? !state.availability[model.type] : true,
    ),
    download,
    refreshAvailability,
  };
}
