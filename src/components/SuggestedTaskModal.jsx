import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, RotateCcw, Check, Pencil, Trash, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function SuggestedTaskModal({
  open,
  task,
  onClose,
  onSuggestAnother,
  onRescheduleToToday,
  onToggleDone,
  onOpenEditModal,
  onDeleteTask,
  hasMoreTasks = false,
}) {
  if (!open) return null;
  
  if (!task) {
    return (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-[80]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full pointer-events-auto p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center">
                  <Sparkles className="mx-auto text-slate-400 dark:text-slate-500 mb-4" size={48} />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                    No Tasks Available
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    You don't have any missed tasks this month to suggest.
                  </p>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  const priority = task.priority || "medium";
  const priorityPill =
    priority === "high"
      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
      : priority === "low"
      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
      : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300";
  
  const priorityBorder =
    priority === "high"
      ? "border-red-300 dark:border-red-800/80"
      : priority === "low"
      ? "border-green-300 dark:border-green-800/80"
      : "border-amber-300 dark:border-amber-800/80";

  const dueDate = task.due || task.dateKey || null;
  const createdAt = task.createdAt || new Date().toISOString();
  const notes = task.notes || "";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-[80]"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <Sparkles className="text-indigo-600 dark:text-indigo-400" size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Suggested Task
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        When you're idle, here's something to work on
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Task Card */}
              <div className="p-6">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className={`border border-l-4 ${priorityBorder} bg-white dark:bg-slate-900 rounded-lg p-4 mb-4`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex-1">
                      {task.title || "Untitled Task"}
                    </h3>
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${priorityPill}`}>
                      <span className={`${priority === "high" ? "bg-red-600" : priority === "low" ? "bg-green-600" : "bg-amber-600"} w-1.5 h-1.5 rounded-full`} />
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </div>
                  </div>

                  {notes && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 mb-3">
                      {notes}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-3">
                    {dueDate && (
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        <span>Due on {format(parseISO(dueDate), "EEE, MMM d")}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>Created {format(parseISO(createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                </motion.div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={onRescheduleToToday}
                    className="w-full px-4 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={18} />
                    Do This Task (Reschedule to Today)
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={onToggleDone}
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2"
                    >
                      <Check size={16} />
                      Mark Done
                    </button>
                    <button
                      onClick={onOpenEditModal}
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-2"
                    >
                      <Pencil size={16} />
                      Edit
                    </button>
                    <button
                      onClick={onDeleteTask}
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center justify-center gap-2"
                    >
                      <Trash size={16} />
                      Delete
                    </button>
                  </div>

                  {hasMoreTasks && (
                    <button
                      onClick={onSuggestAnother}
                      className="w-full px-4 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={16} />
                      Suggest Another Task
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

