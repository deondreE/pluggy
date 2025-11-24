export function extractPluggyImports(code: string): string[] {
  const importRegex =
    /import\s+[^'"]+\s+from\s+["']([^"']+\.pluggy)["']/g;
  const files: string[] = [];
  let match;
  while ((match = importRegex.exec(code))) {
    files.push(match[1]!);
  }
  return files;
}

export function stripPluggyImports(code: string): string {
  // Remove any import ... from "something.pluggy"
  return code.replace(
    /import\s+[^'"]+\s+from\s+["'][^"']+\.pluggy["'];?/g,
    ""
  );
}

export function stripCssImports(code: string): string {
  return code.replace(
    /\s*import\s+(?:[^'"]+\s+from\s+)?["'][^"']+\.(?:css|scss|sass|less|postcss)["']\s*;?/g,
    ""
  );
}