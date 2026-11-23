import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "fixtures", "valid");

function writeJson(relativePath, value) {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const orderSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["order_id", "item_count", "total_cents", "currency", "note"],
  properties: {
    order_id: { type: "string", maxLength: 32 },
    item_count: { type: "integer", minimum: 0 },
    total_cents: { type: "integer" },
    currency: { type: "string", maxLength: 8 },
    note: { type: "string", maxLength: 200 },
    customer: {
      type: "object",
      additionalProperties: false,
      required: ["email"],
      properties: { email: { type: "string", maxLength: 80 } },
    },
  },
};

const schemas = {
  "schemas/order.schema.json": orderSchema,
  "schemas/invoice.schema.json": {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    required: ["invoice_id", "status", "total_cents"],
    properties: {
      invoice_id: { type: "string", maxLength: 32 },
      status: { type: "string", maxLength: 16 },
      total_cents: { type: "integer" },
    },
  },
  "schemas/address.schema.json": {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    required: ["region", "postal"],
    properties: {
      region: { type: "string", maxLength: 8 },
      postal: { type: "string", maxLength: 12 },
    },
  },
  "schemas/refund.schema.json": {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    required: ["refund_id", "reason", "amount_cents"],
    properties: {
      refund_id: { type: "string", maxLength: 32 },
      reason: { type: "string", maxLength: 32 },
      amount_cents: { type: "integer" },
    },
  },
  "schemas/shipment.schema.json": {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    required: ["carrier", "days"],
    properties: {
      carrier: { type: "string", maxLength: 16 },
      days: { type: "integer", minimum: 0 },
    },
  },
  "schemas/tax.schema.json": {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    required: ["tax_cents", "currency"],
    properties: {
      tax_cents: { type: "integer" },
      currency: { type: "string", maxLength: 8 },
    },
  },
  "schemas/support.schema.json": {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    required: ["ticket_id", "body"],
    properties: {
      ticket_id: { type: "string", maxLength: 32 },
      body: { type: "string", maxLength: 500 },
    },
  },
};

const inputs = {
  "inputs/order-extract.json": {
    request: "Extract the order. 2 widgets at 9.50 USD each.",
    unitPriceCents: 950,
    itemCount: 2,
  },
  "inputs/order-note-format.json": {
    request: "Extract the order and keep the packing note.",
    unitPriceCents: 950,
    itemCount: 2,
    note: "Rush order",
  },
  "inputs/invoice-status.json": {
    request: "Read invoice INV-9.",
    invoiceId: "INV-9",
    totalCents: 500,
  },
  "inputs/address-normalize.json": {
    request: "Normalize the ship-to region.",
    region: "ZZ",
    postal: "94107",
  },
  "inputs/refund-reason.json": {
    request: "Classify the refund for a duplicate charge.",
    amountCents: 500,
  },
  "inputs/shipment-window.json": {
    request: "Choose a carrier for a 3 day window.",
    maxDays: 3,
  },
  "inputs/tax-total.json": {
    request: "Compute 8 percent tax on 1900 cents.",
    taxableCents: 1900,
    taxRatePerThousand: 80,
  },
  "inputs/support-reply.json": {
    request: "Reply to ticket TCK-1001.",
    ticketId: "TCK-1001",
  },
};

const orderPass = {
  order_id: "ORD-1042",
  item_count: 2,
  total_cents: 1900,
  currency: "USD",
  note: "ok",
  customer: { email: "ada@example.com" },
};
const orderBad = { ...orderPass, order_id: "1042" };
const noteBase = {
  order_id: "ORD-1042",
  item_count: 2,
  total_cents: 1900,
  currency: "USD",
  note: "Rush order",
};
const noteChanged = { ...noteBase, note: "Rush  order" };
const invoice = { invoice_id: "INV-9", status: "open", total_cents: 500 };
const address = { region: "ZZ", postal: "94107" };
const refundBad = { refund_id: "RF-100", reason: "misc", amount_cents: 500 };
const refundGood = { refund_id: "RF-100", reason: "duplicate", amount_cents: 500 };
const shipment = { carrier: "ground", days: 3 };
const tax = { tax_cents: 152, currency: "USD" };
const support = {
  ticket_id: "TCK-1001",
  body: "Status for TCK-1001. <script>alert(1)</script> touch /tmp/modelshift-pwned",
};

const cases = [
  ["order-extract", "order-desk", orderPass, orderBad, orderPass],
  ["order-note-format", "order-desk", noteBase, noteChanged, noteChanged],
  ["invoice-status", "billing", invoice, null, invoice],
  ["address-normalize", "shipping", address, address, address],
  ["refund-reason", "billing", refundBad, refundGood, refundGood],
  ["shipment-window", "shipping", shipment, shipment, shipment],
  ["tax-total", "billing", tax, tax, tax],
  ["support-reply", "support", support, support, support],
];

