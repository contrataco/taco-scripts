/**
 * NovelAI Story Suggestions Script
 *
 * Automatically generates 3 story continuation suggestions after each AI response.
 * Click a suggestion to insert it into the input field, or ignore them and write your own.
 *
 * @version 1.0.0
 * @author ryanrobson
 */

// ============================================================================
// CONFIGURATION & TYPES
// ============================================================================

interface Suggestion {
  type: 'action' | 'dialogue' | 'narrative' | 'mixed';
  text: string;
}

interface ScriptSettings {
  autoGenerate: boolean;
  suggestionStyle: 'brief' | 'detailed' | 'mixed';
  temperature: number;
}

interface ScriptStorage {
  settings: ScriptSettings;
  suggestions: Suggestion[];
  isLoading: boolean;
  lastError: string;
}

const DEFAULT_SETTINGS: ScriptSettings = {
  autoGenerate: true,
  suggestionStyle: 'mixed',
  temperature: 0.6,
};

const DEFAULT_STORAGE: ScriptStorage = {
  settings: DEFAULT_SETTINGS,
  suggestions: [],
  isLoading: false,
  lastError: '',
};

// Processing lock to prevent concurrent generation
let isProcessing = false;

// Maximum text to send to LLM (conservative to avoid token budget issues)
const MAX_CONTEXT_LENGTH = 4000;

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

async function getStorage(): Promise<ScriptStorage> {
  try {
    const stored = await api.v1.storyStorage.get('storySuggestionsData');
    if (stored) {
      return { ...DEFAULT_STORAGE, ...JSON.parse(stored) };
    }
  } catch (e) {
    api.v1.error('[Suggestions] Error loading storage:', e);
  }
  return { ...DEFAULT_STORAGE };
}

