import React, { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { CheckCircle2, Circle, Plus, Trash2, Target } from "lucide-react";

export default function HabitTracker({ habits = [], onAddHabit, onToggleHabitForDay, onDeleteHabit }) {
  const [title, setTitle] = useState("");
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

  const recentDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const day = addDays(new Date(), index - 6);
      const key = format(day, "yyyy-MM-dd");
      return {
        key,
        shortDay: format(day, "EEE"),
        dayNumber: format(day, "d"),
      };
    });
  }, []);

  const completionSummary = useMemo(() => {
    const total = habits.length;
    const completed = habits.filter((habit) => !!habit?.history?.[selectedDateKey]).length;
    return { total, completed };
  }, [habits, selectedDateKey]);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAddHabit && onAddHabit(trimmed);
    setTitle("");
  }

  return (
    <main className="grid grid-cols-1 gap-4 sm:gap-6 pb-24 sm:pb-0">
      <section className="bg-white dark:bg-slate-900 rounded-2xl shadow p-4 sm:p-5 border border-transparent dark:border-slate-800">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100">Habit Tracker</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Build consistency by checking off habits every day.</p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
            <Target size={14} />
            {completionSummary.completed}/{completionSummary.total} today
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a new habit (e.g. Drink water)"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-medium min-h-[44px] active:scale-[0.98] transition-transform"
          >
            <Plus size={16} />
            Add Habit
          </button>
        </form>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl shadow p-4 sm:p-5 border border-transparent dark:border-slate-800">
        <div className="mb-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">History (last 7 days)</div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {recentDays.map((day) => {
              const active = selectedDateKey === day.key;
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelectedDateKey(day.key)}
                  className={`flex-shrink-0 rounded-xl border px-3 py-2 min-w-[56px] min-h-[44px] text-center ${
                    active
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wide">{day.shortDay}</div>
                  <div className="text-sm font-semibold">{day.dayNumber}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
            {selectedDateKey === todayKey ? "Today" : "Selected day"} ({format(new Date(selectedDateKey), "EEE, MMM d")})
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">{habits.length} habits</span>
        </div>

        {habits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 sm:p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No habits yet. Add your first habit above.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {habits.map((habit) => {
              const completed = !!habit?.history?.[selectedDateKey];
              return (
                <li
                  key={habit.id}
                  className="flex items-center gap-2.5 sm:gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 sm:p-3"
                >
                  <button
                    type="button"
                    onClick={() => onToggleHabitForDay && onToggleHabitForDay(habit.id, selectedDateKey)}
                    className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-indigo-600 dark:text-indigo-400 active:scale-95"
                    aria-label={completed ? `Mark ${habit.title} as not completed` : `Mark ${habit.title} as completed`}
                  >
                    {completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm sm:text-base truncate ${completed ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                      {habit.title}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      {recentDays.map((day) => {
                        const done = !!habit?.history?.[day.key];
                        return (
                          <span
                            key={`${habit.id}-${day.key}`}
                            className={`inline-block w-2 h-2 rounded-full ${done ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
                            title={`${day.shortDay} ${day.dayNumber}: ${done ? "Done" : "Not done"}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteHabit && onDeleteHabit(habit.id)}
                    className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 active:scale-95"
                    aria-label={`Delete habit ${habit.title}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
