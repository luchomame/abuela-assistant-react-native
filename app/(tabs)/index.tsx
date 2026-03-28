import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import VoiceRecorder from "@/components/voice-recorder";
import { useInterpreter } from "@/hooks/use-interpreter";
import { useModelManager } from "@/hooks/use-model-manager";
import { ExtractionResult } from "@/lib/services/interpreter";

export default function TabOneScreen() {
  const {
    availability,
    isLoading,
    isDownloading,
    downloadingModel,
    downloadProgress,
    error,
    missingModels,
    download,
    isReady: areModelsReady,
  } = useModelManager();

  const { interpreter } = useInterpreter(areModelsReady);
  const [isProcessing, setIsProcessing] = useState(false);
  const [summaryData, setSummaryData] = useState<ExtractionResult | null>(null);

  const handleTranscriptionComplete = async (finalText: string) => {
    if (!interpreter) return;

    setIsProcessing(true);
    try {
      console.log("Passing text to LLM for extraction...");
      const result = await interpreter.extractSummary(finalText);
      setSummaryData(result);
    } catch (error) {
      console.error("LLM Extraction failed: ", error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#0c7" />
        <ThemedText>Checking local model availability…</ThemedText>
      </ThemedView>
    );
  }

  if (error || availability === null) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.missingContainer}>
          <ThemedText type="title" style={styles.title}>
            Unable to verify models
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            The app could not confirm whether the local model files are available.
            Please check your device storage and try again.
          </ThemedText>
          {error ? (
            <ThemedText style={[styles.paragraph, styles.errorText]}>
              {error}
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
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.missingContainer}>
          <ThemedText type="title" style={styles.title}>
            Models Required
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            To use this app, you need two local models: Whisper for speech
            transcription and Qwen for the local LLM. Download the missing
            files below and reopen the app once they are installed.
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
              Downloading {downloadingModel.displayName}: {Math.round(
                downloadProgress * 100,
              )}%
            </ThemedText>
          ) : null}

          {error ? (
            <ThemedText style={[styles.paragraph, styles.errorText]}>
              {error}
            </ThemedText>
          ) : null}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {!isProcessing && (
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

      {summaryData && !isProcessing && (
        <ScrollView style={styles.resultsContainer}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Resumen de la Visita (Visit Summary)
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {summaryData.spanish_summary}
          </ThemedText>

          {summaryData.action_items.length > 0 && (
            <>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Action Items Found:
              </ThemedText>
              {summaryData.action_items.map((item, index) => (
                <View key={index} style={styles.actionItemCard}>
                  <ThemedText style={{ fontWeight: "bold" }}>
                    Type: {item.action_type}
                  </ThemedText>
                  <ThemedText>
                    {JSON.stringify(item.action_description, null, 2)}
                  </ThemedText>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    flex: 1,
    padding: 20,
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
  },
});
