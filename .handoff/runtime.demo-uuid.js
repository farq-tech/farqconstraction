'use strict';

const crypto = require('crypto');
const path = require('path');
const logger = require('../logger');
const { deriveUserId } = require('../outbound-redirect/authUser');
const { resolveOwnerPrincipal, logOwnerGrant } = require('../auth/ownerAccess');
const { SUPPLIERS } = require('./catalog');
const { createMemoryConstructionRepository } = require('./memory-repository');
const { createUnavailableConstructionRepository } = require('./repository-contract');
const { createRfqDispatcher } = require('./rfq-dispatch');
const { createSupabaseConstructionRepository } = require('./supabase-repository');

function demoEnabled(env = process.env) {
  return env.NODE_ENV !== 'production' && String(env.CONSTRUCTION_DEMO_MODE || '').trim() === '1';
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Postgres buyer_user_id is uuid — CONSTRUCTION_DEMO_BUYER_USER_ID for no-login demos. */
function resolveDemoBuyerActorId(demoActor, env = process.env) {
  const configured = String(env.CONSTRUCTION_DEMO_BUYER_USER_ID || '').trim();
  if (UUID_RE.test(configured)) return configured;
  if (UUID_RE.test(demoActor)) return demoActor;
  const hash = crypto.createHash('sha256').update(`construction-demo:${demoActor}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


function createConstructionRuntime(env = process.env) {
  const demo = demoEnabled(env);
  // CONSTRUCTION_DB_URL wins over SUPABASE_CONSTRUCTION_DB_URL on purpose.
  // Setting the new variable is the entire cutover onto Railway Postgres and
  // clearing it is the entire rollback; the Supabase value stays in place,
  // untouched, so the rollback never depends on anyone still holding that
  // secret. Keep this order — the old order made the new variable dead weight
  // whenever the Supabase one was still set, which it always is.
  const constructionDbUrl = String(env.CONSTRUCTION_DB_URL || env.SUPABASE_CONSTRUCTION_DB_URL || '').trim();
  const configuredStatePath = String(env.CONSTRUCTION_DEMO_STATE_PATH || '').trim();
  const statePath = configuredStatePath || (env === process.env
    ? path.join(__dirname, '../../data/construction/private/demo-rfq-state.json')
    : null);
  const dispatcher = createRfqDispatcher({ env });
  const repository = constructionDbUrl
    ? createSupabaseConstructionRepository({ connectionString: constructionDbUrl, dispatcher, env })
    : demo
      ? createMemoryConstructionRepository({ dispatcher, statePath })
      : createUnavailableConstructionRepository();
  return {
    dispatcher,
    repository: require('./boq-directory-matching').attachBoqDirectoryMatching(
      require('./supplier-discovery-runtime').attachSupplierDiscovery(repository, { env }),
    ),
    authorizeBuyer: async (req) => {
      const userId = await deriveUserId(req);
      if (userId && typeof repository.resolveBuyerActor === 'function') {
        let access = null;
        try {
          access = await repository.resolveBuyerActor(userId);
        } catch (error) {
          // The membership store is unreachable. That must not decide
          // authorization by itself: an owner still gets through here, and
          // the data routes then report the real problem (503, persistence
          // unavailable) instead of this surfacing as a 500 on the gate.
          logger.warn(
            { err: error?.message, code: error?.code },
            '[construction] membership lookup failed — falling through to owner access',
          );
        }
        if (access) {
          const role = typeof access === 'string' ? access : access.role;
          const scopeOwnerUserId = typeof access === 'string' ? userId : access.scopeOwnerUserId;
          return { allowed: true, actorId: scopeOwnerUserId, userId, role };
        }
      }
      // A platform owner with no membership row still gets in, as ADMIN over
      // their own scope. This is the bootstrap: without it the first admin
      // cannot open فرق بناء to grant anyone — including themselves — a row.
      // The scope stays their own user id, so an owner sees the data they own
      // rather than silently inheriting another buyer's scope.
      const owner = await resolveOwnerPrincipal(req, env);
      if (owner) {
        logOwnerGrant('construction-buyer', owner, req);
        return { allowed: true, actorId: owner.userId, userId: owner.userId, role: 'ADMIN', owner: true };
      }
      const demoActor = String(req.get('x-construction-demo-user') || '').trim();
      if (!demo || !demoActor) return false;
      const actorId = resolveDemoBuyerActorId(demoActor, env);
      return {
        allowed: true,
        actorId,
        userId: actorId,
        role: 'ADMIN',
        demo: true,
        demoLabel: demoActor,
      };
    },
    authorizeSupplier: async (req) => {
      const userId = await deriveUserId(req);
      if (userId && typeof repository.resolveSupplierActor === 'function') {
        const supplierId = await repository.resolveSupplierActor(userId);
        if (supplierId) return { allowed: true, actorId: userId, supplierId, role: 'SUPPLIER' };
      }
      const supplierId = String(req.get('x-construction-supplier-id') || '').trim();
      const supplier = SUPPLIERS.find((entry) => entry.id === supplierId);
      return demo && supplier ? { allowed: true, actorId: `demo-supplier:${supplierId}`, supplierId, role: 'SUPPLIER', demo: true } : false;
    },
  };
}

module.exports = { createConstructionRuntime, demoEnabled, resolveDemoBuyerActorId };
