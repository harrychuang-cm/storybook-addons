import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));

export default {
  managerEntries: [join(packageDir, "manager.js")],
  name: "@harrychuang/storybook-addon-prototype-inspector",
  previewAnnotations: [join(packageDir, "preview.js")],
};
