import crypto from "node:crypto";
import { config } from "../config.js";
import { createHttpError } from "./http-error.js";

const ACCESS_TOKEN_TTL_MS = 1000 * 60 * 60;
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

// Mengubah object menjadi string base64url agar bisa dipakai sebagai token ter-sign.
function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// Membalikkan base64url ke object JSON dan gagal eksplisit jika token rusak.
function decode(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw createHttpError(401, "Invalid token", "INVALID_TOKEN");
  }
}

// Menandatangani payload dengan HMAC agar token bisa diverifikasi tanpa dependency tambahan.
function sign(content) {
  return crypto.createHmac("sha256", config.authSecret).update(content).digest("base64url");
}

// Membuat token sederhana untuk access dan refresh flow admin dashboard.
function createToken(payload, expiresInMs) {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({
    ...payload,
    exp: Date.now() + expiresInMs
  });
  const content = `${header}.${body}`;
  return `${content}.${sign(content)}`;
}

// Memverifikasi signature dan masa berlaku token sebelum dipakai endpoint auth.
export function verifyToken(token, expectedType = null) {
  const [header, body, signature] = String(token || "").split(".");

  if (!header || !body || !signature) {
    throw createHttpError(401, "Invalid token", "INVALID_TOKEN");
  }

  const content = `${header}.${body}`;

  if (sign(content) !== signature) {
    throw createHttpError(401, "Invalid token", "INVALID_TOKEN");
  }

  const payload = decode(body);

  if (payload.exp <= Date.now()) {
    throw createHttpError(401, "Token expired", "TOKEN_EXPIRED");
  }

  if (expectedType && payload.type !== expectedType) {
    throw createHttpError(401, "Invalid token type", "INVALID_TOKEN_TYPE");
  }

  return payload;
}

// Menerbitkan access token dan refresh token untuk user admin yang sudah lolos login.
export function issueAuthTokens(user) {
  const basePayload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };

  return {
    token: createToken({ ...basePayload, type: "access" }, ACCESS_TOKEN_TTL_MS),
    refresh_token: createToken({ ...basePayload, type: "refresh" }, REFRESH_TOKEN_TTL_MS)
  };
}

// Mengambil bearer token dari header Authorization dan gagal bila formatnya salah.
export function getBearerToken(authorization) {
  const [type, token] = String(authorization || "").split(" ");

  if (type !== "Bearer" || !token) {
    throw createHttpError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return token;
}
