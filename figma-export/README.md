# Storybook Figma Export

Reusable Storybook addon utilities for exporting a rendered React story into a
Figma import payload. The exporter expects a three-layer CSS token model:
`ref`, `sys`, and `comp`.

## Preview Setup

```ts
import {
  createFigmaExportDecorator,
  createFigmaExportGlobalTypes,
  createFigmaExportInitialGlobals,
} from "./figma-export/preview";
import type { FigmaExportAddonOptions } from "./figma-export/options";

const figmaExportOptions = {
  componentClassPrefixes: ["md-"],
  storyTitlePrefix: "Components/",
} satisfies FigmaExportAddonOptions;

export default {
  decorators: [createFigmaExportDecorator(figmaExportOptions)],
  globalTypes: {
    ...createFigmaExportGlobalTypes(figmaExportOptions),
  },
  initialGlobals: {
    ...createFigmaExportInitialGlobals(figmaExportOptions),
  },
};
```

## Manager Setup

```ts
import { registerFigmaExportTool } from "./figma-export/manager";

registerFigmaExportTool();
```

## Token Prefix Detection

By default, the exporter auto-detects the token prefix from CSS custom
properties matching:

```txt
--{prefix}-ref-*
--{prefix}-sys-*
--{prefix}-comp-*
```

For example, both `--cm-ref-color-*` and `--md-ref-color-*` are supported. If a
project cannot be auto-detected, pass `tokenPrefix`, such as `"md"`.

## Options

- `tokenPrefix`: Optional explicit token prefix.
- `tokenLayers`: Custom layer segment names for `ref`, `sys`, and `comp`.
- `collections`: Figma variable collection names for each layer.
- `pluginDataKey`: Figma variable plugin data key for duplicate detection.
- `globalName`: Storybook global used by the toolbar switch.
- `storyTitlePrefix`: Story title prefix filter, or `false` to export all stories.
- `componentClassPrefixes`: Class prefixes used when naming exported layers.
- `absoluteFidelityComponents`: Component names exported with absolute layout.
- `embeddedSvgByDataGraphic`: Inline SVG map keyed by `data-graphic`.
