// src/FigmaCodeExporter.tsx
import {
  CheckIcon,
  CommandIcon,
  CopyIcon,
  FigmaIcon
} from "@storybook/icons";
import { useRef, useState } from "react";

// src/tokenExport.ts
var tokenLayerOrder = {
  comp: 2,
  ref: 0,
  sys: 1
};
var tokenLayers = ["ref", "sys", "comp"];
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function getTokenFamily(name) {
  if (name.includes("-color-")) return "color";
  if (name.includes("-opacity-")) return "opacity";
  if (name.includes("-shadow-")) return "shadow";
  if (name.includes("-typeface-") || name.includes("-typescale-") || name.includes("-weight-") || name.includes("-line-height-")) {
    return "type";
  }
  if (name.includes("-spacing-")) return "spacing";
  if (name.includes("-shape-") || name.includes("-radius-")) return "shape";
  if (name.includes("-duration-") || name.includes("-easing-")) return "motion";
  if (name.includes("-size-")) return "size";
  return "other";
}
function normalizeTokenValue(value) {
  return value.trim().replace(/\s+/g, " ");
}
function collectCssCustomProperties() {
  const tokens = /* @__PURE__ */ new Map();
  const targetElements = [document.documentElement, document.body].filter(Boolean);
  function collectFromStyle(style, overwrite) {
    for (const property of Array.from(style)) {
      if (!property.startsWith("--")) continue;
      const value = style.getPropertyValue(property).trim();
      if (!value) continue;
      if (!overwrite && tokens.has(property)) continue;
      tokens.set(property, normalizeTokenValue(value));
    }
  }
  function ruleMatchesTokenTarget(rule) {
    return targetElements.some((element) => {
      try {
        return element.matches(rule.selectorText);
      } catch {
        return false;
      }
    });
  }
  function mediaRuleIsActive(rule) {
    try {
      return window.matchMedia(rule.conditionText).matches;
    } catch {
      return true;
    }
  }
  function collectRuleList(ruleList) {
    for (const rule of Array.from(ruleList)) {
      if (rule instanceof CSSStyleRule) {
        if (ruleMatchesTokenTarget(rule)) {
          collectFromStyle(rule.style, true);
        }
        continue;
      }
      if (rule instanceof CSSImportRule) {
        try {
          if (rule.styleSheet) collectRuleList(rule.styleSheet.cssRules);
        } catch {
        }
        continue;
      }
      if (rule instanceof CSSMediaRule && !mediaRuleIsActive(rule)) {
        continue;
      }
      if ("cssRules" in rule) {
        try {
          collectRuleList(rule.cssRules);
        } catch {
        }
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectRuleList(sheet.cssRules);
    } catch {
    }
  }
  collectFromStyle(document.documentElement.style, true);
  if (document.body) collectFromStyle(document.body.style, true);
  collectFromStyle(window.getComputedStyle(document.documentElement), false);
  if (document.body) collectFromStyle(window.getComputedStyle(document.body), false);
  return tokens;
}
function getTokenLayer(name, prefix, layers) {
  for (const layer of tokenLayers) {
    const segment = layers[layer];
    if (name.startsWith(`--${prefix}-${segment}-`)) return layer;
  }
  return void 0;
}
function detectTokenPrefix(tokenNames, options) {
  if (options.tokenPrefix) return options.tokenPrefix;
  const candidates = /* @__PURE__ */ new Map();
  for (const name of tokenNames) {
    for (const layer of tokenLayers) {
      const segment = options.tokenLayers[layer];
      const match = name.match(new RegExp(`^--(.+?)-${escapeRegExp(segment)}-`));
      if (!match) continue;
      const prefix = match[1];
      const candidate = candidates.get(prefix) ?? {
        count: 0,
        layers: /* @__PURE__ */ new Set()
      };
      candidate.count += 1;
      candidate.layers.add(layer);
      candidates.set(prefix, candidate);
    }
  }
  const completeCandidates = Array.from(candidates.entries()).filter(([, candidate]) => tokenLayers.every((layer) => candidate.layers.has(layer))).sort(([, a], [, b]) => b.count - a.count);
  if (completeCandidates.length > 0) return completeCandidates[0][0];
  throw new Error(
    "Unable to detect a ref/sys/comp token prefix. Pass tokenPrefix in the Storybook Figma export addon options."
  );
}
function detectTokenSystem(options) {
  const customProperties = collectCssCustomProperties();
  const prefix = detectTokenPrefix(customProperties.keys(), options);
  const catalog = [];
  customProperties.forEach((value, name) => {
    const layer = getTokenLayer(name, prefix, options.tokenLayers);
    if (!layer) return;
    catalog.push({
      family: getTokenFamily(name),
      layer,
      name,
      value
    });
  });
  return {
    catalog,
    collections: options.collections,
    layers: options.tokenLayers,
    pluginDataKey: options.pluginDataKey,
    prefix
  };
}
function parseHexColor(value) {
  const normalized = value.trim();
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return void 0;
  const hex = match[1];
  const expanded = hex.length === 3 ? hex.split("").map((part) => `${part}${part}`).join("") : hex;
  const intValue = Number.parseInt(expanded, 16);
  return {
    r: (intValue >> 16 & 255) / 255,
    g: (intValue >> 8 & 255) / 255,
    b: (intValue & 255) / 255,
    a: 1
  };
}
function parseRawValue(value) {
  const trimmed = value.trim();
  const color = parseHexColor(trimmed);
  if (color) {
    return {
      type: "COLOR",
      value: color
    };
  }
  const px = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (px) {
    return {
      type: "FLOAT",
      value: Number(px[1])
    };
  }
  const number = trimmed.match(/^(-?\d+(?:\.\d+)?)$/);
  if (number) {
    return {
      type: "FLOAT",
      value: Number(number[1])
    };
  }
  if (trimmed === "true" || trimmed === "false") {
    return {
      type: "BOOLEAN",
      value: trimmed === "true"
    };
  }
  return {
    type: "STRING",
    value: trimmed.replace(/^["']|["']$/g, "")
  };
}
function getFallbackType(token) {
  if (token.family === "color") return "COLOR";
  if (token.family === "size" || token.family === "spacing" || token.family === "shape" || token.family === "opacity" || token.name.includes("-weight-") || token.name.includes("-typescale-")) {
    return "FLOAT";
  }
  return "STRING";
}
function getTokenType(token, tokenByName, tokenSystem, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(token.name)) return getFallbackType(token);
  seen.add(token.name);
  const alias = getAliasTokenName(token, tokenSystem);
  const aliasToken = alias ? tokenByName.get(alias) : void 0;
  if (aliasToken) return getTokenType(aliasToken, tokenByName, tokenSystem, seen);
  return parseRawValue(token.value).type;
}
function getTokenScopes(token, type) {
  if (type === "COLOR") {
    return ["FRAME_FILL", "SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR"];
  }
  if (type === "STRING") {
    if (token.name.includes("-typeface-")) return ["FONT_FAMILY"];
    return ["TEXT_CONTENT"];
  }
  if (type !== "FLOAT") return [];
  if (token.name.includes("-opacity-")) return ["OPACITY"];
  if (token.name.includes("-radius-") || token.name.includes("-shape-")) {
    return ["CORNER_RADIUS"];
  }
  if (token.name.includes("-spacing-")) {
    return ["GAP", "WIDTH_HEIGHT"];
  }
  if (token.name.includes("-weight-")) return ["FONT_WEIGHT"];
  if (token.name.includes("-line-height-")) return ["LINE_HEIGHT"];
  if (token.name.includes("-typescale-") && token.name.includes("-size")) {
    return ["FONT_SIZE"];
  }
  if (token.name.includes("-size-")) return ["WIDTH_HEIGHT"];
  return ["WIDTH_HEIGHT"];
}
function extractCssVariableNames(value, tokenSystem) {
  const layerPattern = tokenLayers.map((layer) => escapeRegExp(tokenSystem.layers[layer])).join("|");
  const variablePattern = new RegExp(
    `var\\(\\s*(--${escapeRegExp(tokenSystem.prefix)}-(?:${layerPattern})-[a-z0-9-]+)`,
    "gi"
  );
  return Array.from(value.matchAll(variablePattern), (match) => match[1]);
}
function getAliasTokenName(token, tokenSystem) {
  return extractCssVariableNames(token.value, tokenSystem)[0];
}
function toFigmaVariableName(cssName) {
  return cssName.replace(/^--/, "").replaceAll("-", "/");
}
function getExportTokenValue(token, parsed) {
  if (token.family !== "opacity" || parsed?.type !== "FLOAT" || typeof parsed.value !== "number") {
    return parsed?.value;
  }
  return parsed.value >= 0 && parsed.value <= 1 ? parsed.value * 100 : parsed.value;
}
function toExportToken(token, tokenByName, tokenSystem) {
  const alias = getAliasTokenName(token, tokenSystem);
  const type = getTokenType(token, tokenByName, tokenSystem);
  const parsed = alias ? void 0 : parseRawValue(token.value);
  return {
    ...alias ? { alias } : { value: getExportTokenValue(token, parsed) },
    collection: token.layer,
    cssName: token.name,
    figmaName: toFigmaVariableName(token.name),
    rawValue: token.value,
    scopes: getTokenScopes(token, type),
    type
  };
}
function collectTokensForExport(cssNames, tokenSystem) {
  const visited = /* @__PURE__ */ new Set();
  const result = [];
  const tokenByName = new Map(
    tokenSystem.catalog.map((token) => [token.name, token])
  );
  function visit(cssName) {
    if (visited.has(cssName)) return;
    visited.add(cssName);
    const token = tokenByName.get(cssName);
    if (!token) return;
    const alias = getAliasTokenName(token, tokenSystem);
    if (alias) visit(alias);
    result.push(toExportToken(token, tokenByName, tokenSystem));
  }
  Array.from(cssNames).sort().forEach(visit);
  return result.sort((a, b) => {
    const byLayer = tokenLayerOrder[a.collection] - tokenLayerOrder[b.collection];
    if (byLayer !== 0) return byLayer;
    return a.figmaName.localeCompare(b.figmaName);
  });
}

// src/domExport.ts
var bindingProperties = {
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
  width: ["inline-size", "width"]
};
var transparentValues = /* @__PURE__ */ new Set([
  "rgba(0, 0, 0, 0)",
  "rgba(0,0,0,0)",
  "transparent"
]);
var inheritedBindings = /* @__PURE__ */ new Set([
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textColor"
]);
var borderSides = ["top", "right", "bottom", "left"];
function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
}
function cssLengthToNumber(value) {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : void 0;
}
function cssPercentToNumber(value, basis) {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) / 100 * basis : void 0;
}
function cssPositionToNumber(value, basis) {
  return cssLengthToNumber(value) ?? cssPercentToNumber(value, basis);
}
function cssMatrixTranslationToNumber(transform) {
  const matrix3d = transform.trim().match(/^matrix3d\((.+)\)$/);
  if (matrix3d) {
    const values2 = matrix3d[1].split(",").map((value) => Number(value.trim()));
    if (values2.length === 16 && values2.every(Number.isFinite)) {
      return { x: values2[12], y: values2[13] };
    }
  }
  const matrix = transform.trim().match(/^matrix\((.+)\)$/);
  if (!matrix) return void 0;
  const values = matrix[1].split(",").map((value) => Number(value.trim()));
  if (values.length !== 6 || !values.every(Number.isFinite)) return void 0;
  return { x: values[4], y: values[5] };
}
function cssLineHeightToNumber(value) {
  if (value === "normal") return "normal";
  return cssLengthToNumber(value);
}
function cssColorValue(value) {
  const normalized = value.trim();
  if (!normalized || transparentValues.has(normalized)) return void 0;
  return normalized;
}
function clampUnit(value) {
  return Math.min(1, Math.max(0, value));
}
function splitGradientArguments(value) {
  const parts = [];
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
function parseLinearGradientAngle(value) {
  if (!value) return void 0;
  const normalized = value.trim().toLowerCase();
  const degree = normalized.match(/^(-?\d*\.?\d+)deg$/);
  if (degree) return Number(degree[1]);
  if (normalized === "to right") return 90;
  if (normalized === "to bottom") return 180;
  if (normalized === "to left") return 270;
  if (normalized === "to top") return 0;
  return void 0;
}
function parseGradientStop(value, index, total) {
  const colorMatch = value.trim().match(/^(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i);
  if (!colorMatch) return void 0;
  const color = cssColorValue(colorMatch[1]);
  if (!color) return void 0;
  const positionMatch = value.slice(colorMatch[1].length).match(/(-?\d*\.?\d+)%/);
  const position = positionMatch ? clampUnit(Number(positionMatch[1]) / 100) : total > 1 ? index / (total - 1) : 0;
  return { color, position };
}
function parseLinearGradient(backgroundImage) {
  const match = backgroundImage.trim().match(/^linear-gradient\((.*)\)$/i);
  if (!match) return void 0;
  const parts = splitGradientArguments(match[1]);
  if (parts.length < 2) return void 0;
  const angle = parseLinearGradientAngle(parts[0]);
  const stopParts = angle === void 0 ? parts : parts.slice(1);
  const stops = stopParts.map((part, index) => parseGradientStop(part, index, stopParts.length)).filter((stop) => Boolean(stop));
  return stops.length >= 2 ? { angle: angle ?? 180, stops } : void 0;
}
function isGradientConfigSegment(segment) {
  const lowered = segment.trim().toLowerCase();
  if (!lowered) return false;
  if (/#|rgba?\(|hsla?\(|var\(/.test(lowered)) return false;
  return /circle|ellipse|closest-|farthest-|(^|\s)at\s|(^|\s)from\s|center|top|bottom|left|right|%|px|deg|turn|rad/.test(
    lowered
  );
}
function parseRadialOrConicGradient(backgroundImage) {
  const trimmed = backgroundImage.trim();
  const radial = trimmed.match(/^radial-gradient\((.*)\)$/i);
  if (radial) {
    const parts = splitGradientArguments(radial[1]);
    if (parts.length < 1) return void 0;
    const stopParts = isGradientConfigSegment(parts[0]) ? parts.slice(1) : parts;
    const stops = stopParts.map((part, index) => parseGradientStop(part, index, stopParts.length)).filter((stop) => Boolean(stop));
    return stops.length >= 2 ? { angle: 0, stops, type: "radial" } : void 0;
  }
  const conic = trimmed.match(/^conic-gradient\((.*)\)$/i);
  if (conic) {
    const parts = splitGradientArguments(conic[1]);
    if (parts.length < 1) return void 0;
    let angle = 0;
    let stopParts = parts;
    if (isGradientConfigSegment(parts[0])) {
      const fromMatch = parts[0].toLowerCase().match(/from\s+(-?[\d.]+)deg/);
      if (fromMatch) angle = Number(fromMatch[1]);
      stopParts = parts.slice(1);
    }
    const stops = stopParts.map((part, index) => parseGradientStop(part, index, stopParts.length)).filter((stop) => Boolean(stop));
    return stops.length >= 2 ? { angle, stops, type: "angular" } : void 0;
  }
  return void 0;
}
function parseBoxShadowColorAndLengths(value) {
  let working = value;
  let color;
  const functionMatch = working.match(/(?:rgba?|hsla?)\([^)]*\)/i);
  if (functionMatch) {
    color = functionMatch[0];
    working = `${working.slice(0, functionMatch.index)} ${working.slice(
      (functionMatch.index ?? 0) + functionMatch[0].length
    )}`;
  } else {
    const hexMatch = working.match(/#[0-9a-fA-F]{3,8}\b/);
    if (hexMatch) {
      color = hexMatch[0];
      working = `${working.slice(0, hexMatch.index)} ${working.slice(
        (hexMatch.index ?? 0) + hexMatch[0].length
      )}`;
    }
  }
  const lengths = working.trim().split(/\s+/).map((token) => cssLengthToNumber(token)).filter((length) => length !== void 0);
  return { color, lengths };
}
function parseSingleBoxShadow(value) {
  const trimmed = value.trim();
  if (!trimmed) return void 0;
  const inset = /(?:^|\s)inset(?:\s|$)/.test(trimmed);
  const withoutInset = trimmed.replace(/(?:^|\s)inset(?:\s|$)/g, " ");
  const { color, lengths } = parseBoxShadowColorAndLengths(withoutInset);
  if (lengths.length < 2) return void 0;
  const resolvedColor = cssColorValue(color ?? "");
  if (!resolvedColor) return void 0;
  const [offsetX, offsetY, blur = 0, spread = 0] = lengths;
  return {
    blur: Math.max(0, blur),
    color: resolvedColor,
    offsetX,
    offsetY,
    spread,
    type: inset ? "inner" : "drop"
  };
}
function parseBoxShadows(value) {
  const normalized = value.trim();
  if (!normalized || normalized === "none") return [];
  return splitGradientArguments(normalized).map((part) => parseSingleBoxShadow(part)).filter((shadow) => Boolean(shadow));
}
function parseBlurRadius(value) {
  if (!value || value === "none") return void 0;
  const match = value.match(/blur\(\s*([\d.]+)px\s*\)/i);
  if (!match) return void 0;
  const radius = Number(match[1]);
  return Number.isFinite(radius) && radius > 0 ? radius : void 0;
}
function getTextDecoration(computed) {
  const line = `${computed.textDecorationLine || computed.textDecoration || ""}`;
  if (line.includes("underline")) return "UNDERLINE";
  if (line.includes("line-through")) return "STRIKETHROUGH";
  return void 0;
}
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
var maxRasterImageBytes = 2e6;
async function fetchRasterImageBase64(element) {
  const src = element.currentSrc || element.src;
  if (!src) return void 0;
  if (src.startsWith("data:image/")) {
    if (src.startsWith("data:image/svg+xml")) return void 0;
    const [meta = "", data = ""] = src.split(",", 2);
    if (!data) return void 0;
    return meta.includes(";base64") ? data : btoa(decodeURIComponent(data));
  }
  try {
    const response = await fetch(src);
    if (!response.ok) return void 0;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > maxRasterImageBytes) {
      return void 0;
    }
    return arrayBufferToBase64(buffer);
  } catch {
    return void 0;
  }
}
function isColorTokenName(token) {
  return token.includes("-color-") || token.endsWith("-color");
}
function findLinearGradientTokens(declarations, tokenSystem) {
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (!["background", "background-image"].includes(declaration.property)) {
      continue;
    }
    if (!declaration.value.includes("linear-gradient")) continue;
    const tokens = extractCssVariableNames(declaration.value, tokenSystem).filter(
      isColorTokenName
    );
    if (tokens.length >= 2) return tokens;
  }
  return [];
}
function addLinearGradientStopTokens(gradient, declarations, tokenSystem) {
  if (!gradient) return void 0;
  const tokens = findLinearGradientTokens(declarations, tokenSystem);
  if (tokens.length === 0) return gradient;
  return {
    ...gradient,
    stops: gradient.stops.map((stop, index) => ({
      ...stop,
      ...tokens[index] ? { token: tokens[index] } : {}
    }))
  };
}
function cssBorderWidth(computed, side) {
  return cssLengthToNumber(computed.getPropertyValue(`border-${side}-width`)) ?? 0;
}
function cssBorderStyle(computed, side) {
  return computed.getPropertyValue(`border-${side}-style`).trim();
}
function cssBorderColor(computed, side) {
  return computed.getPropertyValue(`border-${side}-color`).trim();
}
function isVisibleBorderSide(computed, side) {
  const width = cssBorderWidth(computed, side);
  const style = cssBorderStyle(computed, side);
  return width > 0 && style !== "none" && style !== "hidden";
}
function getUniformVisibleBorder(computed) {
  const visibleSides = borderSides.filter((side) => isVisibleBorderSide(computed, side));
  if (visibleSides.length !== borderSides.length) return void 0;
  const width = cssBorderWidth(computed, "top");
  const style = cssBorderStyle(computed, "top");
  const color = cssColorValue(cssBorderColor(computed, "top"));
  if (!color) return void 0;
  const isUniform = borderSides.every(
    (side) => cssBorderWidth(computed, side) === width && cssBorderStyle(computed, side) === style && cssBorderColor(computed, side) === cssBorderColor(computed, "top")
  );
  return isUniform ? { color, width } : void 0;
}
function getElementName(element, options) {
  const component = element.getAttribute("data-component");
  const variant = element.getAttribute("data-variant");
  const icon = element.getAttribute("data-icon");
  const classNames = Array.from(element.classList);
  const preferredClassName = options.componentClassPrefixes.length ? classNames.find(
    (name) => options.componentClassPrefixes.some((prefix) => name.startsWith(prefix))
  ) : void 0;
  const className = preferredClassName ?? classNames[0];
  const base = component || icon || className || element.tagName.toLowerCase();
  return variant ? `${base}/${variant}` : base;
}
function toComponentKey(value) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "component";
}
function toComponentLabel(value) {
  return value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").replace(/\b[a-z]/g, (match) => match.toUpperCase());
}
function getComponentReference(element, fallbackName) {
  const sourceName = element.getAttribute("data-component");
  if (!sourceName && !fallbackName) return void 0;
  const variant = element.getAttribute("data-variant") || void 0;
  const source = sourceName || fallbackName || "component";
  const name = fallbackName || toComponentLabel(source);
  const baseKey = toComponentKey(source);
  const key = variant ? `${baseKey}--${toComponentKey(variant)}` : baseKey;
  return {
    key,
    name,
    sourceName: source,
    ...variant ? { variant, variantProperties: { Variant: variant } } : {}
  };
}
function getArtifactKind(storyTitle) {
  return storyTitle.startsWith("Pages/") ? "page" : "component";
}
function hasComponentReference(node) {
  return Boolean(node.component) || node.children.some(hasComponentReference);
}
function isAbsoluteFidelityRoot(element, options) {
  const component = element.getAttribute("data-component");
  return Boolean(component && options.absoluteFidelityComponents.has(component));
}
function isFlexDisplay(display) {
  return display.includes("flex");
}
function isOutOfFlowPositioned(computed) {
  return computed.position === "absolute" || computed.position === "fixed";
}
function isFlexItem(element, computed) {
  if (isOutOfFlowPositioned(computed)) return false;
  const parentElement = element.parentElement;
  if (!parentElement) return false;
  return isFlexDisplay(window.getComputedStyle(parentElement).display);
}
function getLayoutStrategy(element, computed, forceAbsoluteLayout) {
  if (forceAbsoluteLayout) return "absolute";
  return isFlexDisplay(computed.display) || isFlexItem(element, computed) ? "autoLayout" : "absolute";
}
function getExportDisplay(computed, layoutStrategy) {
  if (layoutStrategy === "absolute" && isFlexDisplay(computed.display)) {
    return "block";
  }
  return computed.display;
}
function escapeSvgAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function normalizeSvgStrokeDashValue(value) {
  const normalized = value.trim();
  if (!normalized || normalized === "none") return void 0;
  return normalized.replace(/(-?\d+(?:\.\d+)?)px\b/g, "$1");
}
function serializeInlineSvg(element, width, height) {
  const clone = element.cloneNode(true);
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
      originalStyle.strokeDasharray
    );
    const strokeDashoffset = normalizeSvgStrokeDashValue(
      originalStyle.strokeDashoffset
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
function splitTopLevelComma(value) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
    }
  }
  return [value.trim(), void 0];
}
function resolveCssVarInSvgValue(value, fallbackValue = "#000000") {
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
    const resolved = document.documentElement.style.getPropertyValue(propertyName).trim() || window.getComputedStyle(document.documentElement).getPropertyValue(propertyName).trim() || (document.body ? window.getComputedStyle(document.body).getPropertyValue(propertyName).trim() : "") || fallback || fallbackValue;
    result += resolved.trim();
    cursor = end + 1;
  }
  return result;
}
function sanitizeSvgTextForFigma(svgText) {
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
function parsePolygonPoint(value, size) {
  const normalized = value.trim();
  if (normalized.endsWith("%")) {
    return Number(normalized.slice(0, -1)) / 100 * size;
  }
  return Number(normalized.replace("px", ""));
}
function getPolygonPoints(clipPath, width, height) {
  const match = clipPath.trim().match(/^polygon\((.+)\)$/);
  if (!match) return void 0;
  const points = match[1].split(",").map((point) => point.trim().split(/\s+/)).filter((parts) => parts.length >= 2).map(([xValue, yValue]) => {
    const x = toFiniteNumber(parsePolygonPoint(xValue, width));
    const y = toFiniteNumber(parsePolygonPoint(yValue, height));
    return `${x},${y}`;
  });
  return points.length >= 3 ? points.join(" ") : void 0;
}
function createClipPathSvgNode(element, computed, rect, parentRect, rules, tokenSystem, options) {
  if (!computed.clipPath || computed.clipPath === "none") return void 0;
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  const points = getPolygonPoints(computed.clipPath, width, height);
  if (!points) return void 0;
  const fill = cssColorValue(computed.backgroundColor) ?? cssColorValue(computed.color);
  if (!fill) return void 0;
  const transform = computed.transform && computed.transform.startsWith("matrix(-1") ? ` transform="rotate(180 ${width / 2} ${height / 2})"` : "";
  const layoutStrategy = element.getAttribute("data-figma-layout-strategy") === "auto-layout" || isFlexItem(element, computed) ? "autoLayout" : "absolute";
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${escapeSvgAttribute(points)}" fill="${escapeSvgAttribute(fill)}"${transform}/></svg>`;
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
      y: toFiniteNumber(rect.top - parentRect.top)
    }
  };
}
function createInlineSvgNode(element, computed, rect, parentRect, options) {
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  const component = getComponentReference(element);
  return {
    bindings: {},
    children: [],
    ...component ? { component } : {},
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
      y: toFiniteNumber(rect.top - parentRect.top)
    }
  };
}
function getCssRules() {
  const rules = [];
  function collect(ruleList) {
    for (const rule of Array.from(ruleList)) {
      if (rule instanceof CSSStyleRule) {
        rules.push(rule);
        continue;
      }
      if ("cssRules" in rule) {
        try {
          collect(rule.cssRules);
        } catch {
        }
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collect(sheet.cssRules);
    } catch {
    }
  }
  return rules;
}
function selectorMatches(element, selectorText) {
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
function parseCssTextDeclarations(cssText) {
  const declarations = [];
  let current = "";
  let depth = 0;
  const chunks = [];
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
function getMatchedDeclarations(element, rules) {
  const declarations = [];
  for (const rule of rules) {
    if (!selectorMatches(element, rule.selectorText)) continue;
    for (const property of Array.from(rule.style)) {
      declarations.push({
        property,
        value: rule.style.getPropertyValue(property).trim()
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
        value: element.style.getPropertyValue(property).trim()
      });
    }
  }
  return declarations;
}
function findTokenForProperty(declarations, bindingName, tokenSystem) {
  const properties = bindingProperties[bindingName];
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (!properties.includes(declaration.property)) continue;
    const tokens = extractCssVariableNames(declaration.value, tokenSystem);
    if (tokens.length === 0) return void 0;
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
  return void 0;
}
function pickBindings(bindings, names) {
  const picked = {};
  names.forEach((name) => {
    const token = bindings[name];
    if (token) picked[name] = token;
  });
  return picked;
}
function getTextExportWidth({
  computed,
  text,
  width
}) {
  if (!text.trim()) return width;
  const fontSize = cssLengthToNumber(computed.fontSize) ?? 14;
  const safetyWidth = Math.max(12, fontSize);
  return toFiniteNumber(width + safetyWidth);
}
function getTextExportX({
  computed,
  exportWidth,
  width,
  x
}) {
  const extraWidth = Math.max(0, exportWidth - width);
  const textAlign = computed.textAlign.toLowerCase();
  if (textAlign === "right" || textAlign === "end") {
    return toFiniteNumber(x - extraWidth);
  }
  if (textAlign === "center") return toFiniteNumber(x - extraWidth / 2);
  return x;
}
function justifyContentFromTextAlign(textAlign) {
  const normalized = textAlign.trim().toLowerCase();
  if (normalized === "center") return "center";
  if (normalized === "right" || normalized === "end") return "flex-end";
  return "flex-start";
}
function hasFixedFlexBasis(computed) {
  if (!computed.flexBasis || computed.flexBasis === "auto" || computed.flexBasis === "content") {
    return false;
  }
  return cssLengthToNumber(computed.flexBasis) !== void 0;
}
function isClippedSingleLineText(computed) {
  const overflowX = computed.overflowX.toLowerCase();
  const overflow = computed.overflow.toLowerCase();
  const textOverflow = computed.textOverflow.toLowerCase();
  const whiteSpace = computed.whiteSpace.toLowerCase();
  const clipsInline = overflowX === "hidden" || overflowX === "clip" || overflow === "hidden" || overflow === "clip";
  return clipsInline && textOverflow === "ellipsis" && whiteSpace === "nowrap";
}
function shouldAutoResizeText(element, computed) {
  if (isClippedSingleLineText(computed)) return false;
  if (element.getAttribute("data-figma-text-auto-width") === "true") return true;
  const textAlign = computed.textAlign.toLowerCase();
  if (textAlign === "center" || textAlign === "right" || textAlign === "end") {
    const isSingleLine = computed.whiteSpace.toLowerCase().includes("nowrap");
    if (!isFlexItem(element, computed) || !isSingleLine) return false;
  }
  if (!isFlexItem(element, computed)) return false;
  if (hasFixedFlexBasis(computed)) return false;
  return Number.parseFloat(computed.flexGrow || "0") === 0;
}
function getTextAutoResize(element, computed) {
  return shouldAutoResizeText(element, computed) ? "WIDTH_AND_HEIGHT" : void 0;
}
function getLayoutAlign(element) {
  return element.getAttribute("data-figma-layout-align") === "stretch" ? "STRETCH" : void 0;
}
var verticalSizeProperties = [
  "height",
  "block-size",
  "min-height",
  "min-block-size"
];
var horizontalSizeProperties = [
  "width",
  "inline-size",
  "min-width",
  "min-inline-size"
];
function hasExplicitSizeDeclaration(declarations, properties) {
  return declarations.some(
    (declaration) => properties.includes(declaration.property) && declaration.value.trim().toLowerCase() !== "auto"
  );
}
function isStretchAlignment(value) {
  return value === "stretch" || value === "normal";
}
function getResolvedFlexAlignment(element, computed) {
  const alignSelf = computed.alignSelf;
  if (alignSelf && alignSelf !== "auto") return alignSelf;
  const parentElement = element.parentElement;
  if (!parentElement) return "auto";
  return window.getComputedStyle(parentElement).alignItems || "auto";
}
function getFlexParentCrossAxisInfo(element, computed) {
  if (!isFlexItem(element, computed)) return void 0;
  const parentElement = element.parentElement;
  if (!parentElement) return void 0;
  const parentComputed = window.getComputedStyle(parentElement);
  if (!isFlexDisplay(parentComputed.display)) return void 0;
  return {
    crossAxis: parentComputed.flexDirection.startsWith("column") ? "horizontal" : "vertical",
    stretched: isStretchAlignment(getResolvedFlexAlignment(element, computed))
  };
}
function getInferredFrameLayoutAlign(element, computed, declarations) {
  const crossAxisInfo = getFlexParentCrossAxisInfo(element, computed);
  if (!crossAxisInfo || !crossAxisInfo.stretched) return void 0;
  const crossSizeProperties = crossAxisInfo.crossAxis === "horizontal" ? horizontalSizeProperties : verticalSizeProperties;
  if (hasExplicitSizeDeclaration(declarations, crossSizeProperties)) {
    return void 0;
  }
  return "STRETCH";
}
function getLayoutSizingVertical(element, computed, bindings, declarations) {
  if (bindings.height) return void 0;
  if (hasExplicitSizeDeclaration(declarations, verticalSizeProperties)) {
    return void 0;
  }
  if (element.getAttribute("data-figma-layout-sizing-vertical") === "hug") {
    return "HUG";
  }
  if (!isFlexDisplay(computed.display)) return void 0;
  const crossAxisInfo = getFlexParentCrossAxisInfo(element, computed);
  if (crossAxisInfo?.crossAxis === "vertical" && crossAxisInfo.stretched) {
    return void 0;
  }
  return "HUG";
}
function getLayoutGrow(element, computed) {
  if (element.getAttribute("data-figma-layout-grow") === "1") return 1;
  const flexGrow = Number.parseFloat(computed.flexGrow || "0");
  return Number.isFinite(flexGrow) && flexGrow > 0 ? flexGrow : void 0;
}
function getLayoutSizingHorizontal(element, computed, bindings, declarations) {
  if (bindings.width) return void 0;
  if (hasExplicitSizeDeclaration(declarations, horizontalSizeProperties)) {
    return void 0;
  }
  if (element.getAttribute("data-figma-layout-sizing-horizontal") === "hug") {
    return "HUG";
  }
  if (isFlexItem(element, computed) || computed.display.includes("inline-flex")) {
    if (hasFixedFlexBasis(computed)) return void 0;
    if (Number.parseFloat(computed.flexGrow || "0") > 0) return void 0;
    return "HUG";
  }
  if (isFlexDisplay(computed.display) && isOutOfFlowPositioned(computed)) {
    return "HUG";
  }
  const parentElement = element.parentElement;
  if (parentElement && isFlexDisplay(computed.display) && !isOutOfFlowPositioned(computed)) {
    const parentComputed = window.getComputedStyle(parentElement);
    if (parentComputed.display.includes("grid")) {
      const justifySelf = computed.justifySelf;
      const resolved = justifySelf && justifySelf !== "auto" ? justifySelf : parentComputed.justifyItems;
      if (["start", "center", "end", "flex-start", "flex-end"].includes(resolved)) {
        return "HUG";
      }
    }
  }
  return void 0;
}
function getTextAlignVertical(element) {
  return element.getAttribute("data-figma-text-align-vertical") === "center" ? "CENTER" : void 0;
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
  y
}) {
  const color = cssColorValue(computed.color);
  const fontWeight = Number.parseInt(computed.fontWeight, 10);
  const fontSize = cssLengthToNumber(computed.fontSize) ?? 14;
  const rawLineHeight = cssLineHeightToNumber(computed.lineHeight);
  const lineHeight = rawLineHeight === "normal" ? Math.round(height / Math.max(1, fontSize * 1.2)) <= 1 ? height : void 0 : rawLineHeight;
  const letterSpacing = cssLengthToNumber(computed.letterSpacing);
  const isItalic = computed.fontStyle === "italic" || computed.fontStyle.startsWith("oblique");
  const textDecoration = getTextDecoration(computed);
  const isSingleLineTruncatedText = isClippedSingleLineText(computed);
  const exportWidth = isSingleLineTruncatedText || Boolean(textAutoResize) || layoutGrow === 1 || hasFixedFlexBasis(computed) ? width : getTextExportWidth({ computed, text, width });
  const exportX = getTextExportX({ computed, exportWidth, width, x });
  return {
    bindings: pickBindings(bindings, [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "textColor"
    ]),
    children: [],
    kind: "text",
    layoutStrategy: layoutStrategy ?? (layoutAlign ? "autoLayout" : "absolute"),
    name,
    text,
    styles: {
      ...color ? { color } : {},
      display: computed.display,
      fontFamily: computed.fontFamily,
      fontSize,
      ...isItalic ? { fontStyle: "italic" } : {},
      ...Number.isFinite(fontWeight) ? { fontWeight } : {},
      height,
      ...layoutAlign ? { layoutAlign } : {},
      ...layoutGrow ? { layoutGrow } : {},
      ...letterSpacing !== void 0 ? { letterSpacing } : {},
      ...typeof lineHeight === "number" ? { lineHeight } : {},
      opacity: Number(computed.opacity),
      ...outOfFlow ? { outOfFlow: true } : {},
      overflow: computed.overflow,
      ...isSingleLineTruncatedText ? { maxLines: 1, textTruncation: "ENDING" } : {},
      textAlign: computed.textAlign,
      ...textAlignVertical ? { textAlignVertical } : {},
      ...textAutoResize ? { textAutoResize } : {},
      ...textDecoration ? { textDecoration } : {},
      width: exportWidth,
      x: exportX,
      y
    }
  };
}
function hasBoxedTextStyle(computed, border) {
  return Boolean(
    cssColorValue(computed.backgroundColor) || border || cssLengthToNumber(computed.borderTopLeftRadius) || cssLengthToNumber(computed.paddingBottom) || cssLengthToNumber(computed.paddingLeft) || cssLengthToNumber(computed.paddingRight) || cssLengthToNumber(computed.paddingTop)
  );
}
function getPseudoMatchedDeclarations(element, rules, pseudo) {
  const declarations = [];
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
        value: rule.style.getPropertyValue(property).trim()
      });
    }
    declarations.push(...parseCssTextDeclarations(rule.style.cssText));
  }
  return declarations;
}
function collectPseudoBindings(element, rules, pseudo, tokenSystem) {
  const declarations = getPseudoMatchedDeclarations(element, rules, pseudo);
  const bindings = {};
  for (const bindingName of ["backgroundColor", "height", "width"]) {
    const token = findTokenForProperty(declarations, bindingName, tokenSystem);
    if (token) bindings[bindingName] = token;
  }
  return bindings;
}
function declarationsIncludeProperty(declarations, properties) {
  return declarations.some(
    (declaration) => properties.includes(declaration.property)
  );
}
function getPseudoConstraints(declarations) {
  const hasTop = declarationsIncludeProperty(declarations, [
    "top",
    "inset-block-start",
    "inset-block",
    "inset"
  ]);
  const hasBottom = declarationsIncludeProperty(declarations, [
    "bottom",
    "inset-block-end",
    "inset-block",
    "inset"
  ]);
  const hasLeft = declarationsIncludeProperty(declarations, [
    "left",
    "inset-inline-start",
    "inset-inline",
    "inset"
  ]);
  const hasRight = declarationsIncludeProperty(declarations, [
    "right",
    "inset-inline-end",
    "inset-inline",
    "inset"
  ]);
  return {
    horizontal: hasLeft && hasRight ? "STRETCH" : hasRight && !hasLeft ? "MAX" : "MIN",
    vertical: hasTop && hasBottom ? "STRETCH" : hasBottom && !hasTop ? "MAX" : "MIN"
  };
}
function createPseudoNode(element, rules, pseudo, parentWidth, parentHeight, tokenSystem, options) {
  const style = window.getComputedStyle(element, `::${pseudo}`);
  const content = style.content.trim();
  const width = cssLengthToNumber(style.width) ?? 0;
  const height = cssLengthToNumber(style.height) ?? 0;
  const backgroundColor = cssColorValue(style.backgroundColor);
  if (content === "none" || content === "normal" || width <= 0 || height <= 0 || !backgroundColor) {
    return void 0;
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
        getPseudoMatchedDeclarations(element, rules, pseudo)
      ),
      display: style.display,
      height,
      opacity: Number(style.opacity),
      outOfFlow: true,
      overflow: style.overflow,
      width,
      x: toFiniteNumber(left + translateX),
      y: toFiniteNumber(top + translateY)
    }
  };
}
function getBorderLineProperties(side) {
  const logicalProperties = {
    bottom: ["border-block-end", "border-block"],
    left: ["border-inline-start", "border-inline"],
    right: ["border-inline-end", "border-inline"],
    top: ["border-block-start", "border-block"]
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
    "border-width"
  ];
}
function findBorderLineToken(declarations, side, target, tokenSystem) {
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
  return void 0;
}
function getVisibleBorderSides(computed) {
  if (getUniformVisibleBorder(computed)) return void 0;
  const sides = {};
  for (const side of borderSides) {
    if (!isVisibleBorderSide(computed, side)) continue;
    const width = cssBorderWidth(computed, side);
    const color = cssColorValue(cssBorderColor(computed, side));
    if (!color || width <= 0) continue;
    sides[side] = { color, width };
  }
  return Object.keys(sides).length > 0 ? sides : void 0;
}
function collectBorderSideBindings(element, rules, sides, tokenSystem) {
  const declarations = getMatchedDeclarations(element, rules);
  const bindings = {};
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
function collectBindings(element, rules, hasUniformVisibleBorder, tokenSystem) {
  const declarations = getMatchedDeclarations(element, rules);
  const bindings = {};
  Object.keys(bindingProperties).forEach((bindingName) => {
    if (!hasUniformVisibleBorder && (bindingName === "borderColor" || bindingName === "borderWidth")) {
      return;
    }
    let token = findTokenForProperty(declarations, bindingName, tokenSystem);
    let ancestor = element.parentElement;
    while (!token && inheritedBindings.has(bindingName) && ancestor) {
      token = findTokenForProperty(
        getMatchedDeclarations(ancestor, rules),
        bindingName,
        tokenSystem
      );
      ancestor = ancestor.parentElement;
    }
    if (token) bindings[bindingName] = token;
  });
  return bindings;
}
function getDirectText(element) {
  return Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "").join("").replace(/\s+/g, " ").trim();
}
function hasElementChildren(element) {
  return Array.from(element.children).some((child) => {
    const style = window.getComputedStyle(child);
    return style.display !== "none";
  });
}
function hasOutOfFlowPositionedChildren(elements) {
  return elements.some((child) => {
    const position = window.getComputedStyle(child).position;
    return position === "absolute" || position === "fixed";
  });
}
function getCommonAncestor(elements, boundary) {
  if (elements.length === 0) return boundary;
  let ancestor = elements[0];
  while (ancestor && ancestor !== boundary) {
    if (elements.every((element) => ancestor?.contains(element))) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return boundary;
}
function findExportRoot(scope) {
  const components = Array.from(scope.querySelectorAll("[data-component]"));
  if (components.length === 1) return components[0];
  if (components.length > 1) {
    const ancestor = getCommonAncestor(components, scope);
    if (ancestor !== scope) return ancestor;
  }
  return scope.firstElementChild ?? void 0;
}
async function fetchSvgText(element, options) {
  const graphicName = element.getAttribute("data-graphic");
  if (element.getAttribute("data-component") === "graphic" && graphicName) {
    const svgText = options.embeddedSvgByDataGraphic[graphicName];
    return svgText ? sanitizeSvgTextForFigma(svgText) : void 0;
  }
  const src = element.currentSrc || element.src;
  if (!src) return void 0;
  if (src.startsWith("data:image/svg+xml")) {
    const [, encodedSvg = ""] = src.split(",", 2);
    return sanitizeSvgTextForFigma(decodeURIComponent(encodedSvg));
  }
  try {
    const response = await fetch(src);
    if (!response.ok) return void 0;
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("svg") || text.trimStart().startsWith("<svg")) {
      return sanitizeSvgTextForFigma(text);
    }
    return void 0;
  } catch {
    return void 0;
  }
}
async function createExportNode(element, rootRect, parentRect, rules, tokenSystem, options, forceAbsoluteLayout = false) {
  const computed = window.getComputedStyle(element);
  if (computed.display === "none" || computed.visibility === "hidden" || Number(computed.opacity) === 0) {
    return void 0;
  }
  const rect = element.getBoundingClientRect();
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  if (width <= 0 || height <= 0) return void 0;
  const forceAutoLayout = element.getAttribute("data-figma-layout-strategy") === "auto-layout";
  const nextForceAbsoluteLayout = !forceAutoLayout && (forceAbsoluteLayout || isAbsoluteFidelityRoot(element, options));
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
    options
  );
  if (clipPathNode) return clipPathNode;
  const childElements = Array.from(element.children);
  const hasPositionedChildren = hasOutOfFlowPositionedChildren(childElements);
  const childNodes = (await Promise.all(
    childElements.map(
      (child) => createExportNode(
        child,
        rootRect,
        rect,
        rules,
        tokenSystem,
        options,
        nextForceAbsoluteLayout && !child.hasAttribute("data-component")
      )
    )
  )).filter((child) => Boolean(child));
  const directText = getDirectText(element);
  const backgroundColor = cssColorValue(computed.backgroundColor);
  const declarations = getMatchedDeclarations(element, rules);
  const backgroundLinearGradient = addLinearGradientStopTokens(
    parseLinearGradient(computed.backgroundImage),
    declarations,
    tokenSystem
  );
  const backgroundGradient = backgroundLinearGradient ? void 0 : parseRadialOrConicGradient(computed.backgroundImage);
  const boxShadow = parseBoxShadows(computed.boxShadow);
  const layerBlur = parseBlurRadius(computed.filter);
  const backgroundBlur = parseBlurRadius(
    computed.backdropFilter || computed.webkitBackdropFilter
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
  const gap = isColumnFlex ? rowGap : columnGap;
  const counterAxisGap = isColumnFlex ? columnGap : rowGap;
  const flexWraps = !isColumnFlex && (computed.flexWrap === "wrap" || computed.flexWrap === "wrap-reverse");
  const layoutAlign = getLayoutAlign(element);
  const layoutGrow = getLayoutGrow(element, computed);
  const textLayoutStrategy = element.getAttribute("data-figma-layout-strategy") === "auto-layout" ? "autoLayout" : getLayoutStrategy(element, computed, nextForceAbsoluteLayout);
  const textAlignVertical = getTextAlignVertical(element);
  const bindings = collectBindings(element, rules, Boolean(border), tokenSystem);
  if (borderSideMap) {
    Object.assign(
      bindings,
      collectBorderSideBindings(element, rules, borderSideMap, tokenSystem)
    );
  }
  const layoutSizingHorizontal = getLayoutSizingHorizontal(
    element,
    computed,
    bindings,
    declarations
  );
  const layoutSizingVertical = getLayoutSizingVertical(
    element,
    computed,
    bindings,
    declarations
  );
  const frameLayoutAlign = layoutAlign ?? getInferredFrameLayoutAlign(element, computed, declarations);
  if (backgroundLinearGradient || backgroundGradient) {
    delete bindings.backgroundColor;
  }
  const layoutStrategy = getLayoutStrategy(element, computed, nextForceAbsoluteLayout);
  const pseudoNodes = ["before", "after"].map(
    (pseudo) => createPseudoNode(element, rules, pseudo, width, height, tokenSystem, options)
  ).filter((node) => Boolean(node));
  const shouldPreserveComputedAutoLayout = layoutStrategy === "autoLayout" && isFlexDisplay(computed.display) && !hasPositionedChildren;
  const frameLayoutStrategy = element.getAttribute("data-figma-layout-strategy") === "auto-layout" ? layoutStrategy : shouldPreserveComputedAutoLayout ? layoutStrategy : pseudoNodes.length > 0 || hasPositionedChildren ? "absolute" : layoutStrategy;
  const elementOutOfFlow = isOutOfFlowPositioned(computed);
  const wrapStyles = frameLayoutStrategy === "autoLayout" && flexWraps ? {
    layoutWrap: "WRAP",
    ...counterAxisGap !== void 0 && counterAxisGap >= 0 ? { counterAxisSpacing: counterAxisGap } : {}
  } : {};
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
        y: paddingTop
      });
      if (textLayoutStrategy === "autoLayout") {
        return {
          bindings,
          children: [textNode],
          ...component ? { component } : {},
          kind: "frame",
          layoutStrategy: "autoLayout",
          name: getElementName(element, options),
          styles: {
            alignItems: "center",
            ...backgroundColor ? { backgroundColor } : {},
            ...backgroundLinearGradient ? { backgroundLinearGradient } : {},
            ...border ? { borderColor: border.color, borderWidth: border.width } : {},
            ...borderSideMap ? { borderSides: borderSideMap } : {},
            ...boxShadow.length ? { boxShadow } : {},
            display: "flex",
            flexDirection: "row",
            height,
            justifyContent: justifyContentFromTextAlign(computed.textAlign),
            opacity: Number(computed.opacity),
            ...elementOutOfFlow ? { outOfFlow: true } : {},
            overflow: computed.overflow,
            paddingBottom,
            paddingLeft,
            paddingRight,
            paddingTop,
            ...radius !== void 0 && radius > 0 ? { radius } : {},
            ...layoutSizingHorizontal ? { layoutSizingHorizontal } : {},
            ...layoutSizingHorizontal && !bindings.height ? { layoutSizingVertical: "HUG" } : {},
            width,
            x: toFiniteNumber(rect.left - parentRect.left),
            y: toFiniteNumber(rect.top - parentRect.top)
          }
        };
      }
      return {
        bindings,
        children: [textNode],
        ...component ? { component } : {},
        kind: "frame",
        layoutStrategy: "absolute",
        name: getElementName(element, options),
        styles: {
          ...backgroundColor ? { backgroundColor } : {},
          ...backgroundLinearGradient ? { backgroundLinearGradient } : {},
          ...border ? { borderColor: border.color, borderWidth: border.width } : {},
          ...borderSideMap ? { borderSides: borderSideMap } : {},
          ...boxShadow.length ? { boxShadow } : {},
          display: getExportDisplay(computed, "absolute"),
          height,
          opacity: Number(computed.opacity),
          ...elementOutOfFlow ? { outOfFlow: true } : {},
          overflow: computed.overflow,
          paddingBottom,
          paddingLeft,
          paddingRight,
          paddingTop,
          ...radius !== void 0 && radius > 0 ? { radius } : {},
          ...layoutSizingHorizontal ? { layoutSizingHorizontal } : {},
          width,
          x: toFiniteNumber(rect.left - parentRect.left),
          y: toFiniteNumber(rect.top - parentRect.top)
        }
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
      y: toFiniteNumber(rect.top - parentRect.top)
    });
  }
  const kind = element instanceof HTMLImageElement ? "image" : "frame";
  const elementName = getElementName(element, options);
  const frameStyles = {
    ...computed.alignItems ? { alignItems: computed.alignItems } : {},
    ...backgroundColor ? { backgroundColor } : {},
    ...backgroundLinearGradient ? { backgroundLinearGradient } : {},
    ...backgroundGradient ? { backgroundGradient } : {},
    ...backgroundBlur !== void 0 ? { backgroundBlur } : {},
    ...border ? { borderColor: border.color, borderWidth: border.width } : {},
    ...borderSideMap ? { borderSides: borderSideMap } : {},
    ...boxShadow.length ? { boxShadow } : {},
    ...color ? { color } : {},
    display: getExportDisplay(computed, frameLayoutStrategy),
    ...frameLayoutStrategy === "autoLayout" ? { flexDirection: computed.flexDirection } : {},
    fontFamily: computed.fontFamily,
    fontSize: cssLengthToNumber(computed.fontSize) ?? 14,
    ...Number.isFinite(fontWeight) ? { fontWeight } : {},
    ...gap !== void 0 && gap >= 0 ? { gap } : {},
    ...wrapStyles,
    ...layerBlur !== void 0 ? { layerBlur } : {},
    ...kind === "image" ? { objectFit: computed.objectFit } : {},
    height,
    ...computed.justifyContent ? { justifyContent: computed.justifyContent } : {},
    ...frameLayoutAlign ? { layoutAlign: frameLayoutAlign } : {},
    ...layoutGrow ? { layoutGrow } : {},
    ...layoutSizingHorizontal ? { layoutSizingHorizontal } : {},
    ...layoutSizingVertical ? { layoutSizingVertical } : {},
    ...lineHeight ? { lineHeight } : {},
    opacity: Number(computed.opacity),
    ...elementOutOfFlow ? { outOfFlow: true } : {},
    overflow: computed.overflow,
    paddingBottom: cssLengthToNumber(computed.paddingBottom) ?? 0,
    paddingLeft: cssLengthToNumber(computed.paddingLeft) ?? 0,
    paddingRight: cssLengthToNumber(computed.paddingRight) ?? 0,
    paddingTop: cssLengthToNumber(computed.paddingTop) ?? 0,
    ...radius !== void 0 && radius > 0 ? { radius } : {},
    ...textAlignVertical ? { textAlignVertical } : {},
    width,
    x: toFiniteNumber(rect.left - parentRect.left),
    y: toFiniteNumber(rect.top - parentRect.top)
  };
  const imageSvgText = kind === "image" && element instanceof HTMLImageElement ? await fetchSvgText(element, options) : void 0;
  const imageBytes = kind === "image" && element instanceof HTMLImageElement && !imageSvgText ? await fetchRasterImageBase64(element) : void 0;
  return {
    bindings,
    children: kind === "image" ? [] : [...childNodes, ...pseudoNodes],
    ...component ? { component } : {},
    ...imageBytes ? { imageBytes } : {},
    kind,
    layoutStrategy: kind === "image" ? "absolute" : frameLayoutStrategy,
    name: elementName,
    ...imageSvgText ? { svgText: imageSvgText } : {},
    styles: frameStyles
  };
}
async function createFigmaExportPayload({
  componentTitle,
  options,
  scope,
  storyId,
  storyName,
  storyTitle
}) {
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
    options
  );
  if (!rootNode) {
    throw new Error("The story root has no visible exportable bounds.");
  }
  rootNode.styles.x = 0;
  rootNode.styles.y = 0;
  const component = artifactKind === "component" ? rootNode.component ?? (!hasComponentReference(rootNode) ? getComponentReference(root, componentTitle) : void 0) : void 0;
  const tokenNames = /* @__PURE__ */ new Set();
  function collectNodeTokens(node) {
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
    ...component ? { component } : {},
    componentTitle,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    root: rootNode,
    storyId,
    storyName,
    storyTitle,
    tokenSystem: {
      collections: tokenSystem.collections,
      layers: tokenSystem.layers,
      pluginDataKey: tokenSystem.pluginDataKey,
      prefix: tokenSystem.prefix
    },
    tokens: collectTokensForExport(tokenNames, tokenSystem),
    version: 2
  };
}

