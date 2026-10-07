import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FIXTURES,
  client,
  rawRequest,
  startService,
  stopAll,
  tempDir,
  type Service,
} from "./helpers.ts";

afterEach(stopAll);

/** A minimal built UI: index.html with the desktop base href, and a script. */
function webRoot() {
  const dir = tempDir("web");
  fs.writeFileSync(
    path.join(dir, "index.html"),
    '<!doctype html><html><head><base href="./"></head><body><app-root></app-root><script src="main.js"></script></body></html>'
  );
  fs.writeFileSync(path.join(dir, "main.js"), "console.log('ui');");
  return dir;
}

async function browserService(extra: string[] = []) {
  const svc = await startService(tempDir("session"), [
    "--web-root",
    webRoot(),
    ...extra,
  ]);
  return svc;
}

const own = (svc: Service) => `http://127.0.0.1:${svc.port}`;

async function launchCode(svc: Service) {
  const res = await fetch(`${svc.url}/v1/session/launch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${svc.token}` },
  });
  assert.equal(res.status, 201);
  const { url } = (await res.json()) as any;
  assert.match(url, new RegExp(`^${own(svc)}/#launch=[A-Za-z0-9_-]{43}$`));
  return url.split("#launch=")[1];
}

async function startSession(svc: Service) {
  const code = await launchCode(svc);
  const res = await rawRequest(svc, {
    method: "POST",
    path: "/v1/session",
    headers: { Origin: own(svc), "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(res.status, 201, res.body);
  const cookie = String(res.headers["set-cookie"]).split(";")[0];
  return {
    code,
    cookie,
    csrf: JSON.parse(res.body).csrfToken as string,
    setCookie: String(res.headers["set-cookie"]),
  };
}

test("the service serves the UI only with --web-root, inside the web root", async () => {
  const plain = await startService(tempDir("noweb"));
  assert.equal((await rawRequest(plain, { path: "/" })).status, 404);
  assert.equal(
    (
      await rawRequest(plain, {
        method: "POST",
        path: "/v1/session/launch",
        headers: { Authorization: `Bearer ${plain.token}` },
      })
    ).status,
    404
  );

  const svc = await browserService();
  const index = await rawRequest(svc, { path: "/" });
  assert.equal(index.status, 200);
  assert.match(index.body, /<base href="\/">/);
  assert.match(
    String(index.headers["content-security-policy"]),
    /default-src 'self'; script-src 'self'/
  );
  assert.match(
    String(index.headers["content-security-policy"]),
    /frame-ancestors 'none'/
  );
  assert.equal(index.headers["x-frame-options"], "DENY");

  // Client routes return index.html; files are served with their type
  assert.match(
    (await rawRequest(svc, { path: "/app/inbox/123" })).body,
    /<app-root>/
  );
  const js = await rawRequest(svc, { path: "/main.js" });
  assert.equal(js.headers["content-type"], "text/javascript; charset=utf-8");

  // Nothing outside the web root
  for (const p of [
    "/%2e%2e/library.sqlite",
    "/..%2Flibrary.sqlite",
    "/missing.js",
  ]) {
    const res = await rawRequest(svc, { path: p });
    assert.ok([400, 404].includes(res.status), `${p} -> ${res.status}`);
    assert.ok(!res.body.includes("SQLite format"));
  }
});

test("a launch code is single use, needs the bearer token, and expires", async () => {
  const svc = await browserService(["--launch-code-minutes", "0.005"]);
  assert.equal(
    (await rawRequest(svc, { method: "POST", path: "/v1/session/launch" }))
      .status,
    401
  );

  const { code, setCookie, csrf } = await startSession(svc);
  assert.match(
    setCookie,
    new RegExp(
      `^kc_session_${svc.port}=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=/$`
    )
  );
  assert.match(csrf, /^[A-Za-z0-9_-]{43}$/);

  const reuse = await rawRequest(svc, {
    method: "POST",
    path: "/v1/session",
    headers: { Origin: own(svc), "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(reuse.status, 401);

  // The exchange must come from the service's own page
  for (const origin of [
    undefined,
    "https://evil.example",
    `http://127.0.0.1:${svc.port + 1}`,
  ]) {
    const fresh = await launchCode(svc);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (origin) headers.Origin = origin;
    const res = await rawRequest(svc, {
      method: "POST",
      path: "/v1/session",
      headers,
      body: JSON.stringify({ code: fresh }),
    });
    assert.equal(res.status, 403, `origin ${origin}`);
  }

  const late = await launchCode(svc);
  await new Promise((r) => setTimeout(r, 600));
  const expired = await rawRequest(svc, {
    method: "POST",
    path: "/v1/session",
    headers: { Origin: own(svc), "Content-Type": "application/json" },
    body: JSON.stringify({ code: late }),
  });
  assert.equal(expired.status, 401);
});

test("session requests need same-origin fetches, and writes need CSRF token and Origin", async () => {
  const svc = await browserService();
  const { cookie, csrf } = await startSession(svc);
  const body = JSON.stringify({
    name: "From browser",
    parentId: null,
    data: {},
  });
  const put = (headers: Record<string, string>) =>
    rawRequest(svc, {
      method: "PUT",
      path: "/v1/projects/p1",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    });

  // No credentials, or another port's cookie
  assert.equal((await rawRequest(svc, { path: "/v1/projects" })).status, 401);
  const otherPortCookie = cookie.replace(
    `kc_session_${svc.port}`,
    `kc_session_${svc.port + 1}`
  );
  assert.equal(
    (
      await rawRequest(svc, {
        path: "/v1/projects",
        headers: { Cookie: otherPortCookie },
      })
    ).status,
    401
  );

  // Reads from the own page work; reads started by other sites do not
  assert.equal(
    (
      await rawRequest(svc, {
        path: "/v1/projects",
        headers: { Cookie: cookie, "Sec-Fetch-Site": "same-origin" },
      })
    ).status,
    200
  );
  for (const site of ["cross-site", "same-site"]) {
    assert.equal(
      (
        await rawRequest(svc, {
          path: "/v1/projects",
          headers: { Cookie: cookie, "Sec-Fetch-Site": site },
        })
      ).status,
      403,
      site
    );
  }

  // Writes
  assert.equal((await put({ Origin: own(svc) })).status, 403, "no CSRF token");
  assert.equal(
    (await put({ "X-Knowledge-CSRF": csrf })).status,
    403,
    "no Origin"
  );
  assert.equal(
    (await put({ "X-Knowledge-CSRF": csrf, Origin: "https://evil.example" }))
      .status,
    403,
    "other Origin"
  );
  assert.equal(
    (await put({ "X-Knowledge-CSRF": "x".repeat(43), Origin: own(svc) }))
      .status,
    403,
    "wrong CSRF token"
  );
  assert.equal(
    (await put({ "X-Knowledge-CSRF": csrf, Origin: own(svc) })).status,
    201
  );

  // The page gets its CSRF token again after a reload
  const again = await rawRequest(svc, {
    path: "/v1/session",
    headers: { Cookie: cookie },
  });
  assert.equal(JSON.parse(again.body).csrfToken, csrf);

  // Logout ends the session
  const logout = await rawRequest(svc, {
    method: "DELETE",
    path: "/v1/session",
    headers: { Cookie: cookie, Origin: own(svc), "X-Knowledge-CSRF": csrf },
  });
  assert.equal(logout.status, 204);
  assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/);
  assert.equal(
    (
      await rawRequest(svc, {
        path: "/v1/projects",
        headers: { Cookie: cookie },
      })
    ).status,
    401
  );

  // Bearer clients are unchanged
  assert.equal((await client(svc).get("/v1/projects")).status, 200);
});

test("sessions end after the idle time and the maximum age", async () => {
  const idle = await browserService(["--session-idle-minutes", "0.005"]);
  const a = await startSession(idle);
  assert.equal(
    (
      await rawRequest(idle, {
        path: "/v1/projects",
        headers: { Cookie: a.cookie },
      })
    ).status,
    200
  );
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(
    (
      await rawRequest(idle, {
        path: "/v1/projects",
        headers: { Cookie: a.cookie },
      })
    ).status,
    401
  );

  const max = await browserService(["--session-max-hours", "0.0001"]);
  const b = await startSession(max);
  for (let i = 0; i < 4; i++) {
    assert.equal(
      (
        await rawRequest(max, {
          path: "/v1/projects",
          headers: { Cookie: b.cookie },
        })
      ).status,
      200
    );
    await new Promise((r) => setTimeout(r, 50));
  }
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(
    (
      await rawRequest(max, {
        path: "/v1/projects",
        headers: { Cookie: b.cookie },
      })
    ).status,
    401
  );
});

test("sessions end when the service restarts", async () => {
  const dataDir = tempDir("restart");
  const root = webRoot();
  const first = await startService(dataDir, ["--web-root", root]);
  const { cookie } = await startSession(first);
  await first.stop();
  const second = await startService(dataDir, ["--web-root", root]);
  const res = await rawRequest(second, {
    path: "/v1/projects",
    headers: { Cookie: cookie.replace(`_${first.port}`, `_${second.port}`) },
  });
  assert.equal(res.status, 401);
});

test("managed files cannot run as the application; filenames are kept", async () => {
  const svc = await browserService();
  const api = client(svc);
  const html = path.join(tempDir("html"), "page.html");
  fs.writeFileSync(html, "<script>fetch('/v1/projects')</script>");
  const svg = path.join(tempDir("svg"), "pic.svg");
  fs.writeFileSync(
    svg,
    "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
  );

  const cases = [
    {
      file: html,
      type: "text/html",
      disposition: /^attachment/,
      contentType: "application/octet-stream",
      csp: true,
    },
    {
      file: svg,
      type: "image/svg+xml",
      disposition: /^attachment/,
      contentType: "application/octet-stream",
      csp: true,
    },
    {
      file: path.join(FIXTURES, "recovery-note.txt"),
      type: "text/markdown",
      disposition: /^inline/,
      contentType: "text/plain; charset=utf-8",
      csp: true,
    },
    {
      file: path.join(FIXTURES, "recovery-fixture.pdf"),
      type: "application/pdf",
      disposition: /^inline/,
      contentType: "application/pdf",
      csp: false,
    },
  ];
  for (const c of cases) {
    const asset = (await api.upload(c.file, path.basename(c.file), c.type)).body
      .asset;
    const res = await rawRequest(svc, {
      path: `/v1/assets/${asset.id}/content/${encodeURIComponent(
        asset.filename
      )}`,
      headers: { Authorization: `Bearer ${svc.token}` },
    });
    assert.equal(res.status, 200, c.type);
    assert.match(
      String(res.headers["content-disposition"]),
      c.disposition,
      c.type
    );
    assert.match(
      String(res.headers["content-disposition"]),
      new RegExp(encodeURIComponent(asset.filename).replace(/\./g, "\\."))
    );
    assert.equal(res.headers["content-type"], c.contentType, c.type);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(
      String(res.headers["content-security-policy"] ?? "").startsWith("sandbox"),
      c.csp,
      c.type
    );
  }
});
