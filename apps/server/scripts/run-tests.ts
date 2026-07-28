import { resolve } from "node:path";

const serverRoot = resolve(import.meta.dir, "..");
const livenessTest = "src/__tests__/liveness.test.ts";
const testFiles: string[] = [];
const testGlob = new Bun.Glob("src/**/*.test.ts");

for (const file of testGlob.scanSync({
  cwd: serverRoot,
  onlyFiles: true,
})) {
  const normalizedFile = file.replace(/\\/g, "/");

  if (normalizedFile !== livenessTest) {
    testFiles.push(normalizedFile);
  }
}

const runTests = async (files: string[]): Promise<number> => {
  const childProcess = Bun.spawn(
    [globalThis.process.execPath, "test", "--max-concurrency=1", ...files],
    {
      cwd: serverRoot,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  return childProcess.exited;
};

const main = async (): Promise<void> => {
  const mainExitCode = await runTests(testFiles.sort());

  if (mainExitCode !== 0) {
    process.exit(mainExitCode);
  }

  process.exit(await runTests([livenessTest]));
};

void main();
