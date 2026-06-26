import type {
  FigmaBindingName,
  FigmaComponentReference,
  FigmaExportArtifactKind,
  FigmaExportGradient,
  FigmaExportNode,
  FigmaExportShadow,
  FigmaNodeConstraints,
  FigmaLayoutStrategy,
  FigmaExportPayload,
} from "./types";
import type { ResolvedFigmaExportAddonOptions } from "./options";
import {
  collectTokensForExport,
  detectTokenSystem,
  extractCssVariableNames,
  type DetectedTokenSystem,
} from "./tokenExport";

type MatchedDeclaration = {
  property: string;
  value: string;
};

type BorderSide = "top" | "right" | "bottom" | "left";
type PseudoElementName = "before" | "after";

const bindingProperties: Record<FigmaBindingName, string[]> = {
  backgroundColor: ["background-color", "background"],
  borderColor: ["border-color", "border"],
  borderWidth: ["border-width", "border"],
  cornerRadius: ["border-radius"],
  fontFamily: ["font-family"],
  fontSize: ["font-size"],
  fontWeight: ["font-weight"],
  gap: ["gap", "column-gap", "row-gap"],
  height: ["block-size", "height"],
  lineHeight: ["line-height"],
  opacity: ["opacity"],
  paddingBottom: ["padding-bottom", "padding-block-end", "padding-block", "padding"],
  paddingLeft: ["padding-left", "padding-inline-start", "padding-inline", "padding"],
  paddingRight: ["padding-right", "padding-inline-end", "padding-inline", "padding"],
  paddingTop: ["padding-top", "padding-block-start", "padding-block", "padding"],
  textColor: ["color"],
  width: ["inline-size", "width"],
};

const transparentValues = new Set([
  "rgba(0, 0, 0, 0)",
  "rgba(0,0,0,0)",
  "transparent",
]);

const inheritedBindings = new Set<FigmaBindingName>([
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textColor",
]);

const borderSides: BorderSide[] = ["top", "right", "bottom", "left"];

type VisibleBorder = {
  color: string;
  width: number;
};

function toFiniteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
}

function cssLengthToNumber(value: string): number | undefined {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : undefined;
}

function cssPercentToNumber(value: string, basis: number): number | undefined {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)%$/);
  return match ? (Number(match[1]) / 100) * basis : undefined;
}

function cssPositionToNumber(value: string, basis: number): number | undefined {
  return cssLengthToNumber(value) ?? cssPercentToNumber(value, basis);
}

function cssMatrixTranslationToNumber(
  transform: string,
): { x: number; y: number } | undefined {
  const matrix3d = transform.trim().match(/^matrix3d\((.+)\)$/);
  if (matrix3d) {
    const values = matrix3d[1].split(",").map((value) => Number(value.trim()));
    if (values.length === 16 && values.every(Number.isFinite)) {
      return { x: values[12], y: values[13] };
    }
  }

  const matrix = transform.trim().match(/^matrix\((.+)\)$/);
  if (!matrix) return undefined;

  const values = matrix[1].split(",").map((value) => Number(value.trim()));
  if (values.length !== 6 || !values.every(Number.isFinite)) return undefined;
  return { x: values[4], y: values[5] };
}

function cssLineHeightToNumber(value: string): number | "normal" | undefined {
  if (value === "normal") return "normal";
  return cssLengthToNumber(value);
}

function cssColorValue(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized || transparentValues.has(normalized)) return undefined;
  return normalized;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function splitGradientArguments(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);

    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseLinearGradientAngle(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  const degree = normalized.match(/^(-?\d*\.?\d+)deg$/);
  if (degree) return Number(degree[1]);
  if (normalized === "to right") return 90;
  if (normalized === "to bottom") return 180;
  if (normalized === "to left") return 270;
  if (normalized === "to top") return 0;
  return undefined;
}

function parseGradientStop(
  value: string,
  index: number,
  total: number,
): { color: string; position: number } | undefined {
  const colorMatch = value
    .trim()
    .match(/^(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i);
  if (!colorMatch) return undefined;

  const color = cssColorValue(colorMatch[1]);
  if (!color) return undefined;

  const positionMatch = value.slice(colorMatch[1].length).match(/(-?\d*\.?\d+)%/);
  const position = positionMatch
    ? clampUnit(Number(positionMatch[1]) / 100)
    : total > 1
      ? index / (total - 1)
      : 0;

  return { color, position };
}

function parseLinearGradient(
  backgroundImage: string,
): { angle: number; stops: { color: string; position: number }[] } | undefined {
  const match = backgroundImage.trim().match(/^linear-gradient\((.*)\)$/i);
  if (!match) return undefined;

  const parts = splitGradientArguments(match[1]);
  if (parts.length < 2) return undefined;

  const angle = parseLinearGradientAngle(parts[0]);
  const stopParts = angle === undefined ? parts : parts.slice(1);
  const stops = stopParts
    .map((part, index) => parseGradientStop(part, index, stopParts.length))
    .filter((stop): stop is { color: string; position: number } => Boolean(stop));

  return stops.length >= 2 ? { angle: angle ?? 180, stops } : undefined;
}

// Detects whether the first comma-separated segment of a radial/conic gradient
// is a configuration clause (shape/size/position/from-angle) rather than a stop.
function isGradientConfigSegment(segment: string): boolean {
  const lowered = segment.trim().toLowerCase();
  if (!lowered) return false;
  if (/#|rgba?\(|hsla?\(|var\(/.test(lowered)) return false;
  return /circle|ellipse|closest-|farthest-|(^|\s)at\s|(^|\s)from\s|center|top|bottom|left|right|%|px|deg|turn|rad/.test(
    lowered,
  );
}

function parseRadialOrConicGradient(
  backgroundImage: string,
): FigmaExportGradient | undefined {
  const trimmed = backgroundImage.trim();

  const radial = trimmed.match(/^radial-gradient\((.*)\)$/i);
  if (radial) {
    const parts = splitGradientArguments(radial[1]);
    if (parts.length < 1) return undefined;
    const stopParts = isGradientConfigSegment(parts[0]) ? parts.slice(1) : parts;
    const stops = stopParts
      .map((part, index) => parseGradientStop(part, index, stopParts.length))
      .filter((stop): stop is { color: string; position: number } => Boolean(stop));
    return stops.length >= 2 ? { angle: 0, stops, type: "radial" } : undefined;
  }

  const conic = trimmed.match(/^conic-gradient\((.*)\)$/i);
  if (conic) {
    const parts = splitGradientArguments(conic[1]);
    if (parts.length < 1) return undefined;
    let angle = 0;
    let stopParts = parts;
    if (isGradientConfigSegment(parts[0])) {
      const fromMatch = parts[0].toLowerCase().match(/from\s+(-?[\d.]+)deg/);
      if (fromMatch) angle = Number(fromMatch[1]);
      stopParts = parts.slice(1);
    }
    const stops = stopParts
      .map((part, index) => parseGradientStop(part, index, stopParts.length))
      .filter((stop): stop is { color: string; position: number } => Boolean(stop));
    return stops.length >= 2 ? { angle, stops, type: "angular" } : undefined;
  }

  return undefined;
}

function parseBoxShadowColorAndLengths(value: string): {
  color?: string;
  lengths: number[];
} {
  let working = value;
  let color: string | undefined;

  const functionMatch = working.match(/(?:rgba?|hsla?)\([^)]*\)/i);
  if (functionMatch) {
    color = functionMatch[0];
    working = `${working.slice(0, functionMatch.index)} ${working.slice(
      (functionMatch.index ?? 0) + functionMatch[0].length,
    )}`;
  } else {
    const hexMatch = working.match(/#[0-9a-fA-F]{3,8}\b/);
    if (hexMatch) {
      color = hexMatch[0];
      working = `${working.slice(0, hexMatch.index)} ${working.slice(
        (hexMatch.index ?? 0) + hexMatch[0].length,
      )}`;
    }
  }

  const lengths = working
    .trim()
    .split(/\s+/)
    .map((token) => cssLengthToNumber(token))
    .filter((length): length is number => length !== undefined);

  return { color, lengths };
}

function parseSingleBoxShadow(value: string): FigmaExportShadow | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const inset = /(?:^|\s)inset(?:\s|$)/.test(trimmed);
  const withoutInset = trimmed.replace(/(?:^|\s)inset(?:\s|$)/g, " ");
  const { color, lengths } = parseBoxShadowColorAndLengths(withoutInset);

  // Need at least offset-x and offset-y to be a usable shadow.
  if (lengths.length < 2) return undefined;

  const resolvedColor = cssColorValue(color ?? "");
  if (!resolvedColor) return undefined;

  const [offsetX, offsetY, blur = 0, spread = 0] = lengths;
  return {
    blur: Math.max(0, blur),
    color: resolvedColor,
    offsetX,
    offsetY,
    spread,
    type: inset ? "inner" : "drop",
  };
}

function parseBoxShadows(value: string): FigmaExportShadow[] {
  const normalized = value.trim();
  if (!normalized || normalized === "none") return [];

  return splitGradientArguments(normalized)
    .map((part) => parseSingleBoxShadow(part))
    .filter((shadow): shadow is FigmaExportShadow => Boolean(shadow));
}

function parseBlurRadius(value: string | undefined): number | undefined {
  if (!value || value === "none") return undefined;
  const match = value.match(/blur\(\s*([\d.]+)px\s*\)/i);
  if (!match) return undefined;
  const radius = Number(match[1]);
  return Number.isFinite(radius) && radius > 0 ? radius : undefined;
}

function getTextDecoration(
  computed: CSSStyleDeclaration,
): "UNDERLINE" | "STRIKETHROUGH" | undefined {
  const line = `${computed.textDecorationLine || computed.textDecoration || ""}`;
  if (line.includes("underline")) return "UNDERLINE";
  if (line.includes("line-through")) return "STRIKETHROUGH";
  return undefined;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

// Keeps pasted payloads manageable; larger rasters are dropped with a warning.
const maxRasterImageBytes = 2_000_000;

async function fetchRasterImageBase64(
  element: HTMLImageElement,
): Promise<string | undefined> {
  const src = element.currentSrc || element.src;
  if (!src) return undefined;

  if (src.startsWith("data:image/")) {
    if (src.startsWith("data:image/svg+xml")) return undefined;
    const [meta = "", data = ""] = src.split(",", 2);
    if (!data) return undefined;
    return meta.includes(";base64") ? data : btoa(decodeURIComponent(data));
  }

  try {
    const response = await fetch(src);
    if (!response.ok) return undefined;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > maxRasterImageBytes) {
      return undefined;
    }
    return arrayBufferToBase64(buffer);
  } catch {
    return undefined;
  }
}

function isColorTokenName(token: string): boolean {
  return token.includes("-color-") || token.endsWith("-color");
}

function findLinearGradientTokens(
  declarations: MatchedDeclaration[],
  tokenSystem: DetectedTokenSystem,
): string[] {
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (!["background", "background-image"].includes(declaration.property)) {
      continue;
    }
    if (!declaration.value.includes("linear-gradient")) continue;

    const tokens = extractCssVariableNames(declaration.value, tokenSystem).filter(
      isColorTokenName,
    );
    if (tokens.length >= 2) return tokens;
  }

  return [];
}

