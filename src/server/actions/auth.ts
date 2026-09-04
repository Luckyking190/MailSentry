"use server";

import { signIn, signOut } from "@/server/auth";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/scan" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
