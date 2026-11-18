// The school has a single editor role: the Head Trainer.
export function isHeadTrainerRole(role) {
  return String(role ?? "").trim().toLowerCase() === "head trainer";
}
