import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 5175;
const baseUrl = `http://127.0.0.1:${port}/?qa=1`;
const firebaseEnv = {
  ...process.env,
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-ns-shaft.firebaseapp.com",
  VITE_FIREBASE_DATABASE_URL: "http://127.0.0.1:9000?ns=demo-ns-shaft",
  VITE_FIREBASE_PROJECT_ID: "demo-ns-shaft",
  VITE_FIREBASE_APP_ID: "1:123:web:demo",
  VITE_FIREBASE_EMULATOR: "1"
};

const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
  env: firebaseEnv,
  stdio: ["ignore", "pipe", "pipe"]
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

try {
  await waitForServer(baseUrl);
  await run("node", ["tests/firebase-smoke.mjs"], {
    ...firebaseEnv,
    NS_SHAFT_URL: baseUrl
  });
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(2000)
  ]);
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before startup:\n${serverOutput}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry while Vite starts.
    }
    await delay(100);
  }
  throw new Error(`Vite did not start:\n${serverOutput}`);
}

async function run(command, args, env) {
  const child = spawn(command, args, { env, stdio: "inherit" });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  if (code !== 0) throw new Error(`${command} exited with ${code}`);
}
