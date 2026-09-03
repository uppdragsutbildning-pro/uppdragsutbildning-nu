import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from 'sonner';
import { AuthProvider } from '../contexts/AuthContext';
import { MarketplaceProvider } from '../lib/marketplaceContext';

export default function App() {
  return (
    <AuthProvider>
      <MarketplaceProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </MarketplaceProvider>
    </AuthProvider>
  );
}