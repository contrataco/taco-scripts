# Auto Memory Manager

Automatically manages the Memory field in NovelAI stories by tracking key events, character states, and story developments.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [UI Controls](#ui-controls)
- [Settings](#settings)
- [How Compression Works](#how-compression-works)
- [Memory Format](#memory-format)
- [Technical Details](#technical-details)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)

---

## Features

### Automatic Event Extraction
Uses NovelAI's GLM-4-6 model to intelligently extract key events from your story text. The script identifies:
- Plot-significant events
- Character introductions and developments
- Location changes
- Important dialogue or decisions

### Character State Tracking
Monitors characters mentioned in your story and tracks their current state, including:
- Physical condition
- Emotional state
- Location
- Recent actions

### Smart Compression
When memory approaches the configured token limit (80% threshold), the script automatically:
1. Preserves the 3 most recent events in full detail
2. Groups older events by narrative arc
3. Summarizes grouped events while preserving essential plot points
4. Reduces event count to approximately 1/3 of original

### Token Management
- Real-time token counting using NovelAI's tokenizer
- Visual progress bar with color coding:
  - **Green**: <60% capacity
  - **Yellow**: 60-80% capacity
  - **Red**: >80% capacity (compression may trigger)

### Interactive UI Panel
A dedicated control panel in the NovelAI script sidebar with:
- Token usage display
- Memory preview
- Action buttons
- Collapsible settings section
- Event history viewer

---

## Installation

1. **Open NovelAI** and navigate to **Settings → Advanced → Scripts**

2. **Create a new script**:
   - Click "Add Script" or the + button
   - Name it "Auto Memory Manager"

3. **Copy the script**:
   - Open [`auto-memory-manager.ts`](auto-memory-manager.ts) in this repository
   - Copy the entire file contents

4. **Paste and save**:
   - Paste into the NovelAI script editor
   - Click Save

5. **Enable the script**:
   - Toggle the script ON
   - Grant the **storyEdit** permission when prompted

---

## Usage

### Automatic Mode (Default)

Once enabled, the script works automatically:

1. **After each generation**, the script analyzes new content
2. **Key events** are extracted and added to the event list
3. **Character states** are updated based on the narrative
4. **Memory field** is compiled and updated
5. **Compression** triggers automatically when needed

### Manual Controls

You can also manually control the script:

- **Refresh Now**: Re-analyze the entire story from scratch
- **Clear All**: Reset everything and start fresh

---

## UI Controls

### Token Counter
```
Tokens: 847 / 1000 (85%)
[████████████████░░░░]
```
Shows current token usage with a color-coded progress bar.

### Memory Preview
A read-only text area displaying the current compiled memory content. This is exactly what gets written to NovelAI's Memory field.

### Action Buttons

| Button | Action |
|--------|--------|
| **Refresh Now** | Force complete re-analysis of the entire story. Useful if memory seems out of sync. |
| **Clear All** | Reset all stored data (events, characters, settings) and clear the Memory field. |

### Settings Section (Collapsible)

Click the Settings header to expand/collapse configuration options.

### Event History

Shows the last 10 tracked events in reverse chronological order:
- Recent events appear at full opacity
- Older events appear slightly faded
- Compressed events are marked with `[C]` prefix

---

## Settings

### Token Limit

| Property | Value |
|----------|-------|
| Default | 1000 |
| Range | 500 - 2000 |
| Type | Slider |

Maximum number of tokens allowed in the Memory field. Lower values trigger compression sooner but keep memory more concise.

### Auto-update

| Property | Value |
|----------|-------|
| Default | On |
| Type | Toggle |

When enabled, the script automatically processes new content after each generation ends. Disable if you prefer manual control.

### Tracked Keywords

| Property | Value |
|----------|-------|
| Default | (empty) |
| Type | Text input |
| Format | Comma-separated |

Keywords to prioritize during event extraction. Events containing these keywords receive higher importance ratings.

**Example**: `John, Castle, Dragon, Magic Sword`

### Compression Threshold (Internal)

| Property | Value |
|----------|-------|
| Value | 80% |
| Type | Fixed |

Compression automatically triggers when memory reaches 80% of the token limit. This is not user-configurable.

---

## How Compression Works

### Trigger Condition
Compression activates when the compiled memory exceeds 80% of your configured token limit.

### Compression Process

1. **Preserve Recent Events**
   - The 3 most recent events are always kept in full detail
   - These represent the immediate story context

2. **Group Older Events**
   - Remaining events are grouped for summarization
   - Groups are formed based on temporal proximity

3. **LLM Summarization**
   - Grouped events are sent to GLM-4-6
   - The model creates concise summaries preserving:
     - Key plot points
     - Character developments
     - Important outcomes

4. **Replace and Mark**
   - Original events are replaced with compressed versions
   - Compressed events are marked with `[C]` in the UI

### Example

**Before compression** (5 events):
```
• Sarah entered the ancient library
• She found a mysterious glowing book
• The book revealed a map to the dragon's lair
• Sarah decided to seek the dragon
• She gathered supplies for the journey
```

**After compression** (2 events):
```
• [C] Sarah discovered a magical book in the ancient library containing a map to the dragon's lair
• [C] Sarah decided to seek the dragon and prepared for the journey
```

---

## Memory Format

The script organizes the Memory field into three distinct sections:

```
=== STORY TIMELINE ===
• First major event
• Second major event
• [C] Compressed summary of earlier events
• Most recent event

=== CURRENT SITUATION ===
Brief description of what's currently happening in the story,
including immediate context and any pending actions.

=== KEY CHARACTERS ===
CharacterName: Current state, location, and recent actions
AnotherCharacter: Their current situation and condition
```

### Section Details

**STORY TIMELINE**
- Chronological list of key events
- Bullet-pointed for clarity
- Most important/recent events first after compression

**CURRENT SITUATION**
- 1-3 sentences describing the immediate context
- Updated after each generation
- Helps maintain narrative coherence

**KEY CHARACTERS**
- Character name followed by colon
- Brief state description (physical, emotional, location)
- Only includes characters actively mentioned in story

---

## Technical Details

### APIs Used

| API | Purpose |
|-----|---------|
| `api.v1.storyStorage` | Persistent per-story data storage |
| `api.v1.generate` | GLM-4-6 model for extraction/compression |
| `api.v1.memory` | Update NovelAI Memory field |
| `api.v1.document` | Read story sections |
| `api.v1.tokenizer` | Token counting |
| `api.v1.hooks.register` | Hook into generation events |
| `api.v1.ui.*` | Panel UI components |

### Processing Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| Max input chars | 8,000 | Prevents context overflow |
| Chunk size | 6,000 chars | For processing long stories |
| Chunk overlap | 1,000 chars | Maintains context between chunks |
| Max generation tokens | 150 | Conservative output limit |
| Processing delay | 1 second | Rate limiting between chunks |
| Min content length | 50 chars | Minimum new text to trigger processing |

### Storage Structure

```typescript
{
  events: [{
    id: string,
    timestamp: number,
    text: string,
    importance: 1-5,
    compressed: boolean
  }],
  characters: [{
    name: string,
    state: string,
    lastUpdate: number
  }],
  settings: {
    tokenLimit: number,
    autoUpdate: boolean,
    keywords: string[],
    compressionThreshold: number
  },
  lastProcessedSection: string,
  currentSituation: string
}
```

---

## Troubleshooting

### Memory Not Updating

**Symptoms**: New story content isn't being reflected in memory.

**Solutions**:
1. Check that **Auto-update** is enabled in settings
2. Ensure the script is **enabled** (toggle is ON)
3. Click **Refresh Now** to force a complete re-analysis
4. Check that you've granted the **storyEdit** permission

### Permission Denied Error

**Symptoms**: Script shows permission error on startup.

**Solutions**:
1. Disable and re-enable the script
2. When prompted, click "Allow" for storyEdit permission
3. If no prompt appears, check NovelAI script permissions in settings

### Token Budget Errors

**Symptoms**: Errors about exceeding token limits during generation.

**Solutions**:
1. **Reduce token limit** in settings (try 800 or lower)
2. Click **Refresh Now** to trigger compression
3. Click **Clear All** and start fresh if issues persist

### Compression Not Triggering

**Symptoms**: Memory keeps growing beyond expected size.

**Solutions**:
1. Compression only triggers at 80% capacity
2. Check current usage in the token counter
3. Click **Refresh Now** to force re-evaluation

### Slow Processing

**Symptoms**: Long delays after generation ends.

**Solutions**:
1. This is normal for long stories (chunked processing)
2. Each chunk has a 1-second delay for rate limiting
3. Consider clearing old events if story is very long

### Events Missing Important Details

**Symptoms**: Extracted events seem to miss key information.

**Solutions**:
1. Add relevant terms to **Tracked Keywords**
2. The GLM-4-6 model prioritizes brevity; some details may be condensed
3. Manual refresh may capture missed details

---

## Requirements

### NovelAI Subscription
- Must have access to the **Script API** feature
- Available on most subscription tiers

### Model Access
- Requires access to **GLM-4-6** model
- Used for event extraction and compression
- Check your subscription includes this model

### Permissions
- **storyEdit**: Required to modify the Memory field
- Granted through the NovelAI permission prompt

---

## Known Limitations

1. **Token estimation**: Fallback estimation (~4 chars/token) is less accurate than the tokenizer API
2. **Character detection**: Based on capitalized names; may miss unconventional naming
3. **Compression quality**: Depends on GLM-4-6's summarization capabilities
4. **Processing time**: Long stories require chunked processing with delays
5. **Concurrent processing**: Script prevents simultaneous processing but may occasionally overlap

---

## Version History

- **1.0.0**: Initial release with event tracking, compression, and UI panel
