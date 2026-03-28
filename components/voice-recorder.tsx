import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useWhisper } from "@/hooks/use-whisper";
import { Ionicons } from "@expo/vector-icons";
import { AudioModule, AudioQuality, setAudioModeAsync } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

interface VoiceRecorderProps {
  onTranscriptionComplete?: (text: string) => void;
}

export default function VoiceRecorder({
  onTranscriptionComplete,
}: VoiceRecorderProps) {
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const {
    isReady,
    isTranscribing,
    startRealtime,
    stopRealtime,
    release: releaseWhisper,
  } = useWhisper();

  // cleanup the recording if the component unmounts
  useEffect(() => {
    async function setupAudio(): Promise<void> {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) {
          Alert.alert(
            "Permission Denied",
            "Please grant microphone permissions to use this feature.",
          );
          return;
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      } catch (error) {
        console.error("Audio setup failed", error);
      }
    }

    setupAudio();
  }, []);

  async function startRecording(): Promise<void> {
    try {
      setIsRecording(true);
      setTranscribedText("");

      // triggers every time Whisper processes
      await startRealtime((text) => {
        setTranscribedText(text);
      });

      // audioRecorder.record();
    } catch (error) {
      console.error("Failed to start recording", error);
      setIsRecording(false);
    }
  }

  async function stopRecording(): Promise<void> {
    try {
      await stopRealtime();
      // audioRecorder.stop();
      setIsRecording(false);

      await releaseWhisper();

      // fire callback with final text
      if (onTranscriptionComplete && transcribedText) {
        onTranscriptionComplete(transcribedText);
      }
    } catch (error) {
      console.error("Failed to stop recording", error);
    }
  }

  const onMicPress = () => {
    if (!isReady) return;

    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Voice Recorder
      </ThemedText>

      <View style={styles.statusRow}>
        <Ionicons
          name="mic"
          size={32}
          color={isRecording ? "#ff4f4f" : "#777"}
          style={styles.icon}
        />
        <ThemedText>
          {!isReady
            ? "Loading local AI model..."
            : isRecording
              ? "Recording…"
              : "Tap microphone to start"}
        </ThemedText>
        {(isRecording || !isReady) && (
          <ActivityIndicator style={styles.loader} />
        )}
      </View>

      <Pressable
        onPress={onMicPress}
        disabled={!isReady}
        style={({ pressed }) => [
          styles.button,
          (pressed || !isReady) && styles.buttonPressed,
        ]}
      >
        <Ionicons
          name={isRecording ? "stop-circle" : "mic-circle"}
          size={80}
          color={!isReady ? "#aaa" : isRecording ? "#d00" : "#0c7"}
        />
      </Pressable>

      {isTranscribing || isRecording ? (
        <ScrollView
          ref={scrollViewRef}
          style={styles.transcriptionBox}
          // Auto scroll to bottom
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }
        >
          <ThemedText style={styles.transcriptionText}>
            {transcribedText || (isRecording ? "Waiting for speech..." : "")}
          </ThemedText>
        </ScrollView>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  title: {
    fontSize: 28,
    marginBottom: 12,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  icon: {
    marginRight: 6,
  },
  loader: {
    marginLeft: 8,
  },
  button: {
    marginTop: 10,
    borderRadius: 100,
  },
  buttonPressed: {
    opacity: 0.65,
  },
  note: {
    marginTop: 20,
    textAlign: "center",
    maxWidth: 260,
  },
  playbackContainer: {
    marginTop: 40,
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(150, 150, 150, 0.1)", // Subtle background for the playback area
    borderRadius: 16,
    width: "100%",
  },
  playbackText: {
    fontSize: 16,
    marginBottom: 10,
    fontWeight: "600",
  },
  transcriptionBox: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    width: "100%",
    maxHeight: 200, // keep it from taking over the whole screen
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 24,
  },
});
