import { Directory, File, Paths } from "expo-file-system";

export type ModelType = "whisper" | "llama" | "vad";

export interface ModelInfo {
  type: ModelType;
  filename: string;
  displayName: string;
  downloadUrl: string;
}

const rootPath = Paths.document ?? Paths.cache;
const modelDirectory = new Directory(rootPath, "models");

if (!modelDirectory?.uri) {
  throw new Error(
    "Unable to resolve a writable file system directory for model downloads.",
  );
}

export const MODEL_DIRECTORY_URI = modelDirectory.uri;
console.log("[ModelManager] MODEL_DIRECTORY_URI", MODEL_DIRECTORY_URI);

export const WHISPER_MODEL_INFO: ModelInfo = {
  type: "whisper",
  // filename: "ggml-tiny.en.bin",
  filename: "ggml-base-q5_1.bin",
  displayName: "Whisper speech model",
  downloadUrl:
    // "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin?download=true",
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin?download=true",
};

export const LLAMA_MODEL_INFO: ModelInfo = {
  type: "llama",
  filename: "Qwen3-0.6B-Q4_0.gguf",
  displayName: "Qwen LLM model",
  downloadUrl:
    "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf?download=true",
};

export const VAD_MODEL_INFO: ModelInfo = {
  type: "vad",
  filename: "ggml-silero-v6.2.0.bin",
  displayName: "Whisper VAD model",
  downloadUrl:
    "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin?download=true",
};

export const MODEL_INFOS: readonly ModelInfo[] = [
  WHISPER_MODEL_INFO,
  LLAMA_MODEL_INFO,
  VAD_MODEL_INFO,
];

export function getModelFileUri(model: ModelInfo): string {
  return `${MODEL_DIRECTORY_URI}${model.filename}`;
}

export function getWhisperModelUri(): string {
  return getModelFileUri(WHISPER_MODEL_INFO);
}

export function getVadModelUri(): string {
  return getModelFileUri(VAD_MODEL_INFO);
}

export function getLlamaModelUri(): string {
  return getModelFileUri(LLAMA_MODEL_INFO);
}

export interface ModelAvailability {
  whisper: boolean;
  llama: boolean;
  vad: boolean;
}

export async function ensureModelDirectoryExists(): Promise<void> {
  console.log(
    "[ModelManager] ensureModelDirectoryExists ->",
    MODEL_DIRECTORY_URI,
  );
  if (!modelDirectory.exists) {
    modelDirectory.create({ intermediates: true, idempotent: true });
  }
}

export async function modelFileExists(modelUri: string): Promise<boolean> {
  console.log("[ModelManager] modelFileExists ->", modelUri);
  const file = new File(modelUri);
  return file.exists;
}

export async function checkModelsAvailable(): Promise<ModelAvailability> {
  const [whisperExists, llamaExists, vadExists] = await Promise.all([
    modelFileExists(getWhisperModelUri()),
    modelFileExists(getLlamaModelUri()),
    modelFileExists(getVadModelUri()),
  ]);

  return {
    whisper: whisperExists,
    llama: llamaExists,
    vad: vadExists,
  };
}

export async function downloadModel(
  model: ModelInfo,
  onProgress?: (progress: number) => void,
): Promise<string> {
  await ensureModelDirectoryExists();

  const destinationFile = new File(modelDirectory, model.filename);
  if (onProgress) {
    onProgress(0);
  }

  const file = await File.downloadFileAsync(
    model.downloadUrl,
    destinationFile,
    {
      idempotent: true,
    },
  );

  if (onProgress) {
    onProgress(1);
  }

  return file.uri;
}