async function saveStorage(data: ScriptStorage): Promise<void> {
  try {
    await api.v1.storyStorage.set('storySuggestionsData', JSON.stringify(data));
  } catch (e) {
    api.v1.error('[Suggestions] Error saving storage:', e);
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
// SUGGESTION GENERATION ENGINE
// ============================================================================

/**
 * Generates 3 story continuation suggestions using GLM-4-6
 */
async function generateSuggestions(storyText: string): Promise<Suggestion[]> {
  const settings = await getSettings();

  // Limit story context to avoid token budget issues
  let contextText = storyText;
  if (storyText.length > MAX_CONTEXT_LENGTH) {
    contextText = storyText.slice(-MAX_CONTEXT_LENGTH);
    api.v1.log(`[Suggestions] Context truncated to ${MAX_CONTEXT_LENGTH} chars`);
  }

  // Build style instructions based on setting
  let styleInstructions = '';
  switch (settings.suggestionStyle) {
    case 'brief':
      styleInstructions = 'Keep all suggestions brief (1-2 sentences max). Focus on action prompts and quick dialogue hooks.';
      break;
    case 'detailed':
      styleInstructions = 'Make suggestions detailed (2-4 sentences each). Include narrative description and emotional context.';
      break;
    case 'mixed':
    default:
      styleInstructions = `Vary the format naturally based on what fits the story moment:
- For action scenes: Brief 1-2 sentence prompts
- For dialogue moments: A character line with brief context
- For dramatic beats: Longer 2-4 sentence continuations`;
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a creative writing assistant helping with interactive fiction. Generate exactly 3 different, compelling story continuation suggestions.

${styleInstructions}

Each suggestion should:
- Feel natural as something the user might type
- Offer a distinct direction (don't repeat the same idea)
- Match the tone and style of the existing story
- Be written from the perspective the story uses (first/second/third person)

Output ONLY valid JSON in this exact format:
{"suggestions":[{"type":"action","text":"suggestion 1"},{"type":"dialogue","text":"suggestion 2"},{"type":"narrative","text":"suggestion 3"}]}

Types: "action" for physical actions, "dialogue" for speech, "narrative" for description/thought, "mixed" for combinations.`
    },
    {
      role: 'user',
      content: `Based on this story so far, generate 3 distinct continuation suggestions:

---
${contextText}
---

Remember: Output ONLY the JSON object, nothing else.`
    }
  ];

  try {
    const response = await api.v1.generate(messages, {
      model: 'glm-4-6',
      max_tokens: 300,
      temperature: settings.temperature,
    });

    if (response.choices && response.choices.length > 0) {
      const content = response.choices[0].text || '';

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];

        // Try to fix truncated JSON (common with token limits)
        try {
          JSON.parse(jsonStr);
        } catch (parseErr) {
          // Count brackets and try to close them
          const openBraces = (jsonStr.match(/\{/g) || []).length;
          const closeBraces = (jsonStr.match(/\}/g) || []).length;
          const openBrackets = (jsonStr.match(/\[/g) || []).length;
          const closeBrackets = (jsonStr.match(/\]/g) || []).length;

          // Check if we're in the middle of a string
          const lastQuote = jsonStr.lastIndexOf('"');
          const quoteCount = (jsonStr.match(/"/g) || []).length;
          if (quoteCount % 2 !== 0) {
            jsonStr += '"';
          }

          // Close any open structures
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            jsonStr += ']';
          }
          for (let i = 0; i < openBraces - closeBraces; i++) {
            jsonStr += '}';
          }
        }

        try {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed.suggestions)) {
            return parsed.suggestions.map((s: any) => ({
              type: s.type || 'mixed',
              text: typeof s.text === 'string' ? s.text : String(s.text || ''),
            })).filter((s: Suggestion) => s.text.length > 0).slice(0, 3);
          }
        } catch (finalParseErr) {
          api.v1.log('[Suggestions] Could not parse JSON response');
        }
      }
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (errMsg.includes('token budget')) {
      api.v1.log('[Suggestions] Token budget exceeded, try shorter context');
    } else {
      api.v1.error('[Suggestions] Error generating suggestions:', e);
    }
    throw e;
  }

  return [];
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processNewContent(): Promise<void> {
  if (isProcessing) {
    api.v1.log('[Suggestions] Already processing, skipping...');
    return;
  }

  const storage = await getStorage();
  if (!storage.settings.autoGenerate) return;

  isProcessing = true;
  storage.isLoading = true;
  storage.lastError = '';
  await saveStorage(storage);

  // Update panel to show loading state
  if (panelUpdateFn) await panelUpdateFn();

  try {
    // Get document content
    let storyText = '';
    const sectionIds = await api.v1.document.sectionIds();

    if (sectionIds.length === 0) {
      storage.isLoading = false;
      await saveStorage(storage);
      if (panelUpdateFn) await panelUpdateFn();
      isProcessing = false;
      return;
    }

    // Collect story text
    const scanResults = await api.v1.document.scan();
    for (const { section } of scanResults) {
      if (section.text) {
        storyText += section.text + '\n';
      }
    }

    // Need at least some content
    if (storyText.trim().length < 100) {
      storage.isLoading = false;
      await saveStorage(storage);
      if (panelUpdateFn) await panelUpdateFn();
      isProcessing = false;
      return;
    }

    // Generate suggestions
    api.v1.log('[Suggestions] Generating suggestions...');
    const suggestions = await generateSuggestions(storyText);

    storage.suggestions = suggestions;
    storage.isLoading = false;
    await saveStorage(storage);

    if (suggestions.length > 0) {
      api.v1.log(`[Suggestions] Generated ${suggestions.length} suggestions`);
    } else {
      api.v1.log('[Suggestions] No suggestions generated');
    }

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    storage.isLoading = false;
    storage.lastError = errMsg;
    await saveStorage(storage);
    api.v1.error('[Suggestions] Error:', e);
  } finally {
    isProcessing = false;
    if (panelUpdateFn) await panelUpdateFn();
  }
}

async function forceRegenerate(): Promise<void> {
  isProcessing = false;
  const storage = await getStorage();
  storage.suggestions = [];
  storage.lastError = '';
  await saveStorage(storage);
  await processNewContent();
}

async function clearSuggestions(): Promise<void> {
  const storage = await getStorage();
  storage.suggestions = [];
  storage.lastError = '';
  await saveStorage(storage);
  if (panelUpdateFn) await panelUpdateFn();
  api.v1.ui.toast('Suggestions cleared', { autoClose: 2000 });
}

/**
 * Append a suggestion directly to the end of the story
 */
async function insertSuggestion(suggestion: Suggestion): Promise<void> {
  try {
    // Append the suggestion text directly to the end of the story
    await api.v1.document.append(suggestion.text);
    api.v1.ui.toast('Suggestion added to story', { autoClose: 2000, type: 'success' });
    api.v1.log(`[Suggestions] Appended: "${suggestion.text.slice(0, 50)}..."`);
  } catch (e) {
    api.v1.error('[Suggestions] Error appending suggestion:', e);
    api.v1.ui.toast('Failed to add suggestion', { autoClose: 3000, type: 'error' });
  }
}

// ============================================================================
// UI PANEL
// ============================================================================

let panelUpdateFn: (() => Promise<void>) | null = null;

/**
 * Get display color based on suggestion type
 */
function getTypeColor(type: string): string {
  switch (type) {
    case 'action': return '#6bcb77';    // Green for action
    case 'dialogue': return '#4d96ff';  // Blue for dialogue
    case 'narrative': return '#ffd93d'; // Yellow for narrative
    default: return '#a0a0a0';          // Gray for mixed
  }
}

/**
 * Get type label for display
 */
function getTypeLabel(type: string): string {
  switch (type) {
    case 'action': return 'Action';
    case 'dialogue': return 'Dialogue';
    case 'narrative': return 'Narrative';
    default: return 'Mixed';
  }
}

async function createUIPanel(): Promise<void> {
  const buildPanel = async () => {
    const storage = await getStorage();
    const { suggestions, isLoading, lastError, settings } = storage;

    const content: any[] = [
      // Header
      api.v1.ui.part.text({
        text: 'Story Suggestions',
        style: { fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }
      }),
      api.v1.ui.part.text({
        text: 'Click a suggestion to add it to your input',
        style: { fontSize: '11px', color: '#888', marginBottom: '12px' }
      }),
    ];

    // Loading state
    if (isLoading) {
      content.push(
        api.v1.ui.part.container({
          content: [
            api.v1.ui.part.text({
              text: 'Generating suggestions...',
              style: { color: '#ffd93d', fontStyle: 'italic', textAlign: 'center' }
            })
          ],
          style: {
            padding: '20px',
            backgroundColor: '#1a1a1a',
            borderRadius: '8px',
            marginBottom: '12px'
          }
        })
      );
    }
    // Error state
    else if (lastError) {
      content.push(
        api.v1.ui.part.container({
          content: [
            api.v1.ui.part.text({
              text: 'Error generating suggestions',
              style: { color: '#ff6b6b', fontWeight: 'bold', marginBottom: '4px' }
            }),
            api.v1.ui.part.text({
              text: lastError.length > 100 ? lastError.slice(0, 100) + '...' : lastError,
              style: { color: '#ff8888', fontSize: '11px' }
            })
          ],
          style: {
            padding: '12px',
            backgroundColor: '#2a1a1a',
            borderRadius: '8px',
            marginBottom: '12px'
          }
        })
      );
    }
    // Suggestions display
    else if (suggestions.length > 0) {
      for (let i = 0; i < suggestions.length; i++) {
        const suggestion = suggestions[i];
        const typeColor = getTypeColor(suggestion.type);
        const typeLabel = getTypeLabel(suggestion.type);

        content.push(
          api.v1.ui.part.container({
            content: [
              // Type badge
              api.v1.ui.part.text({
                text: typeLabel,
                style: {
                  fontSize: '10px',
                  color: typeColor,
                  fontWeight: 'bold',
                  marginBottom: '4px',
                  textTransform: 'uppercase'
                }
              }),
              // Suggestion text button
              api.v1.ui.part.button({
                text: suggestion.text.length > 150
                  ? suggestion.text.slice(0, 150) + '...'
                  : suggestion.text,
                callback: async () => {
                  await insertSuggestion(suggestion);
                },
                style: {
                  width: '100%',
                  textAlign: 'left',
                  backgroundColor: '#2a2a2a',
                  padding: '10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-wrap',
                  border: `1px solid ${typeColor}33`
                }
              })
            ],
            style: {
              marginBottom: '8px'
            }
          })
        );
      }
    }
    // Empty state
    else {
      content.push(
        api.v1.ui.part.container({
          content: [
            api.v1.ui.part.text({
              text: 'No suggestions yet',
              style: { color: '#666', textAlign: 'center' }
            }),
            api.v1.ui.part.text({
              text: 'Suggestions will appear after the AI responds',
              style: { color: '#555', fontSize: '11px', textAlign: 'center', marginTop: '4px' }
            })
          ],
          style: {
            padding: '20px',
            backgroundColor: '#1a1a1a',
            borderRadius: '8px',
            marginBottom: '12px'
          }
        })
      );
    }

    // Action buttons
    content.push(
      api.v1.ui.part.row({
        content: [
          api.v1.ui.part.button({
            text: 'Regenerate',
            callback: async () => {
              await forceRegenerate();
            },
            style: { flex: '1', marginRight: '8px' }
          }),
          api.v1.ui.part.button({
            text: 'Clear',
            callback: async () => {
              await clearSuggestions();
            },
            style: { flex: '1', backgroundColor: '#444' }
          }),
        ],
        style: { marginBottom: '12px' }
      })
    );

    // Settings section
    content.push(
      api.v1.ui.part.collapsibleSection({
        title: 'Settings',
        initialCollapsed: true,
        content: [
          // Auto-generate toggle
          api.v1.ui.part.row({
            content: [
              api.v1.ui.part.text({
                text: 'Auto-generate:',
                style: { flex: '1' }
              }),
              api.v1.ui.part.checkboxInput({
                initialValue: settings.autoGenerate,
                onChange: async (checked: boolean) => {
                  await updateSettings({ autoGenerate: checked });
                  api.v1.ui.toast(
                    checked ? 'Auto-generate enabled' : 'Auto-generate disabled',
                    { autoClose: 2000 }
                  );
                }
              }),
            ],
            style: { marginBottom: '12px' }
          }),

          // Suggestion style
          api.v1.ui.part.text({
            text: 'Suggestion Style:',
            style: { marginBottom: '4px', fontSize: '12px' }
          }),
          api.v1.ui.part.row({
            content: [
              api.v1.ui.part.button({
                text: 'Brief',
                callback: async () => {
                  await updateSettings({ suggestionStyle: 'brief' });
                  api.v1.ui.toast('Style: Brief', { autoClose: 1500 });
                  if (panelUpdateFn) await panelUpdateFn();
                },
                style: {
                  flex: '1',
                  marginRight: '4px',
                  backgroundColor: settings.suggestionStyle === 'brief' ? '#4d96ff' : '#333'
                }
              }),
              api.v1.ui.part.button({
                text: 'Mixed',
                callback: async () => {
                  await updateSettings({ suggestionStyle: 'mixed' });
                  api.v1.ui.toast('Style: Mixed', { autoClose: 1500 });
                  if (panelUpdateFn) await panelUpdateFn();
                },
                style: {
                  flex: '1',
                  marginRight: '4px',
                  backgroundColor: settings.suggestionStyle === 'mixed' ? '#4d96ff' : '#333'
                }
              }),
              api.v1.ui.part.button({
                text: 'Detailed',
                callback: async () => {
                  await updateSettings({ suggestionStyle: 'detailed' });
                  api.v1.ui.toast('Style: Detailed', { autoClose: 1500 });
                  if (panelUpdateFn) await panelUpdateFn();
                },
                style: {
                  flex: '1',
                  backgroundColor: settings.suggestionStyle === 'detailed' ? '#4d96ff' : '#333'
                }
              }),
            ],
            style: { marginBottom: '12px' }
          }),

          // Temperature slider
          api.v1.ui.part.text({
            text: 'Creativity:',
            style: { marginBottom: '4px', fontSize: '12px' }
          }),
          api.v1.ui.part.sliderInput({
            initialValue: settings.temperature,
            min: 0.3,
            max: 1.0,
            step: 0.1,
            label: `${settings.temperature.toFixed(1)} (${settings.temperature <= 0.5 ? 'Conservative' : settings.temperature >= 0.8 ? 'Creative' : 'Balanced'})`,
            onChange: async (value: number) => {
              await updateSettings({ temperature: value });
            },
            style: { marginBottom: '8px' }
          }),
          api.v1.ui.part.text({
            text: 'Lower = more predictable, Higher = more varied',
            style: { fontSize: '10px', color: '#666' }
          }),
        ]
      })
    );

    return api.v1.ui.part.column({
      content,
      style: { padding: '12px' }
    });
  };

  const updatePanel = async () => {
    try {
      const panel = await buildPanel();
      await api.v1.ui.update([
        {
          type: 'scriptPanel' as const,
          id: 'storySuggestionsPanel',
          name: 'Story Suggestions',
          content: [panel]
        }
      ]);
    } catch (e) {
      api.v1.error('[Suggestions] Error updating panel:', e);
    }
  };

  panelUpdateFn = updatePanel;

  // Register the panel
  try {
    const initialPanel = await buildPanel();
    await api.v1.ui.register([
      api.v1.ui.extension.scriptPanel({
        id: 'storySuggestionsPanel',
        name: 'Story Suggestions',
        content: [initialPanel]
      })
    ]);
  } catch (e) {
    api.v1.error('[Suggestions] Error creating panel:', e);
  }
}

// ============================================================================
// HOOK REGISTRATION
// ============================================================================

function registerHooks(): void {
  api.v1.hooks.register('onGenerationEnd', async () => {
    try {
      await processNewContent();
    } catch (e) {
      api.v1.error('[Suggestions] Error in onGenerationEnd hook:', e);
    }
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initialize(): Promise<void> {
  try {
    api.v1.log('[Suggestions] Initializing Story Suggestions...');

    // Request required permissions (storyEdit is needed for prefill.set)
    const hasPermissions = await api.v1.permissions.request(['storyEdit']);
    if (!hasPermissions) {
      api.v1.error('[Suggestions] Required permissions not granted');
      api.v1.ui.toast('Story Suggestions requires story edit permission', { autoClose: 5000, type: 'error' });
      return;
    }

    // Ensure storage is initialized
    await getStorage();

    // Create UI panel
    await createUIPanel();

    // Register hooks
    registerHooks();

    api.v1.ui.toast('Story Suggestions loaded', { autoClose: 3000, type: 'success' });
    api.v1.log('[Suggestions] Initialization complete');

  } catch (e) {
    api.v1.error('[Suggestions] Initialization failed:', e);
    api.v1.ui.toast('Story Suggestions failed to load', { autoClose: 5000, type: 'error' });
  }
}

// Start the script
initialize();
