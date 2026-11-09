import { mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";
const merged = mergeConfig(base, {});
merged.test!.setupFiles = ["./src/test/setup.local.ts"];
export default merged;