function addLinearGradientStopTokens(
  gradient: { angle: number; stops: { color: string; position: number }[] } | undefined,
  declarations: MatchedDeclaration[],
  tokenSystem: DetectedTokenSystem,
): { angle: number; stops: { color: string; position: number; token?: string }[] } | undefined {
  if (!gradient) return undefined;

  const tokens = findLinearGradientTokens(declarations, tokenSystem);
  if (tokens.length === 0) return gradient;

  return {
    ...gradient,
    stops: gradient.stops.map((stop, index) => ({
      ...stop,
      ...(tokens[index] ? { token: tokens[index] } : {}),
    })),
  };
}

function cssBorderWidth(computed: CSSStyleDeclaration, side: string): number {
  return cssLengthToNumber(computed.getPropertyValue(`border-${side}-width`)) ?? 0;
}

function cssBorderStyle(computed: CSSStyleDeclaration, side: string): string {
  return computed.getPropertyValue(`border-${side}-style`).trim();
}

function cssBorderColor(computed: CSSStyleDeclaration, side: string): string {
  return computed.getPropertyValue(`border-${side}-color`).trim();
}

function isVisibleBorderSide(computed: CSSStyleDeclaration, side: string): boolean {
  const width = cssBorderWidth(computed, side);
  const style = cssBorderStyle(computed, side);
  return width > 0 && style !== "none" && style !== "hidden";
}

function getUniformVisibleBorder(
  computed: CSSStyleDeclaration,
): VisibleBorder | undefined {
  const visibleSides = borderSides.filter((side) => isVisibleBorderSide(computed, side));

  if (visibleSides.length !== borderSides.length) return undefined;

  const width = cssBorderWidth(computed, "top");
  const style = cssBorderStyle(computed, "top");
  const color = cssColorValue(cssBorderColor(computed, "top"));

  if (!color) return undefined;

  const isUniform = borderSides.every(
    (side) =>
      cssBorderWidth(computed, side) === width &&
      cssBorderStyle(computed, side) === style &&
      cssBorderColor(computed, side) === cssBorderColor(computed, "top"),
  );

  return isUniform ? { color, width } : undefined;
}

function getElementName(
  element: Element,
  options: ResolvedFigmaExportAddonOptions,
): string {
  const component = element.getAttribute("data-component");
  const variant = element.getAttribute("data-variant");
  const icon = element.getAttribute("data-icon");
  const classNames = Array.from(element.classList);
  const preferredClassName = options.componentClassPrefixes.length
    ? classNames.find((name) =>
        options.componentClassPrefixes.some((prefix) => name.startsWith(prefix)),
      )
    : undefined;
  const className = preferredClassName ?? classNames[0];
  const base = component || icon || className || element.tagName.toLowerCase();
  return variant ? `${base}/${variant}` : base;
}

function toComponentKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "component";
}

function toComponentLabel(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function getComponentReference(
  element: Element,
  fallbackName?: string,
): FigmaComponentReference | undefined {
  const sourceName = element.getAttribute("data-component");
  if (!sourceName && !fallbackName) return undefined;

  const variant = element.getAttribute("data-variant") || undefined;
  const source = sourceName || fallbackName || "component";
  const name = fallbackName || toComponentLabel(source);
  const baseKey = toComponentKey(source);
  const key = variant ? `${baseKey}--${toComponentKey(variant)}` : baseKey;

  return {
    key,
    name,
    sourceName: source,
    ...(variant ? { variant, variantProperties: { Variant: variant } } : {}),
  };
}

function getArtifactKind(storyTitle: string): FigmaExportArtifactKind {
  return storyTitle.startsWith("Pages/") ? "page" : "component";
}

function hasComponentReference(node: FigmaExportNode): boolean {
  return Boolean(node.component) || node.children.some(hasComponentReference);
}

function isAbsoluteFidelityRoot(
  element: Element,
  options: ResolvedFigmaExportAddonOptions,
): boolean {
  const component = element.getAttribute("data-component");
  return Boolean(component && options.absoluteFidelityComponents.has(component));
}

function isFlexDisplay(display: string): boolean {
  return display.includes("flex");
}

function isOutOfFlowPositioned(computed: CSSStyleDeclaration): boolean {
  return computed.position === "absolute" || computed.position === "fixed";
}

function isFlexItem(element: Element, computed: CSSStyleDeclaration): boolean {
  if (isOutOfFlowPositioned(computed)) return false;
  const parentElement = element.parentElement;
  if (!parentElement) return false;
  return isFlexDisplay(window.getComputedStyle(parentElement).display);
}

function getLayoutStrategy(
  element: Element,
  computed: CSSStyleDeclaration,
  forceAbsoluteLayout: boolean,
): FigmaLayoutStrategy {
  if (forceAbsoluteLayout) return "absolute";
  return isFlexDisplay(computed.display) || isFlexItem(element, computed)
    ? "autoLayout"
    : "absolute";
}

function getExportDisplay(
  computed: CSSStyleDeclaration,
  layoutStrategy: FigmaLayoutStrategy,
): string {
  if (layoutStrategy === "absolute" && isFlexDisplay(computed.display)) {
    return "block";
  }

  return computed.display;
}

function escapeSvgAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeSvgStrokeDashValue(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized || normalized === "none") return undefined;
  return normalized.replace(/(-?\d+(?:\.\d+)?)px\b/g, "$1");
}