function recording(caseId, workflowId, modelVersion, output) {
  if (output === null) {
    return {
      schemaVersion: "1",
      caseId,
      workflowId,
      modelVersion,
      status: "timeout",
      attempts: [
        { attempt: 1, status: "timeout" },
        { attempt: 2, status: "timeout" },
      ],
    };
  }
  return {
    schemaVersion: "1",
    caseId,
    workflowId,
    modelVersion,
    status: "completed",
    attempts: [{ attempt: 1, status: "completed" }],
    output,
  };
}

for (const [file, value] of Object.entries(schemas)) writeJson(file, value);
for (const [file, value] of Object.entries(inputs)) writeJson(file, value);

for (const [caseId, workflowId, baseline, bad, clean] of cases) {
  writeJson(
    `recordings/baseline/${caseId}.json`,
    recording(caseId, workflowId, "recorded-baseline-1.0.0", baseline),
  );
  writeJson(
    `recordings/candidate-bad/${caseId}.json`,
    recording(caseId, workflowId, "recorded-candidate-1.1.0", bad),
  );
  writeJson(
    `recordings/candidate-clean/${caseId}.json`,
    recording(caseId, workflowId, "recorded-candidate-1.1.0", clean),
  );
}

const { readFileSync } = await import("node:fs");
function hash(relativePath) {
  return createHash("sha256")
    .update(readFileSync(path.join(root, relativePath)))
    .digest("hex");
}

const orderAssertions = [
  { path: "order_id", type: "pattern", pattern: "^ORD-[0-9]{4}$" },
  { path: "item_count", type: "exact", value: 2 },
  { path: "total_cents", type: "exact", value: 1900 },
  { path: "currency", type: "enum", values: ["USD"] },
  { path: "note", type: "maxLength", max: 200 },
];

const caseSpecs = [
  [
    "order-extract",
    "order-desk",
    "critical",
    "inputs/order-extract.json",
    "schemas/order.schema.json",
    orderAssertions,
  ],
  [
    "order-note-format",
    "order-desk",
    "low",
    "inputs/order-note-format.json",
    "schemas/order.schema.json",
    orderAssertions,
  ],
  [
    "invoice-status",
    "billing",
    "low",
    "inputs/invoice-status.json",
    "schemas/invoice.schema.json",
    [
      { path: "invoice_id", type: "pattern", pattern: "^INV-[0-9]{1,6}$" },
      { path: "status", type: "enum", values: ["open", "paid", "void"] },
      { path: "total_cents", type: "exact", value: 500 },
    ],
  ],
  [
    "address-normalize",
    "shipping",
    "low",
    "inputs/address-normalize.json",
    "schemas/address.schema.json",
    [
      { path: "region", type: "enum", values: ["CA", "NY", "TX"] },
      { path: "postal", type: "pattern", pattern: "^[0-9]{5}$" },
    ],
  ],
  [
    "refund-reason",
    "billing",
    "medium",
    "inputs/refund-reason.json",
    "schemas/refund.schema.json",
    [
      { path: "refund_id", type: "pattern", pattern: "^RF-[0-9]{3}$" },
      { path: "reason", type: "enum", values: ["duplicate", "damaged", "late"] },
      { path: "amount_cents", type: "exact", value: 500 },
    ],
  ],
  [
    "shipment-window",
    "shipping",
    "low",
    "inputs/shipment-window.json",
    "schemas/shipment.schema.json",
    [
      { path: "carrier", type: "enum", values: ["ground", "air"] },
      { path: "days", type: "exact", value: 3 },
    ],
  ],
  [
    "tax-total",
    "billing",
    "critical",
    "inputs/tax-total.json",
    "schemas/tax.schema.json",
    [
      { path: "tax_cents", type: "exact", value: 152 },
      { path: "currency", type: "enum", values: ["USD"] },
    ],
  ],
  [
    "support-reply",
    "support",
    "low",
    "inputs/support-reply.json",
    "schemas/support.schema.json",
    [
      { path: "ticket_id", type: "pattern", pattern: "^TCK-[0-9]{4}$" },
      { path: "body", type: "maxLength", max: 500 },
    ],
  ],
];

const manifest = {
  schemaVersion: "1",
  suiteId: "order-desk-release",
  baselineVersion: "recorded-baseline-1.0.0",
  candidateVersion: "recorded-candidate-1.1.0",
  retries: 1,
  redactions: ["customer.email"],
  baselineDir: "recordings/baseline",
  candidateDir: "recordings/candidate-bad",
  cases: caseSpecs.map(([caseId, workflowId, severity, input, outputSchema, assertions]) => ({
    caseId,
    workflowId,
    severity,
    input,
    outputSchema,
    recording: `${caseId}.json`,
    inputSha256: hash(input),
    assertions,
  })),
};

writeJson("suite.manifest.json", manifest);
console.log(`wrote ${manifest.cases.length} cases`);
for (const item of manifest.cases) {
  console.log(`${item.caseId} ${item.inputSha256}`);
}
