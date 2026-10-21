# iPhone → watch: the Shortcut

The "companion app" is an iOS Shortcut — free, built-in, no app to install.

## Create it

1. Open **Shortcuts** → **+** → name it "Send to Watch".
2. Add actions in this order:

   **Option A — share a pin from Apple Maps**
   - Turn on "Show in Share Sheet" (accept *Locations* / *URLs* / *Text*).
   - Action: **Get Details of Locations** → *Latitude* from `Shortcut Input`…
     simpler alternative below.

   **Easiest universal version (works from share sheet *and* manual run):**
   - Action: **Ask for Input** (Text) → prompt "Destination or lat,lon".
     When run from a share sheet, skip this and use Shortcut Input instead —
     or just run it manually and type/paste.
   - Action: **Text** containing:
     ```json
     {"code":"PAIR_CODE","query":"[Ask for Input]"}
     ```
   - Action: **Get Contents of URL**
     - URL: `https://YOUR-RELAY/route`
     - Method: POST
     - Headers: `Content-Type` = `application/json`
     - Request Body: JSON → add the fields directly:
       - `code` (Text) = your 6-digit code
       - `query` (Text) = the input text
   - (Shortcut "Request Body → JSON" is cleaner than the Text action.)

3. Done. Run it from the share sheet in Apple Maps (Share → Send to Watch) or
   from the Shortcuts app/widget/Siri: "Hey Siri, Send to Watch".

## Sending coordinates directly (more precise)

If the share sheet gives you a location, use Request Body JSON with
`lat` (Number) and `lon` (Number) from **Get Details of Locations** on the
Shortcut Input, plus `name` (Text).

## Testing without a watch

```bash
curl -X POST https://YOUR-RELAY/route \
  -H 'Content-Type: application/json' \
  -d '{"code":"123456","query":"Connaught Place, New Delhi"}'
curl 'https://YOUR-RELAY/route?code=123456'
```