function serializeInlineSvg(element: SVGElement, width: number, height: number): string {
  const clone = element.cloneNode(true) as SVGElement;
  const originalNodes = [element, ...Array.from(element.querySelectorAll("*"))];
  const clonedNodes = [clone, ...Array.from(clone.querySelectorAll("*"))];

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  clonedNodes.forEach((clonedNode, index) => {
    const originalNode = originalNodes[index];
    if (!(originalNode instanceof Element) || !(clonedNode instanceof Element)) return;

    const originalStyle = window.getComputedStyle(originalNode);
    const fill = cssColorValue(originalStyle.fill);
    const stroke = cssColorValue(originalStyle.stroke);
    const strokeWidth = originalStyle.strokeWidth;
    const strokeLinecap = originalStyle.strokeLinecap;
    const strokeLinejoin = originalStyle.strokeLinejoin;
    const strokeDasharray = normalizeSvgStrokeDashValue(
      originalStyle.strokeDasharray,
    );
    const strokeDashoffset = normalizeSvgStrokeDashValue(
      originalStyle.strokeDashoffset,
    );

    if (fill) clonedNode.setAttribute("fill", fill);
    if (originalStyle.fill === "none") clonedNode.setAttribute("fill", "none");
    if (stroke) clonedNode.setAttribute("stroke", stroke);
    if (strokeWidth && strokeWidth !== "0px") {
      clonedNode.setAttribute("stroke-width", strokeWidth.replace("px", ""));
    }
    if (strokeLinecap) clonedNode.setAttribute("stroke-linecap", strokeLinecap);
    if (strokeLinejoin) clonedNode.setAttribute("stroke-linejoin", strokeLinejoin);
    if (strokeDasharray) clonedNode.setAttribute("stroke-dasharray", strokeDasharray);
    if (strokeDashoffset) clonedNode.setAttribute("stroke-dashoffset", strokeDashoffset);
  });

  return clone.outerHTML;
}

function splitTopLevelComma(value: string): [string, string | undefined] {
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
    }
  }

  return [value.trim(), undefined];
}

function resolveCssVarInSvgValue(value: string, fallbackValue = "#000000"): string {
  let result = "";
  let cursor = 0;

  while (cursor < value.length) {
    const start = value.indexOf("var(", cursor);
    if (start === -1) {
      result += value.slice(cursor);
      break;
    }

    result += value.slice(cursor, start);

    let depth = 0;
    let end = start;
    for (; end < value.length; end += 1) {
      const character = value[end];
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    if (end >= value.length) {
      result += fallbackValue;
      break;
    }

    const content = value.slice(start + 4, end);
    const [propertyName, fallback] = splitTopLevelComma(content);
    const resolved =
      document.documentElement.style.getPropertyValue(propertyName).trim() ||
      window.getComputedStyle(document.documentElement).getPropertyValue(propertyName).trim() ||
      (document.body
        ? window.getComputedStyle(document.body).getPropertyValue(propertyName).trim()
        : "") ||
      fallback ||
      fallbackValue;

    result += resolved.trim();
    cursor = end + 1;
  }

  return result;
}

function sanitizeSvgTextForFigma(svgText: string): string {
  if (!svgText.includes("var(")) return svgText;

  try {
    const documentValue = new DOMParser().parseFromString(svgText, "image/svg+xml");
    if (documentValue.querySelector("parsererror")) {
      return resolveCssVarInSvgValue(svgText);
    }

    documentValue.querySelectorAll("*").forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        if (!attribute.value.includes("var(")) return;
        element.setAttribute(attribute.name, resolveCssVarInSvgValue(attribute.value));
      });
    });

    return new XMLSerializer().serializeToString(documentValue.documentElement);
  } catch {
    return resolveCssVarInSvgValue(svgText);
  }
}

function parsePolygonPoint(value: string, size: number): number {
  const normalized = value.trim();
  if (normalized.endsWith("%")) {
    return (Number(normalized.slice(0, -1)) / 100) * size;
  }
  return Number(normalized.replace("px", ""));
}

