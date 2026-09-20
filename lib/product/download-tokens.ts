import { createHmac, timingSafeEqual } from "crypto";

const MAX_DOWNLOAD_TTL_SECONDS = 300;
const DEFAULT_DOWNLOAD_TTL_SECONDS = 120;

export type DownloadTokenScope = {
  userId: string;
  solutionId: string;
  artifactId: string;
  versionId?: string | null;
};

type DownloadTokenPayload = DownloadTokenScope & { version: 1; expiresAt: number };

export function issueDownloadToken(scope: DownloadTokenScope) {
  const ttlSeconds = Math.min(MAX_DOWNLOAD_TTL_SECONDS, Math.max(1, Number(process.env.PRODUCT_DOWNLOAD_TTL_SECONDS || DEFAULT_DOWNLOAD_TTL_SECONDS)));
  const payload: DownloadTokenPayload = { version: 1, ...scope, versionId: scope.versionId || null, expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return { token: `${encoded}.${signature}`, expiresAt: new Date(payload.expiresAt * 1000).toISOString(), ttlSeconds };
}

export function verifyDownloadToken(token: string, expected: DownloadTokenScope) {
  try {
    const [encoded, suppliedSignature, extra] = token.split(".");
    if (!encoded || !suppliedSignature || extra) return false;
    const expectedSignature = sign(encoded);
    const supplied = Buffer.from(suppliedSignature, "base64url");
    const signature = Buffer.from(expectedSignature, "base64url");
    if (supplied.length !== signature.length || !timingSafeEqual(supplied, signature)) return false;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DownloadTokenPayload;
    return payload.version === 1
      && Number.isInteger(payload.expiresAt)
      && payload.expiresAt > Math.floor(Date.now() / 1000)
      && payload.userId === expected.userId
      && payload.solutionId === expected.solutionId
      && payload.artifactId === expected.artifactId
      && (payload.versionId || null) === (expected.versionId || null);
  } catch {
    return false;
  }
}

function sign(encoded: string) {
  return createHmac("sha256", downloadSecret()).update(encoded).digest("base64url");
}

function downloadSecret() {
  const configured = process.env.PRODUCT_DOWNLOAD_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("PRODUCT_DOWNLOAD_SECRET is required in production");
  return "development-only-download-secret-change-me";
}
