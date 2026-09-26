import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Accedi" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
