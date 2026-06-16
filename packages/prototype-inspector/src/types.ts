export type PrototypeInspectorDocKey =
  | "prd"
  | "uiSpec"
  | "flowSpec"
  | "dataSpec"
  | "acceptance";

export type PrototypeInspectorDocs = Partial<
  Record<PrototypeInspectorDocKey, string>
> &
  Record<string, string | undefined>;

export type PrototypeInspectorRoute = {
  id: string;
  title?: string;
  description?: string;
  component?: string;
  navigationId?: string;
  presentation?: string;
};

export type PrototypeInspectorTransition = {
  id?: string;
  from: string;
  to: string;
  trigger?: string;
  label?: string;
};

export type PrototypeInspectorFlow = {
  routes: readonly PrototypeInspectorRoute[];
  transitions: readonly PrototypeInspectorTransition[];
};

export type PrototypeInspectorMode = "story" | "docs" | "flow" | "data";

export const prototypeInspectorModes: Array<{
  id: PrototypeInspectorMode;
  label: string;
}> = [
  { id: "story", label: "Story" },
  { id: "docs", label: "Docs" },
  { id: "flow", label: "UI Flow" },
  { id: "data", label: "Data" },
];

export const defaultPrototypeModeGlobalName = "prototypeMode";

export type PrototypeInspectorParameter = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  owner?: string;
  docs?: PrototypeInspectorDocs;
  flow?: PrototypeInspectorFlow;
  data?: unknown;
};

export type PrototypeInspectorOptions = {
  addonId?: string;
  globalName?: string;
  parameterName?: string;
  toolTitle?: string;
};
