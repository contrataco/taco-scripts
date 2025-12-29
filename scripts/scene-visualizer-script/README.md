# Scene Visualizer Script

NovelAI user script that bridges the NovelAI web interface with the Scene Visualizer Electron app.

## Features

- **Automatic Scene Detection**: Extracts scene descriptions from story content
- **Character Integration**: Parses character appearances from lorebook entries
- **Bridge Communication**: Sends image prompts to the companion Electron app
- **Smart Context**: Builds prompts using current scene and character context

## Installation

1. Open NovelAI and navigate to Settings > Advanced > Scripts
2. Create a new script named "Scene Visualizer"
3. Copy the entire content of `scene-visualizer.ts`
4. Paste into the script editor and save
5. Enable the script

## Usage

This script works in conjunction with the Scene Visualizer Electron app (`apps/scene-visualizer`).

1. Install and run the Scene Visualizer app
2. The app will load NovelAI in an embedded webview
3. Enable this script within NovelAI
4. As you write or generate story content, images will be automatically generated

## How It Works

1. Script monitors for new story content
2. Extracts relevant scene descriptions and character appearances
3. Sends prompt data to the Electron app via a DOM bridge
4. Electron app calls NovelAI's image generation API
5. Generated images are displayed alongside the story

## Requirements

- Scene Visualizer Electron app running
- NovelAI subscription with image generation access
- Lorebook entries with character appearance descriptions (optional, but recommended)
