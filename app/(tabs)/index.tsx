import { ThemedView } from "@/components/themed-view";
import VoiceRecorder from "@/components/voice-recorder";

export default function TabOneScreen() {
  return (
    <ThemedView style={{ flex: 1 }}>
      <VoiceRecorder />
    </ThemedView>
  );
}
