import { execFile } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs one program. A non-zero exit is a result. Only a failure to start or a timeout throws. */
export type Exec = (file: string, args: string[], options?: { cwd?: string }) => Promise<ExecResult>;

const GIT_READ_ONLY = new Set(["status", "rev-list", "for-each-ref", "log"]);
const GH_WRITE_FLAGS = new Set(["-X", "--method", "-f", "-F", "--field", "--raw-field", "--input"]);

/** Collectors read. This throws for any command that could write to a repo or to GitHub. */
export function assertReadOnly(file: string, args: string[]): void {
  if (file === "git") {
    const sub = args[0] === "--no-optional-locks" ? args[1] : args[0];
    if (!GIT_READ_ONLY.has(sub)) throw new Error(`Refused: git ${sub ?? ""} is not on the read-only list`);
    return;
  }
  if (file === "gh") {
    const [group, action] = args;
    const readPr = group === "pr" && (action === "list" || action === "view");
    const readApi = group === "api" && !args.some((a) => GH_WRITE_FLAGS.has(a.split("=")[0]));
    if (!readPr && !readApi) throw new Error(`Refused: gh ${args.slice(0, 2).join(" ")} is not on the read-only list`);
    return;
  }
  throw new Error(`Refused: ${file} is not git or gh`);
}

export const realExec: Exec = async (file, args, options = {}) => {
  assertReadOnly(file, args);
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd: options.cwd, timeout: 60_000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" } },
      (err, stdout, stderr) => {
        if (err && typeof (err as { code?: unknown }).code !== "number") {
          reject(new Error(`${file} ${args.slice(0, 2).join(" ")} failed to run: ${err.message}`));
          return;
        }
        resolve({ code: err ? ((err as { code: number }).code) : 0, stdout, stderr });
      },
    );
  });
};

/** Returns stdout, or throws with the start of stderr. */
export function stdoutOf(result: ExecResult, what: string): string {
  if (result.code !== 0) throw new Error(`${what} exited with ${result.code}: ${result.stderr.trim().slice(0, 300)}`);
  return result.stdout;
}