// src/options.ts
var defaultFigmaExportGlobalName = "figmaExport";
var defaultTokenLayers = {
  comp: "comp",
  ref: "ref",
  sys: "sys"
};
function normalizeTokenPrefix(prefix) {
  if (!prefix) return void 0;
  return prefix.replace(/^--/, "").replace(/-$/, "");
}
function normalizeStoryTitlePrefix(prefix) {
  if (prefix === false) return false;
  if (Array.isArray(prefix)) return prefix;
  if (typeof prefix === "string") return [prefix];
  return false;
}
function resolveFigmaExportAddonOptions(options) {
  return {
    absoluteFidelityComponents: new Set(options?.absoluteFidelityComponents ?? []),
    collections: {
      ...defaultTokenLayers,
      ...options?.collections
    },
    componentClassPrefixes: options?.componentClassPrefixes ?? [],
    embeddedSvgByDataGraphic: options?.embeddedSvgByDataGraphic ?? {},
    globalName: options?.globalName ?? defaultFigmaExportGlobalName,
    pluginDataKey: options?.pluginDataKey ?? "storybookCssToken",
    storyTitlePrefix: normalizeStoryTitlePrefix(options?.storyTitlePrefix),
    tokenLayers: {
      ...defaultTokenLayers,
      ...options?.tokenLayers
    },
    tokenPrefix: normalizeTokenPrefix(options?.tokenPrefix)
  };
}
function isStoryIncludedForFigmaExport(title, options) {
  if (!title) return true;
  if (options.storyTitlePrefix === false) return true;
  return options.storyTitlePrefix.some((prefix) => title.startsWith(prefix));
}

