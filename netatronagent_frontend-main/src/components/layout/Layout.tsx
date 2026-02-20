import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useAuthStore } from "@/stores/authStore";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";

interface LayoutProps {
  title?: string;
}

export function Layout({ title }: LayoutProps) {
  const { isAuthenticated, isLoading, token, user, setUser, setLoading } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const hasVerifiedRef = useRef(false);

  // Debug logging
  useEffect(() => {
    console.log("[Layout] Auth state:", { 
      isAuthenticated, 
      isLoading, 
      hasToken: !!token, 
      hasUser: !!user,
      isAdmin: user?.is_admin 
    });
  }, [isAuthenticated, isLoading, token, user]);

  // Verify token on mount if we have token but user might be stale (e.g., missing is_admin)
  useEffect(() => {
    // Only verify once, after Zustand rehydration
    if (hasVerifiedRef.current) return;
    hasVerifiedRef.current = true; // Mark as verifying to prevent multiple calls
    
    const verifyTokenIfNeeded = async () => {
      // Wait a bit for Zustand to rehydrate
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const currentToken = useAuthStore.getState().token;
      const currentUser = useAuthStore.getState().user;
      
      if (currentToken && (!currentUser || currentUser.is_admin === undefined)) {
        console.log("[Layout] Token exists but user is stale or missing is_admin, verifying...");
        try {
          useAuthStore.getState().setLoading(true);
          const freshUser = await api.verifyAuth(currentToken);
          console.log("[Layout] Token verified, fresh user:", freshUser);
          useAuthStore.getState().setUser(freshUser, currentToken);
        } catch (err) {
          console.error("[Layout] Token verification failed:", err);
          useAuthStore.getState().setUser(null, null);
        } finally {
          useAuthStore.getState().setLoading(false);
        }
      }
      
      setIsInitialized(true);
    };

    verifyTokenIfNeeded();
  }, []); // Empty deps - run only on mount

  // Wait for initialization before checking auth
  if (!isInitialized) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Check both store and localStorage for token (fallback for race conditions)
  let effectiveToken = token;
  if (!effectiveToken && typeof window !== "undefined") {
    try {
      const storedToken = localStorage.getItem("auth_token");
      if (storedToken) {
        console.log("[Layout] Token found in localStorage but not in store - using localStorage token");
        effectiveToken = storedToken;
      }
    } catch (e) {
      console.warn("[Layout] Error reading localStorage:", e);
    }
  }
  
  // If no token at all, redirect to login immediately
  if (!effectiveToken) {
    console.log("[Layout] No token found in store or localStorage, redirecting to login");
    return <Navigate to="/login" replace />;
  }

  // If we have a token but are still loading (verifying), show loading screen
  if (isLoading) {
    console.log("[Layout] Loading (verifying token), showing loading screen");
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // If we have a token but are not authenticated (verification failed or user cleared), redirect to login
  if (!isAuthenticated) {
    console.log("[Layout] Not authenticated despite having token, redirecting to login");
    return <Navigate to="/login" replace />;
  }

  // If authenticated, show the layout
  console.log("[Layout] Authenticated, showing layout");
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
