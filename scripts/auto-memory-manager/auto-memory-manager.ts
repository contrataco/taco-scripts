/**
 * NovelAI Auto-Memory Manager
 *
 * Automatically manages the Memory field by tracking key events,
 * summarizing older content, and maintaining a structured, token-efficient
 * memory that stays relevant regardless of story length.
 *
 * @version 1.0.0
 * @author ryanrobson
 */

// ============================================================================
// CONFIGURATION & TYPES
// ============================================================================

interface StoredEvent {
  id: string;
  timestamp: number;
  text: string;
  importance: number; // 1-5, higher = more important
  compressed: boolean;
}

interface CharacterState {
  name: string;
  state: string;
  lastUpdated: number;
}

interface ScriptSettings {
  tokenLimit: number;
  autoUpdate: boolean;
  trackedKeywords: string[];
  compressionThreshold: number; // Percentage of tokenLimit to trigger compression
}

interface ScriptStorage {
  events: StoredEvent[];
  characters: Record<string, CharacterState>;
  settings: ScriptSettings;
  lastProcessedSectionId: number | null;
  currentSituation: string;
}

const DEFAULT_SETTINGS: ScriptSettings = {
  tokenLimit: 1000,
  autoUpdate: true,
  trackedKeywords: [],
  compressionThreshold: 0.8, // Start compressing at 80% capacity
};

const DEFAULT_STORAGE: ScriptStorage = {
  events: [],
  characters: {},
  settings: DEFAULT_SETTINGS,
  lastProcessedSectionId: null,
  currentSituation: '',
};

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

async function getStorage(): Promise<ScriptStorage> {
  try {
    const stored = await api.v1.storyStorage.get('memoryManagerData');
    if (stored) {
      return { ...DEFAULT_STORAGE, ...JSON.parse(stored) };
    }
  } catch (e) {
    api.v1.error('[AutoMemory] Error loading storage:', e);
  }
  return { ...DEFAULT_STORAGE };
}

async function saveStorage(data: ScriptStorage): Promise<void> {
  try {
    await api.v1.storyStorage.set('memoryManagerData', JSON.stringify(data));
  } catch (e) {
    api.v1.error('[AutoMemory] Error saving storage:', e);
  }
}

async function getSettings(): Promise<ScriptSettings> {
  const storage = await getStorage();
  return storage.settings;
}

async function updateSettings(updates: Partial<ScriptSettings>): Promise<void> {
  const storage = await getStorage();
  storage.settings = { ...storage.settings, ...updates };
  await saveStorage(storage);
}

// ============================================================================
// TOKEN UTILITIES
// ============================================================================

