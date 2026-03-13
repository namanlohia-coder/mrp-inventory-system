"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Badge, LoadingSpinner } from "@/components/ui";
import { getProducts, getProductionOrdersWithMilestones, getMilestones, updateMilestone } from "@/lib/data";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string;
  production_order_id: string;
  name: string;
  assigned_to: string;
  due_date: string | null;
  status: "not_started" | "in_progress" | "complete" | "blocked";
  notes: string;
  sort_order: number;
}

interface Order {
  id: string;
  order_name: string;
  quantity: number;
  start_date: string | null;
  training_date: string | null;
  delivery_date: string | null;
  status: string;
  customers: { id: string; name: string } | null;
  production_milestones: Milestone[];
}

type View = "calendar" | "countdown" | "board";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today0(): Date { const d = new Date(); d.setHours(0,0,0,0); return d; }
function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00"); return isNaN(d.getTime()) ? null : d;
}
function daysFromNow(dateStr: string | null): number | null {
  const d = parseDate(dateStr); if (!d) return null;
  return Math.round((d.getTime() - today0().getTime()) / 86400000);
}
function fmtDate(s: string | null): string {
  const d = parseDate(s); if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtShort(s: string | null): string {
  const d = parseDate(s); if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function startOfWeek(d: Date): Date {
  const r = new Date(d); r.setHours(0,0,0,0);
  const day = r.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  r.setDate(r.getDate() + diff); return r;
}
function endOfWeek(d: Date): Date {
  const r = startOfWeek(d); r.setDate(r.getDate() + 6); return r;
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function mkDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function milestoneStatusColor(s: string): "default" | "blue" | "green" | "red" {
  if (s === "not_started") return "default";
  if (s === "in_progress") return "blue";
  if (s === "complete") return "green";
  return "red";
}
function milestoneStatusDot(s: string): string {
  if (s === "complete") return "bg-emerald-400";
  if (s === "in_progress") return "bg-blue-400";
  if (s === "blocked") return "bg-red-400";
  return "bg-gray-500";
}

const ORDER_STATUS_COLS = ["Planning", "In Training", "In Production", "Ready", "Delivered"] as const;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ─── This Week Panel ──────────────────────────────────────────────────────────

function ThisWeekPanel({
  milestones, orders, onToggle, collapsible = false,
}: {
  milestones: Milestone[];
  orders: Order[];
  onToggle: (m: Milestone) => void;
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const todayDate = today0();
  const weekStart = startOfWeek(todayDate);
  const weekEnd = endOfWeek(todayDate);
  const orderMap = new Map(orders.map((o) => [o.id, o.order_name]));

  // Overdue: past due, not complete
  const overdueMilestones = milestones
    .filter((m) => {
      const d = parseDate(m.due_date);
      return d && d < todayDate && m.status !== "complete";
    })
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  // Incomplete milestones due Mon–Sun this week (from today onward)
  const thisWeekIncomplete = milestones
    .filter((m) => {
      if (m.status === "complete") return false;
      const d = parseDate(m.due_date);
      return d && d >= todayDate && d <= weekEnd;
    })
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  // Complete milestones due anywhere in Mon–Sun (for counting)
  const thisWeekComplete = milestones.filter((m) => {
    if (m.status !== "complete") return false;
    const d = parseDate(m.due_date);
    return d && d >= weekStart && d <= weekEnd;
  });

  const totalThisWeek = thisWeekIncomplete.length + thisWeekComplete.length;
  const remaining = thisWeekIncomplete.length;
  const completed = thisWeekComplete.length;

  // Group by day (Mon–Sun)
  const daySlots: { key: string; date: Date; milestones: Milestone[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    daySlots.push({ key: mkDateKey(d), date: d, milestones: [] });
  }
  for (const m of thisWeekIncomplete) {
    const key = m.due_date?.slice(0, 10);
    const slot = daySlots.find((s) => s.key === key);
    if (slot) slot.milestones.push(m);
  }

  const summaryText = totalThisWeek > 0
    ? `${totalThisWeek} milestone${totalThisWeek !== 1 ? "s" : ""} this week · ${completed} complete · ${remaining} remaining`
    : overdueMilestones.length > 0
    ? `${overdueMilestones.length} overdue milestone${overdueMilestones.length !== 1 ? "s" : ""}`
    : "Nothing due this week";

  return (
    <div className="mb-6 bg-surface-card border border-border rounded-[14px] overflow-hidden">
      {/* Header */}
      <div
        className={`px-5 py-4 border-b border-border flex items-center justify-between ${collapsible ? "cursor-pointer hover:bg-surface-hover transition-colors select-none" : ""}`}
        onClick={collapsible ? () => setCollapsed((c) => !c) : undefined}
      >
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[12px] font-bold text-amber-400 uppercase tracking-widest">This Week</span>
            {collapsible && <span className="text-[10px] text-gray-600">{collapsed ? "▶" : "▼"}</span>}
          </div>
          <div className="text-[12px] text-gray-500">{summaryText}</div>
        </div>
        <div className="text-[11px] text-gray-600 whitespace-nowrap">
          {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" — "}
          {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* OVERDUE sub-section */}
          {overdueMilestones.length > 0 && (
            <div className="border-b border-border bg-red-500/5">
              <div className="px-5 pt-3.5 pb-3">
                <div className="text-[11px] font-bold text-red-400 uppercase tracking-widest mb-3">
                  ⚠ Overdue ({overdueMilestones.length})
                </div>
                <div className="flex flex-col gap-2">
                  {overdueMilestones.map((m) => {
                    const days = daysFromNow(m.due_date);
                    return (
                      <div key={m.id} className="flex items-center gap-3 py-2 px-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <input
                          type="checkbox"
                          checked={m.status === "complete"}
                          onChange={() => onToggle(m)}
                          className="w-4 h-4 accent-emerald-500 cursor-pointer shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-[13px] text-gray-100 font-medium">{m.name}</span>
                          {m.assigned_to && <span className="ml-2 text-[12px] text-gray-500">↳ {m.assigned_to}</span>}
                          <span className="ml-2 text-[12px] text-gray-500">— {orderMap.get(m.production_order_id) || "Unknown Order"}</span>
                        </div>
                        <span className="text-[11px] text-gray-500 whitespace-nowrap">{fmtShort(m.due_date)}</span>
                        <span className="text-[12px] text-red-400 font-bold whitespace-nowrap">
                          {days !== null ? `${Math.abs(days)}d overdue` : "—"}
                        </span>
                        <Badge color={milestoneStatusColor(m.status)}>{m.status.replace("_", " ")}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Nothing this week */}
          {thisWeekIncomplete.length === 0 && overdueMilestones.length === 0 && (
            <div className="px-5 py-6 text-[13px] text-gray-500 text-center">Nothing due this week</div>
          )}
          {thisWeekIncomplete.length === 0 && overdueMilestones.length > 0 && (
            <div className="px-5 py-4 text-[13px] text-gray-600 text-center border-b border-border">No milestones due the rest of this week</div>
          )}

          {/* Day-grouped milestones */}
          {daySlots.map((slot, i) => {
            if (slot.milestones.length === 0) return null;
            const isToday = isSameDay(slot.date, todayDate);
            return (
              <div key={slot.key} className={`border-b border-border last:border-0 ${isToday ? "bg-brand/5" : ""}`}>
                <div className="px-5 py-2 flex items-center gap-2 bg-surface-hover/40">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? "text-brand" : "text-gray-500"}`}>
                    {DAY_NAMES[i]}, {slot.date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                  </span>
                  {isToday && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/20 text-brand font-semibold">TODAY</span>
                  )}
                </div>
                <div>
                  {slot.milestones.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-5 py-2.5 border-t border-border/40">
                      <input
                        type="checkbox"
                        checked={m.status === "complete"}
                        onChange={() => onToggle(m)}
                        className="w-4 h-4 accent-emerald-500 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`text-[13px] font-medium ${m.status === "complete" ? "line-through text-gray-500" : "text-gray-100"}`}>
                          {m.name}
                        </span>
                        {m.assigned_to && <span className="ml-2 text-[12px] text-gray-500">↳ {m.assigned_to}</span>}
                        <span className="ml-2 text-[12px] text-gray-500">— {orderMap.get(m.production_order_id) || "Unknown Order"}</span>
                      </div>
                      <Badge color={milestoneStatusColor(m.status)}>{m.status.replace("_", " ")}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ orders }: { orders: Order[] }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const todayDate = today0();

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  // Build 6-week grid
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }

  // Build event map: dateStr → events[]
  type CalEvent = { type: "milestone" | "training" | "delivery"; label: string; status?: string; orderId: string };
  const eventMap = new Map<string, CalEvent[]>();
  const addEvent = (dateStr: string | null, ev: CalEvent) => {
    if (!dateStr) return;
    const key = dateStr.slice(0, 10);
    if (!eventMap.has(key)) eventMap.set(key, []);
    eventMap.get(key)!.push(ev);
  };
  for (const order of orders) {
    for (const m of order.production_milestones) {
      addEvent(m.due_date, { type: "milestone", label: m.name, status: m.status, orderId: order.id });
    }
    addEvent(order.training_date, { type: "training", label: `Training: ${order.order_name}`, orderId: order.id });
    addEvent(order.delivery_date, { type: "delivery", label: `Delivery: ${order.order_name}`, status: order.status, orderId: order.id });
  }

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_NAMES_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const selectedKey = selectedDay ? mkDateKey(selectedDay) : null;
  const selectedEvents = selectedKey ? (eventMap.get(selectedKey) || []) : [];

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg bg-surface-card border border-border text-gray-400 hover:text-gray-200 cursor-pointer transition-colors">◀</button>
        <div className="flex items-center gap-3">
          <span className="text-[18px] font-bold text-gray-100">{MONTH_NAMES[month]} {year}</span>
          <button onClick={() => { setYear(new Date().getFullYear()); setMonth(new Date().getMonth()); setSelectedDay(todayDate); }}
            className="text-[12px] px-2.5 py-1 rounded-md bg-brand/20 border border-brand/30 text-brand cursor-pointer hover:bg-brand/30 transition-colors">
            Today
          </button>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg bg-surface-card border border-border text-gray-400 hover:text-gray-200 cursor-pointer transition-colors">▶</button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES_SHORT.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-gray-500 uppercase py-2">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-t border-border rounded-[14px] overflow-hidden">
        {cells.map((cell, i) => {
          const isCurrentMonth = cell.getMonth() === month;
          const isToday = isSameDay(cell, todayDate);
          const isSelected = selectedDay ? isSameDay(cell, selectedDay) : false;
          const key = mkDateKey(cell);
          const events = eventMap.get(key) || [];
          const hasOverdue = events.some((e) => e.type === "milestone" && e.status !== "complete" &&
            parseDate(key) && parseDate(key)! < todayDate);

          return (
            <div key={i}
              onClick={() => setSelectedDay(isSelected ? null : new Date(cell))}
              className={`border-r border-b border-border min-h-[90px] p-1.5 cursor-pointer transition-colors ${
                isSelected ? "bg-brand/10"
                : hasOverdue && isCurrentMonth ? "bg-red-500/5 hover:bg-red-500/8"
                : isToday ? "bg-[#1a1f35]"
                : isCurrentMonth ? "bg-surface-card hover:bg-surface-hover"
                : "bg-[#0d1117] hover:bg-[#111827]"
              }`}
            >
              <div className={`text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                isToday ? "bg-brand text-white" : isCurrentMonth ? "text-gray-300" : "text-gray-600"
              }`}>
                {cell.getDate()}
              </div>
              {hasOverdue && <div className="w-2 h-2 rounded-full bg-red-500 mb-1" />}
              <div className="flex flex-col gap-0.5">
                {events.slice(0, 3).map((ev, j) => (
                  <div key={j} className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium ${
                    ev.type === "training" ? "bg-amber-500/20 text-amber-300"
                    : ev.type === "delivery" ? (ev.status === "Delivered" ? "bg-emerald-500/20 text-emerald-300" : "bg-purple-500/20 text-purple-300")
                    : ev.status === "complete" ? "bg-emerald-500/20 text-emerald-300"
                    : ev.status === "blocked" ? "bg-red-500/20 text-red-300"
                    : ev.status === "in_progress" ? "bg-blue-500/20 text-blue-300"
                    : "bg-gray-500/20 text-gray-400"
                  }`}>{ev.label}</div>
                ))}
                {events.length > 3 && <div className="text-[10px] text-gray-500 px-1">+{events.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="mt-4 bg-surface-card border border-border rounded-[14px] p-5">
          <div className="flex justify-between items-center mb-4">
            <div className="font-semibold text-gray-100">{selectedDay.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" })}</div>
            <button onClick={() => setSelectedDay(null)} className="text-gray-500 hover:text-gray-300 bg-transparent border-none cursor-pointer text-lg">✕</button>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="text-[13px] text-gray-500">Nothing scheduled for this day.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedEvents.map((ev, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                  ev.type === "training" ? "border-amber-500/20 bg-amber-500/5"
                  : ev.type === "delivery" ? "border-purple-500/20 bg-purple-500/5"
                  : "border-border bg-surface-hover"
                }`}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded mt-0.5 ${
                    ev.type === "training" ? "bg-amber-500/20 text-amber-300"
                    : ev.type === "delivery" ? "bg-purple-500/20 text-purple-300"
                    : "bg-gray-500/20 text-gray-400"
                  }`}>{ev.type}</div>
                  <div>
                    <div className="text-[13px] text-gray-200 font-medium">{ev.label}</div>
                    {ev.status && <div className="text-[11px] text-gray-500 mt-0.5">Status: {ev.status}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Countdown View ───────────────────────────────────────────────────────────

function CountdownView({ orders }: { orders: Order[] }) {
  const todayDate = today0();

  const activeOrders = orders.filter((o) => o.status !== "Delivered")
    .sort((a, b) => {
      const da = parseDate(a.delivery_date)?.getTime() ?? Infinity;
      const db = parseDate(b.delivery_date)?.getTime() ?? Infinity;
      return da - db;
    });

  return (
    <div>
      {activeOrders.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-[14px]">No active production orders.</div>
      ) : (
        <div className="flex flex-col gap-5">
          {activeOrders.map((order) => {
            const delivDays = daysFromNow(order.delivery_date);
            const trainDays = daysFromNow(order.training_date);
            const milestones = [...order.production_milestones].sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
            const mComplete = milestones.filter((m) => m.status === "complete").length;

            const start = parseDate(order.start_date);
            const end = parseDate(order.delivery_date);
            let progressPct = 0;
            if (start && end) {
              const total = end.getTime() - start.getTime();
              const elapsed = todayDate.getTime() - start.getTime();
              progressPct = Math.max(0, Math.min(100, (elapsed / total) * 100));
            }

            const isOverdue = delivDays !== null && delivDays < 0;

            return (
              <div key={order.id} className={`bg-surface-card border rounded-[14px] overflow-hidden ${isOverdue ? "border-red-500/40" : "border-border"}`}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-border">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[15px] font-bold text-gray-100">{order.order_name}</div>
                      <div className="text-[12px] text-gray-500 mt-0.5">
                        {order.customers?.name && <span className="mr-3">{order.customers.name}</span>}
                        <span>Qty: {order.quantity}</span>
                      </div>
                    </div>
                    <div className={`text-[22px] font-bold ${isOverdue ? "text-red-400" : delivDays !== null && delivDays <= 7 ? "text-amber-400" : "text-gray-100"}`}>
                      {delivDays === null ? "—" : delivDays < 0 ? `${Math.abs(delivDays)}d overdue` : delivDays === 0 ? "Due today" : `${delivDays}d left`}
                    </div>
                  </div>

                  {/* Timeline progress bar */}
                  {order.start_date && order.delivery_date && (
                    <div className="mt-4">
                      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                        <span>Start: {fmtShort(order.start_date)}</span>
                        <span>Delivery: {fmtShort(order.delivery_date)}</span>
                      </div>
                      <div className="relative h-2 bg-[#0B0F19] rounded-full overflow-hidden border border-border">
                        <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: isOverdue ? "#ef4444" : "#6366f1" }} />
                        <div className="absolute top-0 bottom-0 w-0.5 bg-white/60" style={{ left: `${progressPct}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Training date */}
                  {order.training_date && (
                    <div className={`mt-2 text-[12px] ${trainDays !== null && trainDays < 0 ? "text-amber-400" : "text-gray-500"}`}>
                      Training: {fmtDate(order.training_date)}
                      {trainDays !== null && <span className="ml-2 font-semibold">{trainDays < 0 ? `(${Math.abs(trainDays)}d ago)` : trainDays === 0 ? "(today)" : `(in ${trainDays}d)`}</span>}
                    </div>
                  )}

                  {/* Milestone progress */}
                  {milestones.length > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                        <span>Milestones</span>
                        <span className="text-emerald-400 font-semibold">{mComplete}/{milestones.length} complete</span>
                      </div>
                      <div className="h-1.5 bg-[#0B0F19] rounded-full overflow-hidden border border-border">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${milestones.length > 0 ? (mComplete / milestones.length) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Milestone list */}
                {milestones.length > 0 && (
                  <div className="divide-y divide-border">
                    {milestones.map((m) => {
                      const mDays = daysFromNow(m.due_date);
                      const mOverdue = m.status !== "complete" && mDays !== null && mDays < 0;
                      const mThisWeek = m.status !== "complete" && mDays !== null && mDays >= 0 && mDays <= 7;
                      return (
                        <div key={m.id} className={`flex items-center gap-3 px-6 py-2.5 ${mOverdue ? "bg-red-500/5" : mThisWeek ? "bg-amber-500/5" : ""}`}>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${milestoneStatusDot(m.status)}`} />
                          <span className={`text-[13px] flex-1 ${m.status === "complete" ? "line-through text-gray-500" : mOverdue ? "text-red-300" : "text-gray-200"}`}>{m.name}</span>
                          {m.assigned_to && <span className="text-[12px] text-gray-500">{m.assigned_to}</span>}
                          {m.due_date && (
                            <span className={`text-[12px] whitespace-nowrap ${mOverdue ? "text-red-400 font-semibold" : mThisWeek ? "text-amber-400" : "text-gray-500"}`}>
                              {fmtShort(m.due_date)}
                              {mOverdue && ` (${Math.abs(mDays!)}d overdue)`}
                              {mThisWeek && mDays === 0 && " (today)"}
                              {mThisWeek && mDays! > 0 && ` (${mDays}d)`}
                            </span>
                          )}
                          <Badge color={milestoneStatusColor(m.status)}>{m.status.replace("_", " ")}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Board View ───────────────────────────────────────────────────────────────

function BoardView({ orders }: { orders: Order[] }) {
  return (
    <div className="grid grid-cols-5 gap-4 min-h-[400px]">
      {ORDER_STATUS_COLS.map((col) => {
        const colOrders = orders.filter((o) => o.status === col);
        return (
          <div key={col} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">{col}</span>
              <span className="text-[11px] text-gray-600 bg-surface-card border border-border px-2 py-0.5 rounded-full">{colOrders.length}</span>
            </div>
            <div className="flex flex-col gap-3">
              {colOrders.map((order) => {
                const delivDays = daysFromNow(order.delivery_date);
                const isOverdue = col !== "Delivered" && delivDays !== null && delivDays < 0;
                const milestones = order.production_milestones;
                const mComplete = milestones.filter((m) => m.status === "complete").length;

                return (
                  <div key={order.id} className={`bg-surface-card border rounded-xl p-4 ${isOverdue ? "border-red-500/50" : "border-border"}`}>
                    <div className="text-[13px] font-semibold text-gray-100 leading-tight mb-1">{order.order_name}</div>
                    {order.customers?.name && (
                      <div className="text-[11px] text-gray-500 mb-2">{order.customers.name}</div>
                    )}
                    {order.delivery_date && (
                      <div className={`text-[12px] font-semibold mb-2 ${isOverdue ? "text-red-400" : delivDays !== null && delivDays <= 7 ? "text-amber-400" : "text-gray-400"}`}>
                        {delivDays === null ? "—"
                          : delivDays < 0 ? `${Math.abs(delivDays)}d overdue`
                          : delivDays === 0 ? "Due today"
                          : `${delivDays}d remaining`}
                      </div>
                    )}
                    {milestones.length > 0 && (
                      <div>
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                          <span>Milestones</span>
                          <span className="text-emerald-400">{mComplete}/{milestones.length}</span>
                        </div>
                        <div className="h-1.5 bg-[#0B0F19] rounded-full overflow-hidden border border-border">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${milestones.length > 0 ? (mComplete / milestones.length) * 100 : 0}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {colOrders.length === 0 && (
                <div className="border border-dashed border-border rounded-xl h-20 flex items-center justify-center text-[12px] text-gray-600">Empty</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductionTimelinePage() {
  const [view, setView] = useState<View>("calendar");
  const [orders, setOrders] = useState<Order[]>([]);
  const [allMilestones, setAllMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowStockCount, setLowStockCount] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        const [prods, rawOrders, rawMilestones] = await Promise.all([
          getProducts(),
          getProductionOrdersWithMilestones(),
          getMilestones(),
        ]);
        setLowStockCount(prods.filter((p: any) => p.stock <= p.reorder_point).length);
        // Client-side join milestones onto orders
        const withMs = rawOrders.map((o: any) => ({
          ...o,
          production_milestones: rawMilestones.filter((m: any) => m.production_order_id === o.id),
        }));
        setOrders(withMs as Order[]);
        setAllMilestones(rawMilestones as Milestone[]);
      } catch { /* silently handle */ }
      finally { setLoading(false); }
    };
    init();
  }, []);

  const handleToggleMilestone = async (m: Milestone) => {
    const newStatus = m.status === "complete" ? "not_started" : "complete";
    // Optimistic update
    setAllMilestones((prev) => prev.map((x) => x.id === m.id ? { ...x, status: newStatus } : x));
    setOrders((prev) => prev.map((o) => ({
      ...o,
      production_milestones: o.production_milestones.map((x) => x.id === m.id ? { ...x, status: newStatus } : x),
    })));
    try {
      await updateMilestone(m.id, { status: newStatus });
    } catch {
      // Revert
      setAllMilestones((prev) => prev.map((x) => x.id === m.id ? { ...x, status: m.status } : x));
      setOrders((prev) => prev.map((o) => ({
        ...o,
        production_milestones: o.production_milestones.map((x) => x.id === m.id ? { ...x, status: m.status } : x),
      })));
    }
  };

  // Stats — computed from flat allMilestones
  const todayDate = today0();
  const weekEnd = endOfWeek(todayDate);
  const activeOrders = orders.filter((o) => o.status !== "Delivered");

  const dueThisWeek = allMilestones.filter((m) => {
    const d = parseDate(m.due_date);
    return d && d >= todayDate && d <= weekEnd && m.status !== "complete";
  }).length;

  const overdueMilestones = allMilestones.filter((m) => {
    const d = parseDate(m.due_date);
    return d && d < todayDate && m.status !== "complete";
  });

  const thisMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const completedThisMonth = allMilestones.filter((m) =>
    m.status === "complete" && parseDate(m.due_date) && parseDate(m.due_date)! >= thisMonthStart
  ).length;

  if (loading) {
    return (
      <>
        <Header lowStockCount={0} />
        <main className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </main>
      </>
    );
  }

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">

        {/* Stats + view toggle */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Active Orders</div>
              <div className="text-[18px] font-bold text-gray-100">{activeOrders.length}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Due This Week</div>
              <div className={`text-[18px] font-bold ${dueThisWeek > 0 ? "text-amber-400" : "text-gray-100"}`}>{dueThisWeek}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Overdue</div>
              <div className={`text-[18px] font-bold ${overdueMilestones.length > 0 ? "text-red-400" : "text-emerald-400"}`}>{overdueMilestones.length}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Completed This Month</div>
              <div className="text-[18px] font-bold text-emerald-400">{completedThisMonth}</div>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-surface-card border border-border rounded-xl p-1">
            {(["calendar", "countdown", "board"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all border ${
                  view === v ? "bg-brand/20 border-brand text-brand" : "bg-transparent border-transparent text-gray-400 hover:text-gray-200"
                }`}>
                {v === "calendar" ? "Calendar" : v === "countdown" ? "Countdown" : "Board"}
              </button>
            ))}
          </div>
        </div>

        {/* Overdue alert banner */}
        {overdueMilestones.length > 0 && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 flex items-start gap-3">
            <span className="text-red-400 text-[15px] shrink-0 mt-0.5">⚠</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-red-400 mb-1">
                {overdueMilestones.length} overdue milestone{overdueMilestones.length !== 1 ? "s" : ""}
              </div>
              <div className="text-[12px] text-red-300/70 leading-relaxed">
                {overdueMilestones.slice(0, 4).map((m) => {
                  const order = orders.find((o) => o.id === m.production_order_id);
                  const days = daysFromNow(m.due_date);
                  return `${m.name} (${order?.order_name || "Unknown"}, ${Math.abs(days || 0)}d overdue)`;
                }).join(" · ")}
                {overdueMilestones.length > 4 && ` · +${overdueMilestones.length - 4} more`}
              </div>
            </div>
          </div>
        )}

        {/* This Week panel — shown above calendar and countdown */}
        {view !== "board" && (
          <ThisWeekPanel
            milestones={allMilestones}
            orders={orders}
            onToggle={handleToggleMilestone}
            collapsible={view === "calendar"}
          />
        )}

        {view === "calendar" && <CalendarView orders={orders} />}
        {view === "countdown" && <CountdownView orders={orders} />}
        {view === "board" && <BoardView orders={orders} />}

      </main>
    </>
  );
}
