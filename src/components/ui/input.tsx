import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input component props — extends standard HTML input attributes.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Reusable Input component with shadcn/ui styling.
 * Supports all standard HTML input attributes (type, placeholder, value, etc.).
 * The focus ring and border colors use CSS variables defined in globals.css,
 * so they automatically reflect the active shadcn/ui theme.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
