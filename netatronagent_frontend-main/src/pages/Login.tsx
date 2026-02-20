import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Sparkles, Loader2, Lock } from "lucide-react";
import netatronLogo from "@/assets/netatron-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "@/hooks/use-toast";
import { api, setAuthToken } from "@/lib/api";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

declare global {
  interface Window {
    google?: any;
  }
}

// ============================================================================
// GOOGLE AUTH CONFIGURATION
// ============================================================================
// TODO: API_INTEGRATION - Uncomment and configure when ready
// import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
// import { supabase } from '@/lib/supabase';
//
// Required setup:
// 1. Create Google Cloud Project: https://console.cloud.google.com
// 2. Enable Google+ API
// 3. Create OAuth 2.0 credentials (Web application)
// 4. Add authorized origins: your-domain.com, localhost:5173
// 5. Add redirect URIs: your-supabase-project.supabase.co/auth/v1/callback
// 6. Set GOOGLE_CLIENT_ID in environment/secrets
// ============================================================================

export default function Login() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [usePasswordAuth, setUsePasswordAuth] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const googleButtonId = useRef(`google-btn-${Date.now()}`);
  const isMountedRef = useRef(true);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[Login] Starting password authentication...');
      const user = await api.verifyAuth("", username, password);
      console.log('[Login] verifyAuth successful, user:', user);
      
      if (!isMountedRef.current) return;
      
      console.log('[Login] Setting user in authStore...');
      const token = `${username}:${password}`;
      setAuthToken(token);
      setUser(user, token);
      
      toast({
        title: "Welcome!",
        description: `Signed in as ${user.email}`,
      });
      
      console.log('[Login] Navigating to dashboard...');
      setTimeout(() => {
        if (isMountedRef.current) {
          navigate("/", { replace: true });
        }
      }, 0);
    } catch (err) {
      if (!isMountedRef.current) return;
      
      const message = err instanceof Error ? err.message : "Failed to sign in";
      setError(message);
      toast({
        title: "Sign in failed",
        description: message,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleCredential = async (credential: string) => {
    if (!isMountedRef.current) return;
    
    // CRITICAL: Immediately remove the Google button from DOM to prevent React conflicts
    const btn = document.getElementById(googleButtonId.current);
    if (btn) {
      btn.remove();
    }
    
    if (window.google?.accounts?.id) {
      window.google.accounts.id.cancel();
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[Login] Starting authentication with credential...');
      const user = await api.verifyAuth(credential);
      console.log('[Login] verifyAuth successful, user:', user);
      
      if (!isMountedRef.current) return;
      
      console.log('[Login] Setting user in authStore...');
      setAuthToken(credential);
      setUser(user, credential);
      
      toast({
        title: "Welcome!",
        description: `Signed in as ${user.email}`,
      });
      
      console.log('[Login] Navigating to dashboard...');
      // Use setTimeout to ensure all React updates are complete
      setTimeout(() => {
        if (isMountedRef.current) {
          navigate("/", { replace: true });
        }
      }, 0);
    } catch (err) {
      if (!isMountedRef.current) return;
      
      const message = err instanceof Error ? err.message : "Failed to sign in";
      setError(message);
      toast({
        title: "Sign in failed",
        description: message,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    
    // Google auth is optional - if not configured, only show password login
    if (!googleClientId) {
      logger?.info("[Login] Google Client ID not configured - only password login available");
      return;
    }

    const renderButton = () => {
      if (!window.google || !containerRef.current || !isMountedRef.current) return;
      
      // Create a fresh div for Google button - completely outside React's control
      const existingBtn = document.getElementById(googleButtonId.current);
      if (existingBtn) existingBtn.remove();
      
      const buttonDiv = document.createElement('div');
      buttonDiv.id = googleButtonId.current;
      containerRef.current.appendChild(buttonDiv);
      
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential?: string }) => {
          if (response.credential && isMountedRef.current) {
            await handleCredential(response.credential);
          }
        },
      });
      
      window.google.accounts.id.renderButton(buttonDiv, {
        theme: "filled_blue",
        size: "large",
        width: 260,
        text: "continue_with",
        locale: "pl",
      });
    };

    if (!window.google) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = renderButton;
      document.head.appendChild(script);
      return () => {
        isMountedRef.current = false;
        script.onload = null;
        const btn = document.getElementById(googleButtonId.current);
        if (btn) btn.remove();
      };
    }

    renderButton();
    
    return () => {
      isMountedRef.current = false;
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
      const btn = document.getElementById(googleButtonId.current);
      if (btn) btn.remove();
    };
  }, [googleClientId]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Background Effects */}
      <div className="absolute inset-0 cyber-grid opacity-30" />
      
      {/* Animated multi-layer gradients */}
      <motion.div
        className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/30 blur-[100px]"
        animate={{
          x: [0, 50, -30, 0],
          y: [0, -40, 30, 0],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/3 top-1/3 h-72 w-72 rounded-full bg-primary/20 blur-[120px]"
        animate={{
          x: [0, -40, 60, 0],
          y: [0, 50, -20, 0],
          scale: [1, 0.8, 1.1, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        className="absolute left-[15%] top-[20%] h-64 w-64 rounded-full bg-accent/25 blur-[80px]"
        animate={{
          x: [0, 30, -50, 0],
          y: [0, -30, 40, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      
      <motion.div
        className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-accent/30 blur-[100px]"
        animate={{
          x: [0, -50, 30, 0],
          y: [0, 40, -30, 0],
          scale: [1, 0.9, 1.2, 1],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      <motion.div
        className="absolute bottom-1/3 right-1/3 h-72 w-72 rounded-full bg-accent/20 blur-[120px]"
        animate={{
          x: [0, 40, -60, 0],
          y: [0, -50, 20, 0],
          scale: [1, 1.1, 0.8, 1],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />
      <motion.div
        className="absolute bottom-[20%] right-[15%] h-64 w-64 rounded-full bg-primary/25 blur-[80px]"
        animate={{
          x: [0, -30, 50, 0],
          y: [0, 30, -40, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      
      {/* Center blend gradient */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/15 via-accent/10 to-primary/15 blur-[150px]"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
          <CardHeader className="space-y-4 text-center">
            {/* Logo */}
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="mx-auto flex h-20 w-20 items-center justify-center"
            >
              <img src={netatronLogo} alt="Netatron Logo" className="h-20 w-20 object-contain" />
            </motion.div>

            <div className="space-y-2">
              <CardTitle className="text-2xl font-bold">
                <span className="text-foreground">Netatron</span>{" "}
                <span className="gradient-text">Automation</span>
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                AI-powered data scraping & research platform
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Features */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Secure Authentication</p>
                  <p className="text-xs text-muted-foreground">Sign in with your Google account</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">AI-Powered Features</p>
                  <p className="text-xs text-muted-foreground">Advanced scraping & data enrichment</p>
                </div>
              </div>
            </div>

            {/* Password Login Form */}
            {usePasswordAuth ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    disabled={isLoading}
                    className="w-full"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    disabled={isLoading}
                    className="w-full"
                    autoComplete="current-password"
                  />
                </div>
                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-center text-xs text-destructive">{error}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button 
                    type="submit" 
                    className="flex-1" 
                    disabled={isLoading || !username.trim() || !password.trim()}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Sign In
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setUsePasswordAuth(false);
                      setError(null);
                    }}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                {/* Google Sign-In Button - Only show if Google Client ID is configured */}
                {googleClientId ? (
                  <>
                    <div className="flex flex-col items-center gap-4">
                      <div ref={containerRef} className="min-h-[40px] flex items-center justify-center">
                        {!window.google && !error && !isLoading && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading Google Sign-In...
                          </div>
                        )}
                      </div>
                      {isLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Authenticating...
                        </div>
                      )}
                      {error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 w-full">
                          <p className="text-center text-xs text-destructive">{error}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Password Login Option */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or</span>
                      </div>
                    </div>
                    
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setUsePasswordAuth(true)}
                      disabled={isLoading}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Sign in with Password
                    </Button>
                  </>
                ) : (
                  /* Only password login available */
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Sign in with your username and password
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setUsePasswordAuth(true)}
                      disabled={isLoading}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Sign in with Password
                    </Button>
                  </div>
                )}
              </>
            )}

            <p className="text-center text-xs text-muted-foreground">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          © 2025 Netatron Automation. All rights reserved.
        </motion.p>
      </motion.div>
    </div>
  );
}
