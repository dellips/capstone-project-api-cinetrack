import { createHttpError } from "../utils/http-error.js";

const ADMIN_USER = {
  id: "A001",
  name: "Admin",
  email: "admin@gmail.com",
  password: "admin123",
  role: "admin"
};

// Memvalidasi kredensial admin dan mengembalikan token sederhana untuk sesi frontend.
export async function loginAdmin({ email, password }) {
  if (email !== ADMIN_USER.email || password !== ADMIN_USER.password) {
    throw createHttpError(401, "Invalid email or password");
  }

  const token = Buffer.from(
    JSON.stringify({
      sub: ADMIN_USER.id,
      email,
      role: ADMIN_USER.role,
      login_at: new Date().toISOString()
    })
  ).toString("base64url");

  return {
    token,
    user: {
      id: ADMIN_USER.id,
      name: ADMIN_USER.name,
      email: ADMIN_USER.email,
      role: ADMIN_USER.role
    }
  };
}
