# Packaging & installing the .tpk on Galaxy Watch 3

Galaxy Watch 3 runs Tizen 5.5 (wearable). Installing third-party packages
requires Tizen Studio CLI and free Samsung certificates.

## One-time setup (on a Windows/Mac/Linux PC)

1. Install **Tizen Studio** (with the wearable package) —
   https://developer.tizen.org/development/tizen-studio/download
   Or just the CLI: the `tizen-studio` installer includes `tizen` CLI tools.

2. **Watch prep**
   - Watch → Settings → About watch → Software → tap **Software version** 5×
     → *Developer mode ON*.
   - Watch → Settings → Connections → Bluetooth off, **Wi-Fi ON** (same network
     as PC, or note the watch IP under Wi-Fi → network).
   - Settings → About watch → **Debugging ON** (Developer options).

3. **Connect**
   ```bash
   sdb connect <WATCH_IP>:26101
   sdb devices        # should list the watch
   ```

4. **Certificates** (free, one-time)
   - GUI: Tizen Studio → Tools → Certificate Manager → create **Samsung
     Certificate** (author + distributor), sign in with your Samsung account.
     When it asks for the DUID, it's auto-filled if the watch is connected
     (`sdb capability` shows it).
   - Apply the profile: Certificate Manager → set the profile active.

## Build the package

```bash
cd watch-app
# edit js/config.js first: RELAY_URL + PAIR_CODE

tizen package -t wgt -s <your-cert-profile> -- .
# produces watchnav.wgt  (Tizen web apps package as .wgt; watches also accept .tpk for native)
```

CLI equivalent if using the raw toolchain:
```bash
tizen build-web -- .
tizen package -t wgt -s <profile> -- .buildResult
```

## Install

```bash
tizen install -n watchnav.wgt -t <device-name-from-sdb-devices>
# or
sdb install watchnav.wgt
```

Then find **WatchNav** in the watch app list.

## In-app settings (no repackaging needed)

Menu (☰) → Pairing code → enter the 6-digit code on the numpad, and Relay URL
if you didn't bake it into `config.js`.

## Troubleshooting

- `sdb connect` fails → same Wi-Fi, debugging on, try port 26101.
- Install fails with cert error → distributor cert must include the watch DUID;
  re-create while connected.
- Blank map → relay URL wrong or watch has no internet (needs Wi-Fi or BT
  tethering to the phone via Galaxy Wearable).
