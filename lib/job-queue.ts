const queue: Array<() => Promise<void>> = [];
let busy = false;

async function runNext() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  try {
    await job();
  } finally {
    busy = false;
    void runNext();
  }
}

export function enqueueJob(job: () => Promise<void>) {
  queue.push(job);
  void runNext();
  return { queued: true, size: queue.length };
}
