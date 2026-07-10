const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const HTTP_SCHEME_PATTERN = /^https?:\/\//i;

function containsControlCharacter(value: string) {
  return CONTROL_CHARACTER_PATTERN.test(value);
}

function hasAuthority(value: string) {
  return value.length > 0 && !/^[\\/?#]/.test(value);
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function getSafeExternalUrl(value: string): string | null {
  if (containsControlCharacter(value)) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (HTTP_SCHEME_PATTERN.test(trimmed)) {
    const authorityStart = trimmed.indexOf("://") + 3;
    if (!hasAuthority(trimmed.slice(authorityStart))) {
      return null;
    }

    return normalizeHttpUrl(trimmed);
  }

  if (SCHEME_PATTERN.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith("//")) {
    return hasAuthority(trimmed.slice(2))
      ? normalizeHttpUrl(`https:${trimmed}`)
      : null;
  }

  if (/^[.\\/?#]/.test(trimmed)) {
    return null;
  }

  return normalizeHttpUrl(`https://${trimmed}`);
}

export function getSafeMarkdownUrl(value: string): string | null {
  if (containsControlCharacter(value)) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    return trimmed;
  }

  return getSafeExternalUrl(trimmed);
}
