"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const ALLOWED_EMAIL = "naman.lohia@skyfront.com";
const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 10;
const IS_DEV = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("localhost") ?? false;

type Step = "credentials" | "verify";

async function getLockoutStatus(email: string): Promise<{ locked: boolean; minutesLeft: number }> {
  const { data } = await supabase
    .from("login_attempts")
    .select("attempt_count, locked_until")
    .eq("email", email)
    .maybeSingle();

  if (data?.locked_until) {
    const lockedUntil = new Date(data.locked_until);
    if (lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
      return { locked: true, minutesLeft };
    }
  }
  return { locked: false, minutesLeft: 0 };
}

async function recordFailedAttempt(email: string): Promise<boolean> {
  // Upsert: increment count, lock if reaching max
  const { data: existing } = await supabase
    .from("login_attempts")
    .select("attempt_count")
    .eq("email", email)
    .maybeSingle();

  const newCount = (existing?.attempt_count ?? 0) + 1;
  const lockedUntil =
    newCount >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
      : null;

  await supabase.from("login_attempts").upsert({
    email,
    attempt_count: newCount,
    locked_until: lockedUntil,
    updated_at: new Date().toISOString(),
  });

  return newCount >= MAX_ATTEMPTS;
}

async function resetAttempts(email: string) {
  await supabase.from("login_attempts").upsert({
    email,
    attempt_count: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  });
}

export default function LoginPage() {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpRateLimited, setOtpRateLimited] = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (email.toLowerCase().trim() !== ALLOWED_EMAIL) {
      setError("Access denied. Only authorized Skyfront accounts can log in.");
      return;
    }

    setLoading(true);
    try {
      // 1. Check lockout
      const { locked, minutesLeft } = await getLockoutStatus(email.trim());
      if (locked) {
        setError(`Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`);
        return;
      }

      // 2. Verify password
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        const justLocked = await recordFailedAttempt(email.trim());
        if (justLocked) {
          setError(`Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`);
        } else {
          const { data: row } = await supabase
            .from("login_attempts")
            .select("attempt_count")
            .eq("email", email.trim())
            .maybeSingle();
          const remaining = MAX_ATTEMPTS - (row?.attempt_count ?? 0);
          setError(`Invalid email or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`);
        }
        return;
      }

      // 3. Password correct — reset attempts, sign out the password session, send OTP
      await resetAttempts(email.trim());
      await supabase.auth.signOut();

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        const isRateLimit = otpError.message.toLowerCase().includes("rate") ||
          otpError.status === 429;
        setOtpRateLimited(isRateLimit);
        setError(
          isRateLimit
            ? "Email rate limit reached. Please wait a few minutes before trying again."
            : "Could not send verification code. Please try again."
        );
        setStep("verify");
        return;
      }

      setOtpRateLimited(false);
      setStep("verify");
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });

      if (verifyError) {
        setError("Invalid or expired code. Please try again.");
        return;
      }

      window.location.href = "/purchase-orders";
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });
      if (otpError) {
        const isRateLimit = otpError.message.toLowerCase().includes("rate") ||
          otpError.status === 429;
        setOtpRateLimited(isRateLimit);
        setError(
          isRateLimit
            ? "Email rate limit reached. Please wait a few minutes before trying again."
            : "Could not resend code. Please try again."
        );
      } else {
        setOtpRateLimited(false);
        setError("");
      }
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

          {step === "credentials" ? (
            <form onSubmit={handleCredentials}>
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
          ) : (
            <form onSubmit={handleVerify}>
              <div className="mb-2 text-center">
                <div className="text-[13px] text-gray-300 font-medium">Check your email</div>
                <div className="text-[12px] text-gray-500 mt-1">
                  A 6-digit code was sent to{" "}
                  <span className="text-gray-400">{email}</span>
                </div>
              </div>

              <div className="my-6">
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="00000000"
                  required
                  autoFocus
                  className="w-full bg-[#0B0F19] border border-[#1E293B] rounded-lg px-3.5 py-2.5 text-[18px] text-gray-200 outline-none focus:border-[#6366F1]/50 transition-colors tracking-[0.3em] text-center font-mono"
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-[13px] text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 8}
                className="w-full bg-[#6366F1] text-white rounded-lg py-2.5 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#818CF8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Verifying..." : "Verify"}
              </button>

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setStep("credentials"); setCode(""); setError(""); setOtpRateLimited(false); }}
                  className="text-[12px] text-gray-500 hover:text-gray-400 transition-colors bg-transparent border-none cursor-pointer p-0"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="text-[12px] text-[#6366F1] hover:text-[#818CF8] transition-colors bg-transparent border-none cursor-pointer p-0 disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>

              {IS_DEV && otpRateLimited && (
                <button
                  type="button"
                  onClick={() => { window.location.href = "/purchase-orders"; }}
                  className="mt-4 w-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-lg py-2 text-[12px] font-medium cursor-pointer hover:bg-yellow-500/20 transition-colors"
                >
                  Skip verification (dev mode)
                </button>
              )}
            </form>
          )}
        </div>
        <div className="text-center text-[11px] text-gray-600 mt-4">
          Authorized personnel only
        </div>
      </div>
    </div>
  );
}
