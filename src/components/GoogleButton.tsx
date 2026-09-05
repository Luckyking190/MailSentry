import { signInWithGoogle } from "@/server/actions/auth";
import { Icon } from "@/components/Icon";

/** Google's official four-colour mark — required by their branding rules. */
const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
);

export function GoogleButton({
  label = "Sign in with Google",
  action = signInWithGoogle,
  variant = "primary",
}: {
  label?: string;
  action?: () => Promise<void>;
  variant?: "primary" | "secondary";
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={
          variant === "primary"
            ? "group relative flex w-full cursor-pointer items-center justify-center gap-space-md rounded-lg bg-surface-highest px-space-lg py-space-md shadow-lg transition-all duration-200 hover:bg-surface-container active:scale-[0.99]"
            : "group relative flex w-full cursor-pointer items-center justify-center gap-space-sm rounded-lg bg-surface-container px-space-lg py-space-sm transition-all duration-200 hover:bg-surface-high active:scale-[0.99]"
        }
      >
        <span
          className={
            variant === "primary"
              ? "flex size-7 items-center justify-center rounded-full bg-surface-lowest p-1 shadow-sm transition-transform group-hover:scale-105"
              : "flex size-5 items-center justify-center rounded-full bg-surface-lowest p-0.5"
          }
        >
          <GoogleLogo />
        </span>
        <span
          className={
            variant === "primary"
              ? "t-headline-sm font-semibold text-primary"
              : "t-mono-md text-on-surface-variant"
          }
        >
          {label}
        </span>
        {variant === "primary" && (
          <Icon
            name="arrow_forward"
            className="ml-space-xs text-[20px] text-on-surface-variant transition-transform group-hover:translate-x-1"
          />
        )}
      </button>
    </form>
  );
}
