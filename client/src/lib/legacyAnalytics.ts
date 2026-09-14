export const LEGACY_ANALYTICS_SCRIPT_ATTRIBUTE = "data-lexy-legacy-analytics";

export type LegacyAnalyticsConfig = {
  endpoint: unknown;
  websiteId: unknown;
};

function validConfig(
  config: LegacyAnalyticsConfig
): config is { endpoint: string; websiteId: string } {
  return (
    typeof config.endpoint === "string" &&
    /^https:\/\/[^\s]+$/.test(config.endpoint) &&
    typeof config.websiteId === "string" &&
    config.websiteId.length > 0
  );
}

export function removeLegacyAnalyticsScripts(
  documentObject: Document = document
): void {
  documentObject
    .querySelectorAll<HTMLScriptElement>(`script[${LEGACY_ANALYTICS_SCRIPT_ATTRIBUTE}]`)
    .forEach(script => script.remove());
}

export function synchronizeLegacyAnalyticsScript(
  documentObject: Document,
  controlled: boolean,
  config: LegacyAnalyticsConfig
): void {
  if (controlled || !validConfig(config)) {
    removeLegacyAnalyticsScripts(documentObject);
    return;
  }

  const selector = `script[${LEGACY_ANALYTICS_SCRIPT_ATTRIBUTE}]`;
  const scripts = Array.from(
    documentObject.querySelectorAll<HTMLScriptElement>(selector)
  );
  if (scripts.length > 0) {
    scripts.slice(1).forEach(script => script.remove());
    return;
  }

  const script = documentObject.createElement("script");
  script.defer = true;
  script.src = `${config.endpoint.replace(/\/$/, "")}/umami`;
  script.dataset.websiteId = config.websiteId;
  script.setAttribute(LEGACY_ANALYTICS_SCRIPT_ATTRIBUTE, "true");
  documentObject.head.append(script);
}