function getPolygonPoints(
  clipPath: string,
  width: number,
  height: number,
): string | undefined {
  const match = clipPath.trim().match(/^polygon\((.+)\)$/);
  if (!match) return undefined;

  const points = match[1]
    .split(",")
    .map((point) => point.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map(([xValue, yValue]) => {
      const x = toFiniteNumber(parsePolygonPoint(xValue, width));
      const y = toFiniteNumber(parsePolygonPoint(yValue, height));
      return `${x},${y}`;
    });

  return points.length >= 3 ? points.join(" ") : undefined;
}

function createClipPathSvgNode(
  element: Element,
  computed: CSSStyleDeclaration,
  rect: DOMRect,
  parentRect: DOMRect,
  rules: CSSStyleRule[],
  tokenSystem: DetectedTokenSystem,
  options: ResolvedFigmaExportAddonOptions,
): FigmaExportNode | undefined {
  if (!computed.clipPath || computed.clipPath === "none") return undefined;

  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  const points = getPolygonPoints(computed.clipPath, width, height);
  if (!points) return undefined;

  const fill = cssColorValue(computed.backgroundColor) ?? cssColorValue(computed.color);
  if (!fill) return undefined;

  const transform =
    computed.transform && computed.transform.startsWith("matrix(-1")
      ? ` transform="rotate(180 ${width / 2} ${height / 2})"`
      : "";
  const layoutStrategy =
    element.getAttribute("data-figma-layout-strategy") === "auto-layout" ||
    isFlexItem(element, computed)
      ? "autoLayout"
      : "absolute";
  const svgText =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<polygon points="${escapeSvgAttribute(points)}" fill="${escapeSvgAttribute(fill)}"${transform}/>` +
    `</svg>`;

  return {
    bindings: collectBindings(element, rules, false, tokenSystem),
    children: [],
    kind: "svg",
    layoutStrategy,
    name: getElementName(element, options),
    svgText,
    styles: {
      display: computed.display,
      height,
      opacity: Number(computed.opacity),
      overflow: computed.overflow,
      width,
      x: toFiniteNumber(rect.left - parentRect.left),
      y: toFiniteNumber(rect.top - parentRect.top),
    },
  };
}

function createInlineSvgNode(
  element: SVGElement,
  computed: CSSStyleDeclaration,
  rect: DOMRect,
  parentRect: DOMRect,
  options: ResolvedFigmaExportAddonOptions,
): FigmaExportNode {
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  const component = getComponentReference(element);

  return {
    bindings: {},
    children: [],
    ...(component ? { component } : {}),
    kind: "svg",
    layoutStrategy: "absolute",
    name: getElementName(element, options),
    svgText: serializeInlineSvg(element, width, height),
    styles: {
      display: computed.display,
      height,
      opacity: Number(computed.opacity),
      overflow: computed.overflow,
      width,
      x: toFiniteNumber(rect.left - parentRect.left),
      y: toFiniteNumber(rect.top - parentRect.top),
    },
  };
}

function getCssRules(): CSSStyleRule[] {
  const rules: CSSStyleRule[] = [];

  function collect(ruleList: CSSRuleList) {
    for (const rule of Array.from(ruleList)) {
      if (rule instanceof CSSStyleRule) {
        rules.push(rule);
        continue;
      }

      if ("cssRules" in rule) {
        try {
          collect((rule as CSSMediaRule).cssRules);
        } catch {
          // Ignore inaccessible nested rules.
        }
      }
    }
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collect(sheet.cssRules);
    } catch {
      // Ignore cross-origin or browser-managed style sheets.
    }
  }

  return rules;
}

function selectorMatches(element: Element, selectorText: string): boolean {
  return selectorText.split(",").some((selector) => {
    const trimmed = selector.trim();
    if (!trimmed || trimmed.includes(":hover") || trimmed.includes(":focus")) {
      return false;
    }

    try {
      return element.matches(trimmed);
    } catch {
      return false;
    }
  });
}

function parseCssTextDeclarations(cssText: string): MatchedDeclaration[] {
  const declarations: MatchedDeclaration[] = [];
  let current = "";
  let depth = 0;
  const chunks: string[] = [];

  for (const character of cssText) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);

    if (character === ";" && depth === 0) {
      chunks.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) chunks.push(current);

  chunks.forEach((chunk) => {
    const separatorIndex = chunk.indexOf(":");
    if (separatorIndex === -1) return;

    const property = chunk.slice(0, separatorIndex).trim();
    const value = chunk.slice(separatorIndex + 1).trim();
    if (!property || !value) return;

    declarations.push({ property, value });
  });

  return declarations;
}

function getMatchedDeclarations(
  element: Element,
  rules: CSSStyleRule[],
): MatchedDeclaration[] {
  const declarations: MatchedDeclaration[] = [];

  for (const rule of rules) {
    if (!selectorMatches(element, rule.selectorText)) continue;

    for (const property of Array.from(rule.style)) {
      declarations.push({
        property,
        value: rule.style.getPropertyValue(property).trim(),
      });
    }
    declarations.push(...parseCssTextDeclarations(rule.style.cssText));
  }

  const inlineStyle = element.getAttribute("style");
  if (inlineStyle && element instanceof HTMLElement) {
    declarations.push(...parseCssTextDeclarations(element.style.cssText));
    for (const property of Array.from(element.style)) {
      declarations.push({
        property,
        value: element.style.getPropertyValue(property).trim(),
      });
    }
  }

  return declarations;
}

function findTokenForProperty(
  declarations: MatchedDeclaration[],
  bindingName: FigmaBindingName,
  tokenSystem: DetectedTokenSystem,
): string | undefined {
  const properties = bindingProperties[bindingName];

  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (!properties.includes(declaration.property)) continue;

    const tokens = extractCssVariableNames(declaration.value, tokenSystem);
    if (tokens.length === 0) return undefined;

    if (declaration.property === "padding") {
      if (bindingName === "paddingTop" || bindingName === "paddingBottom") {
        return tokens[0];
      }
      if (bindingName === "paddingLeft" || bindingName === "paddingRight") {
        return tokens[1] || tokens[0];
      }
    }

    if (declaration.property === "padding-inline") {
      if (bindingName === "paddingLeft" || bindingName === "paddingRight") {
        return tokens[0];
      }
    }

    if (declaration.property === "padding-block") {
      if (bindingName === "paddingTop" || bindingName === "paddingBottom") {
        return tokens[0];
      }
    }

    if (declaration.property === "border") {
      if (bindingName === "borderColor") {
        return tokens.find(isColorTokenName);
      }
      if (bindingName === "borderWidth") {
        return tokens.find((token) => !isColorTokenName(token)) || tokens[0];
      }
    }

    if (bindingName === "backgroundColor" || bindingName === "textColor") {
      return tokens.find(isColorTokenName) || tokens[0];
    }

    return tokens[0];
  }

  return undefined;
}

function pickBindings(
  bindings: Partial<Record<FigmaBindingName, string>>,
  names: FigmaBindingName[],
): Partial<Record<FigmaBindingName, string>> {
  const picked: Partial<Record<FigmaBindingName, string>> = {};
  names.forEach((name) => {
    const token = bindings[name];
    if (token) picked[name] = token;
  });
  return picked;
}

function getTextExportWidth({
  computed,
  text,
  width,
}: {
  computed: CSSStyleDeclaration;
  text: string;
  width: number;
}): number {
  if (!text.trim()) return width;

  const fontSize = cssLengthToNumber(computed.fontSize) ?? 14;
  const safetyWidth = Math.max(12, fontSize);
  return toFiniteNumber(width + safetyWidth);
}

function getTextExportX({
  computed,
  exportWidth,
  width,
  x,
}: {
  computed: CSSStyleDeclaration;
  exportWidth: number;
  width: number;
  x: number;
}): number {
  const extraWidth = Math.max(0, exportWidth - width);
  const textAlign = computed.textAlign.toLowerCase();
  if (textAlign === "right" || textAlign === "end") {
    return toFiniteNumber(x - extraWidth);
  }
  if (textAlign === "center") return toFiniteNumber(x - extraWidth / 2);
  return x;
}

function justifyContentFromTextAlign(textAlign: string): string {
  const normalized = textAlign.trim().toLowerCase();
  if (normalized === "center") return "center";
  if (normalized === "right" || normalized === "end") return "flex-end";
  return "flex-start";
}

function hasFixedFlexBasis(computed: CSSStyleDeclaration): boolean {
  if (!computed.flexBasis || computed.flexBasis === "auto" || computed.flexBasis === "content") {
    return false;
  }
  return cssLengthToNumber(computed.flexBasis) !== undefined;
}

function isClippedSingleLineText(computed: CSSStyleDeclaration): boolean {
  const overflowX = computed.overflowX.toLowerCase();
  const overflow = computed.overflow.toLowerCase();
  const textOverflow = computed.textOverflow.toLowerCase();
  const whiteSpace = computed.whiteSpace.toLowerCase();
  const clipsInline = overflowX === "hidden" || overflowX === "clip" || overflow === "hidden" || overflow === "clip";
  return clipsInline && textOverflow === "ellipsis" && whiteSpace === "nowrap";
}

function shouldAutoResizeText(element: Element, computed: CSSStyleDeclaration): boolean {
  // Clipped single-line text truncates in the browser, so auto-width would
  // always overflow in Figma — truncation wins over the data attribute.
  if (isClippedSingleLineText(computed)) return false;
  if (element.getAttribute("data-figma-text-auto-width") === "true") return true;
  const textAlign = computed.textAlign.toLowerCase();
  if (textAlign === "center" || textAlign === "right" || textAlign === "end") {
    // Auto layout governs the box position for flex items, so single-line
    // centered/right-aligned text can size itself without x compensation.
    const isSingleLine = computed.whiteSpace.toLowerCase().includes("nowrap");
    if (!isFlexItem(element, computed) || !isSingleLine) return false;
  }
  if (!isFlexItem(element, computed)) return false;
  if (hasFixedFlexBasis(computed)) return false;
  return Number.parseFloat(computed.flexGrow || "0") === 0;
}

function getTextAutoResize(
  element: Element,
  computed: CSSStyleDeclaration,
): "WIDTH_AND_HEIGHT" | undefined {
  return shouldAutoResizeText(element, computed) ? "WIDTH_AND_HEIGHT" : undefined;
}

function getLayoutAlign(element: Element): "STRETCH" | undefined {
  return element.getAttribute("data-figma-layout-align") === "stretch"
    ? "STRETCH"
    : undefined;
}

const verticalSizeProperties = [
  "height",
  "block-size",
  "min-height",
  "min-block-size",
];

const horizontalSizeProperties = [
  "width",
  "inline-size",
  "min-width",
  "min-inline-size",
];

function hasExplicitSizeDeclaration(
  declarations: MatchedDeclaration[],
  properties: string[],
): boolean {
  return declarations.some(
    (declaration) =>
      properties.includes(declaration.property) &&
      declaration.value.trim().toLowerCase() !== "auto",
  );
}

function isStretchAlignment(value: string): boolean {
  return value === "stretch" || value === "normal";
}

function getResolvedFlexAlignment(
  element: Element,
  computed: CSSStyleDeclaration,
): string {
  const alignSelf = computed.alignSelf;
  if (alignSelf && alignSelf !== "auto") return alignSelf;

  const parentElement = element.parentElement;
  if (!parentElement) return "auto";
  return window.getComputedStyle(parentElement).alignItems || "auto";
}

function getFlexParentCrossAxisInfo(
  element: Element,
  computed: CSSStyleDeclaration,
): { crossAxis: "horizontal" | "vertical"; stretched: boolean } | undefined {
  if (!isFlexItem(element, computed)) return undefined;

  const parentElement = element.parentElement;
  if (!parentElement) return undefined;

  const parentComputed = window.getComputedStyle(parentElement);
  if (!isFlexDisplay(parentComputed.display)) return undefined;

  return {
    crossAxis: parentComputed.flexDirection.startsWith("column")
      ? "horizontal"
      : "vertical",
    stretched: isStretchAlignment(getResolvedFlexAlignment(element, computed)),
  };
}

function getInferredFrameLayoutAlign(
  element: Element,
  computed: CSSStyleDeclaration,
  declarations: MatchedDeclaration[],
): "STRETCH" | undefined {
  const crossAxisInfo = getFlexParentCrossAxisInfo(element, computed);
  if (!crossAxisInfo || !crossAxisInfo.stretched) return undefined;

  const crossSizeProperties =
    crossAxisInfo.crossAxis === "horizontal"
      ? horizontalSizeProperties
      : verticalSizeProperties;
  if (hasExplicitSizeDeclaration(declarations, crossSizeProperties)) {
    return undefined;
  }

  return "STRETCH";
}

function getLayoutSizingVertical(
  element: Element,
  computed: CSSStyleDeclaration,
  bindings: Partial<Record<FigmaBindingName, string>>,
  declarations: MatchedDeclaration[],
): "HUG" | undefined {
  if (bindings.height) return undefined;
  if (hasExplicitSizeDeclaration(declarations, verticalSizeProperties)) {
    return undefined;
  }
  if (element.getAttribute("data-figma-layout-sizing-vertical") === "hug") {
    return "HUG";
  }
  if (!isFlexDisplay(computed.display)) return undefined;

  const crossAxisInfo = getFlexParentCrossAxisInfo(element, computed);
  if (crossAxisInfo?.crossAxis === "vertical" && crossAxisInfo.stretched) {
    return undefined;
  }

  return "HUG";
}

function getLayoutGrow(
  element: Element,
  computed: CSSStyleDeclaration,
): number | undefined {
  if (element.getAttribute("data-figma-layout-grow") === "1") return 1;
  const flexGrow = Number.parseFloat(computed.flexGrow || "0");
  return Number.isFinite(flexGrow) && flexGrow > 0 ? flexGrow : undefined;
}

function getLayoutSizingHorizontal(
  element: Element,
  computed: CSSStyleDeclaration,
  bindings: Partial<Record<FigmaBindingName, string>>,
  declarations: MatchedDeclaration[],
): "HUG" | undefined {
  if (bindings.width) return undefined;
  // An explicit non-auto width in CSS always wins — hugging such an element
  // in Figma would diverge from the browser rendering.
  if (hasExplicitSizeDeclaration(declarations, horizontalSizeProperties)) {
    return undefined;
  }
  if (element.getAttribute("data-figma-layout-sizing-horizontal") === "hug") {
    return "HUG";
  }
  if (isFlexItem(element, computed) || computed.display.includes("inline-flex")) {
    if (hasFixedFlexBasis(computed)) return undefined;
    if (Number.parseFloat(computed.flexGrow || "0") > 0) return undefined;
    return "HUG";
  }
  // Out-of-flow flex containers shrink-wrap to their content in CSS, so an
  // absolutely positioned flex frame without an explicit width should hug.
  if (isFlexDisplay(computed.display) && isOutOfFlowPositioned(computed)) {
    return "HUG";
  }
  // Grid items with non-stretch justification shrink-wrap to their content.
  // Note: grid items blockify inline-flex, so check the parent display.
  const parentElement = element.parentElement;
  if (
    parentElement &&
    isFlexDisplay(computed.display) &&
    !isOutOfFlowPositioned(computed)
  ) {
    const parentComputed = window.getComputedStyle(parentElement);
    if (parentComputed.display.includes("grid")) {
      const justifySelf = computed.justifySelf;
      const resolved =
        justifySelf && justifySelf !== "auto"
          ? justifySelf
          : parentComputed.justifyItems;
      if (
        ["start", "center", "end", "flex-start", "flex-end"].includes(resolved)
      ) {
        return "HUG";
      }
    }
  }
  return undefined;
}

function getTextAlignVertical(element: Element): "CENTER" | undefined {
  return element.getAttribute("data-figma-text-align-vertical") === "center"
    ? "CENTER"
    : undefined;
}

function createTextLeafNode({
  bindings,
  computed,
  height,
  layoutStrategy,
  name,
  outOfFlow,
  text,
  textAutoResize,
  layoutAlign,
  layoutGrow,
  textAlignVertical,
  width,
  x,
  y,
}: {
  bindings: Partial<Record<FigmaBindingName, string>>;
  computed: CSSStyleDeclaration;
  height: number;
  layoutStrategy?: FigmaLayoutStrategy;
  name: string;
  outOfFlow?: boolean;
  text: string;
  textAutoResize?: "WIDTH_AND_HEIGHT";
  layoutAlign?: "STRETCH";
  layoutGrow?: number;
  textAlignVertical?: "CENTER";
  width: number;
  x: number;
  y: number;
}): FigmaExportNode {
  const color = cssColorValue(computed.color);
  const fontWeight = Number.parseInt(computed.fontWeight, 10);
  const fontSize = cssLengthToNumber(computed.fontSize) ?? 14;
  const rawLineHeight = cssLineHeightToNumber(computed.lineHeight);
  // `normal` line-height has no px value in computed styles. For single-line
  // text the rendered height equals the line box, so pin it; leave multi-line
  // text on Figma's auto line height.
  const lineHeight =
    rawLineHeight === "normal"
      ? Math.round(height / Math.max(1, fontSize * 1.2)) <= 1
        ? height
        : undefined
      : rawLineHeight;
  const letterSpacing = cssLengthToNumber(computed.letterSpacing);
  const isItalic =
    computed.fontStyle === "italic" || computed.fontStyle.startsWith("oblique");
  const textDecoration = getTextDecoration(computed);
  const isSingleLineTruncatedText = isClippedSingleLineText(computed);
  const exportWidth =
    isSingleLineTruncatedText ||
    Boolean(textAutoResize) ||
    layoutGrow === 1 ||
    hasFixedFlexBasis(computed)
      ? width
      : getTextExportWidth({ computed, text, width });
  const exportX = getTextExportX({ computed, exportWidth, width, x });

  return {
    bindings: pickBindings(bindings, [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "textColor",
    ]),
    children: [],
    kind: "text",
    layoutStrategy: layoutStrategy ?? (layoutAlign ? "autoLayout" : "absolute"),
    name,
    text,
    styles: {
      ...(color ? { color } : {}),
      display: computed.display,
      fontFamily: computed.fontFamily,
      fontSize,
      ...(isItalic ? { fontStyle: "italic" } : {}),
      ...(Number.isFinite(fontWeight) ? { fontWeight } : {}),
      height,
      ...(layoutAlign ? { layoutAlign } : {}),
      ...(layoutGrow ? { layoutGrow } : {}),
      ...(letterSpacing !== undefined ? { letterSpacing } : {}),
      ...(typeof lineHeight === "number" ? { lineHeight } : {}),
      opacity: Number(computed.opacity),
      ...(outOfFlow ? { outOfFlow: true } : {}),
      overflow: computed.overflow,
      ...(isSingleLineTruncatedText ? { maxLines: 1, textTruncation: "ENDING" } : {}),
      textAlign: computed.textAlign,
      ...(textAlignVertical ? { textAlignVertical } : {}),
      ...(textAutoResize ? { textAutoResize } : {}),
      ...(textDecoration ? { textDecoration } : {}),
      width: exportWidth,
      x: exportX,
      y,
    },
  };
}

function hasBoxedTextStyle(
  computed: CSSStyleDeclaration,
  border: VisibleBorder | undefined,
): boolean {
  return Boolean(
    cssColorValue(computed.backgroundColor) ||
      border ||
      cssLengthToNumber(computed.borderTopLeftRadius) ||
      cssLengthToNumber(computed.paddingBottom) ||
      cssLengthToNumber(computed.paddingLeft) ||
      cssLengthToNumber(computed.paddingRight) ||
      cssLengthToNumber(computed.paddingTop),
  );
}

function getPseudoMatchedDeclarations(
  element: Element,
  rules: CSSStyleRule[],
  pseudo: PseudoElementName,
): MatchedDeclaration[] {
  const declarations: MatchedDeclaration[] = [];
  const pseudoSelector = `::${pseudo}`;

  for (const rule of rules) {
    const matchesPseudoSelector = rule.selectorText.split(",").some((selector) => {
      if (!selector.includes(pseudoSelector)) return false;
      const baseSelector = selector.replace(pseudoSelector, "").trim();
      if (!baseSelector || baseSelector.includes(":hover") || baseSelector.includes(":focus")) {
        return false;
      }

      try {
        return element.matches(baseSelector);
      } catch {
        return false;
      }
    });

    if (!matchesPseudoSelector) continue;

    for (const property of Array.from(rule.style)) {
      declarations.push({
        property,
        value: rule.style.getPropertyValue(property).trim(),
      });
    }
    declarations.push(...parseCssTextDeclarations(rule.style.cssText));
  }

  return declarations;
}

function collectPseudoBindings(
  element: Element,
  rules: CSSStyleRule[],
  pseudo: PseudoElementName,
  tokenSystem: DetectedTokenSystem,
): Partial<Record<FigmaBindingName, string>> {
  const declarations = getPseudoMatchedDeclarations(element, rules, pseudo);
  const bindings: Partial<Record<FigmaBindingName, string>> = {};

  for (const bindingName of ["backgroundColor", "height", "width"] as FigmaBindingName[]) {
    const token = findTokenForProperty(declarations, bindingName, tokenSystem);
    if (token) bindings[bindingName] = token;
  }

  return bindings;
}

function declarationsIncludeProperty(
  declarations: MatchedDeclaration[],
  properties: string[],
): boolean {
  return declarations.some((declaration) =>
    properties.includes(declaration.property),
  );
}

function getPseudoConstraints(
  declarations: MatchedDeclaration[],
): FigmaNodeConstraints {
  const hasTop = declarationsIncludeProperty(declarations, [
    "top",
    "inset-block-start",
    "inset-block",
    "inset",
  ]);
  const hasBottom = declarationsIncludeProperty(declarations, [
    "bottom",
    "inset-block-end",
    "inset-block",
    "inset",
  ]);
  const hasLeft = declarationsIncludeProperty(declarations, [
    "left",
    "inset-inline-start",
    "inset-inline",
    "inset",
  ]);
  const hasRight = declarationsIncludeProperty(declarations, [
    "right",
    "inset-inline-end",
    "inset-inline",
    "inset",
  ]);

  return {
    horizontal: hasLeft && hasRight ? "STRETCH" : hasRight && !hasLeft ? "MAX" : "MIN",
    vertical: hasTop && hasBottom ? "STRETCH" : hasBottom && !hasTop ? "MAX" : "MIN",
  };
}

function createPseudoNode(
  element: Element,
  rules: CSSStyleRule[],
  pseudo: PseudoElementName,
  parentWidth: number,
  parentHeight: number,
  tokenSystem: DetectedTokenSystem,
  options: ResolvedFigmaExportAddonOptions,
): FigmaExportNode | undefined {
  const style = window.getComputedStyle(element, `::${pseudo}`);
  const content = style.content.trim();
  const width = cssLengthToNumber(style.width) ?? 0;
  const height = cssLengthToNumber(style.height) ?? 0;
  const backgroundColor = cssColorValue(style.backgroundColor);

  if (
    content === "none" ||
    content === "normal" ||
    width <= 0 ||
    height <= 0 ||
    !backgroundColor
  ) {
    return undefined;
  }

  const left = cssPositionToNumber(style.left, parentWidth) ?? 0;
  const top = cssPositionToNumber(style.top, parentHeight) ?? 0;
  const transformTranslation = cssMatrixTranslationToNumber(style.transform);
  const fallbackTranslateX = style.transform.includes("translate") ? -width / 2 : 0;
  const fallbackTranslateY = style.transform.includes("translate") ? -height / 2 : 0;
  const translateX = transformTranslation?.x ?? fallbackTranslateX;
  const translateY = transformTranslation?.y ?? fallbackTranslateY;

  return {
    bindings: collectPseudoBindings(element, rules, pseudo, tokenSystem),
    children: [],
    kind: "frame",
    layoutStrategy: "absolute",
    name: `${getElementName(element, options)}::${pseudo}`,
    styles: {
      backgroundColor,
      constraints: getPseudoConstraints(
        getPseudoMatchedDeclarations(element, rules, pseudo),
      ),
      display: style.display,
      height,
      opacity: Number(style.opacity),
      outOfFlow: true,
      overflow: style.overflow,
      width,
      x: toFiniteNumber(left + translateX),
      y: toFiniteNumber(top + translateY),
    },
  };
}

function getBorderLineProperties(side: BorderSide): string[] {
  const logicalProperties: Record<BorderSide, string[]> = {
    bottom: ["border-block-end", "border-block"],
    left: ["border-inline-start", "border-inline"],
    right: ["border-inline-end", "border-inline"],
    top: ["border-block-start", "border-block"],
  };

  return [
    `border-${side}`,
    `border-${side}-color`,
    `border-${side}-width`,
    ...logicalProperties[side],
    ...logicalProperties[side].map((property) => `${property}-color`),
    ...logicalProperties[side].map((property) => `${property}-width`),
    "border",
    "border-color",
    "border-width",
  ];
}

function findBorderLineToken(
  declarations: MatchedDeclaration[],
  side: BorderSide,
  target: "color" | "width",
  tokenSystem: DetectedTokenSystem,
): string | undefined {
  const properties = getBorderLineProperties(side);

  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (!properties.includes(declaration.property)) continue;

    const tokens = extractCssVariableNames(declaration.value, tokenSystem);
    if (tokens.length === 0) continue;

    if (target === "color") {
      return tokens.find(isColorTokenName) || tokens[0];
    }

    return tokens.find((token) => !isColorTokenName(token)) || tokens[0];
  }

  return undefined;
}

function getVisibleBorderSides(
  computed: CSSStyleDeclaration,
): Partial<Record<BorderSide, VisibleBorder>> | undefined {
  if (getUniformVisibleBorder(computed)) return undefined;

  const sides: Partial<Record<BorderSide, VisibleBorder>> = {};

  for (const side of borderSides) {
    if (!isVisibleBorderSide(computed, side)) continue;

    const width = cssBorderWidth(computed, side);
    const color = cssColorValue(cssBorderColor(computed, side));
    if (!color || width <= 0) continue;

    sides[side] = { color, width };
  }

  return Object.keys(sides).length > 0 ? sides : undefined;
}

function collectBorderSideBindings(
  element: Element,
  rules: CSSStyleRule[],
  sides: Partial<Record<BorderSide, VisibleBorder>>,
  tokenSystem: DetectedTokenSystem,
): Partial<Record<FigmaBindingName, string>> {
  const declarations = getMatchedDeclarations(element, rules);
  const bindings: Partial<Record<FigmaBindingName, string>> = {};

  for (const side of borderSides) {
    if (!sides[side]) continue;

    if (!bindings.borderColor) {
      const colorToken = findBorderLineToken(declarations, side, "color", tokenSystem);
      if (colorToken) bindings.borderColor = colorToken;
    }
    if (!bindings.borderWidth) {
      const widthToken = findBorderLineToken(declarations, side, "width", tokenSystem);
      if (widthToken) bindings.borderWidth = widthToken;
    }
  }

  return bindings;
}

function collectBindings(
  element: Element,
  rules: CSSStyleRule[],
  hasUniformVisibleBorder: boolean,
  tokenSystem: DetectedTokenSystem,
): Partial<Record<FigmaBindingName, string>> {
  const declarations = getMatchedDeclarations(element, rules);
  const bindings: Partial<Record<FigmaBindingName, string>> = {};

  (Object.keys(bindingProperties) as FigmaBindingName[]).forEach((bindingName) => {
    if (
      !hasUniformVisibleBorder &&
      (bindingName === "borderColor" || bindingName === "borderWidth")
    ) {
      return;
    }

    let token = findTokenForProperty(declarations, bindingName, tokenSystem);
    let ancestor = element.parentElement;

    while (!token && inheritedBindings.has(bindingName) && ancestor) {
      token = findTokenForProperty(
        getMatchedDeclarations(ancestor, rules),
        bindingName,
        tokenSystem,
      );
      ancestor = ancestor.parentElement;
    }

    if (token) bindings[bindingName] = token;
  });

  return bindings;
}

function getDirectText(element: Element): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function hasElementChildren(element: Element): boolean {
  return Array.from(element.children).some((child) => {
    const style = window.getComputedStyle(child);
    return style.display !== "none";
  });
}

function hasOutOfFlowPositionedChildren(elements: Element[]): boolean {
  return elements.some((child) => {
    const position = window.getComputedStyle(child).position;
    return position === "absolute" || position === "fixed";
  });
}

function getCommonAncestor(elements: Element[], boundary: Element): Element {
  if (elements.length === 0) return boundary;
  let ancestor: Element | null = elements[0];

  while (ancestor && ancestor !== boundary) {
    if (elements.every((element) => ancestor?.contains(element))) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }

  return boundary;
}

function findExportRoot(scope: HTMLElement): Element | undefined {
  const components = Array.from(scope.querySelectorAll("[data-component]"));
  if (components.length === 1) return components[0];
  if (components.length > 1) {
    const ancestor = getCommonAncestor(components, scope);
    if (ancestor !== scope) return ancestor;
  }

  return scope.firstElementChild ?? undefined;
}

async function fetchSvgText(
  element: HTMLImageElement,
  options: ResolvedFigmaExportAddonOptions,
): Promise<string | undefined> {
  const graphicName = element.getAttribute("data-graphic");
  if (element.getAttribute("data-component") === "graphic" && graphicName) {
    const svgText = options.embeddedSvgByDataGraphic[graphicName];
    return svgText ? sanitizeSvgTextForFigma(svgText) : undefined;
  }

  const src = element.currentSrc || element.src;
  if (!src) return undefined;

  if (src.startsWith("data:image/svg+xml")) {
    const [, encodedSvg = ""] = src.split(",", 2);
    return sanitizeSvgTextForFigma(decodeURIComponent(encodedSvg));
  }

  try {
    const response = await fetch(src);
    if (!response.ok) return undefined;
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("svg") || text.trimStart().startsWith("<svg")) {
      return sanitizeSvgTextForFigma(text);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function createExportNode(
  element: Element,
  rootRect: DOMRect,
  parentRect: DOMRect,
  rules: CSSStyleRule[],
  tokenSystem: DetectedTokenSystem,
  options: ResolvedFigmaExportAddonOptions,
  forceAbsoluteLayout = false,
): Promise<FigmaExportNode | undefined> {
  const computed = window.getComputedStyle(element);
  if (
    computed.display === "none" ||
    computed.visibility === "hidden" ||
    Number(computed.opacity) === 0
  ) {
    return undefined;
  }

  const rect = element.getBoundingClientRect();
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  if (width <= 0 || height <= 0) return undefined;

  const forceAutoLayout =
    element.getAttribute("data-figma-layout-strategy") === "auto-layout";
  const nextForceAbsoluteLayout =
    !forceAutoLayout && (forceAbsoluteLayout || isAbsoluteFidelityRoot(element, options));
  const component = getComponentReference(element);

  if (element instanceof SVGElement) {
    return createInlineSvgNode(element, computed, rect, parentRect, options);
  }

  const clipPathNode = createClipPathSvgNode(
    element,
    computed,
    rect,
    parentRect,
    rules,
    tokenSystem,
    options,
  );
  if (clipPathNode) return clipPathNode;

  const childElements = Array.from(element.children);
  const hasPositionedChildren = hasOutOfFlowPositionedChildren(childElements);
  const childNodes = (
    await Promise.all(
      childElements.map((child) =>
        createExportNode(
          child,
          rootRect,
          rect,
          rules,
          tokenSystem,
          options,
          nextForceAbsoluteLayout && !child.hasAttribute("data-component"),
        ),
      ),
    )
  ).filter((child): child is FigmaExportNode => Boolean(child));

  const directText = getDirectText(element);
  const backgroundColor = cssColorValue(computed.backgroundColor);
  const declarations = getMatchedDeclarations(element, rules);
  const backgroundLinearGradient = addLinearGradientStopTokens(
    parseLinearGradient(computed.backgroundImage),
    declarations,
    tokenSystem,
  );
  const backgroundGradient = backgroundLinearGradient
    ? undefined
    : parseRadialOrConicGradient(computed.backgroundImage);
  const boxShadow = parseBoxShadows(computed.boxShadow);
  const layerBlur = parseBlurRadius(computed.filter);
  const backgroundBlur = parseBlurRadius(
    computed.backdropFilter ||
      (computed as unknown as { webkitBackdropFilter?: string })
        .webkitBackdropFilter,
  );
  const color = cssColorValue(computed.color);
  const border = getUniformVisibleBorder(computed);
  const borderSideMap = getVisibleBorderSides(computed);
  const fontWeight = Number.parseInt(computed.fontWeight, 10);
  const radius = cssLengthToNumber(computed.borderTopLeftRadius);
  const lineHeight = cssLineHeightToNumber(computed.lineHeight);
  const isColumnFlex = computed.flexDirection.startsWith("column");
  const rowGap = cssLengthToNumber(computed.rowGap);
  const columnGap = cssLengthToNumber(computed.columnGap);
  // Primary-axis spacing follows the flex direction (Figma itemSpacing).
  const gap = isColumnFlex ? rowGap : columnGap;
  // Cross-axis spacing between wrapped lines (Figma counterAxisSpacing).
  const counterAxisGap = isColumnFlex ? columnGap : rowGap;
  const flexWraps =
    !isColumnFlex &&
    (computed.flexWrap === "wrap" || computed.flexWrap === "wrap-reverse");
  const layoutAlign = getLayoutAlign(element);
  const layoutGrow = getLayoutGrow(element, computed);
  const textLayoutStrategy =
    element.getAttribute("data-figma-layout-strategy") === "auto-layout"
      ? "autoLayout"
      : getLayoutStrategy(element, computed, nextForceAbsoluteLayout);
  const textAlignVertical = getTextAlignVertical(element);
  const bindings = collectBindings(element, rules, Boolean(border), tokenSystem);
  if (borderSideMap) {
    Object.assign(
      bindings,
      collectBorderSideBindings(element, rules, borderSideMap, tokenSystem),
    );
  }
  const layoutSizingHorizontal = getLayoutSizingHorizontal(
    element,
    computed,
    bindings,
    declarations,
  );
  const layoutSizingVertical = getLayoutSizingVertical(
    element,
    computed,
    bindings,
    declarations,
  );
  const frameLayoutAlign =
    layoutAlign ?? getInferredFrameLayoutAlign(element, computed, declarations);
  if (backgroundLinearGradient || backgroundGradient) {
    delete bindings.backgroundColor;
  }
  const layoutStrategy = getLayoutStrategy(element, computed, nextForceAbsoluteLayout);
  const pseudoNodes = (["before", "after"] as PseudoElementName[])
    .map((pseudo) =>
      createPseudoNode(element, rules, pseudo, width, height, tokenSystem, options),
    )
    .filter((node): node is FigmaExportNode => Boolean(node));
  const shouldPreserveComputedAutoLayout =
    layoutStrategy === "autoLayout" &&
    isFlexDisplay(computed.display) &&
    !hasPositionedChildren;
  const frameLayoutStrategy: FigmaLayoutStrategy =
    element.getAttribute("data-figma-layout-strategy") === "auto-layout"
      ? layoutStrategy
      : shouldPreserveComputedAutoLayout
        ? layoutStrategy
        : pseudoNodes.length > 0 || hasPositionedChildren
        ? "absolute"
        : layoutStrategy;

  const elementOutOfFlow = isOutOfFlowPositioned(computed);
  const wrapStyles =
    frameLayoutStrategy === "autoLayout" && flexWraps
      ? {
          layoutWrap: "WRAP" as const,
          ...(counterAxisGap !== undefined && counterAxisGap >= 0
            ? { counterAxisSpacing: counterAxisGap }
            : {}),
        }
      : {};

  if (directText && !hasElementChildren(element)) {
    if (hasBoxedTextStyle(computed, border)) {
      const paddingLeft = cssLengthToNumber(computed.paddingLeft) ?? 0;
      const paddingRight = cssLengthToNumber(computed.paddingRight) ?? 0;
      const paddingTop = cssLengthToNumber(computed.paddingTop) ?? 0;
      const paddingBottom = cssLengthToNumber(computed.paddingBottom) ?? 0;
      const textNode = createTextLeafNode({
        bindings,
        computed,
        height: Math.max(1, height - paddingTop - paddingBottom),
        layoutStrategy: textLayoutStrategy,
        name: `${getElementName(element, options)}__text`,
        text: directText,
        textAutoResize: getTextAutoResize(element, computed),
        layoutAlign,
        layoutGrow,
        textAlignVertical,
        width: Math.max(1, width - paddingLeft - paddingRight),
        x: paddingLeft,
        y: paddingTop,
      });

      if (textLayoutStrategy === "autoLayout") {
        return {
          bindings,
          children: [textNode],
          ...(component ? { component } : {}),
          kind: "frame",
          layoutStrategy: "autoLayout",
          name: getElementName(element, options),
          styles: {
            alignItems: "center",
            ...(backgroundColor ? { backgroundColor } : {}),
            ...(backgroundLinearGradient ? { backgroundLinearGradient } : {}),
            ...(border ? { borderColor: border.color, borderWidth: border.width } : {}),
            ...(borderSideMap ? { borderSides: borderSideMap } : {}),
            ...(boxShadow.length ? { boxShadow } : {}),
            display: "flex",
            flexDirection: "row",
            height,
            justifyContent: justifyContentFromTextAlign(computed.textAlign),
            opacity: Number(computed.opacity),
            ...(elementOutOfFlow ? { outOfFlow: true } : {}),
            overflow: computed.overflow,
            paddingBottom,
            paddingLeft,
            paddingRight,
            paddingTop,
            ...(radius !== undefined && radius > 0 ? { radius } : {}),
            ...(layoutSizingHorizontal ? { layoutSizingHorizontal } : {}),
            ...(layoutSizingHorizontal && !bindings.height
              ? { layoutSizingVertical: "HUG" as const }
              : {}),
            width,
            x: toFiniteNumber(rect.left - parentRect.left),
            y: toFiniteNumber(rect.top - parentRect.top),
          },
        };
      }

      return {
        bindings,
        children: [textNode],
        ...(component ? { component } : {}),
        kind: "frame",
        layoutStrategy: "absolute",
        name: getElementName(element, options),
        styles: {
          ...(backgroundColor ? { backgroundColor } : {}),
          ...(backgroundLinearGradient ? { backgroundLinearGradient } : {}),
          ...(border ? { borderColor: border.color, borderWidth: border.width } : {}),
          ...(borderSideMap ? { borderSides: borderSideMap } : {}),
          ...(boxShadow.length ? { boxShadow } : {}),
          display: getExportDisplay(computed, "absolute"),
          height,
          opacity: Number(computed.opacity),
          ...(elementOutOfFlow ? { outOfFlow: true } : {}),
          overflow: computed.overflow,
          paddingBottom,
          paddingLeft,
          paddingRight,
          paddingTop,
          ...(radius !== undefined && radius > 0 ? { radius } : {}),
          ...(layoutSizingHorizontal ? { layoutSizingHorizontal } : {}),
          width,
          x: toFiniteNumber(rect.left - parentRect.left),
          y: toFiniteNumber(rect.top - parentRect.top),
        },
      };
    }

    return createTextLeafNode({
      bindings,
      computed,
      height,
      layoutStrategy: textLayoutStrategy,
      name: getElementName(element, options),
      outOfFlow: elementOutOfFlow,
      text: directText,
      textAutoResize: getTextAutoResize(element, computed),
      layoutAlign,
      layoutGrow,
      textAlignVertical,
      width,
      x: toFiniteNumber(rect.left - parentRect.left),
      y: toFiniteNumber(rect.top - parentRect.top),
    });
  }

  const kind = element instanceof HTMLImageElement ? "image" : "frame";
  const elementName = getElementName(element, options);
  const frameStyles = {
    ...(computed.alignItems ? { alignItems: computed.alignItems } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(backgroundLinearGradient ? { backgroundLinearGradient } : {}),
    ...(backgroundGradient ? { backgroundGradient } : {}),
    ...(backgroundBlur !== undefined ? { backgroundBlur } : {}),
    ...(border ? { borderColor: border.color, borderWidth: border.width } : {}),
    ...(borderSideMap ? { borderSides: borderSideMap } : {}),
    ...(boxShadow.length ? { boxShadow } : {}),
    ...(color ? { color } : {}),
    display: getExportDisplay(computed, frameLayoutStrategy),
    ...(frameLayoutStrategy === "autoLayout"
      ? { flexDirection: computed.flexDirection }
      : {}),
    fontFamily: computed.fontFamily,
    fontSize: cssLengthToNumber(computed.fontSize) ?? 14,
    ...(Number.isFinite(fontWeight) ? { fontWeight } : {}),
    ...(gap !== undefined && gap >= 0 ? { gap } : {}),
    ...wrapStyles,
    ...(layerBlur !== undefined ? { layerBlur } : {}),
    ...(kind === "image" ? { objectFit: computed.objectFit } : {}),
    height,
    ...(computed.justifyContent ? { justifyContent: computed.justifyContent } : {}),
    ...(frameLayoutAlign ? { layoutAlign: frameLayoutAlign } : {}),
    ...(layoutGrow ? { layoutGrow } : {}),
    ...(layoutSizingHorizontal ? { layoutSizingHorizontal } : {}),
    ...(layoutSizingVertical ? { layoutSizingVertical } : {}),
    ...(lineHeight ? { lineHeight } : {}),
    opacity: Number(computed.opacity),
    ...(elementOutOfFlow ? { outOfFlow: true } : {}),
    overflow: computed.overflow,
    paddingBottom: cssLengthToNumber(computed.paddingBottom) ?? 0,
    paddingLeft: cssLengthToNumber(computed.paddingLeft) ?? 0,
    paddingRight: cssLengthToNumber(computed.paddingRight) ?? 0,
    paddingTop: cssLengthToNumber(computed.paddingTop) ?? 0,
    ...(radius !== undefined && radius > 0 ? { radius } : {}),
    ...(textAlignVertical ? { textAlignVertical } : {}),
    width,
    x: toFiniteNumber(rect.left - parentRect.left),
    y: toFiniteNumber(rect.top - parentRect.top),
  };
  const imageSvgText =
    kind === "image" && element instanceof HTMLImageElement
      ? await fetchSvgText(element, options)
      : undefined;
  const imageBytes =
    kind === "image" && element instanceof HTMLImageElement && !imageSvgText
      ? await fetchRasterImageBase64(element)
      : undefined;
  return {
    bindings,
    children: kind === "image" ? [] : [...childNodes, ...pseudoNodes],
    ...(component ? { component } : {}),
    ...(imageBytes ? { imageBytes } : {}),
    kind,
    layoutStrategy: kind === "image" ? "absolute" : frameLayoutStrategy,
    name: elementName,
    ...(imageSvgText ? { svgText: imageSvgText } : {}),
    styles: frameStyles,
  };
}

export async function createFigmaExportPayload({
  componentTitle,
  options,
  scope,
  storyId,
  storyName,
  storyTitle,
}: {
  componentTitle: string;
  options: ResolvedFigmaExportAddonOptions;
  scope: HTMLElement;
  storyId: string;
  storyName: string;
  storyTitle: string;
}): Promise<FigmaExportPayload> {
  const root = findExportRoot(scope);
  if (!root) {
    throw new Error("No exportable story root was found.");
  }
  const artifactKind = getArtifactKind(storyTitle);

  const rules = getCssRules();
  const tokenSystem = detectTokenSystem(options);
  const rootRect = root.getBoundingClientRect();
  const rootNode = await createExportNode(
    root,
    rootRect,
    rootRect,
    rules,
    tokenSystem,
    options,
  );

  if (!rootNode) {
    throw new Error("The story root has no visible exportable bounds.");
  }

  rootNode.styles.x = 0;
  rootNode.styles.y = 0;

  const component =
    artifactKind === "component"
      ? rootNode.component ??
        (!hasComponentReference(rootNode)
          ? getComponentReference(root, componentTitle)
          : undefined)
      : undefined;

  const tokenNames = new Set<string>();
  function collectNodeTokens(node: FigmaExportNode) {
    Object.values(node.bindings).forEach((token) => {
      if (token) tokenNames.add(token);
    });
    node.styles.backgroundLinearGradient?.stops.forEach((stop) => {
      if (stop.token) tokenNames.add(stop.token);
    });
    node.children.forEach(collectNodeTokens);
  }
  collectNodeTokens(rootNode);

  return {
    artifactKind,
    ...(component ? { component } : {}),
    componentTitle,
    generatedAt: new Date().toISOString(),
    root: rootNode,
    storyId,
    storyName,
    storyTitle,
    tokenSystem: {
      collections: tokenSystem.collections,
      layers: tokenSystem.layers,
      pluginDataKey: tokenSystem.pluginDataKey,
      prefix: tokenSystem.prefix,
    },
    tokens: collectTokensForExport(tokenNames, tokenSystem),
    version: 2,
  };
}
