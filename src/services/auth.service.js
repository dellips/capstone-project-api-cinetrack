import { createHttpError } from "../utils/http-error.js";
import { getBearerToken, issueAuthTokens, verifyToken } from "../utils/auth.js";
import { readAppState, updateAppState, pruneRefreshTokens } from "../utils/state.js";

const ADMIN_USER = {
  id: "A001",
  name: "Admin",
  email: "admin@gmail.com",
  password: "admin123",
  role: "admin"
};

// Mengembalikan profil admin tetap yang dipakai seluruh flow autentikasi sederhana ini.
export function getAdminUser() {
  return {
    id: ADMIN_USER.id,
    name: ADMIN_USER.name,
    email: ADMIN_USER.email,
    role: ADMIN_USER.role
  };
}

// Memvalidasi kredensial admin dan mengembalikan token sederhana untuk sesi frontend.
export async function loginAdmin({ email, password }) {
  if (email !== ADMIN_USER.email || password !== ADMIN_USER.password) {
    throw createHttpError(401, "Invalid email or password");
  }

  const user = getAdminUser();
  const tokens = issueAuthTokens(user);

  await updateAppState((state) => ({
    ...state,
    refresh_tokens: pruneRefreshTokens([
      ...state.refresh_tokens.filter((item) => item.token !== tokens.refresh_token),
      {
        token: tokens.refresh_token,
        user_id: user.id,
        created_at: new Date().toISOString()
      }
    ])
  }));

  return {
    ...tokens,
    user
  };
}

// Menukar refresh token aktif dengan pasangan token baru untuk menjaga sesi frontend.
export async function refreshAdminToken(refreshToken) {
  verifyToken(refreshToken, "refresh");

  const state = await readAppState();
  const isActive = state.refresh_tokens.some((item) => item.token === refreshToken);

  if (!isActive) {
    throw createHttpError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  const user = getAdminUser();
  const tokens = issueAuthTokens(user);

  await updateAppState((currentState) => ({
    ...currentState,
    refresh_tokens: pruneRefreshTokens([
      ...currentState.refresh_tokens.filter((item) => item.token !== refreshToken),
      {
        token: tokens.refresh_token,
        user_id: user.id,
        created_at: new Date().toISOString()
      }
    ])
  }));

  return {
    ...tokens,
    user
  };
}

// Menonaktifkan refresh token yang diberikan agar sesi bisa diakhiri dari frontend.
export async function logoutAdmin(refreshToken = null) {
  if (refreshToken) {
    await updateAppState((state) => ({
      ...state,
      refresh_tokens: state.refresh_tokens.filter((item) => item.token !== refreshToken)
    }));
  }

  return {
    message: "Logout success"
  };
}

// Memverifikasi access token bearer dan mengembalikan user aktif untuk route admin.
export async function getCurrentAdmin(authorization) {
  const token = getBearerToken(authorization);
  const payload = verifyToken(token, "access");

  if (payload.sub !== ADMIN_USER.id) {
    throw createHttpError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return getAdminUser();
}
