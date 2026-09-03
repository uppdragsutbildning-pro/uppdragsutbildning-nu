import { createBrowserRouter } from "react-router";
import { Root } from "./components/Root";
import { HomePage } from "./components/pages/HomePage";
import { CatalogPage } from "./components/pages/CatalogPage";
import { TrainingDetailPage } from "./components/pages/TrainingDetailPage";
import { RequestFlowPage } from "./components/pages/RequestFlowPage";
import { LoginPage } from "./components/pages/LoginPage";
import { AdminDashboard } from "./components/pages/AdminDashboard";
import { NotFound } from "./components/pages/NotFound";
import { KompetensindexPage } from "./components/pages/KompetensindexPage";
import { OmTjansten } from "./components/pages/OmTjansten";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ProviderLayout } from "./components/provider/ProviderLayout";
import { ProviderDashboard } from "./components/provider/ProviderDashboard";
import { ProviderCoursesPage } from "./components/provider/ProviderCoursesPage";
import { ProviderCourseFormPage } from "./components/provider/ProviderCourseFormPage";
import { ProviderApplicationsPage } from "./components/provider/ProviderApplicationsPage";
import { ProviderRequestsPage } from "./components/provider/ProviderRequestsPage";
import { ProviderHistoryPage } from "./components/provider/ProviderHistoryPage";
import { MarketplaceFormPage } from "./components/admin/MarketplaceFormPage";
import { MarketplaceBrandingPage } from "./components/admin/MarketplaceBrandingPage";
import { MarketplaceCurationPage } from "./components/admin/MarketplaceCurationPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: HomePage },
      { path: "catalog", Component: CatalogPage },
      { path: "training/:id", Component: TrainingDetailPage },
      { path: "kompetensanalys", Component: KompetensindexPage },
      { path: "om-tjansten", Component: OmTjansten },
      { path: "request", Component: RequestFlowPage },
      { path: "request/:trainingId", Component: RequestFlowPage },
      { path: "login", Component: LoginPage },
      {
        path: "admin",
        element: (
          <ProtectedRoute requireRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        )
      },
      {
        path: "admin/marketplaces/new",
        element: (
          <ProtectedRoute requireRole="admin">
            <MarketplaceFormPage />
          </ProtectedRoute>
        )
      },
      {
        path: "admin/marketplaces/:id/edit",
        element: (
          <ProtectedRoute requireRole="admin">
            <MarketplaceFormPage />
          </ProtectedRoute>
        )
      },
      {
        path: "admin/marketplaces/:id/branding",
        element: (
          <ProtectedRoute requireRole="admin">
            <MarketplaceBrandingPage />
          </ProtectedRoute>
        )
      },
      {
        path: "admin/marketplaces/:id/curation",
        element: (
          <ProtectedRoute requireRole="admin">
            <MarketplaceCurationPage />
          </ProtectedRoute>
        )
      },
      { path: "*", Component: NotFound },
    ],
  },
  {
    path: "/provider",
    element: (
      <ProtectedRoute requireRole="provider">
        <ProviderLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: "dashboard", Component: ProviderDashboard },
      { path: "courses", Component: ProviderCoursesPage },
      { path: "courses/new", Component: ProviderCourseFormPage },
      { path: "courses/:id/edit", Component: ProviderCourseFormPage },
      { path: "applications", Component: ProviderApplicationsPage },
      { path: "requests", Component: ProviderRequestsPage },
      { path: "history", Component: ProviderHistoryPage },
    ],
  },
]);
