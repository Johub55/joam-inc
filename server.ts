import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  /**
   * Server-Side Robust TTS Proxy:
   * Solves all browser CORS, iframe sandboxing, Opera adblocker & 403 hotlinking issues.
   * Delivers pure, reliable Google Translate Dutch TTS audio stream directly from the same origin (/api/tts).
   */
  app.get("/api/tts", async (req, res) => {
    try {
      const text = typeof req.query.text === 'string' ? req.query.text.trim() : '';

      if (!text) {
        return res.status(400).json({ error: "Text parameter is required" });
      }

      // Google Translate Natural Dutch Audio Stream - 100% Free, Reliable, No API Key Required
      const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=nl&client=tw-ob&q=${encodeURIComponent(text)}`;
      const googleResponse = await fetch(googleUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/"
        }
      });

      if (googleResponse.ok) {
        const buffer = await googleResponse.arrayBuffer();
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", buffer.byteLength);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(Buffer.from(buffer));
      }

      return res.status(502).json({ error: "Google TTS upstream service unreachable" });
    } catch (err: any) {
      console.error("TTS Server Error:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  /**
   * Server-Side Custom TTS Proxy:
   * Proxies custom third-party TTS audio requests through the backend.
   * Completely bypasses CORS restrictions and Opera adblockers on Linux/Windows.
   */
  app.get("/api/custom-tts", async (req, res) => {
    try {
      const customUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      if (!customUrl) {
        return res.status(400).json({ error: "URL parameter is required" });
      }

      const upstreamResponse = await fetch(customUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (upstreamResponse.ok) {
        const contentType = upstreamResponse.headers.get("content-type") || "audio/mpeg";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        const buffer = await upstreamResponse.arrayBuffer();
        return res.send(Buffer.from(buffer));
      }

      console.warn(`Custom TTS upstream returned error code ${upstreamResponse.status} for URL: ${customUrl}`);
      return res.status(upstreamResponse.status).send(`Upstream server returned error ${upstreamResponse.status}`);
    } catch (err: any) {
      console.error("Custom TTS Server Error:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });


  // In-memory state
  let linkModeUsername: string | null = null;
  let payModeActive: boolean = false;

  // Middleware voor debuggen van hardware API verzoeken
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/hardware/')) {
      console.log(`[Hardware API] Request: ${req.method} ${req.url}`);
    }
    next();
  });

  // Hardware routes - EXPLICIT PUBLIC en ZONDER REDIRECTS
  app.post("/api/hardware/set-link-mode", (req, res) => {
    linkModeUsername = req.body.username;
    res.json({ status: "ok", mode: "LINK", username: linkModeUsername });
  });

  app.post("/api/hardware/set-pay-mode", (req, res) => {
    payModeActive = true;
    res.json({ status: "ok", mode: "PAY" });
  });

  app.get("/api/hardware/status", (req, res) => {
    if (linkModeUsername) {
      res.json({ status: "LINK", username: linkModeUsername });
      linkModeUsername = null; // Consume
    } else if (payModeActive) {
      res.json({ status: "PAY" });
      payModeActive = false; // Consume
    } else {
      res.json({ status: "IDLE" });
    }
  });

  app.post("/api/hardware/link-card", async (req, res) => {
    const { username, uid } = req.body;
    try {
      const { db } = await import('./src/services/firebase');
      const { collection, query, where, getDocs, updateDoc, doc, arrayUnion, addDoc } = await import('firebase/firestore');
      
      const q = query(collection(db, 'bank_accounts'), where('username', '==', username));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'bank_accounts', userDoc.id), { 
            card_uids: arrayUnion(uid) 
        });
        
        // Log in Firebase
        await addDoc(collection(db, 'pos_audit_logs'), {
            action: 'NFC_LINK_SUCCESS',
            user_name: username,
            details: `Pas ${uid} gekoppeld`,
            timestamp: new Date().toISOString()
        });
        
        res.json({ status: "ok", message: `Pas ${uid} toegevoegd aan ${username}` });
      } else {
        await addDoc(collection(db, 'pos_audit_logs'), {
            action: 'NFC_LINK_FAIL',
            user_name: username,
            details: `Gebruiker niet gevonden voor UID ${uid}`,
            timestamp: new Date().toISOString()
        });
        res.status(404).json({ status: "fail", message: "Gebruiker niet gevonden" });
      }
    } catch (e: any) {
      res.status(500).json({ status: "fail", message: e.message });
    }
  });
  
  app.post("/api/hardware/verify-payment", async (req, res) => {
    const { uid, pin } = req.body;
    try {
      const { db } = await import('./src/services/firebase');
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      
      // Zoek naar bank_account waarbij card_uids (array) de uid bevat
      const q = query(collection(db, 'bank_accounts'), where('card_uids', 'array-contains', uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0].data();
        if (userDoc.pin_code === pin) {
          res.json({ status: "ok", message: "Betaling geautoriseerd" });
        } else {
          res.status(401).json({ status: "fail", message: "Onjuiste PIN" });
        }
      } else {
        res.status(404).json({ status: "fail", message: "Kaart niet herkend" });
      }
    } catch (e) {
      res.status(500).json({ status: "fail", message: "Server fout" });
    }
  });
  
  // Vite middleware for development (runs live unless SERVE_DIST=true)
  if (process.env.SERVE_DIST !== "true") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
