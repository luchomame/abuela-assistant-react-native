# Abuela Assistant - Current Code Status

## Model Configuration

- **Whisper**: `ggml-base-q5_1.bin` (multi-language base model) - works for English-only transcription, crashes on "auto" language detection during live transcription
- **LLM**: `Qwen3-0.6B-Q4_0.gguf` - loads successfully
- **VAD**: `ggml-silero-v6.2.0.bin` - loads successfully

## Interpreter Status

- **Intent Classification**: Uses structured prompts, returns validated JSON via Zod
- **Response Synthesis**: Uses messages format (system + user), generates Spanish responses
- **Summary Extraction**: Currently simplified - uses `/no_think` system message, returns raw transcription text as both English/Spanish summaries, empty action_items array
- **Previous Issue**: Some other completion method caused infinite loops where model repeated prompt+response. Fixed by switching to messages format.

## UI Implementation

- **Recording Tab**: Functional voice recorder, transcribes audio, passes to LLM for extraction, displays result
- **Chat Tab**: Still has default Expo boilerplate ("Explore" screen)
- **Model Management**: Downloads models on first launch, shows progress

## Database

- **Schema**: Defined in `schema.sql` (summaries, translations, action_items tables)
- **Integration**: Not implemented - recordings don't save to database
- **Vector Search**: Schema includes `summaries_vec` virtual table but not implemented

## Key Issues Identified

1. **Multi-language transcription crashes** on "auto" mode during live recording
2. **No structured data extraction** - summaries are just raw text, no medication/follow-up parsing
3. **No database persistence** - transcripts and extractions aren't saved
4. **Chat interface not built** - only recording interface exists

## Working Features

- ✅ Model downloading and loading
- ✅ Voice recording and transcription (English-only)
- ✅ LLM text generation
- ✅ Basic UI navigation
- ✅ Real-time transcription with VAD

## Not Yet Implemented

- ❌ Structured medical data extraction (medications, symptoms, follow-ups)
- ❌ Database storage and retrieval
- ❌ Intent classification for chat queries
- ❌ Semantic search across visit history
- ❌ Spanish response generation for chat
- ❌ Multi-language transcription support

## Recent Changes (Last Commit)

- Updated to use messages format instead of prompt for LLM calls
- Turned off thinking for extraction to prevent loops
- Changed Whisper model to base multi-language (but crashes on auto mode)

The app currently functions as a basic voice recorder that transcribes English speech and generates simple summaries, but lacks the core medical assistant features outlined in the design doc.
