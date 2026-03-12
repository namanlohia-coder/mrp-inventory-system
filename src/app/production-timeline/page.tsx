"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Badge, LoadingSpinner } from "@/components/ui";
import { getProducts, getProductionOrdersWithMilestones } from "@/lib/data";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string;
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
  r.setDate(r.getDate() - r.getDay()); return r;
}
function endOfWeek(d: Date): Date {
  const r = startOfWeek(d); r.setDate(r.getDate() + 6); return r;
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
  const eventMap = new Map<string, { type: "milestone" | "training" | "delivery"; label: string; status?: string; orderId: string }[]>();
  const addEvent = (dateStr: string | null, ev: typeof eventMap extends Map<string, infer V> ? V[number] : never) => {
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
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const selectedKey = selectedDay ? `${selectedDay.getFullYear()}-${String(selectedDay.getMonth()+1).padStart(2,"0")}-${String(selectedDay.getDate()).padStart(2,"0")}` : null;
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
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-gray-500 uppercase py-2">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-t border-border rounded-[14px] overflow-hidden">
        {cells.map((cell, i) => {
          const isCurrentMonth = cell.getMonth() === month;
          const isToday = isSameDay(cell, todayDate);
          const isSelected = selectedDay ? isSameDay(cell, selectedDay) : false;
          const key = `${cell.getFullYear()}-${String(cell.getMonth()+1).padStart(2,"0")}-${String(cell.getDate()).padStart(2,"0")}`;
          const events = eventMap.get(key) || [];
          const hasOverdue = events.some((e) => e.type === "milestone" && e.status !== "complete" &&
            parseDate(key) && parseDate(key)! < todayDate);

          return (
            <div key={i}
              onClick={() => setSelectedDay(isSelected ? null : new Date(cell))}
              className={`border-r border-b border-border min-h-[90px] p-1.5 cursor-pointer transition-colors ${
                isSelected ? "bg-brand/10" : isToday ? "bg-[#1a1f35]" : isCurrentMonth ? "bg-surface-card hover:bg-surface-hover" : "bg-[#0d1117] hover:bg-[#111827]"
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
  const weekEnd = endOfWeek(todayDate);

  const activeOrders = orders.filter((o) => o.status !== "Delivered")
    .sort((a, b) => {
      const da = parseDate(a.delivery_date)?.getTime() ?? Infinity;
      const db = parseDate(b.delivery_date)?.getTime() ?? Infinity;
      return da - db;
    });

  const thisWeekMilestones = orders.flatMap((o) =>
    o.production_milestones
      .filter((m) => {
        if (m.status === "complete") return false;
        const d = parseDate(m.due_date);
        return d && d >= todayDate && d <= weekEnd;
      })
      .map((m) => ({ ...m, orderName: o.order_name }))
  ).sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  return (
    <div>
      {/* This Week */}
      {thisWeekMilestones.length > 0 && (
        <div className="mb-6 bg-surface-card border border-border rounded-[14px] p-5">
          <div className="text-[12px] font-semibold text-amber-400 uppercase tracking-widest mb-3">This Week</div>
          <div className="flex flex-col gap-2">
            {thisWeekMilestones.map((m) => {
              const days = daysFromNow(m.due_date);
              return (
                <div key={m.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${milestoneStatusDot(m.status)}`} />
                  <span className="text-[13px] text-gray-200 font-medium flex-1">{m.name}</span>
                  <span className="text-[12px] text-gray-500">{m.orderName}</span>
                  {m.assigned_to && <span className="text-[12px] text-gray-500">{m.assigned_to}</span>}
                  <span className={`text-[12px] font-semibold ${days === 0 ? "text-red-400" : "text-amber-400"}`}>
                    {days === 0 ? "Today" : `${days}d`}
                  </span>
                  <Badge color={milestoneStatusColor(m.status)}>{m.status.replace("_", " ")}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Order cards */}
      {activeOrders.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-[14px]">No active production orders.</div>
      ) : (
        <div className="flex flex-col gap-5">
          {activeOrders.map((order) => {
            const delivDays = daysFromNow(order.delivery_date);
            const trainDays = daysFromNow(order.training_date);
            const milestones = [...order.production_milestones].sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
            const mComplete = milestones.filter((m) => m.status === "complete").length;

            // Progress bar
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

                  {/* Progress bar */}
                  {order.start_date && order.delivery_date && (
                    <div className="mt-4">
                      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                        <span>Start: {fmtShort(order.start_date)}</span>
                        <span>Delivery: {fmtShort(order.delivery_date)}</span>
                      </div>
                      <div className="relative h-2 bg-[#0B0F19] rounded-full overflow-hidden border border-border">
                        <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: isOverdue ? "#ef4444" : "#6366f1" }} />
                        {/* Today marker */}
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
                  <div className="mt-2 text-[12px] text-gray-500">
                    Milestones: <span className="text-emerald-400 font-semibold">{mComplete}</span>/{milestones.length} complete
                  </div>
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
  const todayDate = today0();

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
  const [loading, setLoading] = useState(true);
  const [lowStockCount, setLowStockCount] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        const [prods, ordersData] = await Promise.all([
          getProducts(),
          getProductionOrdersWithMilestones(),
        ]);
        setLowStockCount(prods.filter((p: any) => p.stock <= p.reorder_point).length);
        setOrders(ordersData as Order[]);
      } catch { /* silently handle */ }
      finally { setLoading(false); }
    };
    init();
  }, []);

  // Stats
  const todayDate = today0();
  const weekEnd = endOfWeek(todayDate);
  const activeOrders = orders.filter((o) => o.status !== "Delivered");
  const allMilestones = orders.flatMap((o) => o.production_milestones);

  const dueThisWeek = allMilestones.filter((m) => {
    const d = parseDate(m.due_date);
    return d && d >= todayDate && d <= weekEnd && m.status !== "complete";
  }).length;

  const overdue = allMilestones.filter((m) => {
    const d = parseDate(m.due_date);
    return d && d < todayDate && m.status !== "complete";
  }).length;

  const thisMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const completedThisMonth = allMilestones.filter((m) => m.status === "complete" && parseDate(m.due_date) && parseDate(m.due_date)! >= thisMonthStart).length;

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">

        {/* Stats + view toggle */}
        <div className="flex justify-between items-center mb-6">
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
              <div className={`text-[18px] font-bold ${overdue > 0 ? "text-red-400" : "text-emerald-400"}`}>{overdue}</div>
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

        {view === "calendar" && <CalendarView orders={orders} />}
        {view === "countdown" && <CountdownView orders={orders} />}
        {view === "board" && <BoardView orders={orders} />}

      </main>
    </>
  );
}
