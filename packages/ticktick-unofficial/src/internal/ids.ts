import { randomBytes, randomUUID } from "node:crypto";

let objectIdCounter = randomBytes(3).readUIntBE(0, 3);
const objectIdRandom = randomBytes(5);

export function createObjectId(date = new Date()): string {
  const timestampSeconds = Math.floor(date.getTime() / 1000);
  const timestamp = Buffer.allocUnsafe(4);
  timestamp.writeUInt32BE(timestampSeconds, 0);

  const counter = Buffer.allocUnsafe(3);
  counter.writeUIntBE(objectIdCounter & 0xffffff, 0, 3);
  objectIdCounter = (objectIdCounter + 1) & 0xffffff;

  return Buffer.concat([timestamp, objectIdRandom, counter]).toString("hex");
}

export function createTraceId(): string {
  const timestampHex = Date.now().toString(16);
  return `${timestampHex}${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export function createDeviceId(): string {
  return createObjectId();
}
