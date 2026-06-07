/** Deterministic initials + gradient for avatar chips (athletes, experts). */

const GRADIENTS = [
  "linear-gradient(135deg, #67E8F9, #2563EB)",
  "linear-gradient(135deg, #B6F569, #92D050)",
  "linear-gradient(135deg, #FCD34D, #F59E0B)",
  "linear-gradient(135deg, #F472A6, #DB2777)",
  "linear-gradient(135deg, #C8D1DD, #8B96A6)",
  "linear-gradient(135deg, #A78BFA, #7C3AED)",
];

export function initials(name: string): string {
  const parts = name
    .replace(/^(Prof\.?|Dr\.?|A\/Prof\.?)\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}
