"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
 * Signup Page — /signup
 *
 * Allows new teachers to create an Examint account.
 *
 * Flow:
 * 1. Teacher fills in name, email, and password.
 * 2. Client-side validation runs (empty check, password length).
 * 3. POST to /api/auth/signup — creates the User row with a bcrypt-hashed password.
 * 4. On success: shows a success toast and redirects to /login.
 * 5. On failure (e.g. duplicate email): shows an error toast.
 *
 * After creating an account, teachers must also add their Gemini API key in
 * Settings before they can use the Upload & Extract feature.
 */
export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handles the signup form submission.
   * Validates inputs client-side first, then calls the signup API.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !password) {
      toast.error("Please fill in all fields.");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password,
        }),
      });

      const data = await response.json() as { message?: string; error?: string };

      if (!response.ok) {
        toast.error(data.error ?? "Failed to create account. Please try again.");
      } else {
        toast.success("Account created! Please sign in.");
        router.push("/login");
      }
    } catch {
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Brand header */}
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
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>
            Register to start building your question paper library.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Full name */}
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ms. Priya Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                disabled={isLoading}
              />
            </div>

            {/* Email */}
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

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={isLoading}
              />
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={isLoading}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating account…" : "Create account"}
            </Button>

            <p className="text-sm text-center text-zinc-500">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>

      <p className="text-xs text-center text-zinc-400">
        After signing up, you&apos;ll need to add your Google Gemini API key in
        Settings to use the AI extraction feature.
      </p>
    </div>
  );
}
