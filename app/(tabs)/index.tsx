import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import VoiceRecorder from "@/components/voice-recorder";
import { useInterpreter } from "@/hooks/use-interpreter";
import { useModelManager } from "@/hooks/use-model-manager";
import { getDbManager } from "@/lib/db";
import { DatabaseManager } from "@/lib/database/manager";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

export default function TabOneScreen() {
  // Model manager handles downloading and verifying local models
  const {
    availability,
    isLoading: isModelManagerLoading,
    isDownloading,
    downloadingModel,
    downloadProgress,
    error: modelManagerError,
    missingModels,
    download,
    isReady: areModelsReady,
  } = useModelManager();

  // Database manager
  const [dbManager, setDbManager] = useState<DatabaseManager | null>(null);

  // Interpreter hook encapsulates LLM logic and database saving
  const {
    isReady: isInterpreterReady,
    isProcessing,
    error: interpreterError,
    processAndSave,
  } = useInterpreter(dbManager, areModelsReady);

  const [lastSummaryId, setLastSummaryId] = useState<number | null>(null);

  // Initialize DB Manager
  useEffect(() => {
    let isMounted = true;
    async function loadDb() {
      try {
        const manager = await getDbManager();
        if (isMounted) {
          setDbManager(manager);
        }
      } catch (e) {
        console.error("Failed to initialize DB manager:", e);
      }
    }
    loadDb();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTranscriptionComplete = async (finalText: string) => {
    setLastSummaryId(null);
    const summaryId = await processAndSave(finalText);
    if (summaryId) {
      setLastSummaryId(summaryId);
    }
  };

  // --- Render logic ---

  if (isModelManagerLoading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#0c7" />
        <ThemedText>Checking local model availability…</ThemedText>
      </ThemedView>
    );
  }

  if (modelManagerError || availability === null) {
    // ... (error handling for model manager)
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.missingContainer}>
          <ThemedText type="title" style={styles.title}>
            Unable to verify models
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            The app could not confirm whether the local model files are
            available. Please check your device storage and try again.
          </ThemedText>
          {modelManagerError ? (
            <ThemedText style={[styles.paragraph, styles.errorText]}>
              {modelManagerError}
            </ThemedText>
          ) : null}
          <Pressable
            onPress={() => void download(missingModels[0])}
            disabled={isDownloading || missingModels.length === 0}
            style={({ pressed }) => [
              styles.downloadButton,
              (pressed || isDownloading) && styles.buttonPressed,
            ]}
          >
            <ThemedText style={styles.downloadButtonText}>
              Retry model install
            </ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    );
  }

  if (!areModelsReady) {
    // ... (UI for downloading missing models)
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.missingContainer}>
          <ThemedText type="title" style={styles.title}>
            Models Required
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            To use this app, you need three local models: Whisper for speech
            transcription, VAD for Whisper, and Qwen for the local LLM. Download
            the missing files below and reopen the app once they are installed.
          </ThemedText>

          {missingModels.map((model) => (
            <View key={model.type} style={styles.missingCard}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                {model.displayName}
              </ThemedText>
              <ThemedText style={styles.paragraph} numberOfLines={4}>
                {model.downloadUrl}
              </ThemedText>

              <View style={styles.buttonRow}>
                <Pressable
                  onPress={() => void Linking.openURL(model.downloadUrl)}
                  style={({ pressed }) => [
                    styles.linkButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <ThemedText style={styles.linkButtonText}>
                    Open download URL
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => void download(model)}
                  disabled={isDownloading}
                  style={({ pressed }) => [
                    styles.downloadButton,
                    (pressed || isDownloading) && styles.buttonPressed,
                  ]}
                >
                  <ThemedText style={styles.downloadButtonText}>
                    Download
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ))}

          {isDownloading && downloadingModel ? (
            <ThemedText style={styles.paragraph}>
              Downloading {downloadingModel.displayName}:{" "}
              {Math.round(downloadProgress * 100)}%
            </ThemedText>
          ) : null}

          {modelManagerError ? (
            <ThemedText style={[styles.paragraph, styles.errorText]}>
              {modelManagerError}
            </ThemedText>
          ) : null}
        </ScrollView>
      </ThemedView>
    );
  }

  const isAppReady = isInterpreterReady && dbManager;

  return (
    <ThemedView style={styles.container}>
      {!isAppReady && !isProcessing && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#0c7" />
          <ThemedText style={{ marginTop: 10 }}>
            Initializing local AI...
          </ThemedText>
        </View>
      )}

      {isAppReady && !isProcessing && (
        <VoiceRecorder onTranscriptionComplete={handleTranscriptionComplete} />
      )}

      {isProcessing && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#0c7" />
          <ThemedText style={{ marginTop: 10 }}>
            Analyzing visit with local AI...
          </ThemedText>
        </View>
      )}

      <View style={styles.resultsContainer}>
        {interpreterError && (
          <ThemedText style={styles.errorText}>{interpreterError}</ThemedText>
        )}

        {lastSummaryId && !isProcessing && (
          <View>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Success!
            </ThemedText>
            <ThemedText style={styles.paragraph}>
              Visit summary saved with ID: {lastSummaryId}
            </ThemedText>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 24,
    marginBottom: 20,
    textAlign: "center",
  },
  missingContainer: {
    padding: 24,
    gap: 16,
  },
  missingCard: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: "rgba(150, 150, 150, 0.08)",
  },
  buttonRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  linkButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#1c7",
    borderRadius: 12,
  },
  linkButtonText: {
    color: "white",
    fontWeight: "600",
  },
  downloadButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#0c7",
    borderRadius: 12,
  },
  downloadButtonText: {
    color: "white",
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.75,
  },
  processingContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  resultsContainer: {
    padding: 20,
    alignSelf: "stretch",
    borderTopWidth: 1,
    borderTopColor: "rgba(150, 150, 150, 0.2)",
  },
  sectionTitle: {
    marginTop: 10,
    marginBottom: 8,
  },
  paragraph: {
    marginBottom: 20,
    lineHeight: 24,
  },
  actionItemCard: {
    backgroundColor: "rgba(150, 150, 150, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  errorText: {
    color: "#d00",
    fontWeight: "600",
    textAlign: "center",
  },
});
