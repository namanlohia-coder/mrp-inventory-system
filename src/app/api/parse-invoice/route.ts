import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { pdfBase64 } = await req.json();

    if (!pdfBase64) {
      return NextResponse.json({ error: "No PDF data provided" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              {
                type: "text",
                text: `You are an invoice data extractor. Extract the following from this invoice PDF and return ONLY valid JSON with no other text, no markdown backticks, no preamble.

Return this exact JSON structure:
{
  "vendor_name": "the vendor/supplier company name",
  "invoice_number": "the invoice number or reference number, empty string if not found",
  "amount": 1234.56,
  "date": "invoice date in YYYY-MM-DD format, empty string if not found",
  "line_items": [
    {
      "description": "item description",
      "quantity": 1,
      "unit_price": 100.00,
      "total": 100.00
    }
  ]
}

Important rules:
- For amount: use the total invoice amount (grand total including tax if present)
- For date: use the invoice date (not due date)
- For line_items: include all billable line items but NOT tax lines, shipping totals, or summary rows
- Return ONLY the JSON object, nothing else`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return NextResponse.json({ error: "Failed to parse invoice with AI" }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content
      ?.map((item: any) => (item.type === "text" ? item.text : ""))
      .filter(Boolean)
      .join("");

    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Invoice parse error:", err);
    return NextResponse.json({ error: err.message || "Failed to parse invoice" }, { status: 500 });
  }
}
