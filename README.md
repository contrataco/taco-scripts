# taco-scripts

A collection of NovelAI utilities, scripts, and applications by [Contrataco](https://github.com/contrataco).

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Auto Memory Manager](#auto-memory-manager)
- [Scene Visualizer](#scene-visualizer)
- [Development](#development)
- [License](#license)

---

## Overview

This repository contains two main components for enhancing your NovelAI experience:

| Component | Type | Description |
|-----------|------|-------------|
| **Auto Memory Manager** | NovelAI Script | Automatically manages the Memory field by tracking events, characters, and compressing older content |
| **Scene Visualizer** | App + Script | Generates AI images alongside your story using NovelAI's image generation |

### Repository Structure

```
taco-scripts/
├── scripts/                      # NovelAI user scripts
│   ├── auto-memory-manager/      # Standalone memory management script
│   └── scene-visualizer-script/  # Companion script for Scene Visualizer app
└── apps/                         # Desktop applications
    └── scene-visualizer/         # Electron app for image generation
```

---

## Quick Start

### Auto Memory Manager (Standalone Script)

1. Open NovelAI → Settings → Advanced → Scripts
2. Create a new script
3. Copy contents of [`scripts/auto-memory-manager/auto-memory-manager.ts`](scripts/auto-memory-manager/auto-memory-manager.ts)
4. Save and enable the script
5. Grant the `storyEdit` permission when prompted

### Scene Visualizer (App + Script)

**Option A: Download Pre-built Release** (Recommended)

1. Download from [Releases](https://github.com/contrataco/taco-scripts/releases)
2. Install and run the app
3. Go to Settings and enter your NovelAI API token
4. Enable the scene-visualizer-script in NovelAI (see below)

**Option B: Build from Source**

```bash
cd apps/scene-visualizer
npm install
npm start
```

---

## Auto Memory Manager

A standalone NovelAI script that automatically maintains your story's Memory field.

### Features

- **Automatic Event Extraction** — Uses the GLM-4-6 model to identify and track key story events
- **Character State Tracking** — Monitors characters and their current states
- **Smart Compression** — Automatically compresses older events when memory reaches 80% capacity
- **Token Management** — Visual progress bar showing current usage vs. configured limit
- **Interactive UI Panel** — Control panel with settings, memory preview, and event history

### Installation

1. Open NovelAI and navigate to **Settings → Advanced → Scripts**
2. Click **"Add Script"** or create a new script
3. Name it "Auto Memory Manager"
4. Copy the entire contents of [`auto-memory-manager.ts`](scripts/auto-memory-manager/auto-memory-manager.ts)
5. Paste into the script editor and save
6. **Enable** the script using the toggle
7. When prompted, grant the **storyEdit** permission

### Usage

Once enabled, the script automatically:
1. Monitors for new story content after each generation
2. Extracts key events, characters, and situation details
3. Updates the Memory field with organized summaries
4. Compresses older content when approaching the token limit

### UI Controls

| Control | Description |
|---------|-------------|
| **Token Counter** | Shows current tokens used (color-coded: green <60%, yellow 60-80%, red >80%) |
| **Memory Preview** | Read-only display of the compiled memory content |
| **Refresh Now** | Force a complete re-analysis of the entire story |
| **Clear All** | Reset all stored events, characters, and clear the Memory field |

### Settings

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Token Limit | 1000 | 500-2000 | Maximum tokens for the memory field |
| Auto-update | On | On/Off | Automatically process after each generation |
| Tracked Keywords | (empty) | Text | Comma-separated keywords to prioritize |

### Memory Format

The script organizes memory into three sections:

```
=== STORY TIMELINE ===
• Key event 1
• Key event 2 (compressed from multiple events)

=== CURRENT SITUATION ===
Brief context of what's currently happening

=== KEY CHARACTERS ===
CharacterName: current state/description
```

### Requirements

- NovelAI subscription with **Script API access**
- Access to the **GLM-4-6 model** (used for event extraction)

📖 **[Full Documentation →](scripts/auto-memory-manager/README.md)**

---

## Scene Visualizer

An Electron desktop app that generates AI images alongside your NovelAI stories. Requires both the app and a companion NovelAI script.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Scene Visualizer App                      │
│  ┌─────────────────────────────┐  ┌──────────────────────┐  │
│  │      NovelAI WebView        │  │    Generated Image   │  │
│  │                             │  │                      │  │
│  │  ┌───────────────────────┐  │  │   [AI-generated      │  │
│  │  │ Scene Visualizer      │  │  │    scene image]      │  │
│  │  │ Script Panel          │──┼──│                      │  │
│  │  │ [Generated Prompt]    │  │  │                      │  │
│  │  └───────────────────────┘  │  └──────────────────────┘  │
│  └─────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

1. **You write** story content in NovelAI
2. **The script** analyzes the scene and generates an image prompt
3. **The app** reads the prompt and calls NovelAI's image API
4. **Images appear** in the side panel alongside your story

### Installation

#### Step 1: Install the Electron App

```bash
cd apps/scene-visualizer
npm install
npm start
```

#### Step 2: Get Your NovelAI API Token

1. Log in to [NovelAI](https://novelai.net)
2. Go to **Account Settings**
3. Find **"Get Persistent API Token"**
4. Copy your token

#### Step 3: Configure the App

1. In the Scene Visualizer app, click the **⚙️ Settings** button
2. Paste your API token in the **"NovelAI API Token"** field
3. Configure your preferred model and generation settings

#### Step 4: Install the Companion Script

1. In NovelAI (inside the app's webview), go to **Settings → Advanced → Scripts**
2. Create a new script named "Scene Visualizer"
3. Copy contents of [`scene-visualizer.ts`](scripts/scene-visualizer-script/scene-visualizer.ts)
4. Save and enable the script

### Supported Models

| Model | ID | Notes |
|-------|----|----|
| NAI Diffusion Anime V3 | `nai-diffusion-3` | Supports SMEA |
| NAI Diffusion Furry V3 | `nai-diffusion-furry-3` | Supports SMEA |
| NAI Diffusion V4 Curated | `nai-diffusion-4-curated-preview` | **Default** |
| NAI Diffusion V4 Full | `nai-diffusion-4-full` | |
| NAI Diffusion V4.5 Curated | `nai-diffusion-4-5-curated` | Latest |
| NAI Diffusion V4.5 Full | `nai-diffusion-4-5-full` | Latest |

### Generation Parameters

| Parameter | Options | Default |
|-----------|---------|---------|
| **Resolution** | Square (832×832), Portrait (832×1216), Landscape (1216×832), Custom | Portrait |
| **Steps** | 1-50 | 28 |
| **Guidance (CFG)** | 1-20 | 5 |
| **Sampler** | Euler, Euler Ancestral, DPM++ 2S Ancestral, DPM++ 2M SDE, DPM++ 2M, DPM++ SDE | Euler |
| **Noise Schedule** | Karras, Native, Exponential, Polyexponential | Karras |
| **SMEA** | On/Off (V3 models only) | Off |
| **Quality Tags** | On/Off | On |
| **UC Preset** | Heavy, Light | Heavy |

### Character Integration

The script can automatically include character appearances in image prompts:

1. Create **Lorebook entries** for your characters
2. Include appearance descriptions using patterns like:
   - `Appearance: tall woman with red hair...`
   - `Physical description: muscular build, green eyes...`
3. Enable **"Use Character Lore"** in the script settings
4. When characters are mentioned in your story, their appearances are included in the prompt

### Script Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto Generate | On | Automatically generate prompts after story generation |
| Min Text Length | 100 | Minimum new text (chars) to trigger auto-generation |
| Art Style | "anime style, detailed, high quality" | Tags appended to all prompts |
| Use Character Lore | On | Include character appearances from lorebook |

### Requirements

- **Node.js 18+**
- **NovelAI subscription** with image generation access (Opus/Tablet/Scroll with Anlas)
- **API Token** from NovelAI account settings

📖 **[App Documentation →](apps/scene-visualizer/README.md)**
📖 **[Script Documentation →](scripts/scene-visualizer-script/README.md)**

---

## Development

This repository uses npm workspaces.

```bash
# Install all dependencies
npm install

# Run Scene Visualizer app
npm run scene-visualizer

# Run with dev tools enabled
npm run scene-visualizer:dev
```

### Adding New Scripts

```bash
mkdir scripts/your-new-script
# Add your-script.ts and README.md
```

### Adding New Apps

```bash
mkdir -p apps/your-new-app
cd apps/your-new-app
npm init
# The app is automatically included in the workspace
```

---

## Troubleshooting

### Auto Memory Manager

| Issue | Solution |
|-------|----------|
| "Permission denied" error | Grant the `storyEdit` permission in script settings |
| Memory not updating | Check that Auto-update is enabled in settings |
| Token budget errors | Reduce the token limit or click "Refresh Now" to force compression |

### Scene Visualizer

| Issue | Solution |
|-------|----------|
| "Invalid API token" | Verify your token in NovelAI Account Settings |
| Images not generating | Check you have Anlas/subscription with image access |
| Prompt not appearing | Ensure the script is enabled and Auto Generate is on |
| Character lore not included | Verify lorebook entries are enabled and contain appearance keywords |

---

## License

MIT
