import { defineConfig } from 'vitest/config';

/**
 * Integration suites talk to real services from docker-compose (Postgres, MinIO, Redis) when their
 * env guards are set, so the default 5s per-test budget is too tight — a BullMQ case waits on real
 * broker round-trips. Guarded suites skip entirely when the services are absent.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
