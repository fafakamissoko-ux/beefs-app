'use client';

import { createContext, useContext, useState } from 'react';

const TabsContext = createContext<{
  value: string;
  onChange: (value: string) => void;
}>({ value: '', onChange: () => {} });

export function Tabs({ 
  defaultValue, 
  children, 
  className = '' 
}: { 
  defaultValue: string; 
  children: React.ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <TabsContext.Provider value={{ value, onChange: setValue }}>
      <div className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex border-b ${className}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({ 
  value, 
  children 
}: { 
  value: string; 
  children: React.ReactNode;
}) {
  const { value: selectedValue, onChange } = useContext(TabsContext);
  const isActive = selectedValue === value;

  return (
    <button
      onClick={() => onChange(value)}
      className={`flex-1 px-2 py-2 font-bold text-xs transition-colors ${
        isActive 
          ? 'text-arena-blue border-b-2 border-arena-blue' 
          : 'text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function TabsContent({ 
  value, 
  children, 
  className = '' 
}: { 
  value: string; 
  children: React.ReactNode;
  className?: string;
}) {
  const { value: selectedValue } = useContext(TabsContext);

  if (selectedValue !== value) return null;

  return <div className={className}>{children}</div>;
}
