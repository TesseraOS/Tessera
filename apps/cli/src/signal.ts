/** Resolve when the process receives an interrupt/terminate signal — the shutdown latch for `serve`/`mcp`. */
export function waitForShutdownSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    const onSignal = (signal: NodeJS.Signals): void => resolve(signal);
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  });
}