async function countTokens(text: string): Promise<number> {
  try {
    const tokens = await api.v1.tokenizer.encode(text, 'glm-4-6');
    return tokens.length;
  } catch (e) {
    // Fallback: rough estimate of ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Processing lock to prevent concurrent processing
let isProcessing = false;

// ============================================================================
// EVENT EXTRACTION
// ============================================================================

// Maximum characters to send to the LLM to avoid context overflow
// Keep it very conservative to leave room for output tokens
// glm-4-6 has limited context, ~4 chars per token
// Aiming for ~2500 tokens input max to leave plenty of room for output
const MAX_TEXT_FOR_EXTRACTION = 8000;

async function extractEventsFromText(text: string, keywords: string[]): Promise<{
  events: string[];
  characters: Record<string, string>;
  situation: string;
}> {
  // Limit text length to avoid context overflow
  // Take the most recent content as it's most relevant
  let processText = text;
  if (text.length > MAX_TEXT_FOR_EXTRACTION) {
    processText = text.slice(-MAX_TEXT_FOR_EXTRACTION);
    api.v1.log(`[AutoMemory] Text truncated from ${text.length} to ${processText.length} chars for extraction`);
  }

  // Build keyword context for the prompt
  const keywordContext = keywords.length > 0
    ? `\nPay special attention to these tracked elements: ${keywords.join(', ')}`
    : '';

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are an expert story analyst. Extract key information from story text and output ONLY valid JSON.`
    },
    {
      role: 'user',
      content: `Analyze this story segment and extract key events worth remembering for story continuity.${keywordContext}

STORY TEXT:
${processText}

Extract:
1. Key events (plot developments, character actions, important revelations, location changes)
2. Character states (current status, goals, relationships for any named characters)
3. Current situation (brief context of what's happening now)

Respond with ONLY this JSON format, no other text:
{"events":["event 1","event 2"],"characters":{"Name":"current state"},"situation":"brief current context"}`
    }
  ];

  try {
    const response = await api.v1.generate(messages, {
      model: 'glm-4-6',
      max_tokens: 150, // Very conservative to avoid token budget issues
      temperature: 0.3,
    });

    if (response.choices && response.choices.length > 0) {
      const content = response.choices[0].text || '';
      // Try to parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];

        // Try to fix incomplete JSON (truncated responses)
        try {
          JSON.parse(jsonStr);
        } catch (parseErr) {
          // Try adding closing brackets if truncated
          const openBraces = (jsonStr.match(/\{/g) || []).length;
          const closeBraces = (jsonStr.match(/\}/g) || []).length;
          const openBrackets = (jsonStr.match(/\[/g) || []).length;
          const closeBrackets = (jsonStr.match(/\]/g) || []).length;

          // Add missing closing characters
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            jsonStr += '"]';
          }
          for (let i = 0; i < openBraces - closeBraces; i++) {
            jsonStr += '}';
          }
        }

        try {
          const parsed = JSON.parse(jsonStr);
          return {
            events: Array.isArray(parsed.events) ? parsed.events : [],
            characters: typeof parsed.characters === 'object' ? parsed.characters : {},
            situation: typeof parsed.situation === 'string' ? parsed.situation : '',
          };
        } catch (finalParseErr) {
          api.v1.log('[AutoMemory] Could not parse response, skipping extraction');
        }
      }
    }
  } catch (e) {
    // Check if it's a token budget error and log appropriately
    const errMsg = e instanceof Error ? e.message : String(e);
    if (errMsg.includes('token budget')) {
      api.v1.log('[AutoMemory] Token budget exceeded, reducing text size for next attempt');
    } else {
      api.v1.error('[AutoMemory] Error extracting events:', e);
    }
  }

  return { events: [], characters: {}, situation: '' };
}

// ============================================================================
// COMPRESSION ENGINE
// ============================================================================

async function compressEvents(events: StoredEvent[], targetTokens: number): Promise<StoredEvent[]> {
  if (events.length <= 3) return events;

  // Separate recent events (keep detailed) from older ones (compress)
  const recentCount = Math.min(3, Math.floor(events.length * 0.3));
  const recentEvents = events.slice(-recentCount);
  const olderEvents = events.slice(0, -recentCount);

  if (olderEvents.length === 0) return events;

  // Group older events for compression
  const olderTexts = olderEvents.map(e => e.text).join('\n• ');

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: 'You are a concise summarizer. Compress story events into brief bullet points while preserving essential plot information.'
    },
    {
      role: 'user',
      content: `Condense these story events into a brief timeline. Combine similar events and remove redundancy. Keep the most important plot points.

EVENTS:
• ${olderTexts}

Output ${Math.ceil(olderEvents.length / 3)} brief bullet points maximum. Each bullet should be under 20 words.
Format: Just the bullet points, one per line, starting with •`
    }
  ];

  try {
    const response = await api.v1.generate(messages, {
      model: 'glm-4-6',
      max_tokens: 150, // Reduced for token budget safety
      temperature: 0.3,
    });

    if (response.choices && response.choices.length > 0) {
      const content = response.choices[0].text || '';
      const compressedBullets = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('•') || line.startsWith('-'))
        .map(line => line.replace(/^[•\-]\s*/, ''));

      // Create compressed events
      const compressedEvents: StoredEvent[] = compressedBullets.map((text, i) => ({
        id: generateId(),
        timestamp: olderEvents[0]?.timestamp || Date.now(),
        text,
        importance: 3,
        compressed: true,
      }));

      return [...compressedEvents, ...recentEvents];
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (!errMsg.includes('token budget')) {
      api.v1.error('[AutoMemory] Error compressing events:', e);
    }
  }

  return events;
}

// ============================================================================
// MEMORY COMPILATION
// ============================================================================

async function compileMemory(): Promise<string> {
  const storage = await getStorage();
  const { events, characters, settings, currentSituation } = storage;

  // Check if we need to compress
  let processedEvents = events;
  const currentText = formatMemoryText(events, characters, currentSituation);
  const currentTokens = await countTokens(currentText);

  if (currentTokens > settings.tokenLimit * settings.compressionThreshold) {
    processedEvents = await compressEvents(events, settings.tokenLimit);
    storage.events = processedEvents;
    await saveStorage(storage);
  }

  return formatMemoryText(processedEvents, characters, currentSituation);
}

function formatMemoryText(
  events: StoredEvent[],
  characters: Record<string, CharacterState>,
  situation: string
): string {
  const sections: string[] = [];

  // Timeline section
  if (events.length > 0) {
    const timelineItems = events.map(e => `• ${e.text}`).join('\n');
    sections.push(`=== STORY TIMELINE ===\n${timelineItems}`);
  }

  // Current situation section
  if (situation) {
    sections.push(`=== CURRENT SITUATION ===\n${situation}`);
  }

  // Characters section
  const charEntries = Object.entries(characters);
  if (charEntries.length > 0) {
    const charLines = charEntries
      .map(([name, data]) => `${name}: ${data.state}`)
      .join('\n');
    sections.push(`=== KEY CHARACTERS ===\n${charLines}`);
  }

  return sections.join('\n\n');
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processNewContent(): Promise<void> {
  // Prevent concurrent processing
  if (isProcessing) {
    api.v1.log('[AutoMemory] Already processing, skipping...');
    return;
  }

  const storage = await getStorage();
  if (!storage.settings.autoUpdate) return;

  isProcessing = true;
  try {
    // Get document content
    let newText = '';
    const sectionIds = await api.v1.document.sectionIds();

    if (sectionIds.length === 0) return;

    // Find new content since last processing
    let startProcessing = storage.lastProcessedSectionId === null;

    const scanResults = await api.v1.document.scan();
    for (const { sectionId, section } of scanResults) {
      if (startProcessing) {
        if (section.text) {
          newText += section.text + '\n';
        }
      } else if (sectionId === storage.lastProcessedSectionId) {
        startProcessing = true;
      }
    }

    // Update last processed section
    storage.lastProcessedSectionId = sectionIds[sectionIds.length - 1];

    if (newText.trim().length < 50) {
      await saveStorage(storage);
      return; // Not enough new content
    }

    // Extract events from new content
    const extracted = await extractEventsFromText(newText, storage.settings.trackedKeywords);

    // Add new events
    for (const eventText of extracted.events) {
      storage.events.push({
        id: generateId(),
        timestamp: Date.now(),
        text: eventText,
        importance: 3,
        compressed: false,
      });
    }

    // Update character states
    for (const [name, state] of Object.entries(extracted.characters)) {
      storage.characters[name] = {
        name,
        state,
        lastUpdated: Date.now(),
      };
    }

    // Update current situation
    if (extracted.situation) {
      storage.currentSituation = extracted.situation;
    }

    await saveStorage(storage);

    // Compile and update memory
    const memoryText = await compileMemory();
    await api.v1.memory.set(memoryText);

    api.v1.ui.toast('Memory updated', { autoClose: 2000 });

  } catch (e) {
    api.v1.error('[AutoMemory] Error processing content:', e);
    api.v1.ui.toast('Memory update failed', { autoClose: 3000, type: 'error' });
  } finally {
    isProcessing = false;
  }
}

async function forceRefresh(): Promise<void> {
  // Reset processing lock in case it's stuck
  isProcessing = false;

  const storage = await getStorage();

  // Clear existing events for a clean refresh
  storage.events = [];
  storage.characters = {};
  storage.currentSituation = '';

  api.v1.ui.toast('Refreshing memory...', { autoClose: 2000 });

  try {
    // Collect all story text
    let fullText = '';
    const scanResults = await api.v1.document.scan();
    for (const { section } of scanResults) {
      if (section.text) {
        fullText += section.text + '\n';
      }
    }

    if (fullText.trim().length < 50) {
      api.v1.ui.toast('Not enough content to analyze', { autoClose: 2000 });
      return;
    }

    // For very long stories, process in chunks
    const CHUNK_SIZE = 6000; // chars per chunk (very conservative for context limits)
    const chunks: string[] = [];

    if (fullText.length > CHUNK_SIZE) {
      // Split into overlapping chunks to maintain context
      for (let i = 0; i < fullText.length; i += CHUNK_SIZE - 1000) {
        chunks.push(fullText.slice(i, i + CHUNK_SIZE));
      }
      api.v1.log(`[AutoMemory] Processing ${chunks.length} chunks for full refresh`);
    } else {
      chunks.push(fullText);
    }

    // Process each chunk with delay to avoid rate limiting
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Add delay between chunks (except first)
      if (i > 0) {
        await new Promise<void>(resolve => api.v1.timers.setTimeout(() => resolve(), 1000));
      }

      try {
        const extracted = await extractEventsFromText(chunk, storage.settings.trackedKeywords);

        // Add events (limit per chunk to avoid explosion)
        const maxEventsPerChunk = Math.ceil(10 / chunks.length) + 2;
        for (const eventText of extracted.events.slice(0, maxEventsPerChunk)) {
          storage.events.push({
            id: generateId(),
            timestamp: Date.now() - (chunks.length - i) * 1000, // Older chunks get older timestamps
            text: eventText,
            importance: 3,
            compressed: false,
          });
        }

        // Update character states (later chunks override earlier)
        for (const [name, state] of Object.entries(extracted.characters)) {
          storage.characters[name] = {
            name,
            state,
            lastUpdated: Date.now(),
          };
        }

        // Use the most recent situation
        if (i === chunks.length - 1 && extracted.situation) {
          storage.currentSituation = extracted.situation;
        }
      } catch (chunkErr) {
        api.v1.log(`[AutoMemory] Chunk ${i + 1}/${chunks.length} failed, continuing...`);
      }
    }

    // Update last processed section
    const sectionIds = await api.v1.document.sectionIds();
    if (sectionIds.length > 0) {
      storage.lastProcessedSectionId = sectionIds[sectionIds.length - 1];
    }

    await saveStorage(storage);

    // Compile and update memory
    const memoryText = await compileMemory();
    await api.v1.memory.set(memoryText);

    api.v1.ui.toast(`Memory refreshed (${storage.events.length} events)`, { autoClose: 3000, type: 'success' });

  } catch (e) {
    api.v1.error('[AutoMemory] Error during refresh:', e);
    api.v1.ui.toast('Refresh failed - see console', { autoClose: 3000, type: 'error' });
  }
}

async function clearAllEvents(): Promise<void> {
  const storage = await getStorage();
  storage.events = [];
  storage.characters = {};
  storage.currentSituation = '';
  storage.lastProcessedSectionId = null;
  await saveStorage(storage);
  await api.v1.memory.set('');
  api.v1.ui.toast('Memory cleared', { autoClose: 2000 });
}

// ============================================================================
// UI PANEL
// ============================================================================

// Store panel update function reference
let panelUpdateFn: (() => Promise<void>) | null = null;

async function createUIPanel(): Promise<void> {
  const buildPanel = async () => {
    const currentStorage = await getStorage();
    const memoryText = await api.v1.memory.get() || '';
    const tokenCount = await countTokens(memoryText);
    const tokenPercent = Math.min(100, Math.round((tokenCount / currentStorage.settings.tokenLimit) * 100));

    const progressColor = tokenPercent > 80 ? '#ff6b6b' : tokenPercent > 60 ? '#ffd93d' : '#6bcb77';

    return api.v1.ui.part.column({
      content: [
        // Header
        api.v1.ui.part.text({
          text: 'Auto-Memory Manager',
          style: { fontWeight: 'bold', fontSize: '16px', marginBottom: '12px' }
        }),

        // Token count display
        api.v1.ui.part.row({
          content: [
            api.v1.ui.part.text({
              text: `Tokens: ${tokenCount} / ${currentStorage.settings.tokenLimit}`,
              style: { flex: '1' }
            }),
            api.v1.ui.part.text({
              text: `${tokenPercent}%`,
              style: { color: progressColor }
            }),
          ],
          style: { marginBottom: '8px' }
        }),

        // Progress bar
        api.v1.ui.part.container({
          content: [
            api.v1.ui.part.container({
              content: [],
              style: {
                width: `${tokenPercent}%`,
                height: '8px',
                backgroundColor: progressColor,
                borderRadius: '4px',
                transition: 'width 0.3s ease'
              }
            })
          ],
          style: {
            width: '100%',
            height: '8px',
            backgroundColor: '#333',
            borderRadius: '4px',
            marginBottom: '16px',
            overflow: 'hidden'
          }
        }),

        // Memory preview
        api.v1.ui.part.text({
          text: 'Current Memory:',
          style: { fontWeight: 'bold', marginBottom: '4px' }
        }),
        api.v1.ui.part.multilineTextInput({
          initialValue: memoryText || '(No memory set)',
          placeholder: 'Memory will appear here...',
          style: { marginBottom: '16px', fontFamily: 'monospace', fontSize: '12px' }
        }),

        // Action buttons
        api.v1.ui.part.row({
          content: [
            api.v1.ui.part.button({
              text: 'Refresh Now',
              callback: async () => {
                await forceRefresh();
                if (panelUpdateFn) await panelUpdateFn();
              },
              style: { flex: '1', marginRight: '8px' }
            }),
            api.v1.ui.part.button({
              text: 'Clear All',
              callback: async () => {
                await clearAllEvents();
                if (panelUpdateFn) await panelUpdateFn();
              },
              style: { flex: '1', backgroundColor: '#ff6b6b' }
            }),
          ],
          style: { marginBottom: '16px' }
        }),

        // Settings section
        api.v1.ui.part.collapsibleSection({
          title: 'Settings',
          initialCollapsed: true,
          content: [
            // Token limit slider
            api.v1.ui.part.text({
              text: 'Token Limit:',
              style: { marginBottom: '4px' }
            }),
            api.v1.ui.part.sliderInput({
              initialValue: currentStorage.settings.tokenLimit,
              min: 500,
              max: 2000,
              step: 100,
              label: `${currentStorage.settings.tokenLimit} tokens`,
              onChange: async (value: number) => {
                await updateSettings({ tokenLimit: value });
                if (panelUpdateFn) await panelUpdateFn();
              },
              style: { marginBottom: '12px' }
            }),

            // Auto-update toggle
            api.v1.ui.part.row({
              content: [
                api.v1.ui.part.text({
                  text: 'Auto-update:',
                  style: { flex: '1' }
                }),
                api.v1.ui.part.checkboxInput({
                  initialValue: currentStorage.settings.autoUpdate,
                  onChange: async (checked: boolean) => {
                    await updateSettings({ autoUpdate: checked });
                    api.v1.ui.toast(checked ? 'Auto-update enabled' : 'Auto-update disabled', { autoClose: 2000 });
                  }
                }),
              ],
              style: { marginBottom: '12px' }
            }),

            // Tracked keywords
            api.v1.ui.part.text({
              text: 'Tracked Keywords (comma-separated):',
              style: { marginBottom: '4px' }
            }),
            api.v1.ui.part.textInput({
              initialValue: currentStorage.settings.trackedKeywords.join(', '),
              placeholder: 'e.g., John, Castle, Dragon',
              onChange: async (value: string) => {
                const keywords = value.split(',').map(k => k.trim()).filter(k => k.length > 0);
                await updateSettings({ trackedKeywords: keywords });
              },
              style: { marginBottom: '8px' }
            }),
          ]
        }),

        // Event history section
        api.v1.ui.part.collapsibleSection({
          title: `Event History (${currentStorage.events.length} events)`,
          initialCollapsed: true,
          content: currentStorage.events.length > 0
            ? currentStorage.events.slice(-10).reverse().map(event =>
                api.v1.ui.part.text({
                  text: `${event.compressed ? '[C]' : '>'} ${event.text}`,
                  style: {
                    fontSize: '12px',
                    marginBottom: '4px',
                    opacity: event.compressed ? 0.7 : 1
                  }
                })
              )
            : [api.v1.ui.part.text({ text: 'No events tracked yet', style: { opacity: 0.5 } })]
        }),
      ],
      style: { padding: '12px' }
    });
  };

  const updatePanel = async () => {
    try {
      const panel = await buildPanel();
      // Update the panel content
      await api.v1.ui.update([
        {
          type: 'scriptPanel' as const,
          id: 'autoMemoryPanel',
          name: 'Auto-Memory',
          content: [panel]
        }
      ]);
    } catch (e) {
      api.v1.error('[AutoMemory] Error updating panel:', e);
    }
  };

  // Store reference for callbacks
  panelUpdateFn = updatePanel;

  // Register the panel
  try {
    const initialPanel = await buildPanel();
    await api.v1.ui.register([
      api.v1.ui.extension.scriptPanel({
        id: 'autoMemoryPanel',
        name: 'Auto-Memory',
        content: [initialPanel]
      })
    ]);
  } catch (e) {
    api.v1.error('[AutoMemory] Error creating panel:', e);
  }
}

// ============================================================================
// HOOK REGISTRATION
// ============================================================================

function registerHooks(): void {
  // Process new content after generation completes
  api.v1.hooks.register('onGenerationEnd', async () => {
    try {
      await processNewContent();
      // Update UI panel if it exists
      if (panelUpdateFn) {
        await panelUpdateFn();
      }
    } catch (e) {
      api.v1.error('[AutoMemory] Error in onGenerationEnd hook:', e);
    }
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initialize(): Promise<void> {
  try {
    api.v1.log('[AutoMemory] Initializing Auto-Memory Manager...');

    // Request required permissions
    const hasPermissions = await api.v1.permissions.request(['storyEdit']);
    if (!hasPermissions) {
      api.v1.error('[AutoMemory] Required permissions not granted');
      api.v1.ui.toast('Auto-Memory requires story edit permission', { autoClose: 5000, type: 'error' });
      return;
    }

    // Ensure storage is initialized
    await getStorage();

    // Create UI panel
    await createUIPanel();

    // Register hooks
    registerHooks();

    api.v1.ui.toast('Auto-Memory Manager loaded', { autoClose: 3000, type: 'success' });
    api.v1.log('[AutoMemory] Initialization complete');

  } catch (e) {
    api.v1.error('[AutoMemory] Initialization failed:', e);
    api.v1.ui.toast('Auto-Memory Manager failed to load', { autoClose: 5000, type: 'error' });
  }
}

// Start the script
initialize();