// src/pluginCode.ts
function createFigmaExportJson(payload) {
  return JSON.stringify(payload, null, 2);
}
function createFigmaPluginCode(payload) {
  const serializedPayload = createFigmaExportJson(payload);
  return `// Storybook -> Figma
// Legacy fallback: paste this script into a Figma plugin main context or the plugin console.
// Primary flow: use Storybook "Copy JSON", then paste it into your Storybook Figma importer plugin.
// It upserts ref/sys/comp variables, creates the selected story as Figma layers,
// and binds supported properties to variables without creating duplicates.

const STORYBOOK_FIGMA_EXPORT = ${serializedPayload};

void (async function importStorybookStory(payload) {
  const COLLECTION_NAMES = payload.tokenSystem?.collections || {
    ref: "ref",
    sys: "sys",
    comp: "comp",
  };
  const PLUGIN_DATA_TOKEN_KEY =
    payload.tokenSystem?.pluginDataKey || "storybookCssToken";
  const PLUGIN_DATA_COMPONENT_KEY =
    payload.componentSystem?.pluginDataKey || "storybookComponentKey";

  const BINDABLE_RADIUS_FIELDS = [
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
  ];

  const layerOrder = { ref: 0, sys: 1, comp: 2 };
  const registry = new Map();
  const componentRegistry = new Map();
  let componentDefinitionOffsetY = 0;
  const rawTokenByName = new Map(
    (payload.tokens || []).map((token) => [token.cssName, token]),
  );

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function cloneColor(color) {
    return {
      r: clamp(Number(color.r) || 0, 0, 1),
      g: clamp(Number(color.g) || 0, 0, 1),
      b: clamp(Number(color.b) || 0, 0, 1),
      a: clamp(Number(color.a ?? 1), 0, 1),
    };
  }

  function colorFromCss(cssValue) {
    if (!cssValue) return { r: 0, g: 0, b: 0, a: 1 };
    const hex = String(cssValue).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const expanded = hex[1].length === 3
        ? hex[1].split("").map((part) => part + part).join("")
        : hex[1];
      const intValue = parseInt(expanded, 16);
      return {
        r: ((intValue >> 16) & 255) / 255,
        g: ((intValue >> 8) & 255) / 255,
        b: (intValue & 255) / 255,
        a: 1,
      };
    }

    const rgba = String(cssValue).match(/rgba?\\(([^)]+)\\)/i);
    if (rgba) {
      const parts = rgba[1].split(",").map((part) => Number(part.trim()));
      return {
        r: clamp((parts[0] || 0) / 255, 0, 1),
        g: clamp((parts[1] || 0) / 255, 0, 1),
        b: clamp((parts[2] || 0) / 255, 0, 1),
        a: clamp(parts[3] ?? 1, 0, 1),
      };
    }

    return { r: 0, g: 0, b: 0, a: 1 };
  }

  function solidPaint(cssValue, variable) {
    const color = variable?.resolvedType === "COLOR" && variable.valuesByMode
      ? { r: 0, g: 0, b: 0 }
      : colorFromCss(cssValue);
    const paint = {
      type: "SOLID",
      color: { r: color.r, g: color.g, b: color.b },
      opacity: color.a ?? 1,
    };

    if (variable && figma.variables?.setBoundVariableForPaint) {
      try {
        return figma.variables.setBoundVariableForPaint(paint, "color", variable);
      } catch {
        return paint;
      }
    }

    return paint;
  }

  async function getCollection(layer) {
    const name = COLLECTION_NAMES[layer] || layer;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const existing = collections.find((collection) => collection.name === name);
    if (existing) return existing;

    const created = figma.variables.createVariableCollection(name);
    if (created.modes[0]?.name !== "Default") {
      created.renameMode(created.modes[0].modeId, "Default");
    }
    return created;
  }

  function getVariablePluginData(variable, key) {
    try {
      return typeof variable.getPluginData === "function" ? variable.getPluginData(key) : "";
    } catch {
      return "";
    }
  }

  function setVariablePluginData(variable, key, value) {
    try {
      if (typeof variable.setPluginData === "function") {
        variable.setPluginData(key, value);
      }
    } catch {
      // Older Figma runtimes may not support plugin data on variables.
    }
  }

  function getNodePluginData(node, key) {
    try {
      return typeof node.getPluginData === "function" ? node.getPluginData(key) : "";
    } catch {
      return "";
    }
  }

  function setNodePluginData(node, key, value) {
    try {
      if (typeof node.setPluginData === "function") {
        node.setPluginData(key, value);
      }
    } catch {
      // Plugin data is metadata only; continue if unsupported.
    }
  }

  function getComponentDisplayName(component) {
    if (!component) return "";
    if (component.variant) {
      return component.name + ", Variant=" + component.variant;
    }
    return component.name;
  }

  function findLocalComponent(component) {
    if (!component?.key) return undefined;
    const cached = componentRegistry.get(component.key);
    if (cached) return cached;

    const nodes = figma.root.findAll((node) => node.type === "COMPONENT");
    const displayName = getComponentDisplayName(component);
    const sourceName = component.sourceName || component.key;
    const found = nodes.find((node) => {
      const nodeKey = getNodePluginData(node, PLUGIN_DATA_COMPONENT_KEY);
      if (nodeKey === component.key) {
        return true;
      }
      if (nodeKey) return false;

      const nodeSource = getNodePluginData(node, "storybookComponentSource");
      const parentSource =
        node.parent?.type === "COMPONENT_SET"
          ? getNodePluginData(node.parent, "storybookComponentSource")
          : "";
      const knownSource = nodeSource || parentSource;
      if (knownSource && knownSource !== sourceName) return false;

      if (component.variant) return node.name === displayName;
      return node.name === displayName || node.name === component.name;
    });

    if (found) componentRegistry.set(component.key, found);
    return found;
  }

  function tagComponentNode(node, component) {
    if (!component?.key) return;
    setNodePluginData(node, PLUGIN_DATA_COMPONENT_KEY, component.key);
    setNodePluginData(node, "storybookComponentName", component.name);
    setNodePluginData(node, "storybookComponentSource", component.sourceName || component.key);
  }

  function getOrCreatePage(name) {
    const normalizedName = String(name || "").trim() || "Components";
    const existing = figma.root.children.find(
      (page) => page.name.toLowerCase() === normalizedName.toLowerCase(),
    );
    if (existing) return existing;

    const page = figma.createPage();
    page.name = normalizedName;
    return page;
  }

  function getComponentDefinitionParentPage() {
    if (payload.artifactKind !== "page") return figma.currentPage;
    return getOrCreatePage(payload.componentSystem?.componentsPageName || "Components");
  }

  function getNextComponentDefinitionY(page) {
    if (componentDefinitionOffsetY === 0 && page.children.length > 0) {
      componentDefinitionOffsetY = page.children.reduce((maxBottom, child) => {
        const bottom = (child.y || 0) + (child.height || 0);
        return Math.max(maxBottom, bottom);
      }, 0);
      if (componentDefinitionOffsetY > 0) componentDefinitionOffsetY += 24;
    }

    return componentDefinitionOffsetY;
  }

  function parkComponentDefinition(node) {
    const parentPage = getComponentDefinitionParentPage();
    const nextY = getNextComponentDefinitionY(parentPage);
    if (node.parent !== parentPage) parentPage.appendChild(node);
    const rootWidth = payload.root?.styles?.width || 0;
    node.x = payload.artifactKind === "page" ? 0 : rootWidth + 80;
    node.y = nextY;
    componentDefinitionOffsetY += (node.height || 0) + 24;
  }

  function moveExistingComponentDefinitionToTargetPage(componentNode) {
    if (payload.artifactKind !== "page" || !componentNode) return;

    const parentPage = getComponentDefinitionParentPage();
    const definitionNode = getComponentSetParent(componentNode) || componentNode;
    if (definitionNode.parent === parentPage) return;

    const nextY = getNextComponentDefinitionY(parentPage);
    parentPage.appendChild(definitionNode);
    definitionNode.x = 0;
    definitionNode.y = nextY;
    componentDefinitionOffsetY += (definitionNode.height || 0) + 24;
  }

  function createSvgSceneNode(spec) {
    const svgNode = figma.createNodeFromSvg(spec.svgText || "");
    svgNode.name = spec.name || "svg";
    safeResize(svgNode, spec.styles.width, spec.styles.height);
    svgNode.x = spec.styles.x || 0;
    svgNode.y = spec.styles.y || 0;
    return svgNode;
  }

  function getLinearGradientTransform(angle) {
    const normalized = ((Number(angle) % 360) + 360) % 360;
    if (normalized === 270) return [[-1, 0, 1], [0, 1, 0]];
    if (normalized === 180) return [[0, 1, 0], [-1, 0, 1]];
    if (normalized === 0) return [[0, -1, 1], [1, 0, 0]];
    return [[1, 0, 0], [0, 1, 0]];
  }

  function linearGradientPaint(gradient) {
    return {
      type: "GRADIENT_LINEAR",
      gradientTransform: getLinearGradientTransform(gradient?.angle ?? 90),
      gradientStops: (gradient?.stops || []).map((stop, index, stops) => {
        const variable = registry.get(stop.token);
        const colorStop = {
          position:
            typeof stop.position === "number"
              ? clamp(stop.position, 0, 1)
              : stops.length > 1
                ? index / (stops.length - 1)
                : 0,
          color: cloneColor(colorFromCss(stop.color)),
        };
        if (variable?.id) {
          colorStop.boundVariables = {
            color: { type: "VARIABLE_ALIAS", id: variable.id },
          };
        }
        return colorStop;
      }),
    };
  }

  function canCreateComponentDefinition(spec) {
    return spec.kind === "frame" || ((spec.kind === "image" || spec.kind === "svg") && Boolean(spec.svgText));
  }

  function collectComponentDefinitionSpecs(spec, componentTitle, output, seen) {
    const specs = output || [];
    const seenKeys = seen || new Set();
    if (!spec) return specs;

    const component = spec.component;
    if (
      component?.key &&
      component.name === componentTitle &&
      canCreateComponentDefinition(spec) &&
      !seenKeys.has(component.key)
    ) {
      seenKeys.add(component.key);
      specs.push(spec);
      return specs;
    }

    for (const childSpec of spec.children || []) {
      collectComponentDefinitionSpecs(childSpec, componentTitle, specs, seenKeys);
    }
    return specs;
  }

  function collectPageComponentDefinitionSpecs(spec, output, seen, isRoot) {
    const specs = output || [];
    const seenKeys = seen || new Set();
    const isRootNode = isRoot !== false;
    if (!spec) return specs;

    const component = spec.component;
    if (
      !isRootNode &&
      component?.key &&
      canCreateComponentDefinition(spec) &&
      !seenKeys.has(component.key)
    ) {
      seenKeys.add(component.key);
      specs.push(spec);
    }

    for (const childSpec of spec.children || []) {
      collectPageComponentDefinitionSpecs(childSpec, specs, seenKeys, false);
    }
    return specs;
  }

  function getComponentSetParent(node) {
    return node?.parent?.type === "COMPONENT_SET" ? node.parent : undefined;
  }

  async function importComponentVariantSet(specs) {
    const existingComponents = specs
      .map((spec) => ({ spec, component: findLocalComponent(spec.component) }))
      .filter((entry) => Boolean(entry.component));
    const existingSet = existingComponents.map((entry) => getComponentSetParent(entry.component)).find(Boolean);
    if (existingSet) {
      for (const { spec, component } of existingComponents) {
        await updateExistingComponentDefinition(component, spec);
      }
      return existingSet;
    }

    const componentNodes = [];
    for (const spec of specs) {
      componentNodes.push(
        await ensureComponentDefinition(spec, spec.component, {
          reuseComponents: true,
        }),
      );
    }

    if (componentNodes.length > 1 && typeof figma.combineAsVariants === "function") {
      const parentPage = getComponentDefinitionParentPage();
      const componentSet = figma.combineAsVariants(componentNodes, parentPage);
      const nextY = payload.artifactKind === "page" ? getNextComponentDefinitionY(parentPage) : 0;
      componentSet.name = payload.componentTitle;
      componentSet.x = 0;
      componentSet.y = nextY;
      if (payload.artifactKind === "page") {
        componentDefinitionOffsetY = nextY + (componentSet.height || 0) + 24;
      }
      setNodePluginData(componentSet, "storybookComponentName", payload.componentTitle);
      setNodePluginData(
        componentSet,
        "storybookComponentSource",
        specs[0]?.component?.sourceName || payload.componentTitle,
      );
      return componentSet;
    }

    return componentNodes[0];
  }

  async function applyInstanceOverrides(node, spec) {
    if (!node || !spec) return;

    if (spec.kind === "text" && node.type === "TEXT") {
      await loadTextNodeFonts(node);
      const nextText = spec.text || "";
      if (node.characters !== nextText) {
        node.characters = nextText;
      }

      if (spec.styles?.textAutoResize && "textAutoResize" in node) {
        try {
          node.textAutoResize = spec.styles.textAutoResize;
        } catch {
          // Some instance text overrides cannot change auto-resize mode.
        }
      } else {
        safeResize(node, spec.styles?.width, spec.styles?.height);
      }
      applyTextTruncation(node, spec.styles || {});
      return;
    }

    if (!("children" in node)) return;

    const nodeChildren = Array.from(node.children || []);
    const specChildren = spec.children || [];
    for (let index = 0; index < specChildren.length; index += 1) {
      await applyInstanceOverrides(nodeChildren[index], specChildren[index]);
    }
  }

  async function updateExistingComponentDefinition(node, spec) {
    if (!node || !spec) return;

    if (spec.kind === "text" && node.type === "TEXT") {
      await applyInstanceOverrides(node, spec);
      const styles = spec.styles || {};
      const bindings = spec.bindings || {};
      if (styles.color) {
        node.fills = [solidPaint(styles.color, registry.get(bindings.textColor))];
      }
      safeBind(node, "fontSize", bindings.fontSize);
      safeBind(node, "fontWeight", bindings.fontWeight);
      safeBind(node, "lineHeight", bindings.lineHeight);
      return;
    }

    if ("fills" in node && spec.kind !== "text") {
      const styles = spec.styles || {};
      const bindings = spec.bindings || {};
      safeResize(node, styles.width, styles.height);
      if ("clipsContent" in node) node.clipsContent = styles.overflow === "hidden";
      if ("opacity" in node) node.opacity = styles.opacity ?? 1;
      setFrameFills(node, styles, bindings);
      setStrokes(node, styles, bindings);
      applyRadius(node, styles, bindings);
      applyAutoLayout(node, spec, styles, bindings);
      safeBind(node, "width", bindings.width);
      safeBind(node, "height", bindings.height);
      safeBind(node, "opacity", bindings.opacity);
      if (!styles.borderSides) safeBind(node, "strokeWeight", bindings.borderWidth);
    }

    if (!("children" in node)) return;

    const nodeChildren = Array.from(node.children || []);
    const specChildren = spec.children || [];
    for (let index = 0; index < specChildren.length; index += 1) {
      const childSpec = specChildren[index];
      const childNode = nodeChildren[index];
      await updateExistingComponentDefinition(childNode, childSpec);
      if (childNode) {
        applyAutoLayoutChildSizing(node, childNode, childSpec);
        positionChildNode(node, childNode, childSpec);
      }
    }
  }

  async function findExistingVariable(collection, spec) {
    const variables = await figma.variables.getLocalVariablesAsync();
    return variables.find((variable) => {
      if (variable.variableCollectionId !== collection.id) return false;
      if (getVariablePluginData(variable, PLUGIN_DATA_TOKEN_KEY) === spec.cssName) return true;
      return variable.name === spec.figmaName;
    });
  }

  function isOpacityVariableSpec(spec) {
    return spec.type === "FLOAT" && (
      (Array.isArray(spec.scopes) && spec.scopes.includes("OPACITY")) ||
      String(spec.cssName || "").includes("-opacity-") ||
      String(spec.figmaName || "").includes("/opacity/")
    );
  }

  function getVariableValueForMode(spec) {
    if (!isOpacityVariableSpec(spec)) return spec.value;

    const value = Number(spec.value);
    if (!Number.isFinite(value)) return spec.value;
    return value >= 0 && value <= 1 ? value * 100 : value;
  }

  async function upsertVariable(spec) {
    const collection = await getCollection(spec.collection);
    const modeId = collection.modes[0].modeId;
    let variable = await findExistingVariable(collection, spec);

    if (variable && variable.resolvedType !== spec.type) {
      throw new Error(
        "Variable type mismatch for " + spec.cssName + ": existing " +
          variable.resolvedType + ", export " + spec.type,
      );
    }

    if (!variable) {
      variable = figma.variables.createVariable(spec.figmaName, collection, spec.type);
    }

    if (Array.isArray(spec.scopes)) {
      try {
        variable.scopes = spec.scopes;
      } catch {
        // Scope support differs by variable type and Figma runtime.
      }
    }

    try {
      variable.setVariableCodeSyntax("WEB", "var(" + spec.cssName + ")");
    } catch {
      // Code syntax is metadata only; continue if unsupported.
    }

    setVariablePluginData(variable, PLUGIN_DATA_TOKEN_KEY, spec.cssName);

    if (spec.alias) {
      const target = registry.get(spec.alias);
      if (!target) {
        throw new Error("Missing alias target " + spec.alias + " for " + spec.cssName);
      }
      variable.setValueForMode(modeId, { type: "VARIABLE_ALIAS", id: target.id });
    } else if (spec.type === "COLOR") {
      variable.setValueForMode(modeId, cloneColor(spec.value));
    } else {
      variable.setValueForMode(modeId, getVariableValueForMode(spec));
    }

    registry.set(spec.cssName, variable);
    return variable;
  }

  async function upsertVariables(tokens) {
    const sorted = [...tokens].sort((a, b) => {
      const byLayer = (layerOrder[a.collection] ?? 9) - (layerOrder[b.collection] ?? 9);
      if (byLayer !== 0) return byLayer;
      return a.figmaName.localeCompare(b.figmaName);
    });

    for (const token of sorted) {
      await upsertVariable(token);
    }
  }

  function safeResize(node, width, height) {
    if (typeof node.resize !== "function") return;
    try {
      node.resize(Math.max(1, width || 1), Math.max(1, height || 1));
    } catch {
      // Some imported nodes do not allow direct resize.
    }
  }

  function safeBind(node, field, tokenName) {
    const variable = registry.get(tokenName);
    if (!variable || typeof node.setBoundVariable !== "function") return;

    try {
      node.setBoundVariable(field, variable);
    } catch {
      // Not every node supports every variable binding field.
    }
  }

  function setFrameLayoutMode(node, mode) {
    if (!("layoutMode" in node)) return;

    try {
      node.layoutMode = mode;
    } catch {
      // Some nodes cannot change layout mode after import.
    }
  }

  function isBorderFallbackNode(spec) {
    return String(spec?.name || "").includes("__border-");
  }

  function isAbsoluteLayoutNodeSpec(spec) {
    return spec?.layoutStrategy === "absolute" || isBorderFallbackNode(spec);
  }

  function applyNodeConstraints(child, constraints) {
    if (!constraints || !("constraints" in child)) return;

    try {
      child.constraints = constraints;
    } catch {
      // Some Figma nodes do not support constraints.
    }
  }

  function getAbsoluteChildX(parent, child, childSpec, styles) {
    const name = String(childSpec?.name || "");
    if (!name.includes("__border-right")) return styles.x || 0;

    const parentWidth = typeof parent.width === "number" ? parent.width : 0;
    const childWidth = styles.width || child.width || 1;
    return Math.max(0, parentWidth - childWidth);
  }

  function getAbsoluteChildY(parent, child, childSpec, styles) {
    const name = String(childSpec?.name || "");
    if (!name.includes("__border-bottom")) return styles.y || 0;

    const parentHeight = typeof parent.height === "number" ? parent.height : 0;
    const childHeight = styles.height || child.height || 1;
    return Math.max(0, parentHeight - childHeight);
  }

  function positionChildNode(parent, child, childSpec) {
    const styles = childSpec.styles || {};
    applyNodeConstraints(child, styles.constraints);

    if (isAbsoluteLayoutNodeSpec(childSpec)) {
      if ("layoutPositioning" in child) {
        try {
          child.layoutPositioning = "ABSOLUTE";
        } catch {
          // Older Figma nodes may not allow absolute positioning.
        }
      }

      child.x = getAbsoluteChildX(parent, child, childSpec, styles);
      child.y = getAbsoluteChildY(parent, child, childSpec, styles);
      return;
    }

    if ("layoutPositioning" in child) {
      try {
        child.layoutPositioning = "AUTO";
      } catch {
        // Older Figma nodes may not allow layout positioning changes.
      }
    }

    if (parent.layoutMode === "NONE") {
      child.x = styles.x || 0;
      child.y = styles.y || 0;
    }
  }

  function setFrameFills(node, styles, bindings) {
    const variable = registry.get(bindings.backgroundColor);
    if (styles.backgroundLinearGradient) {
      node.fills = [linearGradientPaint(styles.backgroundLinearGradient)];
    } else if (styles.backgroundColor || variable) {
      node.fills = [solidPaint(styles.backgroundColor, variable)];
    } else {
      node.fills = [];
    }
  }

  function setStrokes(node, styles, bindings) {
    const colorVariable = registry.get(bindings.borderColor);

    if (styles.borderSides) {
      const firstSide = ["top", "right", "bottom", "left"]
        .map((side) => styles.borderSides[side])
        .find(Boolean);
      if (!firstSide) return;

      node.strokes = [solidPaint(firstSide.color, colorVariable)];
      try {
        node.strokeAlign = "INSIDE";
        node.strokeTopWeight = styles.borderSides.top?.width ?? 0;
        node.strokeRightWeight = styles.borderSides.right?.width ?? 0;
        node.strokeBottomWeight = styles.borderSides.bottom?.width ?? 0;
        node.strokeLeftWeight = styles.borderSides.left?.width ?? 0;
      } catch {
        // Per-side stroke weights are unsupported on some node types.
      }
      return;
    }

    const widthVariable = registry.get(bindings.borderWidth);
    if (!styles.borderWidth && !widthVariable) return;
    if (!styles.borderColor && !colorVariable) return;

    node.strokes = [solidPaint(styles.borderColor, colorVariable)];
    if (styles.borderWidth) node.strokeWeight = styles.borderWidth;
  }

  function applyRadius(node, styles, bindings) {
    if ("cornerRadius" in node && styles.radius !== undefined) {
      node.cornerRadius = styles.radius;
    }

    if (bindings.cornerRadius) {
      for (const field of BINDABLE_RADIUS_FIELDS) {
        safeBind(node, field, bindings.cornerRadius);
      }
    }
  }

  function mapAxisAlignment(value) {
    if (value === "center") return "CENTER";
    if (value === "flex-end" || value === "end") return "MAX";
    if (value === "space-between") return "SPACE_BETWEEN";
    return "MIN";
  }

  function mapCounterAlignment(value) {
    if (value === "center") return "CENTER";
    if (value === "flex-end" || value === "end") return "MAX";
    return "MIN";
  }

  function mapTextAlignHorizontal(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "center") return "CENTER";
    if (normalized === "right" || normalized === "end") return "RIGHT";
    if (normalized === "justify") return "JUSTIFIED";
    return "LEFT";
  }

  function applyAutoLayout(node, spec, styles, bindings) {
    if (spec.layoutStrategy !== "autoLayout") {
      setFrameLayoutMode(node, "NONE");
      return;
    }

    if (!String(styles.display || "").includes("flex")) {
      setFrameLayoutMode(node, "NONE");
      return;
    }

    setFrameLayoutMode(
      node,
      String(styles.flexDirection || "").startsWith("column")
        ? "VERTICAL"
        : "HORIZONTAL",
    );
    const isHorizontalLayout = !String(styles.flexDirection || "").startsWith("column");
    const horizontalSizingMode =
      styles.layoutSizingHorizontal === "HUG" ? "AUTO" : "FIXED";
    const verticalSizingMode =
      styles.layoutSizingVertical === "HUG" ? "AUTO" : "FIXED";
    node.primaryAxisSizingMode = isHorizontalLayout
      ? horizontalSizingMode
      : verticalSizingMode;
    node.counterAxisSizingMode = isHorizontalLayout
      ? verticalSizingMode
      : horizontalSizingMode;
    node.primaryAxisAlignItems = mapAxisAlignment(styles.justifyContent);
    node.counterAxisAlignItems = mapCounterAlignment(styles.alignItems);
    node.itemSpacing = styles.gap ?? 0;
    node.paddingLeft = styles.paddingLeft ?? 0;
    node.paddingRight = styles.paddingRight ?? 0;
    node.paddingTop = styles.paddingTop ?? 0;
    node.paddingBottom = styles.paddingBottom ?? 0;

    safeBind(node, "itemSpacing", bindings.gap);
    safeBind(node, "paddingLeft", bindings.paddingLeft);
    safeBind(node, "paddingRight", bindings.paddingRight);
    safeBind(node, "paddingTop", bindings.paddingTop);
    safeBind(node, "paddingBottom", bindings.paddingBottom);
  }

  function applyAutoLayoutChildSizing(parent, child, spec) {
    if (parent.layoutMode === "NONE") return;

    const styles = spec.styles || {};
    const layoutGrow = Number(styles.layoutGrow || 0);
    if (layoutGrow > 0 && "layoutGrow" in child) {
      try {
        child.layoutGrow = 1;
      } catch {
        // Some Figma nodes do not support fill-container sizing.
      }
    }

    if (styles.layoutAlign !== "STRETCH") return;

    try {
      child.layoutAlign = "STRETCH";
    } catch {
      // Some Figma nodes do not support auto-layout child sizing.
    }
  }

  const loadedFontKeys = new Set();

  function getFontStyleFromWeight(weight) {
    if (weight >= 700) return "Bold";
    if (weight >= 600) return "Semibold";
    if (weight >= 500) return "Medium";
    return "Regular";
  }

  function getFontStyleCandidates(weight) {
    const preferred = getFontStyleFromWeight(weight);
    const candidates = [preferred];

    if (preferred === "Semibold") candidates.push("SemiBold", "Medium");
    if (preferred === "Bold") candidates.push("Semibold", "SemiBold", "Medium");
    if (preferred === "Medium") candidates.push("Regular");
    if (!candidates.includes("Regular")) candidates.push("Regular");

    return candidates;
  }

  function getFontFamily(fontFamily) {
    const first = String(fontFamily || "Inter").split(",")[0]?.trim();
    return first ? first.replace(/^["']|["']$/g, "") : "Inter";
  }

  function normalizeFontName(fontName) {
    if (!fontName || fontName === figma.mixed) return undefined;
    if (typeof fontName === "string") {
      const parts = fontName.trim().split(/\\s+/);
      if (parts.length >= 2) {
        return {
          family: parts.slice(0, -1).join(" "),
          style: parts[parts.length - 1],
        };
      }
      return { family: fontName, style: "Regular" };
    }
    if (fontName.family && fontName.style) return fontName;
    return undefined;
  }

  function resolveTokenValue(tokenName, seen) {
    if (!tokenName) return undefined;

    const visited = seen || new Set();
    if (visited.has(tokenName)) return undefined;
    visited.add(tokenName);

    const token = rawTokenByName.get(tokenName);
    if (!token) return undefined;
    if (token.alias) return resolveTokenValue(token.alias, visited);
    return token.value ?? token.rawValue;
  }

  function getFontFamilyFromToken(tokenName) {
    const value = resolveTokenValue(tokenName);
    if (typeof value !== "string") return undefined;
    return getFontFamily(value);
  }

  async function loadFont(fontName) {
    const normalizedFontName = normalizeFontName(fontName);
    if (!normalizedFontName) return false;

    const key = normalizedFontName.family + "\\n" + normalizedFontName.style;
    if (loadedFontKeys.has(key)) return true;

    await figma.loadFontAsync(normalizedFontName);
    loadedFontKeys.add(key);
    return true;
  }

  async function loadBoundFontFamily(tokenName, fontWeight) {
    const family = getFontFamilyFromToken(tokenName);
    if (!family) return false;

    const styleCandidates = getFontStyleCandidates(fontWeight || 400);
    for (const style of styleCandidates) {
      try {
        await loadFont({ family, style });
        return true;
      } catch {
        // Try next style before skipping the font-family binding.
      }
    }

    return false;
  }

  async function loadTextFont(styles) {
    const family = getFontFamily(styles.fontFamily);
    const styleCandidates = getFontStyleCandidates(styles.fontWeight || 400);

    for (const style of styleCandidates) {
      const fontName = { family, style };
      try {
        await loadFont(fontName);
        return fontName;
      } catch {
        // Try the next style for the same family before falling back.
      }
    }

    const fallback = { family: "Inter", style: "Regular" };
    await loadFont(fallback);
    return fallback;
  }

  async function loadTextNodeFonts(node) {
    const fonts = [];

    if (node.fontName && node.fontName !== figma.mixed) {
      fonts.push(node.fontName);
    }

    if (typeof node.getRangeAllFontNames === "function" && node.characters.length > 0) {
      try {
        fonts.push(...node.getRangeAllFontNames(0, node.characters.length));
      } catch {
        // Some runtimes do not allow range font inspection before insertion.
      }
    }

    for (const fontName of fonts) {
      try {
        await loadFont(fontName);
      } catch {
        const fallback = { family: "Inter", style: "Regular" };
        await loadFont(fallback);
        node.fontName = fallback;
        return;
      }
    }
  }

  async function loadNodeFonts(node) {
    if (node.type === "TEXT") {
      await loadTextNodeFonts(node);
      return;
    }

    if ("children" in node) {
      for (const child of node.children) {
        await loadNodeFonts(child);
      }
    }
  }

  function applyTextTruncation(node, styles) {
    if (!node || !styles) return;

    if (styles.maxLines !== undefined && "maxLines" in node) {
      try {
        node.maxLines = styles.maxLines;
      } catch {
        // Some Figma runtimes may not support max line limits.
      }
    }

    if (styles.textTruncation && "textTruncation" in node) {
      try {
        node.textTruncation = styles.textTruncation;
      } catch {
        // Some Figma runtimes may not support text truncation.
      }
    }
  }

  async function createTextNode(spec) {
    const node = figma.createText();
    const styles = spec.styles;
    const bindings = spec.bindings || {};
    node.name = spec.name;
    node.fontName = await loadTextFont(styles);
    node.characters = spec.text || "";
    node.fontSize = styles.fontSize || 14;
    if ("textAutoResize" in node) {
      try {
        node.textAutoResize = "NONE";
      } catch {
        // Keep default text sizing if fixed text resize is not supported.
      }
    }
    if (styles.lineHeight && styles.lineHeight !== "normal") {
      node.lineHeight = { unit: "PIXELS", value: styles.lineHeight };
    }
    node.fills = [solidPaint(styles.color, registry.get(bindings.textColor))];
    safeResize(node, styles.width, styles.height);
    applyTextTruncation(node, styles);
    if (styles.textAlign && "textAlignHorizontal" in node) {
      try {
        node.textAlignHorizontal = mapTextAlignHorizontal(styles.textAlign);
      } catch {
        // Some imported text nodes may not allow text alignment changes.
      }
    }
    if (styles.textAutoResize && "textAutoResize" in node) {
      try {
        node.textAutoResize = styles.textAutoResize;
      } catch {
        // Some imported text nodes may not allow auto-resize changes.
      }
    }
    if (
      !bindings.fontFamily ||
      (await loadBoundFontFamily(bindings.fontFamily, styles.fontWeight || 400))
    ) {
      safeBind(node, "fontFamily", bindings.fontFamily);
    }
    safeBind(node, "fontSize", bindings.fontSize);
    safeBind(node, "fontWeight", bindings.fontWeight);
    safeBind(node, "lineHeight", bindings.lineHeight);
    await loadTextNodeFonts(node);
    return node;
  }

  async function createImageNode(spec) {
    const wrapper = figma.createFrame();
    wrapper.name = spec.name;
    wrapper.fills = [];
    wrapper.clipsContent = false;
    safeResize(wrapper, spec.styles.width, spec.styles.height);

    if (spec.svgText) {
      try {
        const svgNode = figma.createNodeFromSvg(spec.svgText);
        svgNode.name = spec.name + "/svg";
        safeResize(svgNode, spec.styles.width, spec.styles.height);
        svgNode.x = 0;
        svgNode.y = 0;
        await loadNodeFonts(svgNode);
        wrapper.appendChild(svgNode);
      } catch {
        // Keep an empty wrapper if SVG import fails.
      }
    }

    return wrapper;
  }

  async function createFrameNode(spec, context, asComponent) {
    const node = asComponent ? figma.createComponent() : figma.createFrame();
    const styles = spec.styles;
    const bindings = spec.bindings || {};
    node.name = spec.name;
    safeResize(node, styles.width, styles.height);
    node.clipsContent = styles.overflow === "hidden";
    node.opacity = styles.opacity ?? 1;
    setFrameFills(node, styles, bindings);
    setStrokes(node, styles, bindings);
    applyRadius(node, styles, bindings);
    applyAutoLayout(node, spec, styles, bindings);
    safeBind(node, "width", bindings.width);
    safeBind(node, "height", bindings.height);
    safeBind(node, "opacity", bindings.opacity);
    if (!styles.borderSides) safeBind(node, "strokeWeight", bindings.borderWidth);

    const childContext = { ...(context || {}), isRoot: false };
    for (const childSpec of spec.children || []) {
      const child = await createNode(childSpec, childContext);
      await loadNodeFonts(child);
      node.appendChild(child);
      applyAutoLayoutChildSizing(node, child, childSpec);
      positionChildNode(node, child, childSpec);
    }

    if (spec.layoutStrategy === "absolute") {
      setFrameLayoutMode(node, "NONE");
    }

    return node;
  }

  async function ensureComponentDefinition(spec, component, context) {
    const existing = findLocalComponent(component);
    if (existing) {
      if (context?.updateExistingComponent !== false) {
        await updateExistingComponentDefinition(existing, spec);
        tagComponentNode(existing, component);
        moveExistingComponentDefinitionToTargetPage(existing);
      }
      return existing;
    }

    const componentNode =
      (spec.kind === "image" || spec.kind === "svg") && spec.svgText
        ? figma.createComponentFromNode(createSvgSceneNode(spec))
        : await createFrameNode(
            spec,
            { ...(context || {}), reuseComponents: true },
            true,
          );
    componentNode.name = getComponentDisplayName(component);
    tagComponentNode(componentNode, component);
    parkComponentDefinition(componentNode);
    componentRegistry.set(component.key, componentNode);
    return componentNode;
  }

  async function createComponentInstance(spec, context) {
    const component = await ensureComponentDefinition(
      spec,
      spec.component,
      { ...(context || {}), updateExistingComponent: false },
    );
    const instance = component.createInstance();
    instance.name = spec.component.name;
    safeResize(instance, spec.styles.width, spec.styles.height);
    instance.x = spec.styles.x || 0;
    instance.y = spec.styles.y || 0;
    await applyInstanceOverrides(instance, spec);
    return instance;
  }

  async function createNode(spec, context) {
    const importContext = context || {};
    if (
      importContext.reuseComponents &&
      !importContext.isRoot &&
      spec.component?.key &&
      canCreateComponentDefinition(spec)
    ) {
      return createComponentInstance(spec, importContext);
    }

    const node =
      spec.kind === "text"
        ? await createTextNode(spec)
        : spec.kind === "image" || spec.kind === "svg"
          ? await createImageNode(spec)
          : await createFrameNode(spec, importContext, false);

    node.x = spec.styles.x || 0;
    node.y = spec.styles.y || 0;
    return node;
  }

  await upsertVariables(payload.tokens || []);
  const shouldImportAsComponent = payload.artifactKind === "component";
  const rootComponent = payload.component || payload.root?.component;
  const componentVariantSpecs =
    shouldImportAsComponent && !rootComponent
      ? collectComponentDefinitionSpecs(payload.root, payload.componentTitle)
      : [];
  const pageComponentSpecs =
    payload.artifactKind === "page"
      ? collectPageComponentDefinitionSpecs(payload.root)
      : [];
  for (const spec of pageComponentSpecs) {
    await ensureComponentDefinition(spec, spec.component, {
      reuseComponents: true,
    });
  }

  const rootNode =
    shouldImportAsComponent && rootComponent && canCreateComponentDefinition(payload.root)
      ? await ensureComponentDefinition(
          payload.root,
          rootComponent,
          { reuseComponents: true },
        )
      : componentVariantSpecs.length > 1
        ? await importComponentVariantSet(componentVariantSpecs)
      : await createNode(payload.root, {
          isRoot: true,
          reuseComponents: payload.artifactKind === "page",
        });

  rootNode.name = shouldImportAsComponent && rootComponent
    ? getComponentDisplayName(rootComponent)
    : componentVariantSpecs.length > 1
      ? payload.componentTitle
    : payload.componentTitle + " / " + payload.storyName;
  rootNode.x = 0;
  rootNode.y = 0;
  await loadNodeFonts(rootNode);
  if (!rootNode.parent) figma.currentPage.appendChild(rootNode);
  figma.viewport.scrollAndZoomIntoView([rootNode]);

  figma.notify(
    "Imported " + (payload.artifactKind || "story") + " " + payload.componentTitle + " with " +
      (payload.tokens || []).length + " variables checked.",
  );
})(STORYBOOK_FIGMA_EXPORT).catch((error) => {
  console.error(error);
  figma.notify("Storybook import failed: " + (error?.message || String(error)));
});
`;
}

