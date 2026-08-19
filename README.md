# Nexus Mail Connect

NEXUS EMAIL SYSTEM — DUAL SENDING ARCHITECTURE



You are working on the Nexus project in this repository.



Repository:

https://github.com/PixelAcE45/nexus-workflow-connect.git



OBJECTIVE



Upgrade Nexus's email system so users have TWO ways to send emails:



1. NEXUS DEFAULT MAIL



Nexus's built-in email sending system.



This should work for users without requiring them to connect Gmail.



2. CONNECT GMAIL



Users can optionally connect their own Gmail account using Google OAuth.



When connected, Nexus can send emails through that user's Gmail account.



The user must be able to choose which sending method Nexus uses.



---



IMPORTANT — FIRST INSPECT THE PROJECT



Before changing anything:



1. Inspect the complete repository.

2. Identify the current email implementation.

3. Identify the current n8n integration/workflows.

4. Identify the backend/API architecture.

5. Identify the authentication system.

6. Identify the database/schema.

7. Identify any existing Gmail integration.

8. Identify the existing Nexus email UI.

9. Identify environment variables/secrets already being used.

10. Determine whether email sending currently goes through n8n, a backend API, or another provider.



Do NOT blindly rebuild the email system.



Work with the existing architecture wherever possible.



---



REQUIRED USER EXPERIENCE



Add an Email Settings section to Nexus.



It should clearly show:



Email Sending



Nexus Default



Status: Available



Description:



«Send emails through Nexus's built-in email system. No Gmail connection required.»



My Gmail



Status: Not Connected / Connected



If not connected:



[ Connect Gmail ]



If connected:



Gmail account connected



[ Disconnect ]



---



GOOGLE OAUTH



Implement Gmail connection using Google OAuth.



DO NOT ask users for:



- Gmail password

- SMTP password

- Google account password



The user should click:



Connect Gmail



Then complete Google's authorization flow.



Request only the permissions actually required for sending email.



Store OAuth credentials securely on the backend.



NEVER expose OAuth access tokens or refresh tokens to the frontend.



---



SENDING METHOD SELECTOR



Give the user a setting:



Default Email Sender



○ Nexus Default

○ My Gmail



Rules:



If Nexus Default is selected



Send through Nexus's configured email infrastructure.



If My Gmail is selected AND Gmail is connected



Send through the user's connected Gmail account.



If My Gmail is selected BUT Gmail isn't connected



Do NOT fail silently.



Show:



«"Connect your Gmail account to use Gmail as your default sender."»



Provide:



[ Connect Gmail ]



---



AUTOMATIC FALLBACK



Implement a safe fallback:



If the user has selected Gmail but their Gmail connection becomes invalid/expired/revoked:



1. Detect the failure.

2. Do NOT silently pretend the email was sent.

3. Inform the user that Gmail needs to be reconnected.

4. Offer Nexus Default as an alternative.



Do not automatically send sensitive/user-intended Gmail messages from another sender without making the user aware.



---



NEXUS AI INTEGRATION



Nexus should understand commands such as:



«"Send Rahul an email saying the meeting is tomorrow."»



Nexus should determine the user's configured sending method.



If:



Default = Nexus



→ use Nexus Default Mail.



If:



Default = Gmail



→ use the connected Gmail account.



If Gmail is unavailable:



→ tell the user that Gmail needs to be connected/reconnected.



---



N8N INTEGRATION



Inspect the existing n8n integration before modifying it.



If n8n is currently responsible for email workflows, preserve that architecture where practical.



Create a clean routing layer:



Nexus

↓

Email Sending Router

↓

├── Nexus Default Mail

│

└── User Gmail

↓

Google OAuth

↓

Gmail API / existing n8n Gmail workflow



Do not duplicate email logic unnecessarily.



---



EMAIL COMPOSER



Preserve the existing Nexus email composer if one exists.



It should support:



- Recipient

- Subject

- Message

- Send

- Sending method indicator



Example:



Sending from:

Nexus Default ▾



or



Sending from:

your connected Gmail ▾



The user should be able to override the default sender for an individual email if the existing architecture allows it.



---



DATABASE



Inspect the existing database before creating tables.



If required, create a secure structure for Gmail connections containing only the information necessary for OAuth and account association.



Associate connections with the authenticated Nexus user.



Never store Gmail passwords.



Never store sensitive OAuth credentials in frontend-accessible database fields.



---



SECURITY



This is extremely important.



Never expose:



- Gmail passwords

- OAuth refresh tokens

- OAuth access tokens

- API keys

- Email provider credentials



in:



- frontend JavaScript

- browser localStorage

- client-side environment variables

- public API responses

- GitHub source code



Use the existing secure backend/secrets architecture.



---



NEXUS DEFAULT MAIL



Do not assume which email provider should be used.



Inspect the existing project first.



If Nexus already has an email provider configured, reuse it.



If no provider exists, create the architecture so a backend email provider can be configured through secure environment variables.



Do NOT hardcode credentials.



Do NOT require every Nexus user to configure their own SMTP.



The Nexus Default system should be centrally configured by the Nexus deployment.



---



UI



Keep the existing Nexus visual identity.



Do NOT redesign the entire application.



Use the existing:



- Glassmorphism

- Typography

- Animations

- Dark/light themes

- Navigation

- Dashboard components



Only add the necessary email settings/connectivity UI.



The Gmail connection interface should feel like a native part of Nexus.



---



TESTING



After implementation, test:



TEST 1



User with no Gmail connection sends an email.



Expected:



Nexus Default Mail → email successfully sent



TEST 2



User connects Gmail.



Expected:



Google OAuth → Gmail connected



TEST 3



User selects Gmail as default.



Expected:



Nexus → user's Gmail



TEST 4



User switches back to Nexus Default.



Expected:



Nexus → Nexus Default Mail



TEST 5



Gmail connection is revoked/invalid.



Expected:



Nexus detects the problem and asks the user to reconnect.



TEST 6



Two different Nexus users connect different Gmail accounts.



Expected:



Each user's emails are sent through their own connected Gmail account.



One user's Gmail credentials must NEVER be used for another user.



---



ACCEPTANCE CRITERIA



Do not consider this complete until:



- Nexus Default Mail works.

- Gmail OAuth connection works.

- Users can connect/disconnect Gmail.

- Users can choose their default sender.

- Nexus respects that choice when sending AI-generated emails.

- Gmail passwords are never requested.

- OAuth credentials remain server-side.

- Different users have isolated Gmail connections.

- Existing n8n functionality remains intact.

- Existing Nexus UI remains intact.

- Existing authentication remains intact.

- The project builds successfully.

- Real email sending is tested for both modes.



CRITICAL



Do NOT waste credits rebuilding unrelated parts of Nexus.



Do NOT redesign Nexus.



Do NOT replace existing working integrations unnecessarily.



First inspect the repository and current email/n8n architecture, then implement the smallest reliable change that achieves the complete dual-email system..... Dont worry bro the repo is mine and I give u access perm to extract code and make the instructed changes

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8004780f-a784-4a6f-bfa0-dddd1f73ab5d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
