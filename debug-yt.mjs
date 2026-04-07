import fetch from 'node-fetch';
import fs from 'fs';

async function debugTranscript() {
    const videoId = 'guBolgZ3tws';
    const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        }
    });
    const text = await resp.text();
    const regex = /ytInitialPlayerResponse\s*=\s*({.+?});/s;
    const match = text.match(regex);
    if (!match) {
        console.error("Could not find ytInitialPlayerResponse");
        return;
    }
    const data = JSON.parse(match[1]);
    console.log("Captions available:", !!data.captions);
    if (data.captions) {
        console.log("Caption tracklist:", JSON.stringify(data.captions.playerCaptionsTracklistRenderer.captionTracks, null, 2));
    } else {
        console.log("No captions in playerResponse");
        // Check for other versions
        fs.writeFileSync('debug_yt_page.html', text);
    }
}

debugTranscript().catch(console.error);
