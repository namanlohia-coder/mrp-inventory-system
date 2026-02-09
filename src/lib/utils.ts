import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function getStockStatus(stock: number, reorderPoint: number) {
  if (stock === 0) return { label: "Out of Stock", color: "red" as const };
  if (stock <= reorderPoint) return { label: "Low Stock", color: "orange" as const };
  return { label: "In Stock", color: "green" as const };
}

export function getPOStatusColor(status: string) {
  const map: Record<string, string> = {
    draft: "default",
    ordered: "blue",
    partial: "orange",
    received: "green",
    cancelled: "red",
  };
  return (map[status] || "default") as "default" | "blue" | "orange" | "green" | "red";
}