// src/FigmaCodeExporter.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var statusLabels = {
  copied: "Copied",
  copying: "Exporting",
  error: "Failed",
  idle: "Ready"
};
function getExportComponentTitle(title, options) {
  if (!title) return "Component";
  if (options.storyTitlePrefix === false) return title;
  const matchingPrefix = options.storyTitlePrefix.find(
    (prefix) => title.startsWith(prefix)
  );
  return matchingPrefix ? title.slice(matchingPrefix.length) : title;
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeSvgAttribute2(value) {
  return escapeXml(value).replace(/"/g, "&quot;");
}
function formatSvgNumber(value) {
  const numberValue = Number.isFinite(value) ? Number(value) : 0;
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
}
function svgDataUrl(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}
function getSvgPaint(value, fallback = "none") {
  return value ? escapeSvgAttribute2(value) : fallback;
}
function renderSvgImageNode(node, isRoot) {
  const { height, width, x, y } = node.styles;
  const transform = isRoot ? "" : ` transform="translate(${formatSvgNumber(x)} ${formatSvgNumber(y)})"`;
  if (!node.svgText) {
    return "";
  }
  return `<g${transform}><image href="${escapeSvgAttribute2(svgDataUrl(node.svgText))}" width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" preserveAspectRatio="none"/></g>`;
}
function renderSvgTextNode(node, isRoot) {
  const { color, fontFamily, fontSize, fontWeight, height, textAlign, textAlignVertical, width, x, y } = node.styles;
  const transform = isRoot ? "" : ` transform="translate(${formatSvgNumber(x)} ${formatSvgNumber(y)})"`;
  const resolvedFontSize = fontSize ?? 12;
  const textAnchor = textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start";
  const textX = textAnchor === "middle" ? width / 2 : textAnchor === "end" ? width : 0;
  const isCentered = textAlignVertical === "CENTER";
  const textY = isCentered ? height / 2 : resolvedFontSize;
  const baseline = isCentered ? "middle" : "alphabetic";
  return `<text${transform} x="${formatSvgNumber(textX)}" y="${formatSvgNumber(textY)}" fill="${getSvgPaint(color, "#000000")}" font-family="${escapeSvgAttribute2(fontFamily ?? "sans-serif")}" font-size="${formatSvgNumber(resolvedFontSize)}" font-weight="${escapeSvgAttribute2(String(fontWeight ?? 400))}" text-anchor="${textAnchor}" dominant-baseline="${baseline}">${escapeXml(node.text ?? "")}</text>`;
}
function renderSvgFrameNode(node, isRoot) {
  const {
    backgroundColor,
    borderColor,
    borderWidth,
    height,
    opacity,
    radius,
    width,
    x,
    y
  } = node.styles;
  const transform = isRoot ? "" : ` transform="translate(${formatSvgNumber(x)} ${formatSvgNumber(y)})"`;
  const groupOpacity = typeof opacity === "number" && opacity >= 0 && opacity < 1 ? ` opacity="${formatSvgNumber(opacity)}"` : "";
  const hasRect = Boolean(backgroundColor || borderColor && borderWidth);
  const rect = hasRect ? `<rect width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" rx="${formatSvgNumber(radius)}" fill="${getSvgPaint(backgroundColor)}"${borderColor && borderWidth ? ` stroke="${getSvgPaint(borderColor)}" stroke-width="${formatSvgNumber(borderWidth)}"` : ""}/>` : "";
  const children = node.children.map((child) => renderSvgNode(child)).join("");
  return `<g${transform}${groupOpacity}>${rect}${children}</g>`;
}
function renderSvgNode(node, isRoot = false) {
  if (node.kind === "text") return renderSvgTextNode(node, isRoot);
  if (node.kind === "image" || node.kind === "svg") {
    return renderSvgImageNode(node, isRoot);
  }
  return renderSvgFrameNode(node, isRoot);
}
function createFigmaDesignSvg(payload) {
  const width = Math.max(1, payload.root.styles.width);
  const height = Math.max(1, payload.root.styles.height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" viewBox="0 0 ${formatSvgNumber(width)} ${formatSvgNumber(height)}" role="img" aria-label="${escapeSvgAttribute2(payload.root.name)}">${renderSvgNode(payload.root, true)}</svg>`;
}
async function copySvgDesign(svgText) {
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const plainText = new Blob([svgText], { type: "text/plain" });
    const htmlText = new Blob([svgText], { type: "text/html" });
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/svg+xml": new Blob([svgText], { type: "image/svg+xml" }),
          "text/html": htmlText,
          "text/plain": plainText
        })
      ]);
      return;
    } catch {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlText,
          "text/plain": plainText
        })
      ]);
      return;
    }
  }
  await copyText(svgText);
}
function FigmaCodeExporter({
  children,
  context,
  options
}) {
  const scopeRef = useRef(null);
  const [activeFormat, setActiveFormat] = useState();
  const [copiedFormat, setCopiedFormat] = useState();
  const [status, setStatus] = useState("idle");
  const [summary, setSummary] = useState("");
  const resolvedOptions = resolveFigmaExportAddonOptions(options);
  const enabled = context.globals?.[resolvedOptions.globalName] === "on";
  const includedStory = isStoryIncludedForFigmaExport(context.title, resolvedOptions);
  const componentTitle = getExportComponentTitle(context.title, resolvedOptions);
  async function handleCopy(format) {
    const scope = scopeRef.current;
    if (!scope) return;
    setActiveFormat(format);
    setCopiedFormat(void 0);
    setStatus("copying");
    setSummary(
      format === "design" ? "Generating SVG design..." : format === "json" ? "Generating JSON payload..." : "Generating console script..."
    );
    try {
      const payload = await createFigmaExportPayload({
        componentTitle,
        options: resolvedOptions,
        scope,
        storyId: context.id ?? "unknown-story",
        storyName: context.name ?? "Story",
        storyTitle: context.title ?? ""
      });
      if (format === "design") {
        await copySvgDesign(createFigmaDesignSvg(payload));
      } else {
        const exportText = format === "json" ? createFigmaExportJson(payload) : createFigmaPluginCode(payload);
        await copyText(exportText);
      }
      setCopiedFormat(format);
      setStatus("copied");
      setSummary(
        format === "design" ? `Visual SVG copied from ${payload.root.name}; paste into Figma for quick review.` : format === "json" ? `${payload.tokens.length} variables exported from ${payload.root.name}; ${payload.artifactKind} JSON copied for importer.` : `${payload.tokens.length} variables exported from ${payload.root.name}; ${payload.artifactKind} script copied for plugin console only.`
      );
    } catch (error) {
      setStatus("error");
      setCopiedFormat(void 0);
      setSummary(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setActiveFormat(void 0);
    }
  }
  if (!includedStory) {
    return /* @__PURE__ */ jsx(Fragment, { children });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "sbfx-story-scope", ref: scopeRef, children }),
    enabled ? /* @__PURE__ */ jsxs(
      "aside",
      {
        "aria-label": "Figma export",
        className: "sbfx-exporter",
        "data-status": status,
        children: [
          /* @__PURE__ */ jsxs("header", { className: "sbfx-exporter__header", children: [
            /* @__PURE__ */ jsx("span", { className: "sbfx-exporter__mark", "aria-hidden": "true", children: /* @__PURE__ */ jsx(FigmaIcon, { size: 14 }) }),
            /* @__PURE__ */ jsxs("span", { className: "sbfx-exporter__heading", children: [
              /* @__PURE__ */ jsx("span", { className: "sbfx-exporter__title", children: "Figma export" }),
              /* @__PURE__ */ jsx("span", { className: "sbfx-exporter__subtitle", title: componentTitle, children: componentTitle })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sbfx-exporter__info", children: [
            /* @__PURE__ */ jsxs("span", { className: "sbfx-exporter__status", children: [
              /* @__PURE__ */ jsx("span", { className: "sbfx-exporter__status-dot", "aria-hidden": "true" }),
              statusLabels[status]
            ] }),
            summary ? /* @__PURE__ */ jsx("p", { className: "sbfx-exporter__summary", title: summary, children: summary }) : null
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sbfx-exporter__actions", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                className: "sbfx-exporter__button",
                disabled: status === "copying",
                onClick: () => {
                  void handleCopy("json");
                },
                type: "button",
                children: [
                  copiedFormat === "json" && status === "copied" ? /* @__PURE__ */ jsx(CheckIcon, { size: 14 }) : /* @__PURE__ */ jsx(CopyIcon, { size: 14 }),
                  activeFormat === "json" ? "Copying" : copiedFormat === "json" && status === "copied" ? "Copied" : "Copy JSON"
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                className: "sbfx-exporter__button sbfx-exporter__button--secondary",
                disabled: status === "copying",
                onClick: () => {
                  void handleCopy("script");
                },
                type: "button",
                children: [
                  copiedFormat === "script" && status === "copied" ? /* @__PURE__ */ jsx(CheckIcon, { size: 14 }) : /* @__PURE__ */ jsx(CommandIcon, { size: 14 }),
                  activeFormat === "script" ? "Copying" : copiedFormat === "script" && status === "copied" ? "Copied" : "Plugin Console Script"
                ]
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                "aria-label": "Copy design to Figma",
                className: "sbfx-exporter__button sbfx-exporter__button--secondary sbfx-exporter__button--icon",
                disabled: status === "copying",
                onClick: () => {
                  void handleCopy("design");
                },
                title: "Copy design to Figma",
                type: "button",
                children: copiedFormat === "design" && status === "copied" ? /* @__PURE__ */ jsx(CheckIcon, { size: 14 }) : /* @__PURE__ */ jsx(FigmaIcon, { size: 14 })
              }
            )
          ] })
        ]
      }
    ) : null
  ] });
}

