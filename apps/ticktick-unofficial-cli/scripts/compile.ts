import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const cliDir = import.meta.dir.endsWith("\\scripts") || import.meta.dir.endsWith("/scripts")
  ? join(import.meta.dir, "..")
  : import.meta.dir;
const distDir = join(cliDir, "dist");
const compileRecordPath = join(distDir, "latest-compile-path.txt");
const executableExtension = process.platform === "win32" ? ".exe" : "";
const defaultOutfileBase = join(distDir, "ticktick-unofficial-cli");

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

await mkdir(distDir, { recursive: true });

let outfileBase = defaultOutfileBase;
const defaultExecutablePath = `${defaultOutfileBase}${executableExtension}`;

try {
  await rm(defaultExecutablePath, { force: true });
} catch {
  outfileBase = join(distDir, `ticktick-unofficial-cli-${Date.now()}`);
}

if (await exists(defaultExecutablePath)) {
  outfileBase = join(distDir, `ticktick-unofficial-cli-${Date.now()}`);
}

const compile = Bun.spawn(["bun", "build", "./src/cli.ts", "--compile", "--outfile", outfileBase], {
  cwd: cliDir,
  stderr: "inherit",
  stdout: "inherit",
});

const exitCode = await compile.exited;
if (exitCode !== 0) {
  process.exit(exitCode);
}

const executablePath = `${outfileBase}${executableExtension}`;
await writeFile(compileRecordPath, executablePath, "utf8");
console.log(`Compiled executable: ${executablePath}`);
