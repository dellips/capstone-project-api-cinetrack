import { createHttpError } from "../utils/http-error.js";

const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "admin123";

export async function loginAdmin({ email, password }) {
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    throw createHttpError(401, "Invalid email or password");
  }

  const token = Buffer.from(`${email}:${Date.now()}`).toString("base64");

  return {
    message: "Login success",
    token,
    user: {
      email: ADMIN_EMAIL,
      role: "admin"
    }
  };
}
