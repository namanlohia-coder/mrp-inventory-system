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
                text: `You are a purchase order data extractor. Extract the following from this vendor quote/invoice PDF and return ONLY valid JSON with no other text, no markdown backticks, no preamble.

Return this exact JSON structure:
{
  "supplier_name": "the vendor/supplier company name",
  "quote_number": "the quote or invoice number if present, otherwise empty string",
  "expected_date": "delivery/expiration date in YYYY-MM-DD format if present, otherwise empty string",
  "notes": "any relevant notes like shipping method, quote number, or special instructions - keep it brief",
  "line_items": [
    {
      "product_name": "clean product name - use the part number in brackets like [SF-H0-17-M-0015] followed by the short description. Example: [SF-H0-17-M-0015] SF L1 Left Front (V1.0). Remove vendor-specific prefixes like '146636-' and manufacturing details like 'MJF - Multi Jet Fusion' or material specs",
      "sku": "the part number in brackets if present, e.g. SF-H0-17-M-0015 (without the brackets). If no clear part number, empty string",
      "quantity": 3,
      "unit_cost": 523.22
    }
  ]
}

Important rules:
- For product_name: Extract the Skyfront part number in brackets (e.g. [SF-H0-17-M-0015]) and the short human-readable name. Drop vendor quote prefixes, manufacturing process details, material specs, and dimensions.
- For unit_cost: Use the per-unit price, NOT the line total
- For quantity: Use the integer quantity ordered
- Do NOT include shipping as a line item unless it appears as a separate line item with a price
- Do NOT include subtotals, tax lines, or summary rows as line items
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
      return NextResponse.json({ error: "Failed to parse quote with AI" }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content
      ?.map((item: any) => (item.type === "text" ? item.text : ""))
      .filter(Boolean)
      .join("");

    // Parse the JSON response
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Quote parse error:", err);
    return NextResponse.json({ error: err.message || "Failed to parse quote" }, { status: 500 });
  }
}
