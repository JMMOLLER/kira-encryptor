import { readFile, writeFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import { glob } from "glob";
import path from "path";

async function fixImports() {
  // Search for all .cjs files in the dist/cjs directory
  const files = await glob("dist/esm/**/*.js");
  for (const file of files) {
    let content = await readFile(file, "utf8");

    const addJsExtension = (relPath: string) => {
      if (!relPath.startsWith(".")) return relPath;
      if (relPath.endsWith(".js")) return relPath;

      const resolvedNoExt = path.resolve(path.dirname(file), relPath);

      // Prefer an existing file match: ./foo -> ./foo.js
      if (existsSync(`${resolvedNoExt}.js`)) {
        return `${relPath}.js`;
      }

      // Handle directory imports: ./foo -> ./foo/index.js
      if (existsSync(resolvedNoExt)) {
        try {
          if (statSync(resolvedNoExt).isDirectory()) {
            const indexPath = path.join(resolvedNoExt, "index.js");
            if (existsSync(indexPath)) {
              const normalized = relPath.replace(/\\/g, "/");
              return normalized.endsWith("/")
                ? `${normalized}index.js`
                : `${normalized}/index.js`;
            }
          }
        } catch {
          // fall through
        }
      }

      return `${relPath}.js`;
    };

    // Patch static ESM imports/exports of relative paths: from "./x" -> from "./x.js" (or "./x/index.js")
    content = content.replace(
      /(\bimport\s+[^;\n]*?\sfrom\s|\bexport\s+[^;\n]*?\sfrom\s)(['"])(\.(?:\.[\/])?[^'"]+)(\2)/g,
      (_match, prefix, quote, relPath) => {
        const fixed = addJsExtension(relPath);
        return `${prefix}${quote}${fixed}${quote}`;
      }
    );

    // Patch side-effect imports: import "./x";
    content = content.replace(
      /(\bimport\s+)(['"])(\.(?:\.[\/])?[^'"]+)(\2)(\s*;)/g,
      (_match, prefix, quote, relPath, _q2, semi) => {
        const fixed = addJsExtension(relPath);
        return `${prefix}${quote}${fixed}${quote}${semi}`;
      }
    );

    await writeFile(file, content, "utf8");
  }
  console.log("✅ Parcheo ESM completado");
}

fixImports().catch((err) => {
  console.error(err);
  process.exit(1);
});
