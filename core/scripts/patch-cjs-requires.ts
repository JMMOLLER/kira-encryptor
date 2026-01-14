import { readFile, writeFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import { glob } from "glob";
import path from "path";

async function fixRequires() {
  // Search for all .cjs files in the dist/cjs directory
  const files = await glob("dist/cjs/**/*.cjs");
  for (const file of files) {
    let content = await readFile(file, "utf8");

    const addCjsExtension = (relPath: string) => {
      if (!relPath.startsWith(".")) return relPath;
      if (relPath.endsWith(".cjs")) return relPath;

      const resolvedNoExt = path.resolve(path.dirname(file), relPath);

      // Prefer an existing file match: ./foo -> ./foo.cjs
      if (existsSync(`${resolvedNoExt}.cjs`)) {
        return `${relPath}.cjs`;
      }

      // Handle directory requires: ./foo -> ./foo/index.cjs
      if (existsSync(resolvedNoExt)) {
        try {
          if (statSync(resolvedNoExt).isDirectory()) {
            const indexPath = path.join(resolvedNoExt, "index.cjs");
            if (existsSync(indexPath)) {
              const normalized = relPath.replace(/\\/g, "/");
              return normalized.endsWith("/")
                ? `${normalized}index.cjs`
                : `${normalized}/index.cjs`;
            }
          }
        } catch {
          // fall through
        }
      }

      return `${relPath}.cjs`;
    };

    // Patch require("./x") -> require("./x.cjs") (or ./x/index.cjs)
    content = content.replace(
      /require\((['"])(\.(?:\.[\/])?[^'"]+?)\1\)/g,
      (_match, quote, relPath) => {
        const fixed = addCjsExtension(relPath);
        return `require(${quote}${fixed}${quote})`;
      }
    );

    await writeFile(file, content, "utf8");
  }
  console.log("✅ Parcheo CJS completado");
}

fixRequires().catch((err) => {
  console.error(err);
  process.exit(1);
});
