# Karar

Karar is a bilingual (English and Arabic) AI study companion for IT students.
It uses a React/Vite frontend and an Express backend. AI requests are made by
the server to the locally installed Ollama service; no cloud API key is needed.

## Run locally on Windows

1. Install Node.js 20 or newer.
2. Install Ollama and the models with `ollama pull llama3.2:3b`,
   `ollama pull qwen2.5:3b`, and `ollama pull nomic-embed-text`. The Qwen model
   is used for local Arabic/English translation. Copy
   `.env.example` to `.env`; the default Ollama endpoint and model are ready to
   use. No cloud API key is required.
3. Run `npm install` and `npm --prefix client install`, then double-click
   `Karar.bat` (or the compatible `start.bat` alias). The launcher checks that
   Ollama and the configured model are ready, starts Ollama only if needed,
   safely restarts Karar processes belonging to this project, provisions local
   HTTPS, and starts the app. It does not stop an already-running Ollama service
   or unrelated processes; it refuses to take over ports used by other apps.
4. Open https://localhost:5000. The development frontend listens on `0.0.0.0:5000`;
   the Express API listens only on `127.0.0.1:5001` for Vite's local proxy.
   Other devices on the same trusted Wi-Fi can use `https://YOUR_WIFI_IPV4:5000`.
   The launcher prints the IPv4 address it detects before starting Karar.
   Find it manually with `ipconfig` under the **Wi-Fi adapter's IPv4 Address**.
   Create or sign in to the local owner account; the first owner must be
   created on this PC. Supabase is not required in local-owner mode.

### Windows private-network firewall

Keep Windows Firewall enabled. For another device to connect, Windows must
classify the connected Wi-Fi as a **Private** network, and an inbound rule for
TCP port 5000 should allow only the **Private** profile and **LocalSubnet**.
The development API port (5001) stays local and is not exposed to Wi-Fi.
If Windows Firewall blocks the connection, an administrator can add a
least-privilege rule from an elevated PowerShell window:

```powershell
New-NetFirewallRule -DisplayName "Karar local Wi-Fi (TCP 5000)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5000 -Profile Private -RemoteAddress LocalSubnet
```

Do not enable this rule on the Public profile or configure router port
forwarding. If your Wi-Fi is marked Public, change its network profile to
Private only if this is a trusted home network; otherwise keep the Public
profile and do not allow inbound access on it. Firewall changes require
administrator approval.

If the key previously present in `.env.example` was ever valid, revoke it with
its provider and replace it. Only the harmless placeholder belongs in that file.

## Local owner account

Local account mode is enabled in this machine's ignored `.env` file. Start the
app with `start.bat`, then create the one owner account on the host PC at
`https://localhost:5000`. First-time setup is only allowed from that PC; the
username can be `leo`. Choose a new password of at least 12 characters. The
password is stored as a salted scrypt hash, not as plaintext. This mode does
not use email, Supabase, SMTP, or password-reset email.

To sign in from another device, first transfer
`server\certs\karar-local-root.cer` to that device using a trusted local method
and install it as a trusted root certificate. The Karar-branded HTTPS
certificate covers `localhost`, `karar.local`, and this PC's current Wi-Fi IPv4
address. After the certificate is trusted, open
`https://YOUR_WIFI_IPV4:5000` and sign in with the owner account.
Do not proceed through a browser certificate warning for account use. If the
Wi-Fi IPv4 changes, regenerate the local certificate and install the latest
`karar-local-root.cer` on the devices again. The `karar.local` certificate name
is included for clients with a local DNS/hosts entry; the Wi-Fi IP URL works
without that extra name setup.

After owner setup, anyone who can reach the trusted local Wi-Fi site can create
a separate account from the sign-in screen. New member accounts start with zero
AI tokens; they cannot request replies until the owner grants tokens in the
Admin panel. The owner account retains unlimited AI access. The admin panel
lists usernames, chat/message counts, and tokens granted/used/remaining. It
allows incremental grants of 1–1,000,000 tokens and deletion of member accounts.
It does not show member chat content. Each user's server archive and browser
copy are scoped to that account.

The Admin panel also reports saved-chat totals and can delete all server-side
conversations; this revokes member sessions so connected users must sign in
again. Browser copies on offline devices cannot be remotely erased. Change the
owner password in Settings. To reset a forgotten password, first stop Karar with
Ctrl+C in its running terminal, then run `npm.cmd run reset:local-owner` from an
interactive PowerShell in the project folder on the host PC. The reset revokes
all existing sessions but preserves conversations; restart the app with
`start.bat` afterward. Account deletion requires the current password and
deletes the local account archive.

## Local chats and privacy

Signed-in conversations are synchronized to the host PC and kept as a local
browser copy on each signed-in device. On the host, `server\data\karar-local.json`
contains an AES-256-GCM encrypted archive; the encryption key is stored in the
ignored server-side `.env` as `KARAR_DATA_KEY`. Back up the archive together
with `.env`; losing the key makes the archive unreadable. The owner can export
the archive from the admin panel. Account deletion and delete-all remove the
active archive, but separately created backups must be removed manually.

