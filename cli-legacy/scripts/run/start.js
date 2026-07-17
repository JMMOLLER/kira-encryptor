console.error(
  `\x1b[31m[Error]\x1b[0m The "start" script is not supported when using Bun due to incompatibilities with workerpool/Piscina.\n` +
  `Please use the following command instead:\n\n` +
  `\x1b[36mbun run debug\x1b[0m\n`
);
process.exit(1);
