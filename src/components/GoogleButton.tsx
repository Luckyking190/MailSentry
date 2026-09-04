import { signInWithGoogle } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
    <path
      fill="currentColor"
      d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.15.8 3.87 1.49l2.64-2.55C17.2 6.9 14.86 5.9 12 5.9 6.94 5.9 2.9 9.96 2.9 15S6.94 24.1 12 24.1c5.9 0 9.8-4.14 9.8-9.98 0-.67-.07-1.18-.16-1.69H12Z"
      transform="translate(0 -3)"
    />
  </svg>
);

export function GoogleButton({
  label = "Continue with Google",
  action = signInWithGoogle,
  variant = "primary",
}: {
  label?: string;
  action?: () => Promise<void>;
  variant?: ButtonProps["variant"];
}) {
  return (
    <form action={action}>
      <Button type="submit" size="lg" variant={variant} className="w-full">
        <GoogleLogo />
        {label}
      </Button>
    </form>
  );
}
