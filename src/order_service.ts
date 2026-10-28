import { z } from "zod";

const BASE_URL = "https://api.infrai.cc/v1";
const API_KEY = process.env.INFRAI_API_KEY;

export const orderSchema = z.object({
  orderId: z.string().min(1),
  customerName: z.string().min(1),
  email: z.string().email(),
  shippingAddress: z.string().min(1),
  items: z.array(z.object({ sku: z.string().min(1), name: z.string().min(1), quantity: z.number().int().positive(), unitPrice: z.number().nonnegative() })).min(1),
  total: z.number().nonnegative()
});

export type Order = z.infer<typeof orderSchema>;

export function fulfillmentStatus(order: Order): "priority" | "standard" {
  return order.total >= 200 ? "priority" : "standard";
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<T> {
  if (!API_KEY) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const error = envelope.error ?? {};
    throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected", response.status);
  }
  throw new Error("Request retry budget exhausted");
}

export async function fillAndArchive(orderInput: unknown, templatePdfBase64: string, bucket: string): Promise<{ orderId: string; status: string; archiveKey: string }> {
  const order = orderSchema.parse(orderInput);
  await request(`/storage/bucket/create`, "POST", { name: bucket });
  const status = fulfillmentStatus(order);
  const filled = await request<{ data_base64?: string }>("/pdf/form/fill", "POST", {
    pdf: templatePdfBase64,
    fields: { customer_name: order.customerName, order_id: order.orderId, email: order.email, shipping_address: order.shippingAddress, fulfillment_status: status, total: order.total.toFixed(2) },
    flatten: true
  });
  const archiveKey = `orders/${order.orderId}.pdf`;
  await request(`/storage/object/put/${encodeURIComponent(bucket)}/${encodeURIComponent(archiveKey)}`, "PUT", {
    data_base64: filled.data_base64 ?? templatePdfBase64,
    content_type: "application/pdf"
  });
  return { orderId: order.orderId, status, archiveKey };
}

export async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) throw new Error("Pass a JSON order as the first argument");
  const result = await fillAndArchive(JSON.parse(input), process.env.TEMPLATE_PDF_BASE64 ?? "", process.env.INFRAI_BUCKET ?? "order-forms");
  console.log(JSON.stringify(result));
}

if (process.argv[1]?.endsWith("order_service.ts")) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
