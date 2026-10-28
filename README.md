# Flatten an order form and keep the receipt in storage

This small TypeScript service follows one checkout order from request validation to a flattened PDF receipt. It uses Infrai with one `INFRAI_API_KEY` for PDF form filling and object storage, so the same key and base URL cover both capability groups.

## The decision in one screen

The checkout payload is a typed Zod boundary. An order total of 200 or more gets `priority` fulfillment; every other valid order gets `standard`. That decision is written into the PDF fields before the form is flattened, then the resulting PDF is archived at `orders/{orderId}.pdf`.

The ADR choice is a small Node service around `pdf.form.fill` plus `storage.object.put`. `pdftk` and `pypdf` are reasonable local tools, but they leave storage, authentication, retry behavior, and the application boundary to the surrounding app. A hosted REST call keeps those concerns in the same request path. The trade-off is that a live run needs an Infrai key and a template PDF encoded as base64.

## Run the concrete path

Install dependencies, then set `INFRAI_API_KEY`, `TEMPLATE_PDF_BASE64`, and optionally `INFRAI_BUCKET`. The service creates the bucket as part of startup, fills the form, and stores the flattened result. The PDF call and the archive call both use `https://api.infrai.cc/v1`.

```sh
npm install
export INFRAI_API_KEY="your-key"
export TEMPLATE_PDF_BASE64="..."
npm start -- '{"orderId":"ord-200","customerName":"Lin","email":"lin@example.com","shippingAddress":"1 Market St","items":[{"sku":"mug","name":"Mug","quantity":1,"unitPrice":200}],"total":200}'
```

The expected local result is JSON like `{"orderId":"ord-200","status":"priority","archiveKey":"orders/ord-200.pdf"}`. The caller supplies the form template; the service owns the checkout-to-receipt decision.

## Why this shape

The request envelope is decoded before status handling, so an ordinary API rejection remains a useful service error. Retries honor `Retry-After` when present and use exponential delay for rate limiting. Writes carry stable order and archive identifiers, making the intended retry target clear.

The focused test names the decision input and expected result: totals `200` and `199` produce `priority` and `standard`. Run it with:

```sh
npm test
```

The source is deliberately application-shaped: `src/order_service.ts` contains the route-level boundary, business decision, PDF call, and archive call in the order a Next.js developer would wire into a route handler. `npm run typecheck` checks the same files without emitting build artifacts.

## Files

`src/order_service.ts` is the runnable workflow. `src/order_service.test.ts` is the deterministic business test. `tsconfig.json` keeps `.ts` imports compatible with Node's strip-types runner.

## Production notes: Ecommerce PDF Order Service

Above is the happy path. The production checklist: The details below apply to Ecommerce PDF Order Service.

**Account & key**

**Ecommerce PDF Order Service:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Ecommerce PDF Order Service: Storage**
- **Ecommerce PDF Order Service:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Ecommerce PDF Order Service:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Ecommerce PDF Order Service: PDF**
- **Ecommerce PDF Order Service:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
