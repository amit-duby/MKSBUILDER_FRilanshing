const DEFAULT_TTL_MS = 60_000;
const cache = new Map();

function setAuthUser(userId, user, ttlMs = DEFAULT_TTL_MS) {
  if (!userId || !user) return;
  cache.set(String(userId), {
    expiresAt: Date.now() + ttlMs,
    user: {
      id: String(user.id || user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive !== false,
      tokenVersion: Number(user.tokenVersion) || 0,
    },
  });
}

function getAuthUser(userId, tokenVersion) {
  const entry = cache.get(String(userId));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(String(userId));
    return null;
  }
  if (Number(entry.user.tokenVersion) !== Number(tokenVersion)) {
    cache.delete(String(userId));
    return null;
  }
  if (!entry.user.isActive) {
    cache.delete(String(userId));
    return null;
  }
  return entry.user;
}

function invalidateAuthUser(userId) {
  if (userId == null) return;
  cache.delete(String(userId));
}

module.exports = {
  setAuthUser,
  getAuthUser,
  invalidateAuthUser,
  DEFAULT_TTL_MS,
};
