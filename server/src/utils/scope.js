import { User } from "../models/User.js";

/**
 * Jurisdiction scoping for government officials.
 *
 * Two layers:
 *  1. worker-level: an official may only see workers whose current_state
 *     (and current_district, when the official is district-level) matches
 *     their own.
 *  2. grievance-level: derived from the worker set so that workers who MOVE
 *     districts take their grievance visibility with them. New grievances
 *     also denormalise owner_state/owner_district at creation, so the
 *     district the grievance was filed FROM is preserved even if the worker
 *     later moves.
 *
 * FAIL CLOSED: a non-superadmin with no state set matches NOTHING.
 *
 * How to apply (choose ONE per query, never both):
 *   const { workerFilter, grievanceFilter, workerIds } = await grievanceScopeFilter(official);
 *   - workers queries  → workerFilter
 *   - grievances query → grievanceFilter   (denormalised owner_state/district,
 *     falling back to the live worker set)
 *   - per-document authorization (detail/update/comment) → scopeWorkerIds.has(String(g.owner_id))
 *     OR verify g.owner_state/owner_district against the official's scope.
 */

function scopeParts(official) {
  if (!official) return { state: null, district: null, superadmin: false };
  const superadmin = Boolean(official.is_superadmin);
  const state = official.state ? String(official.state) : null;
  const district = official.district ? String(official.district) : null;
  return { state, district, superadmin };
}

/** Mongo filter over User (workers) for this official. Fail-closed. */
export function workerScopeFilter(official) {
  const { state, district, superadmin } = scopeParts(official);
  if (superadmin) return { role: "worker" };
  if (!state) return { role: "worker", _id: null }; // fail closed — matches nothing
  const f = { role: "worker", current_state: state };
  if (district) f.current_district = district;
  return f;
}

/**
 * Resolve the full scope for an official in one round-trip.
 * Returns workerIds as a Set of strings for per-document checks.
 */
export async function grievanceScopeFilter(official) {
  const { state, district, superadmin } = scopeParts(official);

  const workerFilter = superadmin ? { role: "worker" } : workerScopeFilter(official);
  const workers = await User.find(workerFilter).select("_id");
  const workerIds = new Set(workers.map((w) => String(w._id)));

  if (superadmin) {
    return {
      superadmin: true,
      state: null,
      district: null,
      workerFilter,
      workerIds,
      grievanceFilter: {},
    };
  }

  if (!state) {
    // Fail closed: no jurisdiction → no data, ever.
    return {
      superadmin: false,
      state: null,
      district: null,
      workerFilter,
      workerIds,
      grievanceFilter: { _id: null },
    };
  }

  // Grievances are scoped by WHERE THEY WERE FILED (denormalised at
  // creation) with a fallback to the live worker set (covers rows created
  // before denormalisation and workers who moved since filing).
  const grievanceFilter = {
    $or: [{ owner_state: state, ...(district ? { owner_district: district } : {}) }, { owner_id: { $in: [...workerIds] } }],
  };

  return { superadmin: false, state, district, workerFilter, workerIds, grievanceFilter };
}

/**
 * Per-document check: may this official see THIS grievance?
 * Prefers the denormalised fields; falls back to live worker membership.
 */
export function officialCanSeeGrievance(grievance, official, workerIds) {
  const { state, district, superadmin } = scopeParts(official);
  if (superadmin) return true;
  if (!state) return false; // fail closed
  if (grievance.owner_state) {
    if (grievance.owner_state !== state) return false;
    if (district && grievance.owner_district && grievance.owner_district !== district) return false;
    return true;
  }
  // Legacy rows without denormalisation: check the live worker set.
  return workerIds ? workerIds.has(String(grievance.owner_id)) : false;
}

/**
 * Resolve the set of worker _ids a non-superadmin may target with a
 * notification. Superadmin may target everyone; district/state officials are
 * constrained to their own jurisdiction. Returns null for "all workers"
 * (superadmin broadcast only).
 */
export async function notifiableWorkerIds(official, target, targetValue) {
  const { state, district, superadmin } = scopeParts(official);

  // Only superadmins may broadcast to everyone.
  if (target === "all") return superadmin ? null : { forbidden: true };

  // Fail CLOSED: an official with no jurisdiction may not target anyone —
  // surfaced as 403 by the route (an empty set would only mean 400/"no
  // workers", which would understate the problem). Superadmins always have
  // jurisdiction, but their occupation/state/district targets still NARROW
  // the recipient set.
  if (!superadmin && !state) return { forbidden: true };

  const filter = workerScopeFilter(official);
  if (target === "occupation") {
    if (!targetValue) return { forbidden: true };
    filter.occupation = targetValue;
  } else if (target === "state") {
    if (!targetValue) return { forbidden: true };
    if (!superadmin && targetValue !== state) return { forbidden: true }; // out of scope
    filter.current_state = targetValue;
  } else if (target === "district") {
    if (!targetValue) return { forbidden: true };
    if (superadmin) {
      filter.current_district = targetValue;
    } else if (district) {
      if (targetValue !== district) return { forbidden: true }; // out of scope
    } else {
      // State official picking a district: the district must lie INSIDE their
      // state. If any worker with that district lives in another state, the
      // district is not (entirely) theirs → 403 rather than a silent empty send.
      const outside = await User.countDocuments({
        role: "worker",
        current_district: targetValue,
        current_state: { $ne: state },
      });
      if (outside > 0) return { forbidden: true };
      filter.current_district = targetValue;
    }
  }
  const workers = await User.find(filter).select("_id");
  return new Set(workers.map((w) => String(w._id)));
}