Each AI request is sent from the server to Ollama at
`OLLAMA_BASE_URL` (default `http://localhost:11434`) using
`OLLAMA_MODEL` (default `llama3.2:3b`). The server streams generated text to the
chat as it arrives, and sends the tutor instructions and recent conversation
history for context. Ollama must be running and the selected model must be
installed. `OLLAMA_TIMEOUT` sets the model request timeout in seconds (default
180). If Karar runs inside Docker while Ollama runs on Windows, set
`OLLAMA_BASE_URL=http://host.docker.internal:11434`; when both run directly on
Windows, keep the localhost default. Arabic questions are translated locally
with `OLLAMA_TRANSLATION_MODEL` (default `qwen2.5:3b`), answered using the chat
model, and translated back before any answer text is streamed to the browser.
English questions continue to use only the chat model. No cloud API key is
needed.

## Study documents and local search

Signed-in users can attach PDF, TXT, Markdown, CSV, JSON, Python, Java,
JavaScript/TypeScript, C/C++, HTML, CSS, and SQL files from the document shelf
above the chat composer. Text extraction, chunking, embeddings, and retrieval run
on the Karar host. The default embedding model is `nomic-embed-text`; install it
once with `ollama pull nomic-embed-text`. Check downloaded models with
`ollama list`. Configure another local embedding model with
`OLLAMA_EMBEDDING_MODEL`. The chat model and embedding model are separate.

The default maximum upload is 5 MiB (`KARAR_MAX_UPLOAD_BYTES`, capped at 10
MiB); each account can index up to 30 files and 25 MiB total. Karar stores the
extracted chunks, source metadata, and up to 2,000 indexed sections in
`server\data\karar-documents.json`, encrypted with AES-256-GCM using the
server-only `KARAR_DATA_KEY` (or the configured server-side `SESSION_SECRET`).
Set `KARAR_DOCUMENTS_PATH` to change the index location. Deleting a document or
its account removes the corresponding active index data. Keep backups of the
index and key together; separately created backups require separate deletion.
Chunk size and overlap default to 900 and 120 characters; tune them with
`KARAR_DOCUMENT_CHUNK_SIZE` (200 to 4,000) and
`KARAR_DOCUMENT_CHUNK_OVERLAP` (less than half the chunk size).
Documents are scoped to the authenticated account and never executed. Selected
documents are searched by similarity; answers show source filenames and page
numbers or source line ranges. The prompt treats retrieved text as untrusted
reference material and asks Karar not to follow instructions found in files.
Deleting a document also removes its saved source-reference labels from the
active account conversation archive and the current browser copy.

PDF text extraction preserves page numbers. Scanned/image-only PDFs are
reported as needing OCR; OCR and image/vision understanding are not included.
Retrieval is a lightweight cosine-similarity index, not a dedicated vector
database. No document content is sent to a hosted embedding provider by this
implementation; changing `OLLAMA_BASE_URL` to a remote endpoint changes that
privacy boundary and must be reviewed by the owner. Download both Ollama models
before disconnecting from the internet if offline use is required.

For member accounts, successful replies are charged according to Ollama's
reported prompt and completion token usage. The server reserves
enough of a member's balance before contacting Ollama and blocks requests when
the balance cannot cover the estimated prompt plus an answer. Failed requests
release the reservation. If provider-reported usage exceeds the reservation,
the excess becomes a negative balance and future grants first cover that usage.
The owner account is not quota-limited.

Local-account mode does not use `SUPABASE_URL`, Supabase keys, `APP_URL`, or
`SESSION_SECRET`. If Supabase is intentionally selected instead, its URL must
be the real project API URL (typically `https://<project-ref>.supabase.co`);
`agent.ai` is not a Supabase project URL. Service-role keys and session
secrets must remain server-only.

## Chats and privacy

Signed-in conversations are synchronized to this PC's encrypted local archive
and kept as a local browser copy on each signed-in device. The archive remains
until conversations or the owner account are deleted. Owner-created backups
must be removed separately. There is no external account database or analytics
service in local-owner mode.

The Ollama endpoint and model can be overridden in the server `.env` file:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_TRANSLATION_MODEL=qwen2.5:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_TIMEOUT=180
```

When Karar runs in Docker and Ollama runs on the Windows host, use
`OLLAMA_BASE_URL=http://host.docker.internal:11434`. Run `npm run test:ollama`
to exercise the provider integration tests, `npm run test:documents` for file
validation, extraction, indexing, retrieval, and isolation tests, or `npm test`
to run both test groups.

Each AI request is sent to the configured Ollama service to generate a
reply. The service receives the conversation included with that request. In the
default setup, Ollama runs on this PC; if the endpoint is changed, the owner
must verify the destination and its data practices. The in-app
Privacy Policy is a draft pending owner review and must be checked against the
provider's terms and the app's actual backup and deletion practices before
publication.

The in-app Privacy Policy remains a draft pending owner review. Before
publication, verify the AI provider's retention, training and regional
processing terms, backup/deletion practices, and the service's minimum-age
requirements.

## Production

Set `NODE_ENV=production`, provide the local TLS certificate and its server-side
passphrase, then run `docker compose up --build`. In local-owner mode the
production Express server serves HTTPS on `0.0.0.0:5000`; account cookies are
Secure, HTTP-only, and SameSite=Strict. Keep the firewall limited to the
Private profile and `LocalSubnet`, and do not configure router port forwarding.
