export function startOfflineMonitor({ repository, config, broadcaster }) {
  const timer = setInterval(() => { const cutoff = new Date(Date.now() - config.deviceOfflineTimeoutSeconds * 1000).toISOString(); if (repository.markOffline(cutoff)) broadcaster({ type: "device.status.changed", data: { status: "offline", checkedAt: new Date().toISOString() } }); }, 10_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
