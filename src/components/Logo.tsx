import { cn } from "@/lib/utils";

export const APP_NAME = "MailSentry";
export const APP_TAGLINE =
  "AI-powered email threat detection, geolocation & forensic intelligence";

export function Logo({
  className,
  withText = true,
}: {
  className?: string;
  withText?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6 text-brand"
        fill="none"
        aria-hidden
      >
        <path
          d="M12 2.5 4 5.5v6c0 4.7 3.2 8.4 8 10 4.8-1.6 8-5.3 8-10v-6L12 2.5Z"
          className="fill-brand/15 stroke-brand"
          strokeWidth="1.5"
        />
        <path
          d="m8.5 12 2.5 2.5L16 9"
          className="stroke-brand"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withText && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          {APP_NAME}
        </span>
      )}
    </span>
  );
}
