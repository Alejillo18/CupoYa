export default async function globalSetup() {
  const base = process.env.BASE_URL ?? 'http://localhost:8080';
  try {
    const res = await fetch(`${base}/api/v1/health`);
    if (!res.ok) throw new Error(`health respondió ${res.status}`);
  } catch (err) {
    throw new Error(
      `No pude llegar a CupoYa en ${base} (${(err as Error).message}).\n` +
        'Levantá el stack primero:\n' +
        '  RATE_LIMIT_ENABLED=false docker compose up -d --build\n' +
        '(en PowerShell: $env:RATE_LIMIT_ENABLED="false"; docker compose up -d --build)',
    );
  }
}
