// Point tsx at the test tsconfig (which stubs `server-only`) before tsx loads.
// Using an --import shim keeps the npm script cross-platform (no cross-env).
import { fileURLToPath } from "node:url";

process.env.TSX_TSCONFIG_PATH = fileURLToPath(new URL("./tsconfig.json", import.meta.url));
