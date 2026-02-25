export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. የባክኤንድ ክፍል (API Logic)
    if (url.pathname === "/api/download" && request.method === "POST") {
      const { videoUrl } = await request.json();

      try {
        // Cobalt API በመጠቀም ዳውንሎድ ሊንክ ማመንጨት
        const response = await fetch("https://api.cobalt.tools/api/json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            url: videoUrl,
            vQuality: "720",
          }),
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ status: "error", message: "Error fetching video" }), { status: 500 });
      }
    }

    // 2. የፍሮንትኤንድ ክፍል (HTML/UI)
    const html = `
    <!DOCTYPE html>
    <html lang="am">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CloudDownloader - YT</title>
        <style>
            body { font-family: sans-serif; background: #0f0f0f; color: white; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
            .container { background: #222; padding: 30px; border-radius: 15px; width: 90%; max-width: 400px; text-align: center; border: 1px solid #333; }
            h2 { color: #ff0000; }
            input { width: 100%; padding: 12px; margin: 15px 0; border-radius: 8px; border: none; box-sizing: border-box; }
            button { width: 100%; padding: 12px; background: #ff0000; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
            #status { margin-top: 20px; word-break: break-all; }
            .dl-link { display: inline-block; margin-top: 15px; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; }
            .loader { border: 3px solid #333; border-top: 3px solid #ff0000; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; display: inline-block; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>YT Downloader</h2>
            <p style="font-size: 13px; color: #aaa;">በ Cloudflare Worker የሚሰራ</p>
            <input type="text" id="vUrl" placeholder="የዩቲዩብ ሊንክ እዚህ ይለጥፉ...">
            <button onclick="downloadVideo()" id="btn">ሊንኩን አዘጋጅ</button>
            <div id="status"></div>
        </div>

        <script>
            async function downloadVideo() {
                const videoUrl = document.getElementById('vUrl').value;
                const status = document.getElementById('status');
                const btn = document.getElementById('btn');

                if(!videoUrl) return alert("ሊንክ ያስገቡ!");

                status.innerHTML = '<div class="loader"></div> በመፈለግ ላይ...';
                btn.disabled = true;

                try {
                    const res = await fetch('/api/download', {
                        method: 'POST',
                        body: JSON.stringify({ videoUrl })
                    });
                    const data = await res.json();

                    if(data.url) {
                        status.innerHTML = '✅ ዝግጁ ነው!<br><br><a href="' + data.url + '" class="dl-link" target="_blank">አሁን አውርድ (Download)</a>';
                    } else {
                        status.innerHTML = '❌ ስህተት ተፈጥሯል። እባክዎ ሊንኩን ያረጋግጡ።';
                    }
                } catch (e) {
                    status.innerHTML = '❌ ሰርቨሩ ምላሽ አልሰጠም።';
                }
                btn.disabled = false;
            }
        </script>
    </body>
    </html>
    `;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  },
};
