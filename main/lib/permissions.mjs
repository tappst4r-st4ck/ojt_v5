const headTrainerRoles = new Set(["head trainer", "head trainer admin"]);

export function isHeadTrainerRole(role) {
  return headTrainerRoles.has(String(role ?? "").trim().toLowerCase());
}
