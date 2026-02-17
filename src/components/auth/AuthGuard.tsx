"use client";

import { useEffect, useState, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const ALLOWED_EMAIL = "naman.lohia@skyfront.com";

export function AuthGuard({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user.email?.toLowerCase() === ALLOWED_EMAIL) {
        setAuthed(true);
      } else {
        if (session) {
          // Logged in but wrong email - sign them out
          await supabase.auth.signOut();
        }
        if (pathname !== "/login") {
          router.replace("/login");
        }
      }
      setChecked(true);
    };
    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && session.user.email?.toLowerCase() === ALLOWED_EMAIL) {
        setAuthed(true);
      } else {
        setAuthed(false);
        if (pathname !== "/login") {
          router.replace("/login");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  // Login page is always accessible
  if (pathname === "/login") return <>{children}</>;

  // Still checking auth
  if (!checked) {
    return (
      <div className="min-h-screen bg-[#0F1219] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#6366F1]/30 border-t-[#6366F1] rounded-full animate-spin" />
      </div>
    );
  }

  // Not authed - will redirect via useEffect
  if (!authed) return null;

  return <>{children}</>;
}
