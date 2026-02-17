import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Custom storage using sessionStorage so auth clears when browser closes
const sessionOnlyStorage = {
  getItem: (key: string) => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: sessionOnlyStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
