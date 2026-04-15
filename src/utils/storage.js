export const STORAGE_KEY = "caldo_v2_tasks";
export const STREAK_KEY = "caldo_v2_streak";
export const THEME_KEY = "caldo_v2_theme"; // 'light' | 'dark'
export const DENSITY_KEY = "caldo_v2_density"; // 'normal' | 'compact' | 'minified'
export const RECURRENCE_KEY = "caldo_v2_recurring_series";
export const NOTES_MODE_KEY = "caldo_v2_notes_mode"; // 'edit' | 'preview'
export const SNIPPETS_CACHE_KEY = "caldo_v2_snippets_cache";
export const NOTES_FEED_CACHE_KEY = "caldo_v2_notes_feed_cache"; // merged notes+snippets feed
export const HABBITS_KEY = "caldo_v2_habbits";

export function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveTasks(tasksMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasksMap));
}

export function loadStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { current: 0, longest: 0, lastEarnedDateKey: null };
    const parsed = JSON.parse(raw);
    return {
      current: Number(parsed.current) || 0,
      longest: Number(parsed.longest) || 0,
      lastEarnedDateKey: parsed.lastEarnedDateKey || null,
    };
  } catch {
    return { current: 0, longest: 0, lastEarnedDateKey: null };
  }
}

export function saveStreak(streak) {
  const safe = {
    current: Number(streak?.current) || 0,
    longest: Number(streak?.longest) || 0,
    lastEarnedDateKey: streak?.lastEarnedDateKey || null,
  };
  localStorage.setItem(STREAK_KEY, JSON.stringify(safe));
}

export function saveViewPreference(view) {
  try { localStorage.setItem('caldo_v2_view', String(view || 'month')); } catch {}
}

export function loadViewPreference() {
  try { return localStorage.getItem('caldo_v2_view') || 'month'; } catch { return 'month'; }
}

export function loadThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  try {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveThemePreference(theme) {
  try {
    if (theme === 'light' || theme === 'dark') localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

export function loadDensityPreference() {
  try {
    const stored = localStorage.getItem(DENSITY_KEY);
    if (stored === 'normal' || stored === 'compact' || stored === 'minified') return stored;
  } catch {}
  return 'normal';
}

export function saveDensityPreference(density) {
  try {
    if (density === 'normal' || density === 'compact' || density === 'minified') {
      localStorage.setItem(DENSITY_KEY, density);
    }
  } catch {}
}


export function loadRecurringSeries() {
  try {
    const raw = localStorage.getItem(RECURRENCE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecurringSeries(seriesList) {
  try {
    const safe = Array.isArray(seriesList) ? seriesList : [];
    localStorage.setItem(RECURRENCE_KEY, JSON.stringify(safe));
  } catch {}
}


export function loadNotesModePreference() {
  try {
    const stored = localStorage.getItem(NOTES_MODE_KEY);
    if (stored === 'edit' || stored === 'preview') return stored;
  } catch {}
  return 'edit';
}

export function saveNotesModePreference(mode) {
  try {
    if (mode === 'edit' || mode === 'preview') localStorage.setItem(NOTES_MODE_KEY, mode);
  } catch {}
}


export function loadSnippetsCache() {
  try {
    const raw = localStorage.getItem(SNIPPETS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSnippetsCache(items) {
  try {
    const safe = Array.isArray(items) ? items : [];
    localStorage.setItem(SNIPPETS_CACHE_KEY, JSON.stringify(safe));
  } catch {}
}

export function loadNotesFeedCache() {
  try {
    const raw = localStorage.getItem(NOTES_FEED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveNotesFeedCache(items) {
  try {
    const safe = Array.isArray(items) ? items : [];
    localStorage.setItem(NOTES_FEED_CACHE_KEY, JSON.stringify(safe));
  } catch {}
}

export function loadHabbits() {
  try {
    const raw = localStorage.getItem(HABBITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHabbits(items) {
  try {
    const safe = Array.isArray(items) ? items : [];
    localStorage.setItem(HABBITS_KEY, JSON.stringify(safe));
  } catch {}
}

