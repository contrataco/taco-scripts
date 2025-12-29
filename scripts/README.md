# NovelAI Scripts

User scripts for NovelAI's built-in scripting system.

## Installation

1. Open NovelAI
2. Navigate to Settings > Advanced > Scripts
3. Click "Add Script" or create a new script
4. Copy the entire content of the desired `.ts` file
5. Paste into the script editor
6. Save and enable the script

## Available Scripts

| Script | Description |
|--------|-------------|
| **auto-memory-manager** | Automatic memory management with event tracking and compression |
| **scene-visualizer-script** | Bridge script for the Scene Visualizer Electron app |

## Notes

- Scripts run within NovelAI's sandboxed environment
- Scripts have access to the NovelAI Script API (`api.v1.*`)
- Some scripts may require specific NovelAI subscription tiers for full functionality
