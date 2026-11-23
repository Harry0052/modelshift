export class GateError extends Error {
  readonly exitCode: 2 | 3;
  readonly category: "invalid_config" | "quarantined";
  readonly details: string[];

  constructor(exitCode: 2 | 3, category: "invalid_config" | "quarantined", details: string[]) {
    super(details.join("\n"));
    this.name = "GateError";
    this.exitCode = exitCode;
    this.category = category;
    this.details = details;
  }
}

export function formatGateError(error: GateError): string {
  return error.details.map((detail) => `${error.category}: ${detail}`).join("\n");
}
