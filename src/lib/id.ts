import { randomUUID, randomBytes } from "crypto";

export const newId = () => randomUUID();

/** Short opaque invite token, safe to put in a URL */
export const newToken = () => randomBytes(24).toString("base64url");