# SIH26106 — Problem Statement & Requirements

> Original hackathon brief. Restored verbatim after a filesystem name-collision during scaffolding.

You are an app developer expert.

This is a Smart India Hackathon project for the problem statement **SIH26106 — AI-powered email
threat detection, geolocation, and forensic intelligence platform**.

## Engine requirements

The engine should:

- Detect phishing emails
- Detect spoofed or impersonated senders
- Identify malicious URLs and attachments
- Recognize social engineering attempts
- Detect Business Email Compromise (BEC)
- Assign a fraud/risk score
- Explain why the email was flagged

## How the system detects phishing emails

### 1. NLP-based email content analysis

Natural Language Processing analyzes the subject, body, and writing style instead of relying only on
technical indicators.

**Subject should be examined**, e.g.:
- Urgent
- Immediate Action Required
- Verify Your Account
- Payment Failed
- Security Alert
- Final Notice

**Body analysis:**
- Grammar quality
- Sentence structure
- Emotional manipulation
- Request for confidential information
- Threats
- Rewards

### 2. Impersonation detection

Attackers often pretend to be trusted organizations.

Detection methods: compare sender name with sender domain, compare reply-to address, brand logo
mismatch, domain similarity.

Example — Display Name: `Microsoft Support`, Email: `support@m1crosoft-security.com` → Flag: possible
impersonation.

### 3. Spoofed sender detection

Detects forged email identities. Checks include SPF validation — if an email claims to come from
`support@gmail.com`, SPF checks whether the sending mail server is actually permitted by `gmail.com`
to send emails.

**Role of SPF in SIH26106** — in the Email Threat Detection Engine:
1. Extract the sender's domain from the From address.
2. Retrieve the domain's SPF record from DNS.
3. Extract the sender's IP address from the email headers (typically the earliest trusted `Received:`
   header).
4. Compare the sending IP with the authorized IPs listed in the SPF record.
5. Record the validation result and incorporate it into the overall risk score.

### 4. Suspicious URL detection

Extract every URL. Analyze:
- HTTPS usage
- Domain age
- URL length
- Redirect chain
- Shortened URLs

### 5. Attachment analysis

Extract attachments. Some file types are more likely to contain malware. High-risk extensions:
`.exe`, `.bat`, `.cmd`, `.js`, `.vbs`, `.scr`, `.ps1`.

### 6. Business Email Compromise (BEC) detection

BEC emails often contain no malware or links, relying instead on convincing language. Detect patterns
such as:
- Payment diversion
- Fake invoices
- CEO fraud
- Payroll changes
- Vendor fraud
- Gift card requests

## UI pages / implementation steps

1. **Login with Gmail** — app name, app description in one line, login button.
2. **Loading screen (foreground)** — once mail is logged in, move to the loading screen. Train the
   model to sift through all the mails and check as many of the domains as possible for legitimacy
   (background).
3. **Homepage** — shows summary; filters mails based on their contents, body, domain, check patterns
   and time.
4. **Mail page** — each domain's mail with analysis is separated into blocks; geolocation of each
   mail according to the problem statement.
5. **In-app settings page.**

## Deployment

- Deploy the backend on Vercel.
- Use Google OAuth for access to emails (read/review).
