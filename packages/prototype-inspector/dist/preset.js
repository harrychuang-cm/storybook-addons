// src/preset.ts
import { dirname, join } from "path";
import { fileURLToPath } from "url";
var packageDir = dirname(fileURLToPath(import.meta.url));
var preset_default = {
  managerEntries: [join(packageDir, "manager.js")],
  name: "@harrychuang/storybook-addon-prototype-inspector",
  previewAnnotations: [join(packageDir, "preview.js")]
};
export {
  preset_default as default
};
//# sourceMappingURL=preset.js.map