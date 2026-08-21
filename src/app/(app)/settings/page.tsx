"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Settings Page — /settings
 *
 * Allows a teacher to:
 * 1. Update their display name.
 * 2. Change their email (requires current password confirmation).
 * 3. Change their password (requires current + new password).
 * 4. Enter, update, or remove their Google Gemini API key.
 *    - The key is never shown in plaintext after saving (only a masked indicator).
 *    - "Test Key" button verifies the key with a minimal Gemini API call before saving.
 *
 * All PATCH calls go to /api/settings.
 * The "Test Key" button POSTs to /api/settings (test-key action).
 */

/** Shape of the settings data fetched from GET /api/settings. */
interface SettingsData {
  name: string;
  email: string;
  hasGeminiKey: boolean;
}

export default function SettingsPage() {
  // --- Profile data state ---
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  // --- Password change form state ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // --- Gemini key form state ---
  const [geminiKey, setGeminiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [keyTestStatus, setKeyTestStatus] = useState<
    "idle" | "testing" | "valid" | "invalid"
  >("idle");
  const [keyTestError, setKeyTestError] = useState("");

  // --- Loading state per section ---
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [loading, setLoading] = useState(true);

  /**
   * Fetches current settings from the API on mount.
   * Populates name, email, and the hasGeminiKey flag.
   */
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const data = (await res.json()) as SettingsData;
        setName(data.name);
        setEmail(data.email);
        setHasGeminiKey(data.hasGeminiKey);
      } catch {
        toast.error("Could not load settings. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  /**
   * Saves the teacher's display name via PATCH /api/settings.
   * Does not require a password.
   */
  async function handleSaveName() {
    if (!name.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save name");
      toast.success("Name updated successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save name.");
    } finally {
      setSavingProfile(false);
    }
  }

  /**
   * Changes the teacher's password via PATCH /api/settings.
   * Requires the current password for verification.
   */
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update password");
      toast.success("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update password."
      );
    } finally {
      setSavingPassword(false);
    }
  }

  /**
   * Tests the entered Gemini API key by calling POST /api/settings.
   * Updates the keyTestStatus to provide visual feedback.
   */
  async function handleTestKey() {
    if (!geminiKey.trim()) {
      toast.error("Please enter a Gemini API key to test.");
      return;
    }
    setKeyTestStatus("testing");
    setKeyTestError("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: geminiKey.trim() }),
      });
      const data = (await res.json()) as { valid: boolean; error?: string };
      if (data.valid) {
        setKeyTestStatus("valid");
        toast.success("API key is valid! You can now save it.");
      } else {
        setKeyTestStatus("invalid");
        setKeyTestError(data.error ?? "Key test failed.");
        toast.error(data.error ?? "Invalid API key.");
      }
    } catch {
      setKeyTestStatus("invalid");
      setKeyTestError("Network error during key test.");
      toast.error("Could not reach the test endpoint. Check your connection.");
    }
  }

  /**
   * Saves the entered Gemini API key via PATCH /api/settings.
   * The key is encrypted server-side before storage.
   */
  async function handleSaveGeminiKey() {
    setSavingKey(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiApiKey: geminiKey.trim() }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save API key");
      toast.success(
        geminiKey.trim() ? "Gemini API key saved." : "Gemini API key removed."
      );
      setHasGeminiKey(!!geminiKey.trim());
      setGeminiKey("");
      setKeyTestStatus("idle");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save API key."
      );
    } finally {
      setSavingKey(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>

      {/* ── Profile ── */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your display name.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <div className="flex gap-2">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={savingProfile}
              />
              <Button
                onClick={handleSaveName}
                disabled={savingProfile}
                variant="outline"
              >
                {savingProfile ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-display">Email</Label>
            <Input
              id="email-display"
              value={email}
              disabled
              className="bg-zinc-50"
            />
            <p className="text-xs text-zinc-400">
              Email changes are not supported via this form. Contact your
              administrator if you need to update your email.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Change Password ── */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Enter your current password and choose a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                disabled={savingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                disabled={savingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmNewPassword">Confirm new password</Label>
              <Input
                id="confirmNewPassword"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Repeat new password"
                disabled={savingPassword}
              />
            </div>
            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Gemini API Key ── */}
      <Card>
        <CardHeader>
          <CardTitle>Google Gemini API Key</CardTitle>
          <CardDescription>
            Examint uses your personal Google AI Studio key to extract content
            from uploaded images. Your key is encrypted before storage and never
            shared.{" "}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-zinc-600 hover:text-zinc-900"
            >
              Get a free key from Google AI Studio →
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2 text-sm">
            {hasGeminiKey ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-green-700 font-medium">
                  API key is set
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-zinc-400" />
                <span className="text-zinc-500">No API key saved yet</span>
              </>
            )}
          </div>

          {/* Key input */}
          <div className="space-y-2">
            <Label htmlFor="geminiKey">
              {hasGeminiKey ? "Replace API key" : "Enter API key"}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="geminiKey"
                  type={showGeminiKey ? "text" : "password"}
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    setKeyTestStatus("idle"); // Reset test status on change
                  }}
                  placeholder="AIza..."
                  disabled={savingKey}
                  className="pr-10"
                />
                {/* Toggle key visibility */}
                <button
                  type="button"
                  onClick={() => setShowGeminiKey((v) => !v)}
                  className="absolute right-2 top-2.5 text-zinc-400 hover:text-zinc-700"
                  tabIndex={-1}
                >
                  {showGeminiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Test Key button */}
              <Button
                type="button"
                variant="outline"
                onClick={handleTestKey}
                disabled={!geminiKey.trim() || keyTestStatus === "testing" || savingKey}
              >
                {keyTestStatus === "testing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Test Key"
                )}
              </Button>
            </div>

            {/* Test result feedback */}
            {keyTestStatus === "valid" && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> Key is valid and working.
              </p>
            )}
            {keyTestStatus === "invalid" && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" />{" "}
                {keyTestError || "Key test failed."}
              </p>
            )}
          </div>

          {/* Save / Remove buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleSaveGeminiKey}
              disabled={!geminiKey.trim() || savingKey}
            >
              {savingKey ? "Saving…" : "Save key"}
            </Button>
            {hasGeminiKey && (
              <Button
                variant="outline"
                onClick={async () => {
                  setSavingKey(true);
                  try {
                    await fetch("/api/settings", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ geminiApiKey: "" }),
                    });
                    setHasGeminiKey(false);
                    setGeminiKey("");
                    toast.success("Gemini API key removed.");
                  } finally {
                    setSavingKey(false);
                  }
                }}
                disabled={savingKey}
              >
                Remove key
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
