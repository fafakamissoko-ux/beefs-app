'use client';

import { createContext, useContext, useState } from 'react';
import { motion } from 'framer-motion';

const TabsContext = createContext<{
  value: string;
  onChange: (value: string) => void;
}>({ value: '', onChange: () => {} });

export function Tabs({
  defaultValue,
  children,
  className = '',
}: {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <TabsContext.Provider value={{ value, onChange: setValue }}>
      <div className={`font-sans ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative inline-flex items-center gap-1 rounded-full bg-white/[0.05] p-1 backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className = '',
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { value: selectedValue, onChange } = useContext(TabsContext);
  const isActive = selectedValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onChange(value)}
      className={`relative z-[1] min-w-0 flex-1 rounded-full px-2 py-1.5 text-xs font-bold tracking-wide transition-colors duration-200 sm:px-4 ${className} ${
        isActive
          ? 'text-white'
          : 'text-gray-500 hover:text-gray-200'
      }`}
    >
      {isActive && (
        <motion.span
          layoutId="tab-active-pill"
          className="absolute inset-0 rounded-full bg-white/[0.1] ring-1 ring-white/[0.12] shadow-[0_0_12px_rgba(0,82,255,0.12)]"
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className = '',
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { value: selectedValue } = useContext(TabsContext);
  if (selectedValue !== value) return null;
  return <div className={className}>{children}</div>;
}
