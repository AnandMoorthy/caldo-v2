import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, parseISO, isAfter, startOfDay, isToday } from "date-fns";
import { motion } from "framer-motion";
import { Plus, Check, StickyNote, List, Grip, Minimize2, ListX, CheckSquare, Sparkles, Target } from "lucide-react";
import { auth, db, googleProvider, firebase } from "./firebase";
import Header from "./components/Header.jsx";
import Calendar from "./components/Calendar.jsx";
import WeekView from "./components/WeekView.jsx";
import YearView from "./components/YearView.jsx";
import DayView from "./components/DayView.jsx";
import TaskList from "./components/TaskList.jsx";
import AddTaskDrawer from "./components/AddTaskDrawer.jsx";
import EditTaskDrawer from "./components/EditTaskDrawer.jsx";
import CelebrationCanvas from "./components/CelebrationCanvas.jsx";
import MissedTasksDrawer from "./components/MissedTasksDrawer.jsx";
// import DayNotesDrawer from "./components/DayNotesDrawer.jsx"; // Replaced with unified SnippetsDrawer
import HelpPage from "./components/HelpPage.jsx";
import SearchModal from "./components/SearchModal.jsx";
import ScopeDialog from "./components/ScopeDialog.jsx";
import TooltipProvider from "./components/Tooltip.jsx";
import NotesPage from "./components/NotesPage.jsx";
import SnippetsPage from "./components/SnippetsPage.jsx";
import SnippetsDrawer from "./components/SnippetsDrawer.jsx";
import MomentsPage from "./components/MomentsPage.jsx";
import HabitTracker from "./components/HabitTracker.jsx";
import PublicSnippetView from "./components/PublicSnippetView.jsx";
import FocusedSnippetView from "./components/FocusedSnippetView.jsx";
import FocusedDayNoteView from "./components/FocusedDayNoteView.jsx";
import FloatingPomodoro from "./components/FloatingPomodoro.jsx";
import { loadTasks, saveTasks, loadStreak, saveStreak, loadDensityPreference, saveDensityPreference, loadRecurringSeries, saveRecurringSeries, loadViewPreference, saveViewPreference, loadSnippetsCache, saveSnippetsCache, loadHabbits, saveHabbits } from "./utils/storage";
import { generateId } from "./utils/uid";
import { keyFor, monthKeyFromDate, monthKeyFromDateKey, getMonthMapFor } from "./utils/date";
import { buildSearchIndex, searchTasks } from "./utils/search.js";
import { getMotivationalMessageForCount } from "./utils/motivation.js";
import { DRAG_MIME } from "./constants";
import { createTaskRepository } from "./services/repositories/taskRepository";
import { createDayNoteRepository } from "./services/repositories/noteRepository";
import { createSnippetRepository } from "./services/repositories/snippetRepository";
import { createMomentRepository } from "./services/repositories/momentRepository";
import { createHabitRepository } from "./services/repositories/habitRepository";
import { materializeSeries } from "./utils/recurrence";


// Single-file Caldo app
// Tailwind styling expected. NPM deps: date-fns, framer-motion, lucide-react

// Storage helpers moved to utils/storage.js

