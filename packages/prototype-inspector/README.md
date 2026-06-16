# Storybook Prototype Inspector

Storybook manager addon for product prototypes. It reads prototype metadata from
the active story and shows PRD documents, UI specs, data notes, acceptance
criteria, and an auto-generated UI flow diagram.

## Install

```ts
// .storybook/main.ts
export default {
  addons: [
    "@harrychuang/storybook-addon-prototype-inspector",
  ],
};
```

## Story Metadata

Attach a `prototype` parameter to any story:

```ts
export default {
  title: "Pages/Prototypes/Inventory Prototype",
  parameters: {
    prototype: {
      id: "inventory-prototype",
      title: "Inventory Prototype",
      description: "Interactive product prototype assembled from components.",
      status: "Draft",
      owner: "Product Design",
      docs: {
        prd,
        uiSpec,
        flowSpec,
        dataSpec,
        acceptance,
      },
      flow: {
        routes: [
          { id: "inventory", title: "Inventory", navigationId: "portfolio" },
          { id: "stock-detail", title: "Stock Detail", navigationId: "portfolio" },
        ],
        transitions: [
          { from: "inventory", to: "stock-detail", trigger: "stockRow.click" },
        ],
      },
      data: {
        scenarios: ["default"],
      },
    },
  },
};
```

The flow tab is generated from `flow.routes` and `flow.transitions` with
React Flow. The addon does not import app code directly, so different projects
can use the same contract.
