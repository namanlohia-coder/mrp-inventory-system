// src/lib/generate-po-pdf.ts
// Generates a Purchase Order PDF matching Skyfront Corp's Katana format
// Uses jspdf (installed via npm)

import jsPDF from "jspdf";
import type { PurchaseOrder } from "@/types/database";

const COMPANY = {
  name: "Skyfront Corp",
  street: "500 Howland Street",
  suite: "Suite 5",
  city: "Redwood City",
  state: "CA",
  zip: "94063",
  country: "United States",
  taxId: "47-1396170",
  resaleCert: "253901952",
};

export function generatePOPdf(po: PurchaseOrder) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const bottomMargin = 20; // Reserve space for footer
  let y = 20;
  let pageNum = 1;

  // Reset text color to black
  doc.setTextColor(0, 0, 0);

  // Helper: check if we need a new page
  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > pageHeight - bottomMargin) {
      // Add footer to current page
      addFooter(pageNum);
      // New page
      doc.addPage();
      pageNum++;
      y = 20;
      doc.setTextColor(0, 0, 0);
      return true;
    }
    return false;
  };

  const addFooter = (pNum: number) => {
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Printed on ${new Date().toISOString().split("T")[0]}`,
      margin,
      pageHeight - 10
    );
    doc.text(`${pNum}`, pageWidth - margin, pageHeight - 10, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  // ─── TITLE ─────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(`Purchase order: ${po.po_number}`, margin, y);
  y += 15;

  // ─── SUPPLIER + PO DATES (side by side) ────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Supplier:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(po.supplier?.name || "—", margin, y + 5);

  // Right side - dates
  const rightCol = 120;
  doc.setFont("helvetica", "bold");
  doc.text("PO date:", rightCol, y);
  doc.setFont("helvetica", "normal");
  doc.text(formatDate(po.created_at), rightCol + 35, y);

  doc.setFont("helvetica", "bold");
  doc.text("Expected arrival:", rightCol, y + 5);
  doc.setFont("helvetica", "normal");
  doc.text(po.expected_date ? formatDate(po.expected_date) : "—", rightCol + 35, y + 5);

  y += 20;

  // ─── BILL TO / SHIP TO ─────────────────────────────
  const addressLines = [
    COMPANY.name,
    COMPANY.street,
    COMPANY.suite,
    COMPANY.city,
    `${COMPANY.state} ${COMPANY.zip}`,
    COMPANY.country,
  ];

  // Bill To
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Bill to:", margin, y);
  doc.setFont("helvetica", "normal");
  addressLines.forEach((line, i) => {
    doc.text(line, margin, y + 5 + i * 4.5);
  });

  // Ship To (with light gray background box)
  const shipX = 110;
  doc.setFillColor(245, 245, 245);
  doc.rect(shipX - 3, y - 3, 80, 35, "F");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Ship to:", shipX, y);
  doc.setFont("helvetica", "normal");
  addressLines.forEach((line, i) => {
    doc.text(line, shipX, y + 5 + i * 4.5);
  });

  y += 40;

  // ─── LINE ITEMS TABLE ──────────────────────────────
  // Filter out the dummy "Shipping" line item (qty 0, cost 0) imported from Katana
  const allItems = po.line_items || [];
  const items = allItems.filter((item) => item.product?.name !== "Shipping");
  const colX = {
    num: margin,
    item: margin + 8,
    qty: 95,
    price: 120,
    total: 145,
    tax: 170,
    arrival: 185,
  };

  const drawTableHeader = () => {
    // Table header background
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, y, pageWidth - margin * 2, 8, "F");

    // Table header text
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Item", colX.item, y + 5.5);
    doc.text("Quantity", colX.qty, y + 5.5);
    doc.text("Price per unit", colX.price, y + 5.5);
    doc.text("Total cost", colX.total, y + 5.5);
    doc.text("Tax", colX.tax, y + 5.5);
    doc.text("Exp. arrival", colX.arrival, y + 5.5);

    y += 10;
  };

  drawTableHeader();

  // Table border
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);

  // Line items
  let subtotal = 0;
  let totalUnits = 0;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);

  items.forEach((item, i) => {
    const lineTotal = item.quantity * item.unit_cost;
    subtotal += lineTotal;
    totalUnits += item.quantity;
    const productName = item.product?.name || "Unknown Item";
    const sku = item.product?.sku || "";
    const unit = item.product?.unit || "pcs";

    // Calculate row height
    const itemText = sku ? `[${sku}] ${productName}` : productName;
    const splitName = doc.splitTextToSize(itemText, 50);
    const rowHeight = splitName.length > 1 ? 18 : 14;

    // Check if we need a page break
    if (checkPageBreak(rowHeight + 2)) {
      drawTableHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
    }

    // Alternating row background
    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 1, pageWidth - margin * 2, rowHeight, "F");
    }

    doc.setTextColor(0, 0, 0);

    // Row number
    doc.text(`${i + 1}.`, colX.num, y + 4);

    // Item name (may wrap)
    doc.text(splitName, colX.item, y + 4);

    // Quantity
    doc.text(`${item.quantity}  ${unit}`, colX.qty, y + 4);

    // Price per unit
    doc.text(`${item.unit_cost.toFixed(2)}  USD`, colX.price, y + 4);

    // Total cost
    doc.text(`${lineTotal.toFixed(2)}  USD`, colX.total, y + 4);

    // Tax
    doc.text("0 %", colX.tax, y + 4);

    // Expected arrival
    doc.text(po.expected_date ? formatDate(po.expected_date) : "—", colX.arrival, y + 4);

    // Row bottom border
    y += rowHeight;
    doc.line(margin, y - 2, pageWidth - margin, y - 2);
  });

  // Use DB total_amount (includes shipping/additional costs from Katana)
  // Fall back to line item subtotal only if total_amount is missing
  const poTotal = (po as any).total_amount || subtotal;
  const shipping = poTotal - subtotal;

  // Shipping row (if applicable)
  if (shipping > 0.01) {
    checkPageBreak(14);
    const shippingRowHeight = 14;
    if (items.length % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 1, pageWidth - margin * 2, shippingRowHeight, "F");
    }
    doc.setTextColor(0, 0, 0);
    doc.text(`${items.length + 1}.`, colX.num, y + 4);
    doc.text("Shipping", colX.item, y + 4);
    doc.text("", colX.qty, y + 4);
    doc.text("", colX.price, y + 4);
    doc.text(`${shipping.toFixed(2)}  USD`, colX.total, y + 4);
    doc.text("0 %", colX.tax, y + 4);
    doc.text(po.expected_date ? formatDate(po.expected_date) : "—", colX.arrival, y + 4);
    y += shippingRowHeight;
    doc.line(margin, y - 2, pageWidth - margin, y - 2);
  }

  // Total with tax row
  checkPageBreak(12);
  y += 2;
  doc.setFillColor(240, 240, 240);
  doc.rect(colX.total - 25, y - 2, pageWidth - margin - colX.total + 25, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("Total (with tax):", colX.total - 22, y + 3.5);
  doc.text(`${poTotal.toFixed(2)}  USD`, colX.total + 10, y + 3.5);

  y += 18;

  // ─── SUMMARY BOX ───────────────────────────────────
  checkPageBreak(55);
  const summaryX = 120;
  const summaryW = pageWidth - margin - summaryX;

  // Total units row
  doc.setFillColor(245, 245, 245);
  doc.rect(summaryX, y, summaryW, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("Total units:", summaryX + 3, y + 5.5);
  doc.text(`${totalUnits} pcs`, summaryX + summaryW - 3, y + 5.5, { align: "right" });

  y += 9;
  doc.setFillColor(245, 245, 245);
  doc.rect(summaryX, y, summaryW, 8, "F");
  doc.setTextColor(0, 0, 0);
  doc.text("Subtotal (tax excluded):", summaryX + 3, y + 5.5);
  doc.text(`${subtotal.toFixed(2)}  USD`, summaryX + summaryW - 3, y + 5.5, { align: "right" });

  if (shipping > 0.01) {
    y += 9;
    doc.setFillColor(245, 245, 245);
    doc.rect(summaryX, y, summaryW, 8, "F");
    doc.setTextColor(0, 0, 0);
    doc.text("Plus additional costs (tax excluded):", summaryX + 3, y + 5.5);
    doc.text(`${shipping.toFixed(2)}  USD`, summaryX + summaryW - 3, y + 5.5, { align: "right" });
  }

  y += 9;
  doc.setFillColor(245, 245, 245);
  doc.rect(summaryX, y, summaryW, 8, "F");
  doc.setTextColor(0, 0, 0);
  doc.text("Plus tax:", summaryX + 3, y + 5.5);
  doc.text("0.00  USD", summaryX + summaryW - 3, y + 5.5, { align: "right" });

  y += 9;
  doc.setFillColor(235, 235, 235);
  doc.rect(summaryX, y, summaryW, 9, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Total:", summaryX + 3, y + 6);
  doc.text(`${poTotal.toFixed(2)}  USD`, summaryX + summaryW - 3, y + 6, { align: "right" });

  y += 22;

  // ─── ADDITIONAL INFO ───────────────────────────────
  checkPageBreak(25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Additional info:", margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Federal Tax ID: ${COMPANY.taxId}`, margin, y);
  y += 4.5;
  doc.text(`Resale Certificate ${COMPANY.resaleCert}`, margin, y);
  y += 4.5;
  doc.text("Exempt from Sales Taxes", margin, y);
  y += 4.5;

  // Add PO notes if present
  if (po.notes) {
    y += 2;
    const noteLines = doc.splitTextToSize(po.notes, pageWidth - margin * 2);
    doc.text(noteLines, margin, y);
  }

  // ─── FOOTER on last page ───────────────────────────
  addFooter(pageNum);

  // ─── SAVE ──────────────────────────────────────────
  doc.save(`${po.po_number}.pdf`);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  // If it's a date-only string like "2026-02-10", append T00:00:00 to avoid timezone shift
  // If it's a full timestamp like "2026-02-10T15:30:00.000Z", parse directly but show date in UTC
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = new Date(isDateOnly ? dateStr + "T00:00:00" : dateStr);
  if (isNaN(d.getTime())) return "—";
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
