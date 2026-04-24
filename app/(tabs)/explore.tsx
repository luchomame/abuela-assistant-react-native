import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, FlatList, View, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getDbManager } from '@/lib/db';
import { DatabaseManager } from '@/lib/database/manager';

interface Symptom {
  symptom_id: string;
  symptom_description: string;
  created_at: string;
}

export default function AssistantScreen() {
  const [dbManager, setDbManager] = useState<DatabaseManager | null>(null);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const manager = await getDbManager();
        setDbManager(manager);
        const data = await manager.getAllSymptoms();
        setSymptoms(data);
      } catch (e) {
        console.error('Failed to load symptoms:', e);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const handleSave = async () => {
    if (!dbManager || !inputText.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await dbManager.insertSymptom(inputText.trim());
      setInputText('');
      // Refresh the list
      const data = await dbManager.getAllSymptoms();
      setSymptoms(data);
    } catch (e) {
      console.error('Failed to save symptom:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const renderItem = ({ item }: { item: Symptom }) => (
    <ThemedView style={styles.card}>
      <ThemedText style={styles.dateText}>
        {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </ThemedText>
      <ThemedText style={styles.symptomText}>{item.symptom_description}</ThemedText>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Assistant</ThemedText>
        <ThemedText style={styles.subtitle}>Symptom History & Notes</ThemedText>
      </ThemedView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0c7" />
        </View>
      ) : (
        <FlatList
          data={symptoms}
          renderItem={renderItem}
          keyExtractor={(item) => item.symptom_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <ThemedText style={styles.emptyText}>No symptoms logged yet. Write something below to start.</ThemedText>
          }
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        <ThemedView style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Log a symptom or note..."
            placeholderTextColor="#888"
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity 
            style={[styles.saveButton, (!inputText.trim() || isSaving) && styles.disabledButton]} 
            onPress={handleSave}
            disabled={!inputText.trim() || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={styles.saveButtonText}>Save</ThemedText>
            )}
          </TouchableOpacity>
        </ThemedView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  subtitle: {
    opacity: 0.6,
    marginTop: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  dateText: {
    fontSize: 12,
    opacity: 0.5,
    marginBottom: 4,
  },
  symptomText: {
    fontSize: 16,
    lineHeight: 22,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    opacity: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.2)',
    alignItems: 'flex-end',
    gap: 10,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    color: '#fff',
    maxHeight: 100,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#0c7',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
    height: 44,
  },
  disabledButton: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
