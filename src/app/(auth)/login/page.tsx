"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Login Page — /login
 *
 * The entry point for all teachers. Prominently displays the Examint brand
 * and tagline as specified in the plan: "Examint — Snap. Select. Set the paper."
 *
 * Flow:
 * 1. Teacher enters email and password.
 * 2. `signIn("credentials", ...)` is called — NextAuth's credentials provider
 *    runs the `authorize` function in lib/auth.ts.
 * 3. On success: NextAuth sets the session cookie and redirects to the dashboard.
 * 4. On failure: an error toast is shown without reloading the page.
 *
 * The `callbackUrl` from the URL search params is respected so that if a
 * teacher was redirected to /login from a protected page, they return to that
 * page after successful login.
 */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handles form submission.
   * Calls NextAuth's `signIn` with the credentials provider.
   * On failure, shows an error toast; on success, navigates to the callbackUrl.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim() || !password) {
      toast.error("Please enter your email and password.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false, // Handle redirect manually to show error toasts
      });

      if (result?.error) {
        toast.error("Invalid email or password. Please try again.");
      } else if (result?.ok) {
        toast.success("Logged in successfully!");
        router.push(callbackUrl);
        router.refresh(); // Force Next.js to re-fetch server-side session data
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Brand header — shown above the card */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          Examint
        </h1>
        <p className="text-zinc-500 text-sm italic">
          Snap. Select. Set the paper.
        </p>
      </div>

      <Card className="shadow-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>
            Enter your email and password to access your account.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Email field */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="teacher@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={isLoading}
              />
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={isLoading}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in…" : "Sign in"}
            </Button>

            <p className="text-sm text-center text-zinc-500">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
              >
                Create one
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
