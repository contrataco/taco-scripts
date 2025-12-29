# taco-scripts

A collection of NovelAI utilities, scripts, and applications by Contrataco.

## Structure

- **scripts/** - NovelAI user scripts (TypeScript files for use within NovelAI's scripting system)
- **apps/** - Desktop and web applications

## Scripts

### auto-memory-manager

Automatically manages the Memory field in NovelAI stories by tracking key events, character states, and story developments. Features intelligent compression to maintain token efficiency as stories grow.

### scene-visualizer-script

NovelAI user script that works with the Scene Visualizer app to automatically generate images representing story scenes.

## Apps

### scene-visualizer

Electron desktop application that displays AI-generated scene images alongside NovelAI stories. Embeds the NovelAI web interface and automatically generates images based on story content.

## Installation

### Scripts

1. Open NovelAI
2. Go to Settings > Advanced > Scripts
3. Create a new script
4. Copy the content of the desired `.ts` file
5. Enable the script

### Apps

```bash
cd apps/scene-visualizer
npm install
npm start
```

## Development

This repo uses npm workspaces. From the root:

```bash
npm install
npm run scene-visualizer
```

## License

MIT
