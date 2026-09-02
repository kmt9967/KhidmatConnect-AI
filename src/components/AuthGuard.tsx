'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import type { DemoRole } from '@/lib/auth/session';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: DemoRole;
}

/**
 * Client-side auth guard.
 * - Redirects to /login if not authenticated.
 * - Redirects to /login if wrong role for the page.
 * - Shows loading state while checking auth.
 */
export default function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (requiredRole && user.role !== requiredRole) {
      // Wrong role — redirect to their own workspace
      const roleRedirect: Record<string, string> = {
        CITIZEN: '/dashboard',
        OPERATOR: '/operator',
        RESPONDER: '/responder',
      };
      router.replace(roleRedirect[user.role] || '/login');
    }
  }, [user, loading, requiredRole, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E14]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3FB950] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;
  if (requiredRole && user.role !== requiredRole) return null;

  return <>{children}</>;
}
