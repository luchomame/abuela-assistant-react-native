import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useWhisper } from "@/hooks/use-whisper";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  AudioQuality,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

export default function TabOneScreen() {
  // hold uri after recording
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  // holding text from whisper
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  // use-whisper realtime flag
  const [isRealtimeRecording, setIsRealtimeRecording] = useState(false);

  const audioRecorder = useAudioRecorder({
    // Move away from presets which might override your 16000Hz setting
    extension: ".wav",
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000, // Standard for high-quality mono PCM
    android: {
      outputFormat: "mpeg4",
      audioEncoder: "aac",
    },
    ios: {
      audioQuality: AudioQuality.HIGH,
    },
    web: {},
  });
  const recorderState = useAudioRecorderState(audioRecorder);
  const isRecording = recorderState.isRecording;

  const audioPlayer = useAudioPlayer(recordedUri);

  const {
    isReady,
    isTranscribing,
    transcribeFile,
    startRealtime,
    stopRealtime,
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

  // async functions to return promise
  async function startRecording(): Promise<void> {
    try {
      // Android Expo Audio does not output raw PCM WAV. Use Whisper's realtime capture instead.
      if (Platform.OS === "android") {
        setIsRealtimeRecording(true);
        setTranscribedText("");
        await startRealtime((text) => {
          setTranscribedText(text);
        });
        return;
      }

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      console.error("Failed to start recording", error);
    }
  }

  async function stopRecording(): Promise<void> {
    try {
      if (Platform.OS === "android") {
        await stopRealtime();
        setIsRealtimeRecording(false);
        return;
      }

      await audioRecorder.stop();

      const uri = audioRecorder.uri;
      if (uri) {
        console.log("Recording stopped and stored at", uri);
        setRecordedUri(uri);

        // trigger transcription immediately after stopping
        const text = await transcribeFile(uri);
        if (text) {
          setTranscribedText(text);
          console.log(text);
        }
      }
    } catch (error) {
      console.error("Failed to stop recording", error);
    }
  }

  const onMicPress = () => {
    if (!isReady) return;

    if (isRecording || isRealtimeRecording) {
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
          color={isRecording || isRealtimeRecording ? "#ff4f4f" : "#777"}
          style={styles.icon}
        />
        <ThemedText>
          {!isReady
            ? "Loading local AI model..."
            : isRecording || isRealtimeRecording
              ? "Recording…"
              : "Tap microphone to start"}
        </ThemedText>
        {(isRecording || isRealtimeRecording || !isReady) && (
          <ActivityIndicator style={styles.loader} />
        )}
      </View>

      <Pressable
        onPress={onMicPress}
        disabled={!isReady || (isTranscribing && !isRealtimeRecording)}
        style={({ pressed }) => [
          styles.button,
          (pressed || !isReady || (isTranscribing && !isRealtimeRecording)) &&
            styles.buttonPressed,
        ]}
      >
        <Ionicons
          name={
            isRecording || isRealtimeRecording ? "stop-circle" : "mic-circle"
          }
          size={80}
          color={
            !isReady || (isTranscribing && !isRealtimeRecording)
              ? "#aaa"
              : isRecording || isRealtimeRecording
                ? "#d00"
                : "#0c7"
          }
        />
      </Pressable>

      {/* playback UI  */}
      {recordedUri && !isRecording && (
        <View style={styles.playbackContainer}>
          <ThemedText style={styles.playbackText}>
            Listen to Recording
          </ThemedText>
          <Pressable
            onPress={onPlayPress}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              { marginTop: 0, marginLeft: 10 },
            ]}
          >
            <Ionicons
              name={audioPlayer?.playing ? "pause-circle" : "play-circle"}
              size={64}
              color="#007bff"
            />
          </Pressable>
        </View>
      )}
      {isTranscribing ? (
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      ) : transcribedText ? (
        <ScrollView style={styles.transcriptionBox}>
          <ThemedText style={styles.transcriptionText}>
            {transcribedText}
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
