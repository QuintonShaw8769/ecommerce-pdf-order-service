import test from "node:test";
import assert from "node:assert/strict";
import { fulfillmentStatus, orderSchema } from "./order_service.ts";

test("orders at 200 or above receive priority fulfillment", () => {
  const order = orderSchema.parse({ orderId: "ord-200", customerName: "Lin", email: "lin@example.com", shippingAddress: "1 Market St", items: [{ sku: "mug", name: "Mug", quantity: 1, unitPrice: 200 }], total: 200 });
  assert.equal(fulfillmentStatus(order), "priority");
});

test("smaller orders keep standard fulfillment", () => {
  const order = orderSchema.parse({ orderId: "ord-199", customerName: "Lin", email: "lin@example.com", shippingAddress: "1 Market St", items: [{ sku: "mug", name: "Mug", quantity: 1, unitPrice: 199 }], total: 199 });
  assert.equal(fulfillmentStatus(order), "standard");
});
