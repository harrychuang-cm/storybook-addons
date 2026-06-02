# storybook-addons

Monorepo of Storybook addons by [Harry Chuang](https://github.com/harrychuang).

| Package | Description |
| --- | --- |
| [`@harrychuang/storybook-addon-figma-export`](./packages/figma-export) | Export rendered stories to Figma import payloads |

Requires **Storybook 10** (ESM-only).

## Install from GitHub

```bash
npm install -D "github:harrychuang/storybook-addons#main:packages/figma-export"
```

```bash
pnpm add -D "github:harrychuang/storybook-addons#main:packages/figma-export"
```

```bash
yarn add -D "github:harrychuang/storybook-addons#main:packages/figma-export"
```

Built `dist/` is committed so GitHub installs work without compiling on the consumer machine.

## Development

```bash
npm install
npm run build
```

## Packages

- [Figma Export](./packages/figma-export/README.md)
