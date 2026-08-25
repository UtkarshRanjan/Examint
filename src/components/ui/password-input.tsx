"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";

/**
 * Password input props — identical to Input's, minus `type` (which this
 * component controls internally to toggle between hidden and visible text).
 */
export type PasswordInputProps = Omit<InputProps, "type">;

/**
 * Password field with a show/hide (eye icon) toggle.
 *
 * Renders as `type="password"` by default. Clicking the eye icon flips it
 * to `type="text"` so the user can proofread what they typed before
 * submitting — most useful on Login and Signup forms.
 *
 * Drop-in replacement for `Input` wherever a password is collected: same
 * props, same ref forwarding, just without a `type` prop to set.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          className={cn("pr-10", className)}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 hover:text-zinc-600 focus-visible:outline-none focus-visible:text-zinc-600"
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
