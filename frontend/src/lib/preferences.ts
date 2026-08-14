export const PREFERENCE_SCHEMA_VERSION = 1 as const;

export type CompactReadingMode = 'ask' | 'automatic' | 'off';
export type MotionPreference = 'system' | 'reduce' | 'full';

export interface AdaptiveWebPreferences {
    schemaVersion: typeof PREFERENCE_SCHEMA_VERSION;
    features: {
        hoverAssistance: { enabled: boolean; delayMs: number };
        readingAssistance: { enabled: boolean };
        scrollBackSummary: { enabled: boolean; returnWindowMs: number };
        compactReading: { mode: CompactReadingMode };
        cursorAssistance: { enabled: boolean };
        keyboardShortcuts: { enabled: boolean };
        exitIntent: { enabled: boolean };
    };
    ai: { allowGemini: boolean };
    accessibility: { reducedMotion: MotionPreference };
}

export const DEFAULT_PREFERENCES: AdaptiveWebPreferences = {
    schemaVersion: PREFERENCE_SCHEMA_VERSION,
    features: {
        hoverAssistance: { enabled: true, delayMs: 1500 },
        readingAssistance: { enabled: true },
        scrollBackSummary: { enabled: true, returnWindowMs: 18000 },
        compactReading: { mode: 'ask' },
        cursorAssistance: { enabled: true },
        keyboardShortcuts: { enabled: true },
        exitIntent: { enabled: false },
    },
    ai: { allowGemini: true },
    accessibility: { reducedMotion: 'system' },
};

export class PreferenceValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PreferenceValidationError';
    }
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new PreferenceValidationError(`${name} must be an object`);
    }
    return value as Record<string, unknown>;
}

function strictKeys(value: Record<string, unknown>, allowed: string[], name: string) {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new PreferenceValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
}

function booleanValue(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') throw new PreferenceValidationError(`${name} must be true or false`);
    return value;
}

function boundedInteger(value: unknown, name: string, minimum: number, maximum: number): number {
    if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
        throw new PreferenceValidationError(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return Number(value);
}

export function parsePreferences(input: unknown): AdaptiveWebPreferences {
    const root = objectValue(input, 'preferences');
    strictKeys(root, ['schemaVersion', 'features', 'ai', 'accessibility'], 'preferences');
    if (root.schemaVersion !== PREFERENCE_SCHEMA_VERSION) {
        throw new PreferenceValidationError(`Unsupported preference schema version: ${String(root.schemaVersion)}`);
    }

    const features = objectValue(root.features, 'features');
    strictKeys(features, [
        'hoverAssistance', 'readingAssistance', 'scrollBackSummary', 'compactReading',
        'cursorAssistance', 'keyboardShortcuts', 'exitIntent',
    ], 'features');

    const hover = objectValue(features.hoverAssistance, 'features.hoverAssistance');
    strictKeys(hover, ['enabled', 'delayMs'], 'features.hoverAssistance');
    const reading = objectValue(features.readingAssistance, 'features.readingAssistance');
    strictKeys(reading, ['enabled'], 'features.readingAssistance');
    const scroll = objectValue(features.scrollBackSummary, 'features.scrollBackSummary');
    strictKeys(scroll, ['enabled', 'returnWindowMs'], 'features.scrollBackSummary');
    const compact = objectValue(features.compactReading, 'features.compactReading');
    strictKeys(compact, ['mode'], 'features.compactReading');
    const cursor = objectValue(features.cursorAssistance, 'features.cursorAssistance');
    strictKeys(cursor, ['enabled'], 'features.cursorAssistance');
    const shortcuts = objectValue(features.keyboardShortcuts, 'features.keyboardShortcuts');
    strictKeys(shortcuts, ['enabled'], 'features.keyboardShortcuts');
    const exitIntent = objectValue(features.exitIntent, 'features.exitIntent');
    strictKeys(exitIntent, ['enabled'], 'features.exitIntent');
    const ai = objectValue(root.ai, 'ai');
    strictKeys(ai, ['allowGemini'], 'ai');
    const accessibility = objectValue(root.accessibility, 'accessibility');
    strictKeys(accessibility, ['reducedMotion'], 'accessibility');

    const compactMode = compact.mode;
    if (!['ask', 'automatic', 'off'].includes(String(compactMode))) {
        throw new PreferenceValidationError('features.compactReading.mode must be ask, automatic, or off');
    }
    const reducedMotion = accessibility.reducedMotion;
    if (!['system', 'reduce', 'full'].includes(String(reducedMotion))) {
        throw new PreferenceValidationError('accessibility.reducedMotion must be system, reduce, or full');
    }

    return {
        schemaVersion: PREFERENCE_SCHEMA_VERSION,
        features: {
            hoverAssistance: {
                enabled: booleanValue(hover.enabled, 'features.hoverAssistance.enabled'),
                delayMs: boundedInteger(hover.delayMs, 'features.hoverAssistance.delayMs', 500, 10000),
            },
            readingAssistance: { enabled: booleanValue(reading.enabled, 'features.readingAssistance.enabled') },
            scrollBackSummary: {
                enabled: booleanValue(scroll.enabled, 'features.scrollBackSummary.enabled'),
                returnWindowMs: boundedInteger(scroll.returnWindowMs, 'features.scrollBackSummary.returnWindowMs', 5000, 60000),
            },
            compactReading: { mode: compactMode as CompactReadingMode },
            cursorAssistance: { enabled: booleanValue(cursor.enabled, 'features.cursorAssistance.enabled') },
            keyboardShortcuts: { enabled: booleanValue(shortcuts.enabled, 'features.keyboardShortcuts.enabled') },
            exitIntent: { enabled: booleanValue(exitIntent.enabled, 'features.exitIntent.enabled') },
        },
        ai: { allowGemini: booleanValue(ai.allowGemini, 'ai.allowGemini') },
        accessibility: { reducedMotion: reducedMotion as MotionPreference },
    };
}

export function cloneDefaultPreferences(): AdaptiveWebPreferences {
    return JSON.parse(JSON.stringify(DEFAULT_PREFERENCES)) as AdaptiveWebPreferences;
}

export function migrateLegacyPreferences(settings: unknown): AdaptiveWebPreferences {
    const migrated = cloneDefaultPreferences();
    if (!settings || typeof settings !== 'object') return migrated;
    const legacy = settings as Record<string, unknown>;
    if (typeof legacy.optimizeText === 'boolean') {
        migrated.features.readingAssistance.enabled = legacy.optimizeText;
        migrated.features.compactReading.mode = legacy.optimizeText ? 'ask' : 'off';
    }
    if (Number.isInteger(legacy.hoverDelay)) {
        migrated.features.hoverAssistance.delayMs = Math.max(500, Math.min(10000, Number(legacy.hoverDelay)));
    }
    if (Number.isInteger(legacy.scrollBackWindow)) {
        const raw = Number(legacy.scrollBackWindow);
        migrated.features.scrollBackSummary.returnWindowMs = Math.max(5000, Math.min(60000, raw < 1000 ? raw * 1000 : raw));
    }
    return migrated;
}