// src/manager.tsx
import { CopyIcon as CopyIcon2 } from "@storybook/icons";
import { createElement } from "react";
import { ToggleButton } from "storybook/internal/components";
import { addons, types, useGlobals } from "storybook/manager-api";
var figmaExportAddonId = "storybook/figma-export";
function registerFigmaExportTool(options = {}) {
  const addonId = options.addonId ?? figmaExportAddonId;
  const globalName = options.globalName ?? defaultFigmaExportGlobalName;
  const toolId = `${addonId}/tool`;
  function FigmaExportToggle() {
    const [globals, updateGlobals] = useGlobals();
    const enabled = globals[globalName] === "on";
    const title = enabled ? "Figma export on" : "Figma export off";
    return createElement(
      ToggleButton,
      {
        ariaLabel: title,
        key: toolId,
        onClick: () => {
          updateGlobals({
            [globalName]: enabled ? "off" : "on"
          });
        },
        padding: "small",
        pressed: enabled,
        title,
        tooltip: title,
        variant: "ghost"
      },
      createElement(CopyIcon2),
      createElement("span", null, title)
    );
  }
  addons.register(addonId, () => {
    addons.add(toolId, {
      render: () => createElement(FigmaExportToggle),
      title: "Figma export",
      type: types.TOOL
    });
  });
}

// src/preview.tsx
import { createElement as createElement2 } from "react";
function getFigmaExportGlobalName(options) {
  return options?.globalName ?? defaultFigmaExportGlobalName;
}
function createFigmaExportDecorator(options) {
  return (Story, context) => createElement2(FigmaCodeExporter, { context, options }, Story());
}
function createFigmaExportGlobalTypes(options) {
  return {
    [getFigmaExportGlobalName(options)]: {
      defaultValue: "off",
      description: "Show the component-to-Figma code exporter."
    }
  };
}
function createFigmaExportInitialGlobals(options) {
  return {
    [getFigmaExportGlobalName(options)]: "off"
  };
}
export {
  FigmaCodeExporter,
  createFigmaExportDecorator,
  createFigmaExportGlobalTypes,
  createFigmaExportInitialGlobals,
  createFigmaExportJson,
  createFigmaPluginCode,
  defaultFigmaExportGlobalName,
  figmaExportAddonId,
  getFigmaExportGlobalName,
  isStoryIncludedForFigmaExport,
  registerFigmaExportTool,
  resolveFigmaExportAddonOptions
};
//# sourceMappingURL=index.js.map