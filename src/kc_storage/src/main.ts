/*
 * Entry point. Checks the Node.js version before loading node:sqlite.
 */

const major = Number(process.versions.node.split(".")[0]);
if (major < 24) {
  console.error(
    `kc-storage needs Node.js 24 or later (found ${process.versions.node}). Set KC_NODE to a newer node binary.`
  );
  process.exit(2);
}

const { main } = await import("./cli.ts");
try {
  await main(process.argv.slice(2));
} catch (e: any) {
  console.error(`kc-storage: ${e?.message ?? e}`);
  process.exit(1);
}
