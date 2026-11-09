import { spawn } from "node:child_process";

const ip = process.argv[2] || "127.0.0.1";
if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
  console.error("Invalid IP address.");
  process.exit(1);
}

function portFromEnvironment(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`${name} must be an integer from 1 to 65535.`);
    process.exit(1);
  }
  return port;
}

const port = portFromEnvironment("RP_HTTP_PORT", 12067);

const a = [
  "wrangler", "dev",
  "--config", "dist/server/wrangler.json",
  "--ip", ip,
  "--port", String(port),
  "--local-protocol", "http",
  "--inspector-port", "9231",
  "--show-interactive-dev-session=false"
];
const w = spawn(process.platform === "win32" ? "npx.cmd" : "npx", a, {
  cwd: process.cwd(),
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit"
});

console.log("");
console.log(`Re Player      : http://${ip}:${port}`);
console.log(`Listening      : ${ip}:${port}`);
console.log("");

let closing = false;
let exitCode = 0;
function close(code = 0) {
  if (closing) return;
  closing = true;
  exitCode = code;
  if (!w.killed) {
    if (process.platform === "win32" && w.pid) {
      spawn("taskkill", ["/pid", String(w.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    } else {
      w.kill("SIGINT");
    }
  }
  setTimeout(() => process.exit(code), 1200).unref();
}

w.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
w.on("exit", (code) => {
  if (closing) return process.exit(exitCode);
  process.exit(code || 0);
});
process.on("SIGINT", () => close(0));
process.on("SIGTERM", () => close(0));
