export function toApiDateTime(value: Date | number | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  const iso = date.toISOString();
  return `${iso.slice(0, 23)}+0000`;
}

export function toDateStamp(value: Date | number | string): number {
  if (typeof value === "number") {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return Number(`${year}${month}${day}`);
}