export default function App() {
  const [currentView, setCurrentView] = useState(() => (typeof window === 'undefined' ? 'month' : loadViewPreference()));
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'tasks';
    try {
      const stored = localStorage.getItem('caldo_v2_active_tab') || 'tasks';
      return ['tasks', 'notes', 'moments', 'habits'].includes(stored) ? stored : 'tasks';
    } catch { return 'tasks'; }
  }); // 'tasks' | 'notes' | 'moments' | 'habits'
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasksMap, setTasksMap] = useState(() => loadTasks());
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", priority: "medium", subtasks: [] });
  const [showEdit, setShowEdit] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", notes: "", priority: "medium" });
  const [user, setUser] = useState(null);
  const hasLoadedCloud = useRef(false);
  const loadedMonthsRef = useRef(new Set());
  const [recurringSeries, setRecurringSeries] = useState(() => loadRecurringSeries());
  const [recurringEnabled, setRecurringEnabled] = useState(true);
  const [pomodoroEnabled, setPomodoroEnabled] = useState(true);
  const [deleteAllTasksEnabled, setDeleteAllTasksEnabled] = useState(false);
  
  // Repositories
  const taskRepoRef = useRef(null);
  const noteRepoRef = useRef(null);
  const snippetRepoRef = useRef(null);
  const momentRepoRef = useRef(null);
  const habitRepoRef = useRef(null);
  const habitsSyncReadyRef = useRef(false);
  const [snippetsCache, setSnippetsCache] = useState(() => loadSnippetsCache());
  const [notesCache, setNotesCache] = useState(new Map()); // Cache for day notes
  const [momentsCache, setMomentsCache] = useState([]); // Cache for moments
  const [habbits, setHabbits] = useState(() => loadHabbits());
  // profile menu moved into Header component
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(monthStart);
  const [dragOverDayKey, setDragOverDayKey] = useState(null);
  const [showMissed, setShowMissed] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [draftDayNote, setDraftDayNote] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [snippetsDrawerOpen, setSnippetsDrawerOpen] = useState(false);
  const [snippetsDrawerId, setSnippetsDrawerId] = useState(null);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [iconAnimation, setIconAnimation] = useState({ tab: null, key: 0 });
  
  // Pomodoro timer state
  const [showFloatingPomodoro, setShowFloatingPomodoro] = useState(false);
  const [currentPomodoroTask, setCurrentPomodoroTask] = useState(null);
  const [pomodoroRunningState, setPomodoroRunningState] = useState({ 
    isRunning: false, 
    currentTask: null, 
    timeLeft: null, 
    phase: null, 
    totalTime: null 
  });
  const scopeActionRef = useRef(null); // { type: 'delete'|'edit', task }
  const [density, setDensity] = useState(() => (typeof window === 'undefined' ? 'normal' : loadDensityPreference()));
  const [showDensityMenu, setShowDensityMenu] = useState(false);
  const densityMenuRef = useRef(null);
  const navRepeatRef = useRef({ dir: null, timeoutId: null, intervalId: null, active: false });

  // Public snippet hash route state
  const [publicRoute, setPublicRoute] = useState(() => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash || '';
    if (hash.startsWith('#/s/')) {
      const queryIndex = hash.indexOf('?');
      const path = queryIndex >= 0 ? hash.slice(0, queryIndex) : hash;
      const slug = path.replace('#/s/', '').trim();
      const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : '');
      const token = params.get('t');
      return { slug, token };
    }
    return null;
  });

  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash || '';
      if (hash.startsWith('#/s/')) {
        const queryIndex = hash.indexOf('?');
        const path = queryIndex >= 0 ? hash.slice(0, queryIndex) : hash;
        const slug = path.replace('#/s/', '').trim();
        const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : '');
        const token = params.get('t');
        setPublicRoute({ slug, token });
      } else {
        setPublicRoute(null);
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Focused local views via hash: #/x/sn/:id and #/x/n/:dateKey
  const [focusedRoute, setFocusedRoute] = useState(() => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash || '';
    if (hash.startsWith('#/x/sn/')) {
      const id = hash.replace('#/x/sn/', '').trim();
      return { type: 'snippet', id };
    }
    if (hash.startsWith('#/x/n/')) {
      const dateKey = hash.replace('#/x/n/', '').trim();
      return { type: 'note', dateKey };
    }
    return null;
  });

  useEffect(() => {
    function onHashChange2() {
      const hash = window.location.hash || '';
      if (hash.startsWith('#/x/sn/')) {
        const id = hash.replace('#/x/sn/', '').trim();
        setFocusedRoute({ type: 'snippet', id });
        return;
      }
      if (hash.startsWith('#/x/n/')) {
        const dateKey = hash.replace('#/x/n/', '').trim();
        setFocusedRoute({ type: 'note', dateKey });
        return;
      }
      setFocusedRoute(null);
    }
    window.addEventListener('hashchange', onHashChange2);
    return () => window.removeEventListener('hashchange', onHashChange2);
  }, []);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchIndex, setSearchIndex] = useState([]);

  // Streak state: current, longest, lastEarnedDateKey
  const [streak, setStreak] = useState(() => loadStreak());
  // no-op ref removed; we use interval-based checker

  // Celebration state and bookkeeping
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationDateKey, setCelebrationDateKey] = useState(null);
  const celebrationTimerRef = useRef(null);
  const [confettiSeed, setConfettiSeed] = useState(0);
  const isDev = Boolean(import.meta?.env?.DEV);
  const debugCloud = (...args) => {
    try {
      if (isDev) console.debug('[cloud]', ...args);
    } catch {}
  };

  function triggerCelebration(dateKey) {
    setCelebrationDateKey(dateKey);
    setShowCelebration(true);
    setConfettiSeed((s) => s + 1);
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = setTimeout(() => {
      setShowCelebration(false);
    }, 2800);
  }

  useEffect(() => {
    saveTasks(tasksMap);
  }, [tasksMap]);
  useEffect(() => {
    try { saveViewPreference(currentView); } catch {}
  }, [currentView]);

  // Load recurring series from localStorage on mount (only when not logged in)
  useEffect(() => {
    if (!user) {
      try { saveRecurringSeries(recurringSeries); } catch {}
    }
  }, [recurringSeries, user]);

  // Build search index when tasks, snippets, or moments change
  useEffect(() => {
    const newIndex = buildSearchIndex(tasksMap, snippetsCache, momentsCache);
    setSearchIndex(newIndex);
  }, [tasksMap, snippetsCache, momentsCache]);

  // Persist snippets cache to localStorage
  useEffect(() => {
    try { saveSnippetsCache(snippetsCache); } catch {}
  }, [snippetsCache]);

  useEffect(() => {
    try { saveHabbits(habbits); } catch {}
    if (user && habitRepoRef.current && habitsSyncReadyRef.current) {
      habitRepoRef.current.saveHabbits(habbits).catch((err) => {
        console.error('Failed to sync habits to cloud', err);
      });
    }
  }, [habbits]);

  // Notify other views (e.g., NotesPage) when snippets cache changes
  useEffect(() => {
    try {
      const event = new CustomEvent('snippets:updated', { detail: { items: snippetsCache } });
      window.dispatchEvent(event);
    } catch {}
  }, [snippetsCache]);

  // Update search results when query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      const results = searchTasks(searchQuery, searchIndex);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, searchIndex]);

  // Keep draft note in sync when tasksMap changes for the selected day (e.g., remote refresh)
  useEffect(() => {
    try {
      setDraftDayNote(getDayNoteByKey(keyFor(selectedDate)));
    } catch {}
  }, [tasksMap, selectedDate]);

  // Global keyboard shortcuts: T add task, N open notes, M missed tasks, D density menu, arrows navigate by view, 0 today, 1/2/3 switch views, ? help, CMD+K/Ctrl+K search, Esc close
  useEffect(() => {
    function stopNavRepeat() {
      const r = navRepeatRef.current;
      if (r.timeoutId) { try { clearTimeout(r.timeoutId); } catch {} r.timeoutId = null; }
      if (r.intervalId) { try { clearInterval(r.intervalId); } catch {} r.intervalId = null; }
      r.active = false;
      r.dir = null;
    }

    function startNavRepeat(direction) {
      const r = navRepeatRef.current;
      // If changing direction, stop first
      if (r.active && r.dir !== direction) stopNavRepeat();
      if (r.active) return;
      r.active = true;
      r.dir = direction;
      r.timeoutId = setTimeout(() => {
        r.intervalId = setInterval(() => {
          if (r.dir === 'prev') prevDay(); else nextDay();
        }, 120);
      }, 350);
    }

    function onKeyDown(e) {
      // Allow Esc even inside inputs; ignore other keys while typing or with modifiers
      const tag = (e.target && e.target.tagName) || '';
      const key = (e.key || '').toLowerCase();
      if (key === 'escape') {
        if (showAdd) setShowAdd(false);
        if (showEdit) setShowEdit(false);
        if (showNotes) setShowNotes(false);
        if (showMissed) setShowMissed(false);
        if (showHelp) setShowHelp(false);
        if (showSearch) setShowSearch(false);
        stopNavRepeat();
        return;
      }
      if (/(INPUT|TEXTAREA|SELECT)/.test(tag)) return;
      
      // Handle CMD+K/Ctrl+K for search (allow this everywhere)
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        setShowSearch(true);
        setSearchQuery("");
        return;
      }
      
      // Disable other shortcuts when in snippets or notes sections
      if (activeTab === 'snippets' || activeTab === 'notes' || snippetsDrawerOpen || showNotes) {
        return;
      }

      
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (key === 't') {
        e.preventDefault();
        openAddModal(selectedDate);
      } else if (key === 'n') {
        e.preventDefault();
        // Close snippets drawer if open to avoid conflicts
        setSnippetsDrawerOpen(false);
        setShowNotes(true);
      } else if (key === 'm') {
        e.preventDefault();
        setCurrentView('month');
      } else if (key === 'w') {
        e.preventDefault();
        setCurrentView('week');
      } else if (key === 'd') {
        e.preventDefault();
        setCurrentView('day');
      } else if (key === 'y') {
        e.preventDefault();
        setCurrentView('year');
      } else if (key === 'o') {
        e.preventDefault();
        setShowMissed(true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevDay();
        if (!e.repeat) startNavRepeat('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextDay();
        if (!e.repeat) startNavRepeat('next');
      } else if (key === '0') {
        e.preventDefault();
        const today = new Date();
        setSelectedDate(today);
        setCursor(today);
        try {
          setDraftDayNote(getDayNoteByKey(keyFor(today)));
        } catch {}
        if (user) {
          const dk = keyFor(today);
          refreshDayFromCloud(user.uid, dk);
        }
      } else if (key === '1') {
        e.preventDefault();
        setCurrentView('day');
      } else if (key === '2') {
        e.preventDefault();
        setCurrentView('week');
      } else if (key === '3') {
        e.preventDefault();
        setCurrentView('month');
      } else if (key === '4') {
        e.preventDefault();
        setCurrentView('year');
      } else if (e.key === '?') {
        e.preventDefault();
        setShowHelp(true);
      } else if (key === 'p' && pomodoroEnabled) {
        e.preventDefault();
        setShowFloatingPomodoro(true);
      }
    }
    function onKeyUp(e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        stopNavRepeat();
      }
    }
    function onBlurWindow() {
      stopNavRepeat();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlurWindow);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlurWindow);
    };
  }, [selectedDate, showAdd, showEdit, showNotes, showMissed, showHelp, showSearch, currentView]);

  useEffect(() => {
    saveStreak(streak);
  }, [streak]);

  useEffect(() => {
    try { localStorage.setItem('caldo_v2_active_tab', activeTab); } catch {}
  }, [activeTab]);

  useEffect(() => {
    try { saveDensityPreference(density); } catch {}
  }, [density]);

  useEffect(() => {
    function onDocClick(e) {
      if (!densityMenuRef.current) return;
      if (!densityMenuRef.current.contains(e.target)) setShowDensityMenu(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // celebration canvas moved to component

  // date helpers moved to utils/date.js

  async function saveMonthToCloud(userId, monthKey, monthMap) {
    const docRef = db.collection('users').doc(userId).collection('todos').doc(monthKey);
    debugCloud('saveMonth', { userId, monthKey, days: Object.keys(monthMap || {}).length });
    // Merge the provided days into the 'todos' map without overwriting other days
    await docRef.set({ updatedAt: new Date(), todos: monthMap || {} }, { merge: true });
  }

  async function saveDayToCloud(userId, dateKey, listForDay) {
    const monthKey = monthKeyFromDateKey(dateKey);
    const docRef = db.collection('users').doc(userId).collection('todos').doc(monthKey);
    debugCloud('saveDay', { userId, dateKey, monthKey, count: (listForDay || []).length });
    // Merge only this day under the 'todos' map
    await docRef.set({ updatedAt: new Date(), todos: { [dateKey]: listForDay || [] } }, { merge: true });
  }

  async function deleteDayFromCloud(userId, dateKey) {
    const monthKey = monthKeyFromDateKey(dateKey);
    const docRef = db.collection('users').doc(userId).collection('todos').doc(monthKey);
    try {
      debugCloud('deleteDay', { userId, dateKey, monthKey });
      // Use set with merge and FieldValue.delete to reliably remove nested day key
      await docRef.set(
        { updatedAt: new Date(), todos: { [dateKey]: firebase.firestore.FieldValue.delete() } },
        { merge: true }
      );
    } catch (err) {
      // If doc doesn't exist or update fails, ignore silently
      // A subsequent save will create the doc as needed
      console.warn('Cloud deleteDay failed (non-fatal)', err);
    }
  }

  async function loadMonthFromCloud(userId, monthKey) {
    const docRef = db.collection('users').doc(userId).collection('todos').doc(monthKey);
    const snap = await docRef.get();
    if (!snap.exists) return {};
    const data = snap.data() || {};
    return data.todos || data.tasksMap || data.dates || {};
  }

  async function ensureMonthLoaded(userId, monthKey) {
    if (loadedMonthsRef.current.has(monthKey)) return;
    loadedMonthsRef.current.add(monthKey);
    try {
      // New schema: read tasks and notes for month via repositories
      if (!taskRepoRef.current || !noteRepoRef.current) return;
      const [y, m] = monthKey.split('-');
      const start = new Date(Number(y), Number(m) - 1, 1);
      const end = new Date(Number(y), Number(m), 1);
      const tasks = await taskRepoRef.current.fetchTasksInRange(start, end);
      const notes = await noteRepoRef.current.fetchMonthNotes(monthKey);
      const byDate = {};
      tasks.forEach(t => {
        const dk = t.dateKey;
        if (!byDate[dk]) byDate[dk] = [];
        // Ensure UI expects 'due' to be present
        byDate[dk].push({ ...t, due: dk });
      });
      notes.forEach(n => {
        const dk = n.dateKey;
        const existing = byDate[dk] || [];
        const list = existing.slice();
        if (n.content) list.push({ id: 'day_note', due: dk, dayNote: n.content, createdAt: n.updatedAt || new Date().toISOString() });
        byDate[dk] = list;
        // Also update notesCache
        setNotesCache(prev => new Map(prev).set(dk, n));
      });
      setTasksMap((prev) => mergeTasksMaps(prev, byDate));
    } catch (e) {
      console.error('Failed to load month from cloud', e);
    }
  }

  function mergeTaskListsById(localList, cloudList) {
    const byId = new Map();
    for (const t of localList || []) byId.set(t.id, t);
    for (const t of cloudList || []) {
      if (!byId.has(t.id)) byId.set(t.id, t);
      else {
        const existing = byId.get(t.id);
        // Prefer cloud (t) over local (existing) on conflicts
        byId.set(t.id, { ...existing, ...t });
      }
    }
    return Array.from(byId.values());
  }

  function sortTasksByCreatedDesc(list) {
    return [...(list || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  async function refreshDayFromCloud(userId, dateKey) {
    try {
      if (!taskRepoRef.current || !noteRepoRef.current) return;
      const tasks = await taskRepoRef.current.fetchTasksForDate(dateKey);
      const tasksWithDue = (tasks || []).map(t => ({ ...t, due: dateKey }));
      const note = await noteRepoRef.current.getDayNote(dateKey);
      // Merge with existing local tasks for that day by id, preserving note item
      setTasksMap((prev) => {
        const prevList = prev[dateKey] || [];
        const { taskList: localTasks, noteItem: localNote } = splitDayList(prevList);
        const byId = new Map(localTasks.map((t) => [t.id, t]));
        for (const t of tasksWithDue) {
          const existing = byId.get(t.id);
          byId.set(t.id, existing ? { ...existing, ...t } : t);
        }
        const mergedTasks = sortTasksByCreatedDesc(Array.from(byId.values()));
        const dayNoteItem = note?.content
          ? { id: 'day_note', due: dateKey, dayNote: note.content, createdAt: note.updatedAt || localNote?.createdAt || new Date().toISOString() }
          : localNote || null;
        const fullList = mergeDayList(mergedTasks, dayNoteItem);
        const next = { ...prev };
        if (fullList.length) next[dateKey] = fullList; else delete next[dateKey];
        return next;
      });
      // Also update notesCache
      if (note) {
        setNotesCache(prev => new Map(prev).set(dateKey, note));
      } else {
        setNotesCache(prev => {
          const newMap = new Map(prev);
          newMap.delete(dateKey);
          return newMap;
        });
      }
    } catch (e) {
      console.error('Failed to refresh day from cloud', e);
    }
  }

  async function saveStreakToCloud(userId, s) {
    const docRef = db.collection('users').doc(userId).collection('meta').doc('streakInfo');
    await docRef.set({
      current: Number(s?.current) || 0,
      longest: Number(s?.longest) || 0,
      lastEarnedDateKey: s?.lastEarnedDateKey || null,
      updatedAt: new Date(),
    }, { merge: true });
  }

  function todayKey() {
    return keyFor(new Date());
  }

  function yesterdayKey() {
    return keyFor(addDays(new Date(), -1));
  }

  function ensureStreakUpToDate(s) {
    try {
      const t = todayKey();
      const y = yesterdayKey();
      if (s?.lastEarnedDateKey === t || s?.lastEarnedDateKey === y) return s;
      return { current: 0, longest: Number(s?.longest) || 0, lastEarnedDateKey: null };
    } catch {
      return { current: 0, longest: Number(s?.longest) || 0, lastEarnedDateKey: null };
    }
  }

  // Auth listener
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        habitsSyncReadyRef.current = false;
        // Initialize repositories for the new user
        taskRepoRef.current = createTaskRepository(u.uid);
        noteRepoRef.current = createDayNoteRepository(u.uid);
        snippetRepoRef.current = createSnippetRepository(u.uid);
        momentRepoRef.current = createMomentRepository(u.uid);
        habitRepoRef.current = createHabitRepository(u.uid);
        // Warm snippet cache from cloud (non-blocking) and refresh local cache
        try {
          snippetRepoRef.current.listSnippets({ includeArchived: false, limit: 500 }).then((items) => setSnippetsCache(items)).catch(() => {});
        } catch {}
        
        // Load moments cache
        try {
          momentRepoRef.current.fetchMoments({ limit: 500 }).then((items) => setMomentsCache(items)).catch(() => {});
        } catch {}

        // Load habits cache and merge with local
        try {
          const cloudHabbits = await habitRepoRef.current.loadHabbits();
          setHabbits((prev) => {
            const merged = mergeHabbits(prev, cloudHabbits);
            try { saveHabbits(merged); } catch {}
            return merged;
          });
        } catch (err) {
          console.error('Failed to load habits from cloud', err);
        } finally {
          habitsSyncReadyRef.current = true;
        }
        
                // Load current month from Firestore and merge with local
        try {
          const currentMonthKey = monthKeyFromDate(new Date());
          let monthMap = {};
          if (taskRepoRef.current && noteRepoRef.current) {
            const [y, m] = currentMonthKey.split('-');
            const start = new Date(Number(y), Number(m) - 1, 1);
            const end = new Date(Number(y), Number(m), 1);
            const tasks = await taskRepoRef.current.fetchTasksInRange(start, end);
            const notes = await noteRepoRef.current.fetchMonthNotes(currentMonthKey);
            const byDate = {};
            tasks.forEach(t => {
              const dk = t.dateKey;
              if (!byDate[dk]) byDate[dk] = [];
              byDate[dk].push({ ...t, due: dk });
            });
            notes.forEach(n => {
              const dk = n.dateKey;
              const existing = byDate[dk] || [];
              const list = existing.slice();
              if (n.content) list.push({ id: 'day_note', due: dk, dayNote: n.content, createdAt: n.updatedAt || new Date().toISOString() });
              byDate[dk] = list;
            });
            monthMap = byDate;
          }
          
          hasLoadedCloud.current = true;
          loadedMonthsRef.current.add(currentMonthKey);
          setTasksMap((prev) => {
            const merged = mergeTasksMaps(prev, monthMap);
            // TODO: Convert existing local data to new schema format
            // For now, we'll keep the old sync logic but mark it for removal
            try {
              const months = new Set(Object.keys(merged).map((k) => monthKeyFromDateKey(k)));
              months.forEach((m) => {
                const mMap = getMonthMapFor(merged, m);
                // TODO: Convert to new schema and save using firebaseService
                // saveMonthToCloud(u.uid, m, mMap).catch((err) => console.error('Cloud month sync failed', err));
              });
            } catch (err) {
              console.error('Bulk month sync failed', err);
            }
            return merged;
          });

          // Feature flag: recurring tasks (default enabled). Stored at
          // /users/{uid}/meta/featureFlag { recurringTasks: boolean }
          try {
            const flagRef = db.collection('users').doc(u.uid).collection('meta').doc('featureFlag');
            const flagDoc = await flagRef.get();
            let enabled = true;
            if (flagDoc.exists) enabled = !!(flagDoc.data()?.recurringTasks ?? true);
            setRecurringEnabled(enabled);
            if (!flagDoc.exists) await flagRef.set({ recurringTasks: true }, { merge: true });
          } catch (err) {
            console.warn('Feature flag fetch failed; defaulting to enabled', err);
            setRecurringEnabled(true);
          }

          // Feature flag: pomodoro timer (default enabled). Stored at
          // /users/{uid}/meta/featureFlag { pomodoroTimer: boolean }
          try {
            const flagRef = db.collection('users').doc(u.uid).collection('meta').doc('featureFlag');
            const flagDoc = await flagRef.get();
            let enabled = true;
            if (flagDoc.exists) enabled = !!(flagDoc.data()?.pomodoroTimer ?? true);
            setPomodoroEnabled(enabled);
            if (!flagDoc.exists) await flagRef.set({ pomodoroTimer: true }, { merge: true });
          } catch (err) {
            console.warn('Pomodoro feature flag fetch failed; defaulting to enabled', err);
            setPomodoroEnabled(true);
          }

          // Feature flag: delete all tasks (default disabled). Stored at
          // /users/{uid}/meta/featureFlag { deleteAllTasks: boolean }
          try {
            const delFlagRef = db.collection('users').doc(u.uid).collection('meta').doc('featureFlag');
            const delFlagDoc = await delFlagRef.get();
            let enabled = false;
            if (delFlagDoc.exists) enabled = !!(delFlagDoc.data()?.deleteAllTasks ?? false);
            setDeleteAllTasksEnabled(enabled);
            if (!delFlagDoc.exists) await delFlagRef.set({ deleteAllTasks: false }, { merge: true });
          } catch (err) {
            console.warn('Delete-all flag fetch failed; defaulting to disabled', err);
            setDeleteAllTasksEnabled(false);
          }

          // Load recurring series from cloud '/users/{uid}/meta/recurringTasks' collection
          try {
            const cloudRecurringSeries = await taskRepoRef.current.loadRecurringSeries();
            // Database is source of truth - replace local with cloud data
            setRecurringSeries(cloudRecurringSeries);
            // Also save to local storage for offline access
            try { saveRecurringSeries(cloudRecurringSeries); } catch {}
          } catch (err) {
            console.error('Failed to load recurring series from cloud', err);
            // Fallback to local storage if cloud load fails
            const localSeries = loadRecurringSeries();
            setRecurringSeries(localSeries);
          }

          // Load streak from cloud '/users/{uid}/meta/streakInfo' doc and merge
          try {
            const streakDoc = await db.collection('users').doc(u.uid).collection('meta').doc('streakInfo').get();
            const si = streakDoc.exists ? (streakDoc.data() || {}) : {};
            const cloudStreak = {
              current: Number(si.current) || 0,
              longest: Number(si.longest) || 0,
              lastEarnedDateKey: si.lastEarnedDateKey || null,
            };
            const localStreak = loadStreak();
            const mergedStreak = ensureStreakUpToDate({
              current: cloudStreak.current ?? localStreak.current ?? 0,
              longest: Math.max(Number(localStreak.longest) || 0, Number(cloudStreak.longest) || 0),
              lastEarnedDateKey: cloudStreak.lastEarnedDateKey || localStreak.lastEarnedDateKey || null,
            });
            setStreak(mergedStreak);
          } catch (err) {
            console.error('Failed to load streak from cloud', err);
            setStreak((s) => ensureStreakUpToDate(s));
          }
        } catch (e) {
          console.error('Failed to load current month from cloud', e);
        }
      } else {
        hasLoadedCloud.current = false;
        loadedMonthsRef.current = new Set();
        taskRepoRef.current = null;
        noteRepoRef.current = null;
        snippetRepoRef.current = null;
        momentRepoRef.current = null;
        habitRepoRef.current = null;
        habitsSyncReadyRef.current = false;
        setSnippetsCache([]);
        setRecurringEnabled(false); // Disable recurring tasks when not logged in
        setDeleteAllTasksEnabled(false);
        setStreak((s) => ensureStreakUpToDate(s));
        
        // Clear recurring tasks when user is not logged in
        setRecurringSeries([]);
        try { saveRecurringSeries([]); } catch {}
      }
    });
    return () => unsub();
  }, []);

  // Lazy-load month data when user navigates months
  useEffect(() => {
    if (!user) return;
    const mk = monthKeyFromDate(monthStart);
    if (loadedMonthsRef.current.has(mk)) return;
    ensureMonthLoaded(user.uid, mk);
  }, [user, monthStart]);

  // No effect-based triggers; we trigger celebration directly from user actions when a day becomes fully complete.

  function mergeTasksMaps(localMap, cloudMap) {
    const result = { ...localMap };
    for (const dateKey of Object.keys(cloudMap || {})) {
      const localList = result[dateKey] || [];
      const cloudList = cloudMap[dateKey] || [];
      const byId = new Map();
      for (const t of localList) byId.set(t.id, t);
      for (const t of cloudList) {
        if (!byId.has(t.id)) byId.set(t.id, t);
        else {
          const existing = byId.get(t.id);
          // Prefer cloud task over local task on conflicts
          byId.set(t.id, { ...existing, ...t });
        }
      }
      const mergedList = Array.from(byId.values());
      if (mergedList.length) result[dateKey] = mergedList; else delete result[dateKey];
    }
    return result;
  }

  async function signInWithGoogle() {
    try {
      await auth.signInWithPopup(googleProvider);
    } catch (e) {
      // Some environments with COOP/COEP block popup cleanup; fall back to redirect
      console.warn('Popup sign-in failed, falling back to redirect', e);
      try {
        await auth.signInWithRedirect(googleProvider);
      } catch (err) {
        alert('Sign-in failed');
        console.error(err);
      }
    }
  }

  async function signOut() {
    try {
      await auth.signOut();
    } catch (e) {
      console.error(e);
    }
  }

  // header avatar moved to Header

  const monthDays = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = [];
    let day = start;
    while (day <= end) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [cursor]);

  function nextMonth() {
    setCursor((prev) => addMonths(prev, 1));
  }
  function prevMonth() {
    setCursor((prev) => subMonths(prev, 1));
  }

  function nextWeek() {
    setCursor((prev) => addDays(prev, 7));
    setSelectedDate((prev) => addDays(prev, 7));
  }
  function prevWeek() {
    setCursor((prev) => addDays(prev, -7));
    setSelectedDate((prev) => addDays(prev, -7));
  }
  function nextYear() {
    setCursor((prev) => addMonths(prev, 12));
    setSelectedDate((prev) => addMonths(prev, 12));
  }
  function prevYear() {
    setCursor((prev) => addMonths(prev, -12));
    setSelectedDate((prev) => addMonths(prev, -12));
  }
  function nextDay() {
    setCursor((prev) => addDays(prev, 1));
    setSelectedDate((prev) => addDays(prev, 1));
  }
  function prevDay() {
    setCursor((prev) => addDays(prev, -1));
    setSelectedDate((prev) => addDays(prev, -1));
  }

  function isNoteItem(item) {
    return item && item.id === 'day_note';
  }

  function splitDayList(list) {
    const noteItem = (list || []).find((t) => isNoteItem(t)) || null;
    const taskList = (list || []).filter((t) => !isNoteItem(t));
    return { taskList, noteItem };
  }

  function mergeDayList(taskList, noteItem) {
    return noteItem ? [...(taskList || []), noteItem] : [...(taskList || [])];
  }

  function tasksFor(date) {
    const list = tasksMap[keyFor(date)] || [];
    const { taskList } = splitDayList(list);
    return sortTasksByCreatedDesc(taskList);
  }

  // Get incomplete tasks for a date
  function getIncompleteTasksFor(date) {
    const tasks = tasksFor(date);
    return tasks.filter(t => !t.done);
  }

  // Feature flag to enable/disable motivational messages
  const ENABLE_MOTIVATIONAL_MESSAGES = false;

  // Motivational message component - memoizes message to prevent changing on re-renders
  function MotivationalMessage({ date, incompleteTasks }) {
    // Disabled via feature flag - can be re-enabled by setting ENABLE_MOTIVATIONAL_MESSAGES to true
    if (!ENABLE_MOTIVATIONAL_MESSAGES) return null;
    
    const dateKey = keyFor(date);
    const today = new Date();
    const todayStart = startOfDay(today);
    const dateStart = startOfDay(date);
    const isDateTodayOrPast = !isAfter(dateStart, todayStart);
    const shouldShowMessage = incompleteTasks.length > 0 && isDateTodayOrPast;
    
    // Memoize the message so it doesn't change on every re-render
    // Only changes when dateKey or incompleteTasks.length changes
    const motivationalMessage = useMemo(() => {
      if (!shouldShowMessage) return null;
      return getMotivationalMessageForCount(incompleteTasks.length);
    }, [dateKey, incompleteTasks.length, shouldShowMessage]);
    
    if (!shouldShowMessage || !motivationalMessage) return null;
    
    return (
      <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          {motivationalMessage}
        </p>
      </div>
    );
  }

  // Recurrence materialization
  function getMaterializationWindow() {
    const start = startOfMonth(addMonths(monthStart, -1));
    const end = endOfMonth(addMonths(monthStart, 1));
    return { start, end };
  }

  function mergeWithRecurringInstances(baseMap, recMap) {
    const output = { ...baseMap };
    for (const [dateKey, recList] of Object.entries(recMap || {})) {
      const prevList = output[dateKey] || [];
      const { taskList, noteItem } = splitDayList(prevList);
      const byId = new Map(taskList.map((t) => [t.id, t]));
      
      // For recurring instances, prefer the materialized version to ensure series updates are reflected
      for (const rt of recList) {
        if (byId.has(rt.id)) {
          const existing = byId.get(rt.id);
          // If this is a recurring instance, prefer the materialized version for series properties
          if (rt.isRecurringInstance) {
            byId.set(rt.id, { 
              ...existing,           // Keep existing overrides and completion status
              title: rt.title,       // But use series title
              notes: rt.notes,       // And series notes
              priority: rt.priority, // And series priority
              subtasks: rt.subtasks, // And series subtasks
            });
          } else {
            // For non-recurring, keep existing as source of truth
            byId.set(rt.id, { ...rt, ...existing });
          }
        } else {
          byId.set(rt.id, rt);
        }
      }
      const mergedTasks = sortTasksByCreatedDesc(Array.from(byId.values()));
      const full = mergeDayList(mergedTasks, noteItem);
      if (full.length) output[dateKey] = full; else delete output[dateKey];
    }
    return output;
  }

  useEffect(() => {
    if (!recurringEnabled) return;
    try {
      const { start, end } = getMaterializationWindow();
      const recMap = materializeSeries(recurringSeries, start, end);
      setTasksMap((prev) => mergeWithRecurringInstances(prev, recMap));
    } catch (e) {
      console.error('Failed to materialize recurring series', e);
    }
  }, [cursor, recurringSeries, recurringEnabled]);
  


  function getDayNoteByKey(dateKey) {
    const list = tasksMap[dateKey] || [];
    const noteItem = list.find((t) => isNoteItem(t));
    return noteItem?.dayNote || "";
  }

  async function saveDayNoteForKey(dateKey, noteText) {
    const text = (noteText || "").trim();
    // Build the new full list from current state
    const prevList = tasksMap[dateKey] || [];
    const { taskList, noteItem } = splitDayList(prevList);
    const newNoteItem = text
      ? {
          id: 'day_note',
          due: dateKey,
          dayNote: text,
          createdAt: noteItem?.createdAt || new Date().toISOString(),
        }
      : null;
    const sortedTasks = sortTasksByCreatedDesc(taskList);
    const fullList = mergeDayList(sortedTasks, newNoteItem);
    // Update local state immediately
    setTasksMap((prev) => {
      const updated = { ...prev };
      if (fullList.length) updated[dateKey] = fullList; else delete updated[dateKey];
      return updated;
    });
    // Inform NotesPage feed immediately
    try {
      const event = new CustomEvent('daynote:saved', { detail: { dateKey, content: text } });
      window.dispatchEvent(event);
    } catch {}
    // Persist to cloud using flat schema
    try {
      if (user && noteRepoRef.current) {
        if (text) {
          await noteRepoRef.current.saveDayNote(dateKey, text);
        } else {
          await noteRepoRef.current.deleteDayNote(dateKey);
        }
      }
    } catch (err) {
      console.error('Cloud saveDayNote failed', err);
    }
  }

  function hasNoteForDay(date) {
    try {
      const dk = keyFor(date);
      // Check tasksMap for legacy notes
      const list = tasksMap[dk] || [];
      const hasLegacyNote = list.some((t) => isNoteItem(t) && (t.dayNote || "").trim().length > 0);
      // Check notesCache for new notes
      const hasNewNote = notesCache.has(dk) && notesCache.get(dk)?.content?.trim().length > 0;
      return hasLegacyNote || hasNewNote;
    } catch { return false; }
  }

  function addHabit(title) {
    const trimmed = String(title || "").trim();
    if (!trimmed) return;
    setHabbits((prev) => [
      {
        id: generateId(),
        title: trimmed,
        history: {},
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  function toggleHabitForDay(habitId, dateKey) {
    if (!habitId || !dateKey) return;
    setHabbits((prev) =>
      prev.map((habit) => {
        if (habit.id !== habitId) return habit;
        const history = habit.history && typeof habit.history === "object" ? habit.history : {};
        const done = !!history[dateKey];
        if (done) {
          const { [dateKey]: _removed, ...rest } = history;
          return { ...habit, history: rest };
        }
        return { ...habit, history: { ...history, [dateKey]: true } };
      })
    );
  }

  function deleteHabit(habitId) {
    if (!habitId) return;
    setHabbits((prev) => prev.filter((habit) => habit.id !== habitId));
  }

  function mergeHabbits(localItems, cloudItems) {
    const localList = Array.isArray(localItems) ? localItems : [];
    const cloudList = Array.isArray(cloudItems) ? cloudItems : [];
    const byId = new Map();
    for (const item of localList) {
      if (!item?.id) continue;
      byId.set(item.id, item);
    }
    for (const item of cloudList) {
      if (!item?.id) continue;
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
        continue;
      }
      byId.set(item.id, {
        ...existing,
        ...item,
        history: {
          ...(existing?.history && typeof existing.history === 'object' ? existing.history : {}),
          ...(item?.history && typeof item.history === 'object' ? item.history : {}),
        },
      });
    }
    return Array.from(byId.values());
  }

  // Navigate to search result item
  function navigateToSearchResult(result) {
    try {
      // Snippet: open snippets modal focused on that snippet
      if (result.type === 'snippet') {
        setShowSearch(false);
        setSearchQuery("");
        // Close day notes drawer if open to avoid conflicts
        setShowNotes(false);
        setSnippetsDrawerId(result.id);
        setSnippetsDrawerOpen(true);
        return;
      }

      // Moment: switch to moments tab and scroll to moment
      if (result.type === 'moment') {
        setShowSearch(false);
        setSearchQuery("");
        setActiveTab('moments');
        
        // Scroll to the specific moment after a short delay to allow tab switch
        setTimeout(() => {
          const momentElement = document.getElementById(`moment-${result.id}`);
          if (momentElement) {
            momentElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
            // Add a temporary highlight effect using CSS class
            momentElement.classList.add('ring-4', 'ring-blue-500', 'ring-opacity-50');
            setTimeout(() => {
              momentElement.classList.remove('ring-4', 'ring-blue-500', 'ring-opacity-50');
            }, 2000);
          }
        }, 100);
        return;
      }

      const dateKey = result.dateKey;
      const date = parseISO(dateKey);

      setSelectedDate(date);
      setCursor(date);

      setShowSearch(false);
      setSearchQuery("");

      if (result.type === 'note') {
        // Close snippets drawer if open to avoid conflicts
        setSnippetsDrawerOpen(false);
        setShowNotes(true);
      }
      
      // TODO: In future phases, we can add highlighting and scrolling to specific tasks
    } catch (error) {
      console.error('Failed to navigate to search result:', error);
    }
  }

  // Build a flattened list of this month's incomplete tasks from past days only
  const missedTasksThisMonth = useMemo(() => {
    const today = new Date();
    const currentMonthKey = monthKeyFromDate(monthStart);
    const items = [];
    for (const [dateKey, list] of Object.entries(tasksMap || {})) {
      if (!dateKey.startsWith(currentMonthKey + "-")) continue;
      const dateObj = parseISO(dateKey);
      // only past dates strictly before today
      if (dateObj >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) continue;
      for (const t of list) {
        if (isNoteItem(t)) continue;
        if (!t.done) items.push(t);
      }
    }
    // newest first like the rest of the app
    return sortTasksByCreatedDesc(items);
  }, [tasksMap, monthStart]);

  // Build missed tasks for the current week window (Mon-Sun) for Week view aside
  const missedTasksThisWeek = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    const end = endOfWeek(cursor, { weekStartsOn: 1 });
    const items = [];
    for (const [dateKey, list] of Object.entries(tasksMap || {})) {
      const dateObj = parseISO(dateKey);
      if (dateObj < start || dateObj > end) continue;
      // only past dates strictly before today
      const todayStart = new Date();
      const clampToday = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate());
      if (dateObj >= clampToday) continue;
      for (const t of list) {
        if (isNoteItem(t)) continue;
        if (!t.done) items.push(t);
      }
    }
    return sortTasksByCreatedDesc(items);
  }, [tasksMap, cursor]);

  function openAddModal(date) {
    setSelectedDate(date);
    setForm({ title: "", notes: "", priority: "medium", subtasks: [] });
    setShowAdd(true);
  }

  async function addTask(e, options = {}) {
    e.preventDefault();
    const key = keyFor(selectedDate);
    const subtasks = (Array.isArray(form.subtasks) ? form.subtasks : [])
      .map((st) => ({ id: st.id || generateId(), title: (st.title || '').trim(), done: !!st.done, createdAt: new Date().toISOString() }))
      .filter((st) => !!st.title);
    const wantsRecurrence = recurringEnabled && form?.recurrence && form.recurrence.frequency && form.recurrence.frequency !== 'none';
    if (wantsRecurrence) {
      const seriesId = `rec_${generateId()}`;
      const series = {
        id: seriesId,
        title: form.title || 'Untitled',
        notes: form.notes || '',
        priority: form.priority || 'medium',
        subtasks: subtasks.length ? subtasks : [],
        startDateKey: key,
        recurrence: {
          frequency: form.recurrence.frequency,
          interval: Math.max(1, Number(form.recurrence.interval) || 1),
          ...(form.recurrence.frequency === 'weekly' ? { byWeekday: Array.isArray(form.recurrence.byWeekday) ? form.recurrence.byWeekday.map(Number) : [] } : {}),
          ...(form.recurrence.frequency === 'monthly' ? { byMonthday: Array.isArray(form.recurrence.byMonthday) ? form.recurrence.byMonthday.map(Number) : [] } : {}),
          ends: form.recurrence.ends?.type ? form.recurrence.ends : { type: 'never' },
        },
        exceptions: [],
        overrides: {},
      };
      setRecurringSeries((prev) => [...prev, series]);
      
      // Save to Firestore if user is logged in
      if (user && taskRepoRef.current) {
        try {
          await taskRepoRef.current.saveRecurringSeries(series);
        } catch (err) {
          console.error('Failed to save recurring series to cloud', err);
        }
      }
      
      // Materialize immediately (effect will also run)
      try {
        const { start, end } = getMaterializationWindow();
        const recMap = materializeSeries([series], start, end);
        setTasksMap((prev) => mergeWithRecurringInstances(prev, recMap));
      } catch {}
      if (options?.addAnother) {
        setForm({ title: "", notes: "", priority: "medium", subtasks: [], recurrence: { frequency: 'none', interval: 1 } });
        setShowAdd(true);
      } else {
        setShowAdd(false);
      }
      return;
    }
    const newTask = {
      id: generateId(),
      title: form.title || "Untitled",
      notes: form.notes || "",
      done: false,
      priority: form.priority || "medium",
      due: key,
      createdAt: new Date().toISOString(),
      ...(subtasks.length ? { subtasks } : {}),
    };
    setTasksMap((prev) => {
      const prevList = prev[key] || [];
      const { taskList, noteItem } = splitDayList(prevList);
      const updatedTasks = sortTasksByCreatedDesc([newTask, ...taskList]);
      // Adding a new incomplete task should not trigger; guard by checking prev->new transition
      const fullList = mergeDayList(updatedTasks, noteItem);
      const updated = { ...prev, [key]: fullList };
      if (user && taskRepoRef.current) {
        taskRepoRef.current.saveTask(key, newTask).catch((err) => console.error('Cloud addTask failed', err));
      }
      return updated;
    });
    if (options?.addAnother) {
      setForm({ title: "", notes: "", priority: "medium", subtasks: [] });
      setShowAdd(true);
    } else {
      setShowAdd(false);
    }
  }

  function openEditModal(task) {
    // For recurring tasks, show scope dialog first
    if (task?.isRecurringInstance && task.seriesId) {
      scopeActionRef.current = { type: 'edit', task };
      setScopeDialogOpen(true);
      return;
    }
    
    setEditTask(task);
    setEditForm({
      title: task.title,
      notes: task.notes,
      priority: task.priority || 'medium',
      subtasks: Array.isArray(task.subtasks)
        ? task.subtasks.map((st) => ({
            id: st.id || generateId(),
            title: st.title || '',
            done: !!st.done,
            createdAt: st.createdAt || new Date().toISOString(),
          }))
        : [],
    });
    setShowEdit(true);
  }

  function saveEdit(e) {
    e.preventDefault();
    if (!editTask) return;
    
    // Handle series-wide edit
    if (editTask.isEditingSeries && editTask.series) {
      const sanitizedSubs = Array.isArray(editForm.subtasks)
        ? editForm.subtasks
            .map((st) => ({
              id: st.id || generateId(),
              title: (st.title || '').trim(),
              done: !!st.done,
              createdAt: st.createdAt || new Date().toISOString(),
            }))
            .filter((st) => !!st.title)
        : [];
      
      // Update the series - the materialization effect will handle updating all instances
      setRecurringSeries((prevSeries) => {
        const updated = prevSeries.map((s) => {
          if (s.id !== editTask.series.id) return s;
          const newSeries = {
            ...s,
            title: editForm.title || 'Untitled',
            notes: editForm.notes || '',
            priority: editForm.priority || 'medium',
            subtasks: sanitizedSubs,
          };
          return newSeries;
        });
        // Force a new array reference to ensure React detects the change
        const result = [...updated];
        
        // Save updated series to Firestore if user is logged in
        if (user && taskRepoRef.current) {
          const updatedSeries = result.find(s => s.id === editTask.series.id);
          if (updatedSeries) {
            taskRepoRef.current.saveRecurringSeries(updatedSeries).catch(err => {
              console.error('Failed to save updated recurring series to cloud', err);
            });
          }
        }
        
        return result;
      });
      
      setShowEdit(false);
      setEditTask(null);
      return;
    }
    
    // Handle single occurrence edit (existing logic)
    setTasksMap((prev) => {
      const prevList = prev[editTask.due] || [];
      const { taskList, noteItem } = splitDayList(prevList);
      const list = taskList.map((t) => {
        if (t.id !== editTask.id) return t;
        const sanitizedSubs = Array.isArray(editForm.subtasks)
          ? editForm.subtasks
              .map((st) => ({
                id: st.id || generateId(),
                title: (st.title || '').trim(),
                done: !!st.done,
                createdAt: st.createdAt || new Date().toISOString(),
              }))
              .filter((st) => !!st.title)
          : [];
        const parentDone = sanitizedSubs.length > 0 ? sanitizedSubs.every((st) => st.done) : t.done;
        const updated = {
          ...t,
          title: editForm.title || 'Untitled',
          notes: editForm.notes || '',
          priority: editForm.priority || 'medium',
          done: parentDone,
          ...(sanitizedSubs.length ? { subtasks: sanitizedSubs } : { subtasks: [] }),
        };
        if (t.isRecurringInstance && t.seriesId) {
          setRecurringSeries((prevSeries) => prevSeries.map((s) => {
            if (s.id !== t.seriesId) return s;
            const ov = { ...(s.overrides || {}) };
            ov[t.due] = {
              title: updated.title,
              notes: updated.notes,
              priority: updated.priority,
              done: updated.done,
              subtasks: updated.subtasks || [],
            };
            return { ...s, overrides: ov };
          }));
        }
        return updated;
      });
      const sortedTasks = sortTasksByCreatedDesc(list);
      const fullList = mergeDayList(sortedTasks, noteItem);
      const updated = { ...prev, [editTask.due]: fullList };
      if (user && taskRepoRef.current) {
        const updatedTask = list.find(t => t.id === editTask.id);
        if (updatedTask) {
          const safeTaskBase = {
            ...updatedTask,
            subtasks: Array.isArray(updatedTask.subtasks) ? updatedTask.subtasks : [],
            isRecurringInstance: !!updatedTask.isRecurringInstance,
          };
          const safeTask = updatedTask.isRecurringInstance
            ? { ...safeTaskBase, seriesId: updatedTask.seriesId || null }
            : { ...safeTaskBase };
          taskRepoRef.current.saveTask(editTask.due, safeTask).catch((err) => console.error('Cloud saveEdit failed', err));
        }
      }
      return updated;
    });
    setShowEdit(false);
    setEditTask(null);
  }

  function toggleDone(task) {
    setTasksMap((prev) => {
      const prevList = prev[task.due] || [];
      const { taskList, noteItem } = splitDayList(prevList);
      const list = taskList.map((t) => {
        if (t.id !== task.id) return t;
        const nextDone = !t.done;
        // If marking parent task done, also mark all subtasks done for coherence
        const nextSubtasks = Array.isArray(t.subtasks)
          ? t.subtasks.map((st) => ({ ...st, done: nextDone ? true : st.done }))
          : [];
        const updated = { ...t, done: nextDone, subtasks: nextSubtasks };
        // For recurring instances, persist override to series
        if (t.isRecurringInstance && t.seriesId) {
          setRecurringSeries((prevSeries) => {
            const next = prevSeries.map((s) => {
              if (s.id !== t.seriesId) return s;
              const ov = { ...(s.overrides || {}) };
              ov[t.due] = {
                ...(ov[t.due] || {}),
                done: updated.done,
                subtasks: Array.isArray(updated.subtasks) ? updated.subtasks : [],
              };
              const updatedSeries = { ...s, overrides: ov };
              
              // Save updated series to Firestore if user is logged in
              if (user && taskRepoRef.current) {
                taskRepoRef.current.saveRecurringSeries(updatedSeries).catch(err => {
                  console.error('Failed to save updated recurring series to cloud', err);
                });
              }
              
              return updatedSeries;
            });
            return next;
          });
        }
        return updated;
      });
      const prevAllDone = taskList.length > 0 && taskList.every((t) => t.done);
      const newAllDone = list.length > 0 && list.every((t) => t.done);
      if (!prevAllDone && newAllDone) {
        triggerCelebration(task.due);
        // Streak can only be earned for today
        if (task.due === todayKey()) {
          setStreak((s) => {
            const y = yesterdayKey();
            const nextCurrent = s?.lastEarnedDateKey === y ? (Number(s?.current) || 0) + 1 : 1;
            const nextLongest = Math.max(Number(s?.longest) || 0, nextCurrent);
            const next = { current: nextCurrent, longest: nextLongest, lastEarnedDateKey: todayKey() };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }
      if (prevAllDone && !newAllDone) {
        // If undoing completion for today after earning, revert streak
        if (task.due === todayKey()) {
          setStreak((s) => {
            if (s?.lastEarnedDateKey !== todayKey()) return s;
            const decreased = Math.max(0, (Number(s?.current) || 0) - 1);
            const newLast = decreased > 0 ? yesterdayKey() : null;
            const next = { current: decreased, longest: Number(s?.longest) || 0, lastEarnedDateKey: newLast };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }
      const sortedTasks = sortTasksByCreatedDesc(list);
      const fullList = mergeDayList(sortedTasks, noteItem);
      const updated = { ...prev, [task.due]: fullList };
      if (user && taskRepoRef.current) {
        const updatedTask = list.find(t => t.id === task.id);
        if (updatedTask) {
          // Ensure no undefined fields before saving
          const safeTaskBase = {
            ...updatedTask,
            subtasks: Array.isArray(updatedTask.subtasks) ? updatedTask.subtasks : [],
            isRecurringInstance: !!updatedTask.isRecurringInstance,
          };
          const safeTask = updatedTask.isRecurringInstance
            ? { ...safeTaskBase, seriesId: updatedTask.seriesId || null }
            : { ...safeTaskBase };
          taskRepoRef.current.saveTask(task.due, safeTask).catch((err) => console.error('Cloud toggleDone failed', err));
        }
      }
      return updated;
    });
  }

  function deleteTask(task) {
    // For recurring instance, ask for scope
    if (task?.isRecurringInstance && task.seriesId) {
      scopeActionRef.current = { type: 'delete', task };
      setScopeDialogOpen(true);
      return;
    }
    setTasksMap((prev) => {
      const prevList = prev[task.due] || [];
      const { taskList, noteItem } = splitDayList(prevList);
      const list = taskList.filter((t) => t.id !== task.id);
      const prevAllDone = taskList.length > 0 && taskList.every((t) => t.done);
      const newAllDone = list.length > 0 && list.every((t) => t.done);
      if (!prevAllDone && newAllDone) {
        // Deleting the only incomplete task could complete the day, so trigger
        triggerCelebration(task.due);
        if (task.due === todayKey()) {
          setStreak((s) => {
            const y = yesterdayKey();
            const nextCurrent = s?.lastEarnedDateKey === y ? (Number(s?.current) || 0) + 1 : 1;
            const nextLongest = Math.max(Number(s?.longest) || 0, nextCurrent);
            const next = { current: nextCurrent, longest: nextLongest, lastEarnedDateKey: todayKey() };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }
      if (prevAllDone && !newAllDone) {
        if (task.due === todayKey()) {
          setStreak((s) => {
            if (s?.lastEarnedDateKey !== todayKey()) return s;
            const decreased = Math.max(0, (Number(s?.current) || 0) - 1);
            const newLast = decreased > 0 ? yesterdayKey() : null;
            const next = { current: decreased, longest: Number(s?.longest) || 0, lastEarnedDateKey: newLast };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }
      const copy = { ...prev };
      const sortedTasks = sortTasksByCreatedDesc(list);
      const fullList = mergeDayList(sortedTasks, noteItem);
      if (fullList.length) copy[task.due] = fullList;
      else delete copy[task.due];
      if (user && taskRepoRef.current) {
        (async () => {
          try {
            await taskRepoRef.current.deleteTask(task.id);
          } catch (err) {
            console.error('Cloud deleteTask failed', err);
          }
        })();
      }
      return copy;
    });
  }

  // Scope handlers for recurring actions
  function handleScopeOnlyThis() {
    const payload = scopeActionRef.current;
    setScopeDialogOpen(false);
    if (!payload) return;
    const task = payload.task;
    if (payload.type === 'delete') {
      // Only this occurrence: add exception and remove from local day
      setRecurringSeries((prev) => prev.map((s) => {
        if (s.id !== task.seriesId) return s;
        const ex = Array.isArray(s.exceptions) ? s.exceptions.slice() : [];
        if (!ex.includes(task.due)) ex.push(task.due);
        return { ...s, exceptions: ex };
      }));
      // Remove this instance from local state
      setTasksMap((prev) => {
        const prevList = prev[task.due] || [];
        const { taskList, noteItem } = splitDayList(prevList);
        const list = taskList.filter((t) => t.id !== task.id);
        const sorted = sortTasksByCreatedDesc(list);
        const full = mergeDayList(sorted, noteItem);
        const next = { ...prev };
        if (full.length) next[task.due] = full; else delete next[task.due];
        return next;
      });
    } else if (payload.type === 'edit') {
      // Only this occurrence: open edit modal for current task
      setEditTask(task);
      setEditForm({
        title: task.title,
        notes: task.notes,
        priority: task.priority || 'medium',
        subtasks: Array.isArray(task.subtasks)
          ? task.subtasks.map((st) => ({
              id: st.id || generateId(),
              title: st.title || '',
              done: !!st.done,
              createdAt: st.createdAt || new Date().toISOString(),
            }))
          : [],
      });
      setShowEdit(true);
    }
    scopeActionRef.current = null;
  }

  // Removed 'This and future' flow per product decision

  function handleScopeEntireSeries() {
    const payload = scopeActionRef.current;
    setScopeDialogOpen(false);
    if (!payload) return;
    const task = payload.task;
    if (payload.type === 'delete') {
      // Remove entire series
      setRecurringSeries((prev) => prev.filter((s) => s.id !== task.seriesId));
      
      // Delete from Firestore if user is logged in
      if (user && taskRepoRef.current) {
        taskRepoRef.current.deleteRecurringSeries(task.seriesId).catch(err => {
          console.error('Failed to delete recurring series from cloud', err);
        });
      }
      
      // Remove all materialized instances from local tasks
      setTasksMap((prev) => {
        const next = { ...prev };
        for (const [dateKey, list] of Object.entries(prev)) {
          const { taskList, noteItem } = splitDayList(list);
          const filtered = taskList.filter((t) => t.seriesId !== task.seriesId);
          const merged = mergeDayList(sortTasksByCreatedDesc(filtered), noteItem);
          if (merged.length) next[dateKey] = merged; else delete next[dateKey];
        }
        return next;
      });
    } else if (payload.type === 'edit') {
      // Edit entire series: find the series and open edit modal
      const series = recurringSeries.find(s => s.id === task.seriesId);
      if (series) {
        const editTaskWithSeries = { ...task, isEditingSeries: true, series };
        setEditTask(editTaskWithSeries);
        setEditForm({
          title: series.title,
          notes: series.notes,
          priority: series.priority || 'medium',
          subtasks: Array.isArray(series.subtasks)
            ? series.subtasks.map((st) => ({
                id: st.id || generateId(),
                title: st.title || '',
                done: !!st.done,
                createdAt: st.createdAt || new Date().toISOString(),
              }))
            : [],
        });
        setShowEdit(true);
      } else {
        // Fallback: if series not found, edit just this occurrence
        setEditTask(task);
        setEditForm({
          title: task.title,
          notes: task.notes,
          priority: task.priority || 'medium',
          subtasks: Array.isArray(task.subtasks)
            ? task.subtasks.map((st) => ({
                id: st.id || generateId(),
                title: st.title || '',
                done: !!st.done,
                createdAt: st.createdAt || new Date().toISOString(),
              }))
            : [],
        });
        setShowEdit(true);
      }
    }
    scopeActionRef.current = null;
  }

  // Subtasks: add, toggle, delete
  function addSubtask(parentTask, title) {
    const trimmed = (title || '').trim();
    if (!trimmed) return;
    const dueKey = parentTask.due;
    setTasksMap((prev) => {
      const prevList = prev[dueKey] || [];
      const { taskList, noteItem } = splitDayList(prevList);
      const list = taskList.map((t) => {
        if (t.id !== parentTask.id) return t;
        const currentSubtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
        const newSubtasks = [
          ...currentSubtasks,
          { id: generateId(), title: trimmed, done: false, createdAt: new Date().toISOString() },
        ];
        // Parent is considered done only if all subtasks are done
        const parentDone = newSubtasks.length > 0 ? newSubtasks.every((st) => st.done) : t.done;
        const updated = { ...t, subtasks: newSubtasks, done: parentDone && t.done };
        if (t.isRecurringInstance && t.seriesId) {
          setRecurringSeries((prevSeries) => prevSeries.map((s) => {
            if (s.id !== t.seriesId) return s;
            const ov = { ...(s.overrides || {}) };
            ov[t.due] = {
              ...(ov[t.due] || {}),
              subtasks: updated.subtasks,
              done: updated.done,
            };
            const updatedSeries = { ...s, overrides: ov };
            
            // Save updated series to Firestore if user is logged in
            if (user && taskRepoRef.current) {
              taskRepoRef.current.saveRecurringSeries(updatedSeries).catch(err => {
                console.error('Failed to save updated recurring series to cloud', err);
              });
            }
            
            return updatedSeries;
          }));
        }
        return updated;
      });

      const prevAllDone = taskList.length > 0 && taskList.every((t) => t.done);
      const newAllDone = list.length > 0 && list.every((t) => t.done);
      if (!prevAllDone && newAllDone) {
        triggerCelebration(dueKey);
        if (dueKey === todayKey()) {
          setStreak((s) => {
            const y = yesterdayKey();
            const nextCurrent = s?.lastEarnedDateKey === y ? (Number(s?.current) || 0) + 1 : 1;
            const nextLongest = Math.max(Number(s?.longest) || 0, nextCurrent);
            const next = { current: nextCurrent, longest: nextLongest, lastEarnedDateKey: todayKey() };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }
      if (prevAllDone && !newAllDone) {
        if (dueKey === todayKey()) {
          setStreak((s) => {
            if (s?.lastEarnedDateKey !== todayKey()) return s;
            const decreased = Math.max(0, (Number(s?.current) || 0) - 1);
            const newLast = decreased > 0 ? yesterdayKey() : null;
            const next = { current: decreased, longest: Number(s?.longest) || 0, lastEarnedDateKey: newLast };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }

      const sortedTasks = sortTasksByCreatedDesc(list);
      const fullList = mergeDayList(sortedTasks, noteItem);
      const updated = { ...prev, [dueKey]: fullList };
      if (user && taskRepoRef.current) {
        const updatedTask = list.find(t => t.id === parentTask.id);
        if (updatedTask) taskRepoRef.current.saveTask(dueKey, updatedTask).catch((err) => console.error('Cloud addSubtask failed', err));
      }
      return updated;
    });
  }
  // Skip a recurring occurrence (add to exceptions and remove locally)
  function skipOccurrence(task) {
    if (!task?.isRecurringInstance || !task.seriesId) return;
    setRecurringSeries((prev) => prev.map((s) => {
      if (s.id !== task.seriesId) return s;
      const ex = Array.isArray(s.exceptions) ? s.exceptions.slice() : [];
      if (!ex.includes(task.due)) ex.push(task.due);
      const updatedSeries = { ...s, exceptions: ex };
      
      // Save updated series to Firestore if user is logged in
      if (user && taskRepoRef.current) {
        taskRepoRef.current.saveRecurringSeries(updatedSeries).catch(err => {
          console.error('Failed to save updated recurring series to cloud', err);
        });
      }
      
      return updatedSeries;
    }));
    setTasksMap((prev) => {
      const prevList = prev[task.due] || [];
      const { taskList, noteItem } = splitDayList(prevList);
      const list = taskList.filter((t) => t.id !== task.id);
      const sorted = sortTasksByCreatedDesc(list);
      const full = mergeDayList(sorted, noteItem);
      const next = { ...prev };
      if (full.length) next[task.due] = full; else delete next[task.due];
      return next;
    });
  }

  function toggleSubtask(parentTask, subtaskId) {
    if (!parentTask || !subtaskId) return;
    const dueKey = parentTask.due;
    setTasksMap((prev) => {
      const prevList = prev[dueKey] || [];
      const { taskList, noteItem } = splitDayList(prevList);
      const list = taskList.map((t) => {
        if (t.id !== parentTask.id) return t;
        const currentSubtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
        const newSubtasks = currentSubtasks.map((st) =>
          st.id === subtaskId ? { ...st, done: !st.done } : st
        );
        // Parent is done if and only if all subtasks are done (when any subtasks exist)
        const hasSubtasks = newSubtasks.length > 0;
        const allSubsDone = hasSubtasks ? newSubtasks.every((st) => st.done) : true;
        const parentDone = hasSubtasks ? allSubsDone : t.done;
        const updated = { ...t, subtasks: newSubtasks, done: parentDone };
        if (t.isRecurringInstance && t.seriesId) {
          setRecurringSeries((prevSeries) => prevSeries.map((s) => {
            if (s.id !== t.seriesId) return s;
            const ov = { ...(s.overrides || {}) };
            ov[t.due] = {
              ...(ov[t.due] || {}),
              subtasks: updated.subtasks,
              done: updated.done,
            };
            const updatedSeries = { ...s, overrides: ov };
            
            // Save updated series to Firestore if user is logged in
            if (user && taskRepoRef.current) {
              taskRepoRef.current.saveRecurringSeries(updatedSeries).catch(err => {
                console.error('Failed to save updated recurring series to cloud', err);
              });
            }
            
            return updatedSeries;
          }));
        }
        return updated;
      });

      const prevAllDone = taskList.length > 0 && taskList.every((t) => t.done);
      const newAllDone = list.length > 0 && list.every((t) => t.done);
      if (!prevAllDone && newAllDone) {
        triggerCelebration(dueKey);
        if (dueKey === todayKey()) {
          setStreak((s) => {
            const y = yesterdayKey();
            const nextCurrent = s?.lastEarnedDateKey === y ? (Number(s?.current) || 0) + 1 : 1;
            const nextLongest = Math.max(Number(s?.longest) || 0, nextCurrent);
            const next = { current: nextCurrent, longest: nextLongest, lastEarnedDateKey: todayKey() };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }
      if (prevAllDone && !newAllDone) {
        if (dueKey === todayKey()) {
          setStreak((s) => {
            if (s?.lastEarnedDateKey !== todayKey()) return s;
            const decreased = Math.max(0, (Number(s?.current) || 0) - 1);
            const newLast = decreased > 0 ? yesterdayKey() : null;
            const next = { current: decreased, longest: Number(s?.longest) || 0, lastEarnedDateKey: newLast };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }

      const sortedTasks = sortTasksByCreatedDesc(list);
      const fullList = mergeDayList(sortedTasks, noteItem);
      const updated = { ...prev, [dueKey]: fullList };
      if (user && taskRepoRef.current) {
        const updatedTask = list.find(t => t.id === parentTask.id);
        if (updatedTask) taskRepoRef.current.saveTask(dueKey, updatedTask).catch((err) => console.error('Cloud toggleSubtask failed', err));
      }
      return updated;
    });
  }

  function deleteSubtask(parentTask, subtaskId) {
    if (!parentTask || !subtaskId) return;
    const dueKey = parentTask.due;
    setTasksMap((prev) => {
      const prevList = prev[dueKey] || [];
      const { taskList, noteItem } = splitDayList(prevList);
      const list = taskList.map((t) => {
        if (t.id !== parentTask.id) return t;
        const currentSubtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
        const newSubtasks = currentSubtasks.filter((st) => st.id !== subtaskId);
        const hasSubtasks = newSubtasks.length > 0;
        const allSubsDone = hasSubtasks ? newSubtasks.every((st) => st.done) : true;
        const parentDone = hasSubtasks ? allSubsDone : t.done;
        const updated = { ...t, subtasks: newSubtasks, done: parentDone };
        if (t.isRecurringInstance && t.seriesId) {
          setRecurringSeries((prevSeries) => prevSeries.map((s) => {
            if (s.id !== t.seriesId) return s;
            const ov = { ...(s.overrides || {}) };
            ov[t.due] = {
              ...(ov[t.due] || {}),
              subtasks: updated.subtasks,
              done: updated.done,
            };
            const updatedSeries = { ...s, overrides: ov };
            
            // Save updated series to Firestore if user is logged in
            if (user && taskRepoRef.current) {
              taskRepoRef.current.saveRecurringSeries(updatedSeries).catch(err => {
                console.error('Failed to save updated recurring series to cloud', err);
              });
            }
            
            return updatedSeries;
          }));
        }
        return updated;
      });

      const prevAllDone = taskList.length > 0 && taskList.every((t) => t.done);
      const newAllDone = list.length > 0 && list.every((t) => t.done);
      if (!prevAllDone && newAllDone) {
        triggerCelebration(dueKey);
        if (dueKey === todayKey()) {
          setStreak((s) => {
            const y = yesterdayKey();
            const nextCurrent = s?.lastEarnedDateKey === y ? (Number(s?.current) || 0) + 1 : 1;
            const nextLongest = Math.max(Number(s?.longest) || 0, nextCurrent);
            const next = { current: nextCurrent, longest: nextLongest, lastEarnedDateKey: todayKey() };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }
      if (prevAllDone && !newAllDone) {
        if (dueKey === todayKey()) {
          setStreak((s) => {
            if (s?.lastEarnedDateKey !== todayKey()) return s;
            const decreased = Math.max(0, (Number(s?.current) || 0) - 1);
            const newLast = decreased > 0 ? yesterdayKey() : null;
            const next = { current: decreased, longest: Number(s?.longest) || 0, lastEarnedDateKey: newLast };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }

      const sortedTasks = sortTasksByCreatedDesc(list);
      const fullList = mergeDayList(sortedTasks, noteItem);
      const updated = { ...prev, [dueKey]: fullList };
      if (user && taskRepoRef.current) {
        const updatedTask = list.find(t => t.id === parentTask.id);
        if (updatedTask) taskRepoRef.current.saveTask(dueKey, updatedTask).catch((err) => console.error('Cloud deleteSubtask failed', err));
      }
      return updated;
    });
  }

  // Drag and drop: move task between days
  // drag mime moved to constants

  function moveTask(fromKey, taskId, toKey) {
    if (!fromKey || !taskId || !toKey || fromKey === toKey) return;
    setTasksMap((prev) => {
      const fromList = prev[fromKey] || [];
      const { taskList: fromTasks, noteItem: fromNote } = splitDayList(fromList);
      const task = fromTasks.find((t) => t.id === taskId);
      if (!task) return prev;
      
      // Prevent moving recurring tasks
      if (task.isRecurringInstance) return prev;
      
      const updatedFromTasks = fromTasks.filter((t) => t.id !== taskId);
      const sortedFromTasks = sortTasksByCreatedDesc(updatedFromTasks);
      const fullFromList = mergeDayList(sortedFromTasks, fromNote);
      const toList = prev[toKey] || [];
      const { taskList: toTasks, noteItem: toNote } = splitDayList(toList);
      let movedTask = { ...task, due: toKey };
      // If moving a recurring instance, convert to a normal one-off task to avoid series conflicts
      if (movedTask.isRecurringInstance) {
        const { seriesId, occurrenceDateKey, ...rest } = movedTask;
        movedTask = { ...rest, isRecurringInstance: false, id: generateId() };
      }
      const newToTasks = sortTasksByCreatedDesc([movedTask, ...toTasks]);
      const fullToList = mergeDayList(newToTasks, toNote);
      const updated = { ...prev, [toKey]: fullToList };
      if (fullFromList.length) updated[fromKey] = fullFromList; else delete updated[fromKey];

      // Handle completion transitions for streak if today is affected
      const prevFromAllDone = fromTasks.length > 0 && fromTasks.every((t) => t.done);
      const newFromAllDone = updatedFromTasks.length > 0 && updatedFromTasks.every((t) => t.done);
      const prevToAllDone = toTasks.length > 0 && toTasks.every((t) => t.done);
      const newToAllDone = ([movedTask, ...toTasks]).length > 0 && [movedTask, ...toTasks].every((t) => t.done);
      const tKey = todayKey();
      if (fromKey === tKey) {
        if (!prevFromAllDone && newFromAllDone) {
          triggerCelebration(fromKey);
          setStreak((s) => {
            const y = yesterdayKey();
            const nextCurrent = s?.lastEarnedDateKey === y ? (Number(s?.current) || 0) + 1 : 1;
            const nextLongest = Math.max(Number(s?.longest) || 0, nextCurrent);
            const next = { current: nextCurrent, longest: nextLongest, lastEarnedDateKey: tKey };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
        if (prevFromAllDone && !newFromAllDone) {
          setStreak((s) => {
            if (s?.lastEarnedDateKey !== tKey) return s;
            const decreased = Math.max(0, (Number(s?.current) || 0) - 1);
            const newLast = decreased > 0 ? yesterdayKey() : null;
            const next = { current: decreased, longest: Number(s?.longest) || 0, lastEarnedDateKey: newLast };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }
      if (toKey === tKey) {
        if (!prevToAllDone && newToAllDone) {
          triggerCelebration(toKey);
          setStreak((s) => {
            const y = yesterdayKey();
            const nextCurrent = s?.lastEarnedDateKey === y ? (Number(s?.current) || 0) + 1 : 1;
            const nextLongest = Math.max(Number(s?.longest) || 0, nextCurrent);
            const next = { current: nextCurrent, longest: nextLongest, lastEarnedDateKey: tKey };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
        if (prevToAllDone && !newToAllDone) {
          setStreak((s) => {
            if (s?.lastEarnedDateKey !== tKey) return s;
            const decreased = Math.max(0, (Number(s?.current) || 0) - 1);
            const newLast = decreased > 0 ? yesterdayKey() : null;
            const next = { current: decreased, longest: Number(s?.longest) || 0, lastEarnedDateKey: newLast };
            if (user) saveStreakToCloud(user.uid, next).catch(() => {});
            return next;
          });
        }
      }
      if (user && taskRepoRef.current) {
        try {
          // Persist changes: delete from original day and upsert to new day
          taskRepoRef.current.updateTaskDueDate(taskId, toKey).catch((err) => console.error('Cloud moveTask failed', err));
        } catch (err) {
          console.error('Cloud moveTask error', err);
        }
      }
      return updated;
    });
  }

  function onDragStartTask(e, task) {
    // Prevent dragging recurring tasks
    if (task.isRecurringInstance) {
      e.preventDefault();
      return;
    }
    
    try {
      e.dataTransfer.effectAllowed = 'move';
      const payload = JSON.stringify({ taskId: task.id, fromKey: task.due });
      e.dataTransfer.setData(DRAG_MIME, payload);
      // Fallback for some browsers/tools
      e.dataTransfer.setData('text/plain', payload);
    } catch {}
  }

  function onDropTaskOnDay(e, day) {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const { taskId, fromKey } = JSON.parse(raw || '{}');
      
      // Get the task to check if it's recurring
      const fromList = tasksMap[fromKey] || [];
      const { taskList: fromTasks } = splitDayList(fromList);
      const task = fromTasks.find((t) => t.id === taskId);
      
      // Prevent dropping recurring tasks
      if (task && task.isRecurringInstance) return;
      
      const toKey = keyFor(day);
      moveTask(fromKey, taskId, toKey);
      setDragOverDayKey(null);
    } catch {}
  }

  // Pomodoro timer functions
  function openPomodoroTimer(task = null) {
    setCurrentPomodoroTask(task);
    setShowFloatingPomodoro(true);
  }

  function closePomodoroTimer() {
    setShowFloatingPomodoro(false);
    setCurrentPomodoroTask(null);
    setPomodoroRunningState({ 
      isRunning: false, 
      currentTask: null, 
      timeLeft: null, 
      phase: null, 
      totalTime: null 
    });
  }

  const handlePomodoroRunningStateChange = useCallback((state) => {
    setPomodoroRunningState(state);
  }, []);

  function handlePomodoroTaskComplete(task) {
    if (task && task.id) {
      if (task.parentTask) {
        // This is a subtask - toggle the subtask
        toggleSubtask(task.parentTask, task.id);
      } else {
        // This is a main task - mark as completed
        toggleDone(task);
      }
    }
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(tasksMap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "caldo-tasks.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        // shallow merge
        setTasksMap((prev) => {
          const merged = { ...prev, ...parsed };
          // Bulk sync all months to cloud if signed in
          if (user && taskRepoRef.current && noteRepoRef.current) {
            const months = new Set(Object.keys(merged).map((k) => monthKeyFromDateKey(k)));
            months.forEach((m) => {
              const monthMap = getMonthMapFor(merged, m);
              Object.entries(monthMap).forEach(([dateKey, dayList]) => {
                if (Array.isArray(dayList)) {
                  const { taskList, noteItem } = splitDayList(dayList);
                  taskList.forEach(t => taskRepoRef.current.saveTask(dateKey, t).catch(() => {}));
                  if (noteItem?.dayNote) noteRepoRef.current.saveDayNote(dateKey, noteItem.dayNote).catch(() => {});
                }
              });
            });
          }
          return merged;
        });
      } catch (err) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!confirm("Clear all tasks?")) return;
    const prevSnapshot = tasksMap;
    setTasksMap(() => ({}));
    // Fire and forget cloud cleanup
    if (user && taskRepoRef.current) {
      (async () => {
        try {
          const years = Array.from(new Set(Object.keys(prevSnapshot).map(k => k.slice(0, 4))));
          await Promise.all(
            years.map((year) => {
              const start = new Date(Number(year), 0, 1);
              const end = new Date(Number(year) + 1, 0, 1);
              return taskRepoRef.current.deleteTasksInRange(start, end);
            })
          );
        } catch (e) {
          console.error('Cloud clear failed', e);
        }
      })();
    }
    setStreak({ current: 0, longest: Number(streak?.longest) || 0, lastEarnedDateKey: null });
    if (user) saveStreakToCloud(user.uid, { current: 0, longest: Number(streak?.longest) || 0, lastEarnedDateKey: null }).catch(() => {});
  }

  async function deleteAllTasksFromCloud() {
    if (!user || !taskRepoRef.current) return;
    const ok = confirm('This will permanently delete all your tasks from the cloud. This cannot be undone. Continue?');
    if (!ok) return;
    try {
      // Broad range - delete from cloud
      const start = new Date(1970, 0, 1);
      const end = new Date(3000, 0, 1);
      console.log('Deleting tasks from cloud with range:', start, 'to', end);
      await taskRepoRef.current.deleteTasksInRange(start, end);
      console.log('Cloud deletion completed');
      
      // Also clear any notes that might contain task-related data
      try {
        if (noteRepoRef.current) {
          // Clear notes for the same broad range
          const notes = await noteRepoRef.current.fetchMonthNotes('1970-01');
          for (const note of notes) {
            await noteRepoRef.current.deleteDayNote(note.dateKey);
          }
        }
      } catch (e) {
        console.error('Failed to clear notes:', e);
      }
      
      // Clear local tasks state
      setTasksMap({});
      
      // Clear all task-related localStorage data
      try { 
        saveTasks({}); 
        console.log('Cleared tasks from localStorage');
      } catch (e) {
        console.error('Failed to clear tasks from localStorage:', e);
      }
      
      // Also clear recurring series so they don't rematerialize
      setRecurringSeries([]);
      try { 
        saveRecurringSeries([]); 
        console.log('Cleared recurring series from localStorage');
      } catch (e) {
        console.error('Failed to clear recurring series from localStorage:', e);
      }
      
      // Clear any other task-related localStorage keys
      try {
        // Clear all caldo_v2 related keys
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('caldo_v2_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => {
          localStorage.removeItem(key);
          console.log('Removed localStorage key:', key);
        });
      } catch (e) {
        console.error('Failed to clear additional localStorage keys:', e);
      }
      
      // Reset streak as well since tasks are gone
      setStreak({ current: 0, longest: 0, lastEarnedDateKey: null });
      try {
        saveStreak({ current: 0, longest: 0, lastEarnedDateKey: null });
        console.log('Reset streak data');
      } catch (e) {
        console.error('Failed to reset streak:', e);
      }
      
      // Clear cloud streak data
      try {
        await saveStreakToCloud(user.uid, { current: 0, longest: 0, lastEarnedDateKey: null });
        console.log('Cleared cloud streak data');
      } catch (e) {
        console.error('Failed to clear cloud streak:', e);
      }
      
      console.log('All task data cleared successfully');
      alert('All tasks have been deleted from both cloud and local storage.');
      
    } catch (e) {
      console.error('Failed to delete all tasks from cloud', e);
      alert('Failed to delete all tasks. Please try again.');
    }
  }



  // Keep streak valid across day changes: if last earned day is neither today nor yesterday, reset current to 0
  useEffect(() => {
    function checkAndResetIfBroken() {
      setStreak((s) => ensureStreakUpToDate(s));
    }
    // Run on mount
    checkAndResetIfBroken();
    // Check periodically and at approximate midnight
    const intervalId = setInterval(checkAndResetIfBroken, 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Close drawers when switching tabs to prevent conflicts
  useEffect(() => {
    if (activeTab === 'tasks') {
      setSnippetsDrawerOpen(false);
    } else if (activeTab === 'notes') {
      setShowAdd(false);
      setShowEdit(false);
      setShowMissed(false);
    } else if (activeTab === 'moments') {
      setShowAdd(false);
      setShowEdit(false);
      setShowMissed(false);
      setSnippetsDrawerOpen(false);
    } else if (activeTab === 'habits') {
      setShowAdd(false);
      setShowEdit(false);
      setShowMissed(false);
      setSnippetsDrawerOpen(false);
      setShowNotes(false);
    }
  }, [activeTab]);

  // Reset icon animation after it completes
  useEffect(() => {
    if (iconAnimation.tab) {
      const timer = setTimeout(() => {
        setIconAnimation({ tab: null, key: 0 });
      }, 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [iconAnimation]);

  return (
    publicRoute ? (
      <PublicSnippetView slug={publicRoute.slug} token={publicRoute.token} />
    ) : focusedRoute ? (
      focusedRoute.type === 'snippet' ? (
        <FocusedSnippetView id={focusedRoute.id} />
      ) : (
        <FocusedDayNoteView dateKey={focusedRoute.dateKey} />
      )
    ) : (
    <div className={`min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 px-4 sm:px-6 md:px-10 py-4 sm:py-6 md:py-10 ${activeTab === 'tasks' ? 'pb-40' : 'pb-20'} sm:pb-10 safe-pt safe-pb font-sans text-slate-800 dark:text-slate-200 overflow-x-hidden flex flex-col`}>
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col gap-4 sm:gap-6">
        <div className="flex-shrink-0 w-full">
          <Header
            user={user}
          onSignInWithGoogle={signInWithGoogle}
          onSignOut={signOut}
          onExportJSON={exportJSON}
          onImportJSON={importJSON}
          onOpenHelp={() => setShowHelp(true)}
          onOpenSearch={() => setShowSearch(true)}
          onOpenPomodoro={() => openPomodoroTimer()}
          currentStreak={streak?.current || 0}
          deleteAllTasksEnabled={!!deleteAllTasksEnabled}
          onDeleteAllTasks={deleteAllTasksFromCloud}
          currentView={currentView}
          onChangeView={(v) => setCurrentView(v)}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          pomodoroEnabled={pomodoroEnabled}
          />
        </div>
        
        
        <div className="flex-1 flex flex-col">
        {activeTab === 'tasks' && currentView === 'month' ? (
          <main className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 pb-40 sm:pb-0">
            <Calendar
              monthStart={monthStart}
              monthDays={monthDays}
              selectedDate={selectedDate}
              onSelectDate={(d) => {
                setCursor(d);
                setSelectedDate(d);
                if (user) {
                  const dk = keyFor(d);
                  refreshDayFromCloud(user.uid, dk);
                }
                try {
                  setDraftDayNote(getDayNoteByKey(keyFor(d)));
                } catch {}
              }}
              onPrevMonth={prevMonth}
              onNextMonth={nextMonth}
              tasksFor={tasksFor}
              hasNoteFor={hasNoteForDay}
              onOpenAddModal={openAddModal}
              dragOverDayKey={dragOverDayKey}
              setDragOverDayKey={setDragOverDayKey}
              onDropTaskOnDay={onDropTaskOnDay}
              missedCount={missedTasksThisMonth.length}
              onOpenMissed={() => setShowMissed(true)}
              snippets={snippetsCache}
            />

            <aside className="bg-white dark:bg-slate-900 rounded-2xl shadow p-4 border border-transparent dark:border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Tasks for</div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{format(selectedDate, 'EEEE, MMM d')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative" ref={densityMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowDensityMenu((v) => !v)}
                      className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2 rounded-lg inline-flex items-center justify-center"
                      aria-label="Task card density"
                      data-tip="Task card density"
                    >
                      {density === 'minified' ? <Minimize2 size={16} /> : density === 'compact' ? <Grip size={16} /> : <List size={16} />}
                    </button>
                    {showDensityMenu && (
                      <div className="absolute right-0 z-10 mt-2 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1">
                        <button
                          type="button"
                          onClick={() => { setDensity('normal'); setShowDensityMenu(false); }}
                          className={`w-full flex items-center justify-start gap-2 p-2 rounded ${density === 'normal' ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                          aria-label="Normal density"
                        >
                          <List size={16} />
                          <span className="text-sm">Normal</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDensity('compact'); setShowDensityMenu(false); }}
                          className={`w-full flex items-center justify-start gap-2 p-2 rounded ${density === 'compact' ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                          aria-label="Compact density"
                        >
                          <Grip size={16} />
                          <span className="text-sm">Compact</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDensity('minified'); setShowDensityMenu(false); }}
                          className={`w-full flex items-center justify-start gap-2 p-2 rounded ${density === 'minified' ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                          aria-label="Minified density"
                        >
                          <Minimize2 size={16} />
                          <span className="text-sm">Minified</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      // Close snippets drawer if open to avoid conflicts
                      setSnippetsDrawerOpen(false);
                      setShowNotes(true);
                    }}
                    className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2 rounded-lg inline-flex items-center justify-center"
                    aria-label="Open notes (N)"
                    data-tip="Open notes (N)"
                  >
                    <StickyNote size={16} />
                  </button>
                  {/* <button
                    onClick={() => setShowMissed(true)}
                    className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2 rounded-lg inline-flex items-center justify-center"
                    aria-label="Show missed tasks this week"
                    data-tip="Show missed tasks this week"
                  >
                    <ListX size={16} />
                  </button> */}
                  <button
                    onClick={() => openAddModal(selectedDate)}
                    className="bg-indigo-600 text-white p-2 rounded-lg inline-flex items-center justify-center"
                    aria-label="Add task (T)"
                    data-tip="Add task (T)"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <MotivationalMessage 
                date={selectedDate}
                incompleteTasks={getIncompleteTasksFor(selectedDate)}
              />

              <TaskList
                tasks={tasksFor(selectedDate)}
                onDragStartTask={onDragStartTask}
                onToggleDone={toggleDone}
                onOpenEditModal={openEditModal}
                onDeleteTask={deleteTask}
                onAddSubtask={addSubtask}
                onToggleSubtask={toggleSubtask}
                onDeleteSubtask={deleteSubtask}
                onStartPomodoro={pomodoroEnabled ? openPomodoroTimer : null}
                density={density}
                emptyMessage="No tasks. Add a new task to view."
                recurringSeries={recurringSeries}
                pomodoroRunningState={pomodoroEnabled ? pomodoroRunningState : { isRunning: false, currentTask: null, timeLeft: null, phase: null, totalTime: null }}
              />
            </aside>
          </main>
        ) : activeTab === 'tasks' && currentView === 'week' ? (
          <main className="grid grid-cols-1 gap-4 sm:gap-6 pb-40 sm:pb-0">
            <WeekView
              anchorDate={cursor}
              onPrevWeek={prevWeek}
              onNextWeek={nextWeek}
              onToday={() => { const today = new Date(); setCursor(today); setSelectedDate(today); }}
              tasksFor={tasksFor}
              selectedDate={selectedDate}
              onOpenAddForDate={(d) => openAddModal(d)}
              hasNoteFor={hasNoteForDay}
              missedCount={missedTasksThisWeek.length}
              onOpenMissed={() => setShowMissed(true)}
              onOpenNotes={(day) => {
                // Set the selected date to the clicked day
                if (day) {
                  setSelectedDate(day);
                  setCursor(day);
                }
                // Close snippets drawer if open to avoid conflicts
                setSnippetsDrawerOpen(false);
                setShowNotes(true);
              }}
              snippets={snippetsCache}
              dragOverDayKey={dragOverDayKey}
              setDragOverDayKey={setDragOverDayKey}
              onDropTaskOnDay={onDropTaskOnDay}
              onDragStartTask={onDragStartTask}
              onToggleDone={toggleDone}
              onOpenEditModal={openEditModal}
              onDeleteTask={deleteTask}
              onAddSubtask={addSubtask}
              onToggleSubtask={toggleSubtask}
              onDeleteSubtask={deleteSubtask}
              onStartPomodoro={pomodoroEnabled ? openPomodoroTimer : null}
              recurringSeries={recurringSeries}
              pomodoroRunningState={pomodoroEnabled ? pomodoroRunningState : { isRunning: false, currentTask: null, timeLeft: null, phase: null, totalTime: null }}
            />
          </main>
        ) : activeTab === 'tasks' && currentView === 'year' ? (
          <main className="grid grid-cols-1 gap-4 sm:gap-6 pb-40 sm:pb-0">
            <YearView
              anchorDate={cursor}
              onPrevYear={prevYear}
              onNextYear={nextYear}
              onToday={() => { const today = new Date(); setCursor(today); setSelectedDate(today); }}
              tasksFor={tasksFor}
              hasNoteFor={hasNoteForDay}
              snippets={snippetsCache}
              onSelectMonth={(monthDate) => {
                setCursor(monthDate);
                setCurrentView('month');
              }}
            />
          </main>
        ) : activeTab === 'tasks' ? (
          <main className="flex flex-col gap-4 sm:gap-6 flex-1 min-h-0 pb-40 sm:pb-0">
            <DayView
              date={selectedDate}
              onPrevDay={() => prevDay()}
              onNextDay={() => nextDay()}
              onToday={() => { const today = new Date(); setCursor(today); setSelectedDate(today); }}
              tasks={tasksFor(selectedDate)}
              onDragStartTask={onDragStartTask}
              onToggleDone={toggleDone}
              onOpenEditModal={openEditModal}
              onDeleteTask={deleteTask}
              onAddSubtask={addSubtask}
              onToggleSubtask={toggleSubtask}
              onDeleteSubtask={deleteSubtask}
              onStartPomodoro={pomodoroEnabled ? openPomodoroTimer : null}
              density={density}
              onAddTask={() => openAddModal(selectedDate)}
              onOpenNotes={() => {
                // Close snippets drawer if open to avoid conflicts
                setSnippetsDrawerOpen(false);
                setShowNotes(true);
              }}
              showDensityMenu={showDensityMenu}
              setShowDensityMenu={setShowDensityMenu}
              onChangeDensity={(d) => setDensity(d)}
              densityMenuRef={densityMenuRef}
              recurringSeries={recurringSeries}
              pomodoroRunningState={pomodoroEnabled ? pomodoroRunningState : { isRunning: false, currentTask: null, timeLeft: null, phase: null, totalTime: null }}
            />
          </main>
        ) : null}

        {activeTab === 'notes' && (
          <NotesPage
            repo={noteRepoRef.current}
            user={user}
            snippetRepo={snippetRepoRef.current}
            onOpenDayNotes={(n) => {
              try {
                const d = parseISO(n?.dateKey);
                setSelectedDate(d);
                setCursor(d);
                setDraftDayNote(n?.content || '');
                // Close snippets drawer if open to avoid conflicts
                setSnippetsDrawerOpen(false);
                setShowNotes(true);
              } catch {
                // Close snippets drawer if open to avoid conflicts
                setSnippetsDrawerOpen(false);
                setShowNotes(true);
              }
            }}
            onOpenSnippetEditor={(id) => { 
              // Close other drawers to avoid conflicts
              setShowNotes(false);
              setShowMissed(false);
              setShowHelp(false);
              setSnippetsDrawerId(id || '__new__'); 
              setSnippetsDrawerOpen(true); 
            }}
          />
        )}

        {activeTab === 'snippets' && (
          <SnippetsPage
            repo={snippetRepoRef.current}
            user={user}
            initialSnippets={snippetsCache}
            onOpenEditor={(id) => { 
              // Close other drawers to avoid conflicts
              setShowNotes(false);
              setShowMissed(false);
              setShowHelp(false);
              setSnippetsDrawerId(id || '__new__'); 
              setSnippetsDrawerOpen(true); 
            }}
            onSnippetsChanged={(items) => setSnippetsCache(items)}
          />
        )}

        {activeTab === 'moments' && (
          <MomentsPage 
            user={user} 
            onMomentsChanged={(moments) => setMomentsCache(moments)}
          />
        )}

        {activeTab === 'habits' && (
          <HabitTracker
            habits={habbits}
            onAddHabit={addHabit}
            onToggleHabitForDay={toggleHabitForDay}
            onDeleteHabit={deleteHabit}
          />
        )}
        </div>

        {(snippetsDrawerOpen || showNotes) && (
          <div
            className="fixed inset-0 z-[65] bg-slate-900/20 backdrop-blur-sm"
            onClick={() => { setSnippetsDrawerOpen(false); setShowNotes(false); }}
          />
        )}

        {showCelebration && (
          <div className="pointer-events-none fixed inset-0 z-[60]">
            <CelebrationCanvas seed={confettiSeed} />
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-auto fixed top-4 right-4 z-[61]">
              <div className="px-3 sm:px-4 py-2 rounded-lg sm:rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur shadow-lg text-[12px] sm:text-sm font-semibold text-green-700 dark:text-green-300 border border-green-100 dark:border-green-900/40 inline-flex items-center gap-2">
                <Check size={16} className="text-green-600" />
                <span>All tasks done for {celebrationDateKey ? format(parseISO(celebrationDateKey), 'EEE, MMM d') : ''}</span>
              </div>
            </motion.div>
          </div>
        )}

        <AddTaskDrawer open={showAdd} selectedDate={selectedDate} form={form} setForm={setForm} onSubmit={addTask} onClose={() => setShowAdd(false)} recurringEnabled={recurringEnabled} />
        <EditTaskDrawer open={showEdit} editForm={editForm} setEditForm={setEditForm} onSubmit={saveEdit} onClose={() => setShowEdit(false)} editTask={editTask} />
        <MissedTasksDrawer
          open={showMissed}
          count={currentView === 'week' || currentView === 'weeknew' ? missedTasksThisWeek.length : missedTasksThisMonth.length}
          tasks={currentView === 'week' || currentView === 'weeknew' ? missedTasksThisWeek : missedTasksThisMonth}
          onClose={() => setShowMissed(false)}
          onDragStartTask={onDragStartTask}
          onToggleDone={toggleDone}
          onOpenEditModal={openEditModal}
          onDeleteTask={deleteTask}
          onAddSubtask={addSubtask}
          onToggleSubtask={toggleSubtask}
          onDeleteSubtask={deleteSubtask}
          density={density}
          scope={currentView === 'week' || currentView === 'weeknew' ? 'week' : 'month'}
          recurringSeries={recurringSeries}
        />

        <SnippetsDrawer
          open={showNotes}
          onClose={() => {
            setShowNotes(false);
          }}
          repo={noteRepoRef.current}
          user={user}
          snippetId={keyFor(selectedDate)}
          type="note"
          dateLabel={format(selectedDate, 'PPP')}
          onGoToDay={() => {
            setActiveTab('tasks');
            setCurrentView('day');
          }}
          onNotesChanged={(dateKey, content) => {
            // Update notes cache when note is saved
            if (content && content.trim()) {
              setNotesCache(prev => new Map(prev).set(dateKey, { dateKey, content, updatedAt: new Date() }));
            } else {
              setNotesCache(prev => {
                const newMap = new Map(prev);
                newMap.delete(dateKey);
                return newMap;
              });
            }
          }}
        />

        <HelpPage 
          open={showHelp || (typeof window !== 'undefined' && window.location.hash === '#help')} 
          onClose={() => { 
            console.log('App: HelpPage onClose called');
            setShowHelp(false); 
            try { 
              if (window.location.hash === '#help') {
                history.replaceState(null, '', location.pathname + location.search);
              }
            } catch (e) {
              console.error('App: Error updating history:', e);
            }
          }}
          pomodoroEnabled={pomodoroEnabled}
        />

        <SearchModal
          isOpen={showSearch}
          onClose={() => setShowSearch(false)}
          searchResults={searchResults}
          onNavigateToItem={navigateToSearchResult}
          query={searchQuery}
          onQueryChange={setSearchQuery}
        />


        <SnippetsDrawer
          open={snippetsDrawerOpen}
          onClose={() => setSnippetsDrawerOpen(false)}
          repo={snippetRepoRef.current}
          user={user}
          snippetId={snippetsDrawerId}
          onSnippetsChanged={(/* _ */) => {
            // Refresh cache lightly via repo
            try {
              if (snippetRepoRef.current && user) {
                snippetRepoRef.current.listSnippets({ includeArchived: false, limit: 500 }).then((items) => setSnippetsCache(items)).catch(() => {});
              }
            } catch {}
          }}
        />

        <ScopeDialog
          open={scopeDialogOpen}
          onClose={() => { setScopeDialogOpen(false); scopeActionRef.current = null; }}
          onOnlyThis={handleScopeOnlyThis}
          onEntireSeries={handleScopeEntireSeries}
          actionType={scopeActionRef.current?.type || 'delete'}
        />

        {/* Floating Pomodoro Widget */}
        {pomodoroEnabled && (
          <FloatingPomodoro
            isVisible={showFloatingPomodoro}
            onClose={closePomodoroTimer}
            currentTask={currentPomodoroTask}
            onTaskComplete={handlePomodoroTaskComplete}
            onRunningStateChange={handlePomodoroRunningStateChange}
          />
        )}

        <TooltipProvider />
      </div>
      
      {/* Task View Switcher - Bottom of screen, above options */}
      {activeTab === 'tasks' && (
        <div className="fixed bottom-20 left-0 right-0 z-40 flex justify-center sm:bottom-4 safe-pb pointer-events-none">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6">
            <div className="flex justify-center py-2 sm:py-3">
              <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 backdrop-blur-md sm:backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg dark:shadow-xl sm:shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:sm:shadow-[0_8px_30px_rgb(0,0,0,0.3)] px-2 py-1.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setCurrentView('day')}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 min-h-[38px] min-w-[52px] touch-manipulation ${
                    currentView === 'day'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 active:text-slate-900 dark:active:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700/60'
                  }`}
                >
                  Day
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('week')}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 min-h-[38px] min-w-[52px] touch-manipulation ${
                    currentView === 'week'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 active:text-slate-900 dark:active:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700/60'
                  }`}
                >
                  Week
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('month')}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 min-h-[38px] min-w-[52px] touch-manipulation ${
                    currentView === 'month'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 active:text-slate-900 dark:active:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700/60'
                  }`}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('year')}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 min-h-[38px] min-w-[52px] touch-manipulation ${
                    currentView === 'year'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 active:text-slate-900 dark:active:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700/60'
                  }`}
                >
                  Year
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white dark:bg-slate-900 backdrop-blur-md border-t border-slate-200 dark:border-slate-700 safe-pb shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="max-w-7xl mx-auto px-2 py-2">
          <div className="flex items-center justify-around gap-1">
            <button
              type="button"
              onClick={() => {
                setIconAnimation({ tab: 'tasks', key: Date.now() });
                setActiveTab('tasks');
              }}
              className={`relative flex flex-col items-center justify-center gap-1 flex-1 h-14 rounded-xl transition-all duration-200 touch-manipulation active:scale-95 ${
                activeTab === 'tasks'
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400 active:bg-slate-50 dark:active:bg-slate-800/50'
              }`}
            >
              <CheckSquare 
                size={20} 
                strokeWidth={activeTab === 'tasks' ? 2.5 : 2}
                className={`transition-all duration-200 ${
                  activeTab === 'tasks' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
                } ${iconAnimation.tab === 'tasks' ? 'animate-[iconPulse_0.3s_ease-out]' : ''}`}
              />
              <span className={`text-[11px] font-semibold ${activeTab === 'tasks' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>Tasks</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIconAnimation({ tab: 'notes', key: Date.now() });
                setActiveTab('notes');
              }}
              className={`relative flex flex-col items-center justify-center gap-1 flex-1 h-14 rounded-xl transition-all duration-200 touch-manipulation active:scale-95 ${
                activeTab === 'notes'
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400 active:bg-slate-50 dark:active:bg-slate-800/50'
              }`}
            >
              <StickyNote 
                size={20} 
                strokeWidth={activeTab === 'notes' ? 2.5 : 2}
                className={`transition-all duration-200 ${
                  activeTab === 'notes' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
                } ${iconAnimation.tab === 'notes' ? 'animate-[iconPulse_0.3s_ease-out]' : ''}`}
              />
              <span className={`text-[11px] font-semibold ${activeTab === 'notes' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>Notes</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIconAnimation({ tab: 'moments', key: Date.now() });
                setActiveTab('moments');
              }}
              className={`relative flex flex-col items-center justify-center gap-1 flex-1 h-14 rounded-xl transition-all duration-200 touch-manipulation active:scale-95 ${
                activeTab === 'moments'
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400 active:bg-slate-50 dark:active:bg-slate-800/50'
              }`}
            >
              <Sparkles 
                size={20} 
                strokeWidth={activeTab === 'moments' ? 2.5 : 2}
                className={`transition-all duration-200 ${
                  activeTab === 'moments' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
                } ${iconAnimation.tab === 'moments' ? 'animate-[iconPulse_0.3s_ease-out]' : ''}`}
              />
              <span className={`text-[11px] font-semibold ${activeTab === 'moments' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>Moments</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIconAnimation({ tab: 'habits', key: Date.now() });
                setActiveTab('habits');
              }}
              className={`relative flex flex-col items-center justify-center gap-1 flex-1 h-14 rounded-xl transition-all duration-200 touch-manipulation active:scale-95 ${
                activeTab === 'habits'
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400 active:bg-slate-50 dark:active:bg-slate-800/50'
              }`}
            >
              <Target
                size={20}
                strokeWidth={activeTab === 'habits' ? 2.5 : 2}
                className={`transition-all duration-200 ${
                  activeTab === 'habits' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
                } ${iconAnimation.tab === 'habits' ? 'animate-[iconPulse_0.3s_ease-out]' : ''}`}
              />
              <span className={`text-[11px] font-semibold ${activeTab === 'habits' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>Habits</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
    )
  );
}
