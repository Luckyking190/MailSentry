import type { AttachmentMeta, EmailRecord, UrlMeta } from "@prisma/client";
import type { ParsedEmail } from "./types";

/**
 * Reconstruct a `ParsedEmail` from a stored `EmailRecord` (+ its UrlMeta /
 * AttachmentMeta rows) so it can be re-run through the pipeline without
 * re-fetching from Gmail — used by "re-run analysis".
 */
export function parsedEmailFromRecord(
  email: EmailRecord & { urls: UrlMeta[]; attachments: AttachmentMeta[] },
): ParsedEmail {
  const headers = (email.rawHeaders as Record<string, string>) ?? {};
  const receivedChain = headers.received ? headers.received.split("\n") : [];

  return {
    messageIdHdr: email.messageIdHdr,
    fromAddress: email.fromAddress,
    fromDisplay: email.fromDisplay,
    senderDomain: email.senderDomain,
    replyTo: email.replyTo,
    returnPath: email.returnPath,
    toAddresses: email.toAddresses,
    subject: email.subject,
    sentAt: email.sentAt,
    bodyText: email.bodyText,
    bodyHtml: email.bodyHtml,
    snippet: email.snippet,
    headers,
    receivedChain,
    authenticationResults: headers["authentication-results"] ?? null,
    attachments: email.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      extension: a.extension,
    })),
    urls: email.urls.map((u) => ({
      rawUrl: u.rawUrl,
      host: u.host,
      scheme: u.scheme,
      anchorText: u.anchorText,
    })),
    hasAttachments: email.hasAttachments,
  };
}
