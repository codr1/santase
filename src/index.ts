export function resolvePort(envPort: string | undefined): number {
  const parsedPort = envPort ? Number.parseInt(envPort, 10) : NaN;
  return Number.isNaN(parsedPort) ? 3000 : parsedPort;
}

if (import.meta.main) {
  const port = resolvePort(Bun.env.BUN_PORT);

  Bun.serve({
    port,
    fetch() {
      return new Response("Hello");
    },
  });

  console.log(`Server listening on http://localhost:${port}`);
}
