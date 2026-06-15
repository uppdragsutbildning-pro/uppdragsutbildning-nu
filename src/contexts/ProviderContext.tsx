import { createContext, useContext, ReactNode } from 'react';

interface ProviderContextType {
  selectedProviderId: string;
  isAdmin: boolean;
}

const ProviderContext = createContext<ProviderContextType | undefined>(undefined);

export function ProviderProvider({
  children,
  selectedProviderId,
  isAdmin
}: {
  children: ReactNode;
  selectedProviderId: string;
  isAdmin: boolean;
}) {
  return (
    <ProviderContext.Provider value={{ selectedProviderId, isAdmin }}>
      {children}
    </ProviderContext.Provider>
  );
}

export function useProviderContext() {
  const context = useContext(ProviderContext);
  if (context === undefined) {
    throw new Error('useProviderContext must be used within a ProviderProvider');
  }
  return context;
}
