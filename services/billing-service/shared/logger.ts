export function log(message: string, service: string = "app") {
  const ts = new Date().toISOString();
  console.log(`${ts} [${service}] ${message}`);
}

export function logError(message: string, service: string = "app", err?: unknown) {
  const ts = new Date().toISOString();
  console.error(`${ts} [${service}] ERROR: ${message}`, err ?? "");
}
