# Pinterest Video Downloader — full-stack starter

This project includes a responsive HTML frontend and a Node.js API backend that invokes `yt-dlp` for public Pinterest Pin URLs. It is a self-hosted starter, not a guarantee that every Pin can be downloaded. Pinterest may change its delivery system, and some Pins may be unavailable or restricted.

## Requirements
- Node.js 18+
- Python 3 and `yt-dlp` installed on the server
- For best compatibility, `ffmpeg` installed as well

## Run locally
1. Install Node.js and Python.
2. Install `yt-dlp` and `ffmpeg`:
   - `python -m pip install -U yt-dlp`
   - Install ffmpeg using your operating system's package manager.
3. In this folder run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Deploy with Docker
Build and run:
```sh
docker build -t pinterest-video-downloader .
docker run --rm -p 3000:3000 pinterest-video-downloader
```
Deploy the container to a server/container host that allows outbound requests and long-lived streamed responses. Keep `yt-dlp` updated.

## API
- `GET /api/health` — health check
- `POST /api/info` JSON body `{"url":"https://www.pinterest.com/pin/..."}` — checks metadata
- `GET /api/download?url=<encoded-Pinterest-Pin-URL>` — streams a downloadable video if supported

## Blogger integration
Blogger is static hosting; it cannot run this Node.js backend itself. Deploy this project to a separate backend host first. Then either:
- link from Blogger to the hosted downloader page, or
- embed the frontend in a Blogger page and change the frontend API calls from relative paths (`/api/info`, `/api/download`) to your backend's full HTTPS URL. If embedding on a different domain, configure a narrow CORS allowlist in the backend and update Content Security Policy accordingly; do not use `Access-Control-Allow-Origin: *` for a public production service.

## Production checklist
- Add your own domain and HTTPS.
- Add stronger per-IP and per-user quotas if making it public.
- Monitor CPU, bandwidth and memory usage; downloads can be expensive.
- Consider queueing and a maximum video size/duration.
- Do not add a login-cookie bypass or download private content.
- Download only videos you own or have permission to save; follow applicable laws, creator rights, and Pinterest's terms.

## Limitations
No third-party extractor can guarantee compatibility. A failed download may mean Pinterest changed its page, the Pin is private/restricted, the video is unavailable, or the server cannot reach the source. This project does not include a commercial API key or a managed hosting service.
