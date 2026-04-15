import React from "react";
import { motion } from "framer-motion";
import { CheckSquare, StickyNote, Sparkles, Target } from "lucide-react";

export default function TabSwitcher({ activeTab, onChangeTab }) {
  const tabs = [
    {
      key: 'tasks',
      label: 'Tasks',
      icon: CheckSquare,
      shortLabel: 'Tasks'
    },
    {
      key: 'notes',
      label: 'Notes & Snippets',
      icon: StickyNote,
      shortLabel: 'Notes'
    },
    {
      key: 'moments',
      label: 'Moments',
      icon: Sparkles,
      shortLabel: 'Moments'
    },
    {
      key: 'habits',
      label: 'Habits',
      icon: Target,
      shortLabel: 'Habits'
    }
  ];

  return (
    <div className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700" role="tablist" aria-label="Main navigation">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;
        
        return (
          <motion.button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChangeTab && onChangeTab(tab.key)}
            className={`
              relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
              transition-all duration-150 ease-out
              text-xs font-medium
              ${isActive
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }
            `}
            whileHover={{ scale: isActive ? 1 : 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Icon 
              size={14} 
              className={`
                flex-shrink-0
                ${isActive 
                  ? 'text-slate-900 dark:text-slate-100' 
                  : 'text-slate-500 dark:text-slate-400'
                }
              `} 
            />
            <span className="whitespace-nowrap">
              {tab.shortLabel}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

