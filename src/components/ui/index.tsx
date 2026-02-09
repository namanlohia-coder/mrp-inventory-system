"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─── BADGE ───────────────────────────────────
const badgeColors = {
  default:
    "bg-brand-bg text-brand border-brand/20",
  green:
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  red: "bg-red-500/10 text-red-400 border-red-500/20",
  orange:
    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export function Badge({
  children,
  color = "default",
  className,
}: {
  children: ReactNode;
  color?: keyof typeof badgeColors;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold tracking-wide uppercase border",
        badgeColors[color],
        className
      )}
    >
      {children}
    </span>
  );
}

// ─── BUTTON ──────────────────────────────────
const buttonVariants = {
  primary:
    "bg-brand text-white border-transparent shadow-[0_2px_12px_rgba(99,102,241,0.3)] hover:bg-brand-hover",
  secondary:
    "bg-transparent text-gray-400 border-border hover:bg-surface-hover",
  danger:
    "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20",
  ghost: "bg-transparent text-gray-400 border-transparent hover:text-gray-200",
};

export function Button({
  children,
  variant = "primary",
  size = "default",
  className,
  ...props
}: {
  children: ReactNode;
  variant?: keyof typeof buttonVariants;
  size?: "default" | "sm";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg font-semibold border transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-sans",
        size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-5 py-2.5 text-[13px]",
        buttonVariants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── INPUT ───────────────────────────────────
export function Input({
  label,
  className,
  ...props
}: {
  label?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs text-gray-400 font-medium">{label}</label>
      )}
      <input
        className={cn(
          "bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-gray-200 outline-none focus:border-brand/50 transition-colors font-sans",
          className
        )}
        {...props}
      />
    </div>
  );
}

// ─── TEXTAREA ────────────────────────────────
export function Textarea({
  label,
  className,
  ...props
}: {
  label?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs text-gray-400 font-medium">{label}</label>
      )}
      <textarea
        className={cn(
          "bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-gray-200 outline-none focus:border-brand/50 transition-colors font-sans resize-none",
          className
        )}
        rows={3}
        {...props}
      />
    </div>
  );
}

// ─── SELECT ──────────────────────────────────
export function Select({
  label,
  options,
  className,
  ...props
}: {
  label?: string;
  options: { value: string; label: string }[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs text-gray-400 font-medium">{label}</label>
      )}
      <select
        className={cn(
          "bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-gray-200 outline-none focus:border-brand/50 transition-colors font-sans",
          className
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── MODAL ───────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative bg-surface border border-border rounded-2xl max-w-[90vw] max-h-[85vh] overflow-auto p-7 shadow-2xl",
          className || "w-[560px]"
        )}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-100">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl cursor-pointer bg-transparent border-none"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── SEARCH BAR ──────────────────────────────
export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
        ⌕
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Search..."}
        className="w-full bg-[#0B0F19] border border-border rounded-xl px-3.5 py-2.5 pl-9 text-[13px] text-gray-200 outline-none focus:border-brand/50 transition-colors font-sans"
      />
    </div>
  );
}

// ─── STAT CARD ───────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  trend?: number;
}) {
  return (
    <div className="bg-surface-card border border-border rounded-[14px] p-6 flex-1 min-w-[200px]">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-gray-400 mb-2 font-medium tracking-wide uppercase">
            {label}
          </div>
          <div className="text-[28px] font-bold text-gray-100 font-sans">
            {value}
          </div>
          {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
        </div>
        <div className="text-[28px] opacity-60">{icon}</div>
      </div>
      {trend !== undefined && (
        <div
          className={cn(
            "mt-3 text-xs font-semibold",
            trend > 0 ? "text-emerald-400" : "text-red-400"
          )}
        >
          {trend > 0 ? "▲" : "▼"} {Math.abs(trend)}% vs last month
        </div>
      )}
    </div>
  );
}

// ─── EMPTY STATE ─────────────────────────────
export function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="text-center py-16 text-gray-500">
      <div className="text-5xl mb-4 opacity-50">{icon}</div>
      <div className="text-base font-semibold text-gray-400 mb-1.5">
        {title}
      </div>
      <div className="text-[13px]">{sub}</div>
    </div>
  );
}

// ─── TABLE ───────────────────────────────────
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function TableHeader({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr className="border-b border-border">
        {columns.map((col) => (
          <th
            key={col}
            className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide"
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function TableRow({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className="border-b border-border hover:bg-surface-hover transition-colors cursor-pointer"
    >
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-4 py-3.5 text-[13px]", className)}>{children}</td>
  );
}

// ─── LOADING ─────────────────────────────────
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
    </div>
  );
}
