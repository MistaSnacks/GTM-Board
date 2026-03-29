import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export function readCard(filePath: string): { data: Record<string, unknown>; content: string } {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);
  return { data: parsed.data as Record<string, unknown>, content: parsed.content };
}

export function writeCard(
  filePath: string,
  frontmatter: Record<string, unknown>,
  content: string
): void {
  const output = matter.stringify(content, frontmatter);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, output, "utf-8");
}

export function listCardsInDir(
  dirPath: string
): Array<{ id: string; data: Record<string, unknown>; path: string }> {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"));
  return files.map((f) => {
    const filePath = path.join(dirPath, f);
    const { data } = readCard(filePath);
    return { id: (data.id as string) || path.basename(f, ".md"), data, path: filePath };
  });
}

export function moveCardFile(fromPath: string, toDir: string): string {
  if (!fs.existsSync(toDir)) {
    fs.mkdirSync(toDir, { recursive: true });
  }
  const fileName = path.basename(fromPath);
  const newPath = path.join(toDir, fileName);
  fs.renameSync(fromPath, newPath);
  return newPath;
}
