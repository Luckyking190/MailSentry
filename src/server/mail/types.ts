export type ParsedAttachment = {
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  extension: string | null;
};

export type ExtractedUrl = {
  rawUrl: string;
  host: string | null;
  scheme: string | null;
  /** Visible anchor text, when the URL came from an HTML <a href>. */
  anchorText: string | null;
};

export type ParsedEmail = {
  messageIdHdr: string | null;
  fromAddress: string;
  fromDisplay: string | null;
  senderDomain: string;
  replyTo: string | null;
  returnPath: string | null;
  toAddresses: string[];
  subject: string;
  sentAt: Date | null;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  /** Lower-cased header name -> raw value(s), joined with "\n" when repeated. */
  headers: Record<string, string>;
  /** The full Received: header chain, newest-first (as they appear in the message). */
  receivedChain: string[];
  authenticationResults: string | null;
  attachments: ParsedAttachment[];
  urls: ExtractedUrl[];
  hasAttachments: boolean;
};
