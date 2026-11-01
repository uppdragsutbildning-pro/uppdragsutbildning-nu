import { createContext, useContext, ReactNode } from 'react';

interface ProviderContextType {
  selectedProviderId: string;
  isAdmin: boolean;
  // Antal nya efterfrågningar (tilldelningar) respektive nya förfrågningar, för märken i menyn och flikarna.
  newAssignments: number;
  newRequests: number;
}

const ProviderContext = createContext<ProviderContextType | undefined>(undefined);

export function ProviderProvider({
  children,
  selectedProviderId,
  isAdmin,
  newAssignments = 0,
  newRequests = 0
}: {
  children: ReactNode;
  selectedProviderId: string;
  isAdmin: boolean;
  newAssignments?: number;
  newRequests?: number;
}) {
  return (
    <ProviderContext.Provider value={{ selectedProviderId, isAdmin, newAssignments, newRequests }}>
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
