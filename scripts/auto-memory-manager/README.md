# Auto Memory Manager

Automatically manages the Memory field in NovelAI stories by tracking key events, character states, and story developments.

## Features

- **Automatic Event Extraction**: Uses LLM (GLM-4-6) to extract key events from story text
- **Character State Tracking**: Monitors character names and their current states
- **Smart Compression**: Intelligently compresses older events when approaching token limits
- **Token Management**: Estimates and counts tokens to stay within configurable limits
- **Interactive UI Panel**: Control panel with token usage display, settings, and event history

## Installation

1. Open NovelAI and navigate to Settings > Advanced > Scripts
2. Create a new script named "Auto Memory Manager"
3. Copy the entire content of `auto-memory-manager.ts`
4. Paste into the script editor and save
5. Enable the script

## Usage

Once enabled, the script will:

1. Monitor for new story content
2. Automatically extract key events and character information
3. Update the Memory field with organized, token-efficient summaries
4. Compress older content as needed to stay within limits

### UI Controls

- **Token Usage**: Visual progress bar showing current memory usage
- **Memory Preview**: Read-only display of current memory content
- **Refresh**: Force a full refresh of memory analysis
- **Clear**: Clear all stored events and character data
- **Settings**: Adjust token limits, auto-update toggle, and keyword tracking

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Token Limit | 2000 | Maximum tokens for memory field |
| Auto Update | true | Automatically update on new content |
| Compression Threshold | 80% | Trigger compression at this capacity |

## Requirements

- NovelAI subscription with script access
- Access to GLM-4-6 model for event extraction
