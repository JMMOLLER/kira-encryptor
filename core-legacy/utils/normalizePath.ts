export default function normalizePath(input: string): string {
  const normalizedPath = input.replace(/^["']|["']$/g, "").trim();
  return normalizedPath;
}
