# Kaak Charger Status

Run locally from this directory:

```powershell
& "C:\Web\php-7.4.33-Win32-vc15-x64\php.exe" -d extension_dir="C:\Web\php-7.4.33-Win32-vc15-x64\ext" -d extension=php_openssl.dll -S localhost:8000
```

Open http://localhost:8000. The OpenSSL setting enables HTTPS requests to the charger API with the bundled PHP installation.

## Marker positions

Edit `config.json` to position markers on `static/img/map.png`. Each key is a charger `qr_code` returned by the API. `x` is the percentage from the left edge, and `y` is the percentage from the top edge. Both must be between 0 and 100.

```json
{
  "markers": {
    "18B03383": { "x": 36, "y": 52 }
  }
}
```

Add another entry for each new charger. Reload the page to see changes. Chargers without a configured position still appear in the list.

While the page is open, it requests cached charger data and refresh limits every 60 seconds. Failed GET requests are retried after 10 seconds. Only the Live refresh button sends a POST request that consumes the API's limited live-refresh quota.

## Coordinate helper

Open http://localhost:8000/?coordinates=1 and open your browser's developer console (usually F12). Click a parking space on the map. The console prints a ready-to-copy `{"x": ..., "y": ...}` value for `config.json`. It also works on the cropped mobile map because it measures the displayed image. Open the normal URL to turn the helper off.

## Toast preview

The preview is currently commented out in `static/js/app.js`. Uncomment the marked Toast preview block to enable it again.

Open http://localhost:8000/?toast-test=1 to show a Test toast button in the footer. Each click cycles through a success notification, an error notification, and a charger status change. Success and error notifications expire after 10 seconds; status changes expire after 30 minutes with a countdown bar. These examples only display notifications. Open the normal URL to hide the button.
