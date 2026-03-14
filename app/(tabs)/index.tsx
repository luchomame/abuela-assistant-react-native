import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

export default function TabOneScreen() {
  // hold uri after recording
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const isRecording = recorderState.isRecording;

  const audioPlayer = useAudioPlayer(recordedUri);

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

        // Note: The new API removed the "IOS" suffix from these properties
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

  // async functions to return promise
  async function startRecording(): Promise<void> {
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  }

  async function stopRecording(): Promise<void> {
    try {
      await audioRecorder.stop();

      const uri = audioRecorder.uri;
      if (uri) {
        console.log("Recording stopped and stored at", uri);
        setRecordedUri(uri);
      }
    } catch (err) {
      console.error("Failed to stop recording", err);
    }
  }

  const onMicPress = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const onPlayPress = () => {
    if (!audioPlayer) return;

    if (audioPlayer.playing) {
      audioPlayer.pause();
    } else {
      audioPlayer.play();
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
          {isRecording ? "Recording…" : "Tap microphone to start"}
        </ThemedText>
        {isRecording && <ActivityIndicator style={styles.loader} />}
      </View>

      <Pressable
        onPress={onMicPress}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Ionicons
          name={isRecording ? "stop-circle" : "mic-circle"}
          size={80}
          color={isRecording ? "#d00" : "#0c7"}
        />
      </Pressable>

      {/* playback UI  */}
      {recordedUri && !isRecording && (
        <View style={styles.playbackContainer}>
          <ThemedText style={styles.playbackText}>
            {" "}
            Listen to Recording
          </ThemedText>
          <Pressable
            onPress={onPlayPress}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons
              name={audioPlayer?.playing ? "pause-circle" : "play-circle"}
              size={64}
              color="#007bff"
            />
          </Pressable>

          <ThemedText>{recordedUri}</ThemedText>
        </View>
      )}
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
});
