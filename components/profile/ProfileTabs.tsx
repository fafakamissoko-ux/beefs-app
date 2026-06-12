import React from 'react';

export interface TabDefinition {
  id: string;
  label: string;
  icon: React.ElementType;
  isHidden?: boolean;
}

export interface ProfileTabsProps {
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function ProfileTabs({ tabs, activeTab, onTabChange, className = '' }: ProfileTabsProps) {
  const visibleTabs = tabs.filter((tab) => !tab.isHidden);

  return (
    <div className={`rounded-[2rem] bg-slate-900/40 border border-white/10 backdrop-blur-sm p-4 sm:p-6 ${className}`}>
      <nav
        aria-label="Navigation du profil"
        className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-black/20 p-1 [scrollbar-width:none] backdrop-blur-[2px] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {visibleTabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs sm:text-sm font-bold transition-all duration-200 ${
                isActive
                  ? 'text-white bg-white/10 ring-1 ring-white/20 shadow-lg'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
