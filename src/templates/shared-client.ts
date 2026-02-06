export function renderIsHostDetectionSource(isHost: boolean): string {
  return `const isHost = ${isHost ? "true" : "false"};`;
}

export function renderParseStatusPayloadSource(): string {
  return `const parseStatusPayload = (payload) => {
  if (!payload) {
    return null;
  }
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object") {
      return {
        hostConnected: Boolean(parsed.hostConnected),
        guestConnected: Boolean(parsed.guestConnected),
      };
    }
  } catch {
    // Not JSON, fall through to HTML parsing.
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(payload, "text/html");
    const span = doc.body.firstElementChild;
    if (!span) {
      return null;
    }
    const hostAttr = span.getAttribute("data-host-connected");
    const guestAttr = span.getAttribute("data-guest-connected");
    if (hostAttr === null || guestAttr === null) {
      return null;
    }
    return {
      hostConnected: hostAttr === "true",
      guestConnected: guestAttr === "true",
    };
  } catch {
    return null;
  }
};`;
}

export function renderUpdateStatusTextSource(statusElementName: string): string {
  return `const updateStatusText = (hostConnected, guestConnected) => {
  if (!${statusElementName}) {
    return;
  }
  const opponentIsConnected = isHost ? guestConnected : hostConnected;
  const message = opponentIsConnected
    ? opponentLabel + " connected"
    : "Waiting for " + opponentLabel.toLowerCase() + "...";
  ${statusElementName}.textContent = message;
};`;
}

export function renderDisconnectSseSource(): string {
  return `const disconnectSse = () => {
  if (!sseRootEl || !window.htmx || typeof window.htmx.trigger !== "function") {
    return;
  }
  window.htmx.trigger(sseRootEl, "htmx:beforeCleanupElement");
};`;
}
