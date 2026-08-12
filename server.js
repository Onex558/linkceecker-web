const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function normalizeUrl(value) {
    value = String(value || "").trim();

    if (!value) return null;

    if (!/^https?:\/\//i.test(value)) {
        value = "https://" + value;
    }

    try {
        return new URL(value).href;
    } catch {
        return null;
    }
}

async function checkLink(url) {
    const started = Date.now();

    try {
        let response;

        // HEAD is lightweight.
        try {
            response = await fetch(url, {
                method: "HEAD",
                redirect: "follow",
                signal: AbortSignal.timeout(10000)
            });
        } catch {
            // Some servers don't support HEAD.
            response = await fetch(url, {
                method: "GET",
                redirect: "follow",
                signal: AbortSignal.timeout(10000)
            });
        }

        const elapsed = Date.now() - started;

        return {
            url,
            status: response.status,
            statusText: response.statusText || "",
            ok: response.ok,
            finalUrl: response.url,
            redirected: response.redirected,
            responseTime: elapsed,
            error: null
        };

    } catch (error) {

        return {
            url,
            status: null,
            statusText: "",
            ok: false,
            finalUrl: null,
            redirected: false,
            responseTime: Date.now() - started,
            error: error.name === "TimeoutError"
                ? "Request timed out"
                : error.message || "Request failed"
        };
    }
}

app.post("/api/check", async (req, res) => {

    if (!Array.isArray(req.body.links)) {
        return res.status(400).json({
            error: "links must be an array"
        });
    }

    const links = [
        ...new Set(
            req.body.links
                .map(normalizeUrl)
                .filter(Boolean)
        )
    ];

    if (!links.length) {
        return res.status(400).json({
            error: "No valid URLs supplied"
        });
    }

    // Limit a single request so the server isn't overloaded.
    const limited = links.slice(0, 100);

    const results = [];

    // A few at a time instead of hammering every site simultaneously.
    const concurrency = 5;

    for (let i = 0; i < limited.length; i += concurrency) {

        const batch = limited.slice(i, i + concurrency);

        const checked = await Promise.all(
            batch.map(checkLink)
        );

        results.push(...checked);
    }

    res.json({
        total: results.length,
        results
    });
});

app.listen(PORT, () => {
    console.log(`Link Checker running at http://localhost:${PORT}`);
});
