"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const ALLOWED_EMAIL = "naman.lohia@skyfront.com";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (email.toLowerCase().trim() !== ALLOWED_EMAIL) {
      setError("Access denied. Only authorized Skyfront accounts can log in.");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        if (authError.message.includes("Invalid login")) {
          setError("Invalid email or password.");
        } else {
          setError(authError.message);
        }
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1219] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#151D2E] border border-[#1E293B] rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366F1] to-purple-500 flex items-center justify-center text-xl font-bold text-white">
              M
            </div>
            <div>
              <div className="font-bold text-lg text-gray-100">MRP System</div>
              <div className="text-[11px] text-gray-500">Skyfront Corp</div>
            </div>
          </div>

          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="naman.lohia@skyfront.com"
                required
                className="w-full bg-[#0B0F19] border border-[#1E293B] rounded-lg px-3.5 py-2.5 text-[13px] text-gray-200 outline-none focus:border-[#6366F1]/50 transition-colors"
              />
            </div>
            <div className="mb-6">
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="w-full bg-[#0B0F19] border border-[#1E293B] rounded-lg px-3.5 py-2.5 text-[13px] text-gray-200 outline-none focus:border-[#6366F1]/50 transition-colors"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-[13px] text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#6366F1] text-white rounded-lg py-2.5 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#818CF8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
        <div className="text-center text-[11px] text-gray-600 mt-4">
          Authorized personnel only
        </div>
      </div>
    </div>
  );
}
