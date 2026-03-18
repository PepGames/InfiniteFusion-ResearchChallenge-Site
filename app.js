// =========================
// Constants / Global State
// =========================

const STORAGE_KEY = "fusion-research-tool-current-run";
const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "true";

const defaultRunState = {
  meta: {
    runName: "My Fusion Run",
    createdAt: "",
    updatedAt: "",
    version: 4
  },
  rp: {
    achievementEarned: 0,
    bonusEarned: 0,
    spent: 0
  },
  resources: {
    catchesAvailable: 0,
    splitsAvailable: 0
  },
  actions: [],
  redoStack: [],
  pokemon: [],
  fusions: [],
  battles: [],
  achievementProgress: {},
};

const VALID_ACTION_TYPES = new Set([
  "catch",
  "death",
  "fusion",
  "split",
  "battle",
  "purchase"
]);

const actionHandlers = {
  catch: handleCatchAction,
  death: handleDeathAction,
  fusion: handleFusionAction,
  split: handleSplitAction,
  battle: handleBattleAction
};

const SHOP_ITEMS = {
  catch_token: {
    itemId: "catch_token",
    name: "Catch Token",
    cost: 1
  },
  split_token: {
    itemId: "split_token",
    name: "Split Token",
    cost: 1
  }
};

let shopCart = {
  catch_token: 0,
  split_token: 0
};

let runState = loadRunState();
let achievementCatalog = [];
let speciesCatalog = [];
let speciesById = {};
let hasRenderedFusionFlowerOnce = false;
let locationCatalog = [];
let locationById = {};
let trainerCatalog = [];
let trainerById = {};
let achievementNotificationQueue = [];
let achievementNotificationIdCounter = 0;
let achievementAssetCache = new Set();

let lastRenderedFusionFlowerValues = {
  fusions: null,
  catches: null,
  splits: null
};

document.fonts.load("1em 'Permanent Marker'").then(() => {
  document.body.classList.add("marker-font");
});

// =========================
// Persistence / Save State
// =========================

function createNewRunState() {
  const now = new Date().toISOString();

  return {
    ...structuredClone(defaultRunState),
    meta: {
      ...structuredClone(defaultRunState.meta),
      createdAt: now,
      updatedAt: now
    }
  };
}

function normalizeRunState(state) {
  return {
    meta: {
      runName: state?.meta?.runName || "My Fusion Run",
      createdAt: state?.meta?.createdAt || new Date().toISOString(),
      updatedAt: state?.meta?.updatedAt || new Date().toISOString(),
      version: state?.meta?.version ?? 4
    },
    rp: {
      achievementEarned: state?.rp?.achievementEarned || 0,
      bonusEarned: state?.rp?.bonusEarned || 0,
      spent: state?.rp?.spent || 0
    },
    resources: {
      catchesAvailable: state?.resources?.catchesAvailable ?? 0,
      splitsAvailable: state?.resources?.splitsAvailable ?? 0
    },
    actions: Array.isArray(state?.actions) ? state.actions : [],
    redoStack: Array.isArray(state?.redoStack) ? state.redoStack : [],
    pokemon: Array.isArray(state?.pokemon) ? state.pokemon : [],
    fusions: Array.isArray(state?.fusions) ? state.fusions : [],
    battles: Array.isArray(state?.battles) ? state.battles : [],
    achievementProgress:
      state?.achievementProgress && !Array.isArray(state.achievementProgress)
        ? state.achievementProgress
        : {},
  };
}

function loadRunState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const freshState = createNewRunState();
    saveRunState(freshState);
    return freshState;
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeRunState(parsed);
  } catch (error) {
    console.error("Failed to parse saved run data:", error);
    const freshState = createNewRunState();
    saveRunState(freshState);
    return freshState;
  }
}

function saveRunState(state) {
  state.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}


// =========================
// Catalog Loading
// =========================

async function loadAchievementCatalog() {
  try {
    const response = await fetch("data/achievements.json");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    achievementCatalog = await response.json();

    if (!Array.isArray(achievementCatalog)) {
      throw new Error("achievements.json is not an array.");
    }

    validateAchievementCatalog();
  } catch (error) {
    console.error("Failed to load achievements:", error);
    alert("Achievement database failed to load. Check console.");
  }
}

async function loadSpeciesCatalog() {
  try {
    debugLog("Loading species from data/species.json...");

    const response = await fetch("data/species.json");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    speciesCatalog = await response.json();

    if (!Array.isArray(speciesCatalog)) {
      throw new Error("species.json is not an array.");
    }

    speciesById = {};

    speciesCatalog.forEach((species) => {
      speciesById[species.speciesId] = species;
    });

    debugLog(`Loaded ${speciesCatalog.length} species.`);
  } catch (error) {
    console.error("Failed to load species:", error);
    alert("Species database failed to load. Check console.");
  }
}

async function loadLocationCatalog() {
  try {
    debugLog("Loading locations from data/locations.json...");

    const response = await fetch("data/locations.json");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    locationCatalog = await response.json();

    if (!Array.isArray(locationCatalog)) {
      throw new Error("locations.json is not an array.");
    }

    locationById = {};

    locationCatalog.forEach((location) => {
      locationById[location.locationId] = location;
    });

    debugLog(`Loaded ${locationCatalog.length} locations.`);
  } catch (error) {
    console.error("Failed to load locations:", error);
    alert("Location database failed to load. Check console.");
  }
}

async function loadTrainerCatalog() {
  try {
    debugLog("Loading trainers from data/trainers.json...");

    const response = await fetch("data/trainers.json");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    trainerCatalog = await response.json();

    if (!Array.isArray(trainerCatalog)) {
      throw new Error("trainers.json is not an array.");
    }

    trainerById = {};

    trainerCatalog.forEach((trainer) => {
      trainerById[trainer.trainerId] = trainer;
    });

    debugLog(`Loaded ${trainerCatalog.length} trainers.`);
  } catch (error) {
    console.error("Failed to load trainers:", error);
    alert("Trainer database failed to load. Check console.");
  }
}

function validateAchievementCatalog() {
  const errors = [];
  const achievementIds = new Set();
  const achievementMap = {};
  const allowedRuleTypes = new Set([
    "action_count",
    "party_battle_count",
    "fusion_dex_count"
  ]);

  for (const achievement of achievementCatalog) {
    if (!achievement?.id) {
      errors.push("Achievement missing id.");
      continue;
    }

    if (achievementIds.has(achievement.id)) {
      errors.push(`Duplicate achievement id: ${achievement.id}`);
    }

    achievementIds.add(achievement.id);
    achievementMap[achievement.id] = achievement;

    if (!achievement.name) {
      errors.push(`Achievement "${achievement.id}" is missing name.`);
    }

    if (achievement.tags && !Array.isArray(achievement.tags)) {
      errors.push(`Achievement "${achievement.id}" has non-array tags.`);
    }

    if (!achievement.rule || typeof achievement.rule !== "object" || Array.isArray(achievement.rule)) {
      errors.push(`Achievement "${achievement.id}" is missing a valid rule object.`);
      continue;
    }

    const rule = achievement.rule;

    if (!rule.type) {
      errors.push(`Achievement "${achievement.id}" is missing rule.type.`);
    } else if (!allowedRuleTypes.has(rule.type)) {
      errors.push(`Achievement "${achievement.id}" has unknown rule.type "${rule.type}".`);
    }

    if (rule.target !== undefined) {
      const target = Number(rule.target);
      if (!Number.isFinite(target) || target < 1) {
        errors.push(`Achievement "${achievement.id}" has invalid rule.target "${rule.target}".`);
      }
    }

    if (rule.filters !== undefined) {
      if (!rule.filters || typeof rule.filters !== "object" || Array.isArray(rule.filters)) {
        errors.push(`Achievement "${achievement.id}" has invalid rule.filters.`);
      }
    }

    if (rule.options !== undefined) {
      if (!rule.options || typeof rule.options !== "object" || Array.isArray(rule.options)) {
        errors.push(`Achievement "${achievement.id}" has invalid rule.options.`);
      }
    }

    if (
      (rule.type === "action_count" || rule.type === "party_battle_count") &&
      !rule.actionType
    ) {
      errors.push(`Achievement "${achievement.id}" requires rule.actionType.`);
    }

    if (rule.type === "action_count" && rule.actionType) {
      if (!VALID_ACTION_TYPES.has(rule.actionType)) {
        errors.push(
          `Achievement "${achievement.id}" has invalid rule.actionType "${rule.actionType}".`
        );
      }
    }

    if (rule.type === "party_battle_count" && rule.actionType !== "battle") {
      errors.push(`Achievement "${achievement.id}" with party_battle_count must use actionType "battle".`);
    }

    if (rule.type === "fusion_dex_count") {
      const options = rule.options || {};
      const allowedMatchModes = new Set([
        "either_component",
        "both_components",
        "head_only",
        "body_only"
      ]);

      if (
        options.speciesTypesIncludes !== undefined &&
        !Array.isArray(options.speciesTypesIncludes)
      ) {
        errors.push(
          `Achievement "${achievement.id}" has invalid options.speciesTypesIncludes.`
        );
      }

      if (
        options.match !== undefined &&
        !allowedMatchModes.has(options.match)
      ) {
        errors.push(
          `Achievement "${achievement.id}" has invalid options.match "${options.match}".`
        );
      }
    }
  }

  for (const achievement of achievementCatalog) {
    const prev = achievement.previousAchievement;

    if (prev && !achievementMap[prev]) {
      errors.push(
        `Achievement "${achievement.id}" references missing previousAchievement "${prev}".`
      );
    }
  }

  function hasCycle(startId, visited = new Set(), stack = new Set()) {
    if (stack.has(startId)) return true;
    if (visited.has(startId)) return false;

    visited.add(startId);
    stack.add(startId);

    const achievement = achievementMap[startId];
    const prev = achievement?.previousAchievement;

    if (prev && achievementMap[prev]) {
      if (hasCycle(prev, visited, stack)) {
        return true;
      }
    }

    stack.delete(startId);
    return false;
  }

  for (const achievement of achievementCatalog) {
    if (achievement?.id && hasCycle(achievement.id)) {
      errors.push(`Circular dependency detected involving "${achievement.id}".`);
    }
  }

  if (errors.length > 0) {
    console.error("Achievement catalog validation failed:");
    errors.forEach((error) => console.error(" -", error));
    alert("Achievement catalog has errors. Check console.");
  } else {
    debugLog("Achievement catalog validation passed.");
  }
}

// =========================
// Core State Logic
// =========================

function createBaseAction(actionType) {
  return {
    actionId: crypto.randomUUID(),
    actionType,
    actionAt: new Date().toISOString()
  };
}

function addAction(action) {
  runState.actions.push(action);
  runState.redoStack = [];
}

function rebuildDerivedStateFromActions() {
  const pokemon = [];
  const fusions = [];
  const battles = [];
  const resources = {
    catchesAvailable: 0,
    splitsAvailable: 0
  };

  for (const action of runState.actions) {
    switch (action.actionType) {
      case "catch": {
        if (resources.catchesAvailable <= 0) break;
        resources.catchesAvailable -= 1;
        if (!action.isFusion) {
          const species = speciesById[action.speciesId];
          if (!species) break;

          pokemon.push({
            pokemonId: action.caughtPokemonId,
            speciesId: action.speciesId,
            speciesName: species.name,
            variant: species.variant || "",
            nickname: action.nickname || "",
            locationId: action.locationId || "",
            catchType: action.catchType || "",
            status: "alive",
            activeFusionId: null,
            createdActionId: action.actionId,
            createdAt: action.actionAt
          });
        } else {
          const headSpecies = speciesById[action.headSpeciesId];
          const bodySpecies = speciesById[action.bodySpeciesId];
          if (!headSpecies || !bodySpecies) break;

          pokemon.push({
            pokemonId: action.headPokemonId,
            speciesId: action.headSpeciesId,
            speciesName: headSpecies.name,
            variant: headSpecies.variant || "",
            nickname: action.headNickname || "",
            locationId: action.locationId || "",
            catchType: action.catchType || "",
            status: "alive",
            activeFusionId: action.caughtFusionId,
            createdActionId: action.actionId,
            createdAt: action.actionAt
          });

          pokemon.push({
            pokemonId: action.bodyPokemonId,
            speciesId: action.bodySpeciesId,
            speciesName: bodySpecies.name,
            variant: bodySpecies.variant || "",
            nickname: action.bodyNickname || "",
            locationId: action.locationId || "",
            catchType: action.catchType || "",
            status: "alive",
            activeFusionId: action.caughtFusionId,
            createdActionId: action.actionId,
            createdAt: action.actionAt
          });

          fusions.push({
            fusionId: action.caughtFusionId,
            headPokemonId: action.headPokemonId,
            bodyPokemonId: action.bodyPokemonId,
            createdActionId: action.actionId,
            createdAt: action.actionAt,
            status: "active",
            deathNote: ""
          });
        }
        break;
      }

      case "death": {
        if (action.targetType === "pokemon") {
          const targetPokemon = pokemon.find((p) => p.pokemonId === action.targetId);
          if (!targetPokemon) break;

          targetPokemon.status = "dead";
          targetPokemon.deathNote = action.note || "";

          if (targetPokemon.activeFusionId) {
            const linkedFusion = fusions.find((f) => f.fusionId === targetPokemon.activeFusionId);
            if (linkedFusion && linkedFusion.status !== "dead") {
              linkedFusion.status = "dead";
              linkedFusion.deathNote = action.note || "";

              const head = pokemon.find((p) => p.pokemonId === linkedFusion.headPokemonId);
              const body = pokemon.find((p) => p.pokemonId === linkedFusion.bodyPokemonId);

              if (head) {
                head.status = "dead";
                head.deathNote = action.note || "";
              }

              if (body) {
                body.status = "dead";
                body.deathNote = action.note || "";
              }
            }
          }

          break;
        }

        if (action.targetType === "fusion") {
          const targetFusion = fusions.find((f) => f.fusionId === action.targetId);
          if (!targetFusion) break;

          targetFusion.status = "dead";
          targetFusion.deathNote = action.note || "";

          const head = pokemon.find((p) => p.pokemonId === targetFusion.headPokemonId);
          const body = pokemon.find((p) => p.pokemonId === targetFusion.bodyPokemonId);

          if (head) {
            head.status = "dead";
            head.deathNote = action.note || "";
          }

          if (body) {
            body.status = "dead";
            body.deathNote = action.note || "";
          }
        }

        break;
      }

      case "fusion": {
        const head = pokemon.find((p) => p.pokemonId === action.headPokemonId);
        const body = pokemon.find((p) => p.pokemonId === action.bodyPokemonId);

        if (!head || !body) break;
        if (head.status !== "alive" || body.status !== "alive") break;
        if (head.activeFusionId || body.activeFusionId) break;

        fusions.push({
          fusionId: action.fusionId,
          headPokemonId: action.headPokemonId,
          bodyPokemonId: action.bodyPokemonId,
          createdActionId: action.actionId,
          createdAt: action.actionAt,
          status: "active",
          deathNote: ""
        });

        head.activeFusionId = action.fusionId;
        body.activeFusionId = action.fusionId;
        break;
      }

      case "battle": {
        battles.push({
          battleId: action.actionId,
          battleType: action.battleType || "",
          trainerId: action.trainerId || "",
          result: action.result,
          party: Array.isArray(action.party) ? action.party : [],
          createdAt: action.actionAt
        });
        break;
      }

      case "split": {
        if (resources.splitsAvailable <= 0) break;
        resources.splitsAvailable -= 1;
        const fusion = fusions.find((f) => f.fusionId === action.fusionId);
        if (!fusion) break;
        if (fusion.status !== "active") break;

        fusion.status = "split";
        fusion.splitActionId = action.actionId;
        fusion.splitAt = action.actionAt;

        const head = pokemon.find((p) => p.pokemonId === fusion.headPokemonId);
        const body = pokemon.find((p) => p.pokemonId === fusion.bodyPokemonId);

        if (head && head.activeFusionId === fusion.fusionId) {
          head.activeFusionId = null;
        }

        if (body && body.activeFusionId === fusion.fusionId) {
          body.activeFusionId = null;
        }

        break;
      }

      case "purchase": {
        const lines = Array.isArray(action.lines) ? action.lines : [];

        lines.forEach((line) => {
          const itemId = line.itemId;
          const quantity = Number(line.quantity || 0);

          if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
            return;
          }

          if (itemId === "catch_token") {
            resources.catchesAvailable += quantity;
          }

          if (itemId === "split_token") {
            resources.splitsAvailable += quantity;
          }
        });

        break;
      }
    }
  }

  runState.pokemon = pokemon;
  runState.fusions = fusions;
  runState.battles = battles;
  runState.resources = resources;
}

function getAvailableRP() {
  return runState.rp.achievementEarned + runState.rp.bonusEarned - runState.rp.spent;
}

function updateAndSave() {
  const latestActionTimestamp =
    runState.actions.length > 0
      ? runState.actions[runState.actions.length - 1].actionAt
      : new Date().toISOString();

  const achievementTimestamp = new Date(
    new Date(latestActionTimestamp).getTime() + 1
  ).toISOString();

  rebuildDerivedStateFromActions();
  syncSpentRPFromActions();
  const achievementChanges = evaluateAchievements(achievementTimestamp);

  achievementChanges.newlyUnlocked.forEach((id) => {
    const achievement = achievementCatalog.find((a) => a.id === id);
    if (!achievement) return;

    console.log("Achievement unlocked:", achievement.name);
    popValue(document.getElementById("rp-earned"));
  });

  achievementChanges.newlyRemoved.forEach((id) => {
    const achievement = achievementCatalog.find((a) => a.id === id);
    if (!achievement) return;

    console.log("Achievement removed:", achievement.name);
  });

  saveRunState(runState);
  renderRun();
  queueAchievementNotifications(achievementChanges);

  debugLog("Achievement changes:", achievementChanges);
}

function validateActionSequence(actions) {
  let catchesAvailable = 0;
  let splitsAvailable = 0;

  for (const action of actions) {
    if (action.actionType === "purchase") {
      const lines = Array.isArray(action.lines) ? action.lines : [];

      lines.forEach((line) => {
        const itemId = line.itemId;
        const quantity = Number(line.quantity || 0);

        if (!Number.isFinite(quantity) || quantity <= 0) {
          return;
        }

        if (itemId === "catch_token") {
          catchesAvailable += quantity;
        }

        if (itemId === "split_token") {
          splitsAvailable += quantity;
        }
      });

      continue;
    }

    if (action.actionType === "catch") {
      if (catchesAvailable <= 0) {
        return {
          valid: false,
          reason: "This action history would become invalid because a later catch depends on a Catch Token from the deleted transaction."
        };
      }

      catchesAvailable -= 1;
      continue;
    }

    if (action.actionType === "split") {
      if (splitsAvailable <= 0) {
        return {
          valid: false,
          reason: "This action history would become invalid because a later split depends on a Split Token from the deleted transaction."
        };
      }

      splitsAvailable -= 1;
      continue;
    }
  }

  return { valid: true };
}

// =========================
// Achievement Logic
// =========================

function isPreviousAchievementUnlocked(achievement, progressMap) {
  if (!achievement.previousAchievement) {
    return true;
  }

  return !!progressMap[achievement.previousAchievement]?.unlocked;
}

function getAchievementRule(achievement) {
  return achievement?.rule || {};
}

function getRuleTarget(rule) {
  const target = Number(rule?.target);
  return Number.isFinite(target) && target > 0 ? target : 1;
}

function countFilteredActions(actionType, filters = {}) {
  return runState.actions.filter((action) => {
    if (action.actionType !== actionType) return false;

    return Object.entries(filters).every(([key, value]) => action[key] === value);
  }).length;
}

function countPartyBattleMatches(filters = {}, options = {}) {
  return runState.actions.filter((action) => {
    if (action.actionType !== "battle") return false;

    const basicMatch = Object.entries(filters).every(([key, value]) => action[key] === value);
    if (!basicMatch) return false;

    const party = Array.isArray(action.party) ? action.party : [];
    const fusionCount = party.filter((member) => member.entityType === "fusion").length;
    const pokemonCount = party.filter((member) => member.entityType === "pokemon").length;

    if (
      options.minFusionPartyMembers !== undefined &&
      fusionCount < Number(options.minFusionPartyMembers)
    ) {
      return false;
    }

    if (
      options.maxFusionPartyMembers !== undefined &&
      fusionCount > Number(options.maxFusionPartyMembers)
    ) {
      return false;
    }

    if (
      options.minPokemonPartyMembers !== undefined &&
      pokemonCount < Number(options.minPokemonPartyMembers)
    ) {
      return false;
    }

    if (
      options.maxPokemonPartyMembers !== undefined &&
      pokemonCount > Number(options.maxPokemonPartyMembers)
    ) {
      return false;
    }

    if (options.requireFusionInParty === true && fusionCount < 1) {
      return false;
    }

    if (options.requireFullParty === true && party.length !== 6) {
      return false;
    }

    return true;
  }).length;
}

function getSpeciesTypes(species) {
  if (!species) return [];

  const types = [];

  if (species.primaryType) {
    types.push(String(species.primaryType).toLowerCase());
  }

  if (species.secondaryType) {
    types.push(String(species.secondaryType).toLowerCase());
  }

  return [...new Set(types)];
}

function fusionActionMatchesDexOptions(action, options = {}) {
  // Counts only player-created fusion actions.
  if (action.actionType !== "fusion") return false;

  const headPokemon = getPokemonById(action.headPokemonId);
  const bodyPokemon = getPokemonById(action.bodyPokemonId);

  if (!headPokemon || !bodyPokemon) return false;

  const headSpecies = speciesById[headPokemon.speciesId];
  const bodySpecies = speciesById[bodyPokemon.speciesId];

  if (!headSpecies || !bodySpecies) return false;

  const headTypes = getSpeciesTypes(headSpecies);
  const bodyTypes = getSpeciesTypes(bodySpecies);

  const requiredTypes = Array.isArray(options.speciesTypesIncludes)
    ? options.speciesTypesIncludes.map((type) => String(type).toLowerCase())
    : [];

  const matchMode = options.match || "either_component";

  if (requiredTypes.length > 0) {
    const headMatches = requiredTypes.some((type) => headTypes.includes(type));
    const bodyMatches = requiredTypes.some((type) => bodyTypes.includes(type));

    if (matchMode === "either_component" && !headMatches && !bodyMatches) {
      return false;
    }

    if (matchMode === "both_components" && (!headMatches || !bodyMatches)) {
      return false;
    }

    if (matchMode === "head_only" && !headMatches) {
      return false;
    }

    if (matchMode === "body_only" && !bodyMatches) {
      return false;
    }
  }

  return true;
}

function countFusionDexMatches(options = {}) {
  return runState.actions.filter((action) =>
    fusionActionMatchesDexOptions(action, options)
  ).length;
}

function getAchievementProgressState(achievement, progressMap) {
  const rule = getAchievementRule(achievement);
  const ruleType = rule.type;
  const actionType = rule.actionType;
  const filters = rule.filters || {};
  const options = rule.options || {};
  const target = getRuleTarget(rule);

  let current = 0;

  if (ruleType === "action_count") {
    current = countFilteredActions(actionType, filters);
  } else if (ruleType === "party_battle_count") {
    current = countPartyBattleMatches(filters, options);
  } else if (ruleType === "fusion_dex_count") {
    current = countFusionDexMatches(options);
  }

  const prerequisiteMet = isPreviousAchievementUnlocked(achievement, progressMap);
  const unlocked = prerequisiteMet && current >= target;

  return {
    current,
    target,
    unlocked
  };
}

function calculateAchievementEarnedRP(progressMap) {
  return achievementCatalog.reduce((total, achievement) => {
    const progress = progressMap[achievement.id];

    if (progress?.unlocked) {
      return total + (achievement.rpReward || 0);
    }

    return total;
  }, 0);
}

function evaluateAchievements(updateTimestamp) {
  const previousProgress = structuredClone(runState.achievementProgress);
  let nextProgress = {};

  const now = updateTimestamp || new Date().toISOString();
  let changed = true;
  let safetyCounter = 0;
  const maxPasses = achievementCatalog.length + 5;

  while (changed) {
    changed = false;
    safetyCounter += 1;

    if (safetyCounter > maxPasses) {
      console.error("Achievement evaluation exceeded safe pass limit.");
      break;
    }

    const rebuiltProgress = {};

    achievementCatalog.forEach((achievement) => {
      const previousEntry = previousProgress[achievement.id];
      const priorUnlockedAt = previousEntry?.unlockedAt || null;

      const progressState = getAchievementProgressState(achievement, {
        ...nextProgress,
        ...rebuiltProgress
      });

      rebuiltProgress[achievement.id] = {
        unlocked: progressState.unlocked,
        unlockedAt: progressState.unlocked
          ? (priorUnlockedAt || now)
          : null,
        current: progressState.current,
        target: progressState.target
      };
    });

    const before = JSON.stringify(nextProgress);
    const after = JSON.stringify(rebuiltProgress);

    nextProgress = rebuiltProgress;

    if (before !== after) {
      changed = true;
    }
  }

  const newlyUnlocked = [];
  const newlyRemoved = [];

  achievementCatalog.forEach((achievement) => {
    const wasUnlocked = !!previousProgress[achievement.id]?.unlocked;
    const isUnlocked = !!nextProgress[achievement.id]?.unlocked;

    if (!wasUnlocked && isUnlocked) {
      newlyUnlocked.push(achievement.id);
    }

    if (wasUnlocked && !isUnlocked) {
      newlyRemoved.push(achievement.id);
    }
  });

  runState.achievementProgress = nextProgress;
  runState.rp.achievementEarned = calculateAchievementEarnedRP(nextProgress);

  return {
    newlyUnlocked,
    newlyRemoved
  };
}

// =========================
// Rendering
// =========================

function renderRun() {
  document.getElementById("run-name").value = runState.meta.runName;
  document.getElementById("rp-earned").textContent =
    runState.rp.achievementEarned + runState.rp.bonusEarned;
  document.getElementById("rp-spent").textContent = runState.rp.spent;
  document.getElementById("rp-available").textContent = getAvailableRP();

  renderFusionFlowerWidget();
  renderActionLog();
  renderAchievements();
  renderShop();
  requestAnimationFrame(updateAchievementCardScales);

  const undoBtn = document.getElementById("undo-action-btn");
  const redoBtn = document.getElementById("redo-action-btn");

  if (undoBtn) undoBtn.disabled = !Array.isArray(runState.actions) || runState.actions.length === 0;
  if (redoBtn) redoBtn.disabled = !Array.isArray(runState.redoStack) || runState.redoStack.length === 0;
}

function renderActionLog() {
  const list = document.getElementById("action-list");
  list.innerHTML = "";

  const timeline = buildDisplayTimeline();

  if (timeline.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No actions logged yet.";
    list.appendChild(emptyItem);
    return;
  }

  timeline.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "action-log-item";

    const textSpan = document.createElement("span");
    textSpan.className = "action-log-text";

    const rightGroup = document.createElement("div");
    rightGroup.className = "action-log-right";

    const timeSpan = document.createElement("span");
    timeSpan.className = "action-log-time";
    timeSpan.textContent = formatActionTimestamp(entry.sortAt);

    rightGroup.appendChild(timeSpan);

    if (entry.entryType === "action") {
      textSpan.appendChild(renderActionCard(entry.action));

      const deleteButton = document.createElement("button");
      deleteButton.className = "action-delete-btn";
      deleteButton.type = "button";
      deleteButton.textContent = "×";
      deleteButton.setAttribute("aria-label", "Delete action");
      deleteButton.addEventListener("click", () => handleDeleteAction(entry.action.actionId));

      rightGroup.appendChild(deleteButton);
    }

    if (entry.entryType === "achievement_unlocked") {
      textSpan.appendChild(renderAchievementLogCard(entry.achievementId));
    }

    li.appendChild(textSpan);
    li.appendChild(rightGroup);

    list.appendChild(li);
  });
}

function renderAchievements() {
  const container = document.getElementById("achievements-list");
  container.innerHTML = "";

  const visibleAchievements = achievementCatalog.filter((achievement) => {
    const progress = runState.achievementProgress[achievement.id];
    const unlocked = !!progress?.unlocked;

    if (achievement.hidden && !unlocked) {
      return false;
    }

    return true;
  });

  const sortedAchievements = [...visibleAchievements].sort((a, b) => {
    const progressA = runState.achievementProgress[a.id];
    const progressB = runState.achievementProgress[b.id];

    const unlockedA = !!progressA?.unlocked;
    const unlockedB = !!progressB?.unlocked;

    if (unlockedA && unlockedB) {
      const timeA = progressA.unlockedAt || "";
      const timeB = progressB.unlockedAt || "";
      return timeB.localeCompare(timeA);
    }

    if (unlockedA) return -1;
    if (unlockedB) return 1;

    return a.name.localeCompare(b.name);
  });

  sortedAchievements.forEach((achievement) => {
    const progress = runState.achievementProgress[achievement.id] || {
      unlocked: false,
      unlockedAt: null,
      current: 0,
      target: getRuleTarget(achievement.rule)
    };

    const unlocked = !!progress.unlocked;
    const description = achievement.description || "";
    const current = Number(progress.current || 0);
    const target = Number(progress.target || 1);
    const clampedCurrent = Math.min(current, target);
    const percent = Math.max(0, Math.min(100, (current / target) * 100));

    const badgeSrc = getAchievementBadgeImage(achievement);
    const backgroundSrc = getAchievementTierBackground(achievement);

    const card = document.createElement("div");
    card.className = "achievement-card-v3 achievement-card-scaled";

    const backgroundOverlay = unlocked
      ? `linear-gradient(180deg, rgba(10, 17, 32, 0.22), rgba(7, 13, 24, 0.30))`
      : `linear-gradient(180deg, rgba(10, 17, 32, 0.55), rgba(7, 13, 24, 0.68))`;

    card.style.backgroundImage = `
      ${backgroundOverlay},
      url("${backgroundSrc}")
    `;

    if (unlocked) {
      card.classList.add("achievement-complete");
    }

    const metaText = unlocked
      ? `Completed • ${formatActionTimestamp(progress.unlockedAt)}`
      : `Progress: ${clampedCurrent} / ${target}`;

    card.innerHTML = `
      <div class="achievement-icon-panel">
        <div class="achievement-icon-box">
          <img
            class="achievement-badge-image"
            src="${badgeSrc}"
            alt="${achievement.name} badge"
          />
        </div>
      </div>

      <div class="achievement-main-panel">
        <div class="achievement-topline">
          <div class="achievement-title-v2">${achievement.name}</div>
          <div class="achievement-rp-v2">+${achievement.rpReward} RP</div>
        </div>

        <div class="achievement-desc-v2">${description}</div>

        <div class="achievement-meta-v2">${metaText}</div>

        <div class="achievement-progress-shell ${unlocked ? "is-complete" : ""}">
          <div class="achievement-progress-fill" style="width: ${percent}%;"></div>
          <div class="achievement-progress-text">
            ${unlocked ? "Complete" : `${clampedCurrent} / ${target}`}
          </div>
        </div>
      </div>
    `;

    const badgeImage = card.querySelector(".achievement-badge-image");
    if (badgeImage) {
      badgeImage.addEventListener("error", () => {
        badgeImage.src = "assets/achievements/badges/trophy_default.png";
      }, { once: true });
    }

    const shell = document.createElement("div");
    shell.className = "achievement-scale-shell";
    shell.appendChild(card);

    container.appendChild(shell);
  });
}

function renderActionFields() {
  debugLog("renderActionFields fired");

  const type = document.getElementById("action-type").value;
  const container = document.getElementById("action-fields");

  debugLog("action-fields container:", container);
  debugLog("action type:", type);

  if (!container) return;

  container.innerHTML = "";

    if (type === "catch") {
      container.innerHTML = `
        <div class="field-row">
          <label for="catch-type">Catch Type</label>
          <select id="catch-type" required>
            <option value="">Select catch type</option>
            <option value="wild">Wild</option>
            <option value="starter">Starter</option>
            <option value="gift">Gift</option>
            <option value="trade">Trade</option>
          </select>
        </div>

        <div class="field-row">
          <label for="catch-location">Location</label>
          <select id="catch-location" required>
            <option value="">Select a location</option>
          </select>
        </div>

        <div class="field-row">
          <label>
            <input type="checkbox" id="catch-is-fusion" />
            Wild / caught fusion
          </label>
        </div>

        <div id="catch-normal-fields">
          <div class="field-row">
            <label for="catch-species">Species</label>
            <select id="catch-species" required>
              <option value="">Select a species</option>
            </select>
          </div>

          <div class="field-row">
            <label for="catch-nickname">Nickname (optional)</label>
            <input id="catch-nickname" type="text" placeholder="e.g. Bubbles" />
          </div>
        </div>

        <div id="catch-fusion-fields" style="display:none;">
          <div class="field-row">
            <label for="catch-head-species">Head Species</label>
            <select id="catch-head-species">
              <option value="">Select head species</option>
            </select>
          </div>

          <div class="field-row">
            <label for="catch-head-nickname">Head Nickname (optional)</label>
            <input id="catch-head-nickname" type="text" placeholder="e.g. Sparky" />
          </div>

          <div class="field-row">
            <label for="catch-body-species">Body Species</label>
            <select id="catch-body-species">
              <option value="">Select body species</option>
            </select>
          </div>

          <div class="field-row">
            <label for="catch-body-nickname">Body Nickname (optional)</label>
            <input id="catch-body-nickname" type="text" placeholder="e.g. Shellshock" />
          </div>
        </div>
      `;

      populateSpeciesSelect("catch-species");
      populateSpeciesSelect("catch-head-species");
      populateSpeciesSelect("catch-body-species");
      populateLocationSelect("catch-location");

      const fusionCheckbox = document.getElementById("catch-is-fusion");
      const normalFields = document.getElementById("catch-normal-fields");
      const fusionFields = document.getElementById("catch-fusion-fields");
      const catchSpeciesSelect = document.getElementById("catch-species");
      const catchHeadSpeciesSelect = document.getElementById("catch-head-species");
      const catchBodySpeciesSelect = document.getElementById("catch-body-species");

      function updateCatchFusionMode() {
        const isFusion = fusionCheckbox.checked;

        normalFields.style.display = isFusion ? "none" : "";
        fusionFields.style.display = isFusion ? "" : "none";

        catchSpeciesSelect.required = !isFusion;
        catchSpeciesSelect.disabled = isFusion;

        catchHeadSpeciesSelect.required = isFusion;
        catchHeadSpeciesSelect.disabled = !isFusion;

        catchBodySpeciesSelect.required = isFusion;
        catchBodySpeciesSelect.disabled = !isFusion;
      }

      fusionCheckbox.addEventListener("change", updateCatchFusionMode);
      updateCatchFusionMode();
    }

  if (type === "death") {
    const alivePokemon = runState.pokemon.filter(isPokemonStandalone);
    const activeFusions = runState.fusions.filter(isFusionActive);

    const pokemonOptions = alivePokemon.map((p) =>
      `<option value="pokemon:${p.pokemonId}">Pokémon — ${getPokemonDisplayName(p)}</option>`
    ).join("");

    const fusionOptions = activeFusions.map((f) => {
      const fusionName = getFusionDisplayName(f);
      return `<option value="fusion:${f.fusionId}">Fusion — ${fusionName}</option>`;
    }).join("");

    container.innerHTML = `
      <div class="field-row">
        <label for="death-target">Target</label>
        <select id="death-target">
          <option value="">Select a target</option>
          ${fusionOptions}
          ${pokemonOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="death-note">Death Note (optional)</label>
        <input id="death-note" type="text" placeholder="e.g. Crit from Brock's Onix" />
      </div>
    `;
  }

  if (type === "fusion") {
    const available = runState.pokemon.filter(canPokemonBeFusionSelected);

    const options = available.map((p) =>
      `<option value="${p.pokemonId}">${getPokemonDisplayName(p)}</option>`
    ).join("");

    container.innerHTML = `
      <div class="field-row">
        <label for="fusion-head">Head Pokémon</label>
        <select id="fusion-head">
          <option value="">Select a Pokémon</option>
          ${options}
        </select>
      </div>

      <div class="field-row">
        <label for="fusion-body">Body Pokémon</label>
        <select id="fusion-body">
          <option value="">Select a Pokémon</option>
          ${options}
        </select>
      </div>
    `;
  }

  if (type === "split") {
    const activeFusions = runState.fusions.filter(canFusionBeSplitSelected);

    const options = activeFusions.map((fusion) => {
      const fusionName = getFusionDisplayName(fusion);
      return `<option value="${fusion.fusionId}">${fusionName}</option>`;
    }).join("");

    container.innerHTML = `
      <div class="field-row">
        <label for="split-fusion">Fusion</label>
        <select id="split-fusion">
          <option value="">Select a fusion</option>
          ${options}
        </select>
      </div>
    `;
  }

  if (type === "battle") {
    const partyOptions = getBattleEligibleEntities()
      .map((entry) => {
        const prefix = entry.entityType === "fusion" ? "Fusion" : "Pokémon";
        return `<option value="${entry.entityType}:${entry.entityId}">${prefix} — ${entry.label}</option>`;
      })
      .join("");

    container.innerHTML = `
      <div class="field-row">
        <label for="battle-type">Battle Type</label>
        <select id="battle-type">
          <option value="">Select a battle type</option>
          <option value="gym">Gym</option>
          <option value="rival">Rival</option>
          <option value="elite_four">Elite Four</option>
          <option value="champion">Champion</option>
        </select>
      </div>

      <div class="field-row">
        <label for="battle-trainer">Trainer</label>
        <select id="battle-trainer">
          <option value="">Select a trainer</option>
        </select>
      </div>

      <div class="field-row">
        <label for="battle-result">Result</label>
        <select id="battle-result">
          <option value="win">Win</option>
          <option value="loss">Loss</option>
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-1">Party Slot 1</label>
        <select id="battle-party-1">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-2">Party Slot 2</label>
        <select id="battle-party-2">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-3">Party Slot 3</label>
        <select id="battle-party-3">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-4">Party Slot 4</label>
        <select id="battle-party-4">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-5">Party Slot 5</label>
        <select id="battle-party-5">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-6">Party Slot 6</label>
        <select id="battle-party-6">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>
    `;

    const battleTypeSelect = document.getElementById("battle-type");
    const battleTrainerSelectId = "battle-trainer";

    battleTypeSelect.addEventListener("change", () => {
      const battleType = battleTypeSelect.value;
      populateBattleTrainerSelect(battleTrainerSelectId, battleType);
    });
  }
}

function populateSpeciesSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const currentFirstOption = select.querySelector("option");
  const firstOptionText = currentFirstOption?.textContent || "Select a species";

  select.innerHTML = `<option value="">${firstOptionText}</option>`;

  speciesCatalog.forEach((species) => {
    const option = document.createElement("option");
    option.value = species.speciesId;

    const variantText = species.variant ? ` (${species.variant})` : "";
    option.textContent = `${species.name}${variantText}`;

    select.appendChild(option);
  });

  debugLog(`Populated select "${selectId}" with ${speciesCatalog.length} species.`);
}

function switchTab(tabName) {
  const buttons = document.querySelectorAll(".tab-button");
  const panels = document.querySelectorAll(".tab-panel");

  buttons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("active", isActive);
  });

  panels.forEach((panel) => {
    const isActive = panel.id === `tab-${tabName}`;
    panel.classList.toggle("active", isActive);
  });

  if (tabName === "achievements") {
    requestAnimationFrame(() => {
      requestAnimationFrame(updateAchievementCardScales);
    });
  }
}

function renderFusionFlowerWidget() {
  const fusionsEl = document.getElementById("fusions-discovered-value");
  const catchesEl = document.getElementById("catches-available-value");
  const splitsEl = document.getElementById("splits-available-value");

  const nextValues = {
    fusions: getFusionsDiscoveredCount(),
    catches: runState.resources?.catchesAvailable ?? 0,
    splits: runState.resources?.splitsAvailable ?? 0
  };

  function updateValue(el, key) {
    if (!el) return;

    const next = String(nextValues[key]);
    const previous = lastRenderedFusionFlowerValues[key];

    el.textContent = next;

    if (hasRenderedFusionFlowerOnce && previous !== null && String(previous) !== next) {
      popValue(el);

      const petalCard = el.closest(".petal-card");
      const petalWrap = petalCard?.querySelector(".petal-anim-wrap");
      const petalSvg = petalCard?.querySelector(".petal-svg");

      if (petalWrap) {
        pulsePetal(petalWrap);
      }

      if (petalSvg) {
        flashPetal(petalSvg);
      }
    }

    lastRenderedFusionFlowerValues[key] = nextValues[key];
  }

  updateValue(fusionsEl, "fusions");
  updateValue(catchesEl, "catches");
  updateValue(splitsEl, "splits");

  hasRenderedFusionFlowerOnce = true;
}

function popValue(el) {
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

function flashPetal(el) {
  el.classList.remove("flash");
  el.getBoundingClientRect();
  el.classList.add("flash");
}

function pulsePetal(el) {
  el.classList.remove("pulse");
  void el.offsetWidth;
  el.classList.add("pulse");
}

function attachAnimationCleanup() {
  document.querySelectorAll(".petal-value").forEach((el) => {
    el.addEventListener("animationend", () => {
      el.classList.remove("pop");
    });
  });

  document.querySelectorAll(".petal-anim-wrap").forEach((el) => {
    el.addEventListener("animationend", () => {
      el.classList.remove("pulse");
    });
  });

  document.querySelectorAll(".petal-svg").forEach((el) => {
    el.addEventListener("animationend", (event) => {
      if (event.animationName === "petalFlash") {
        el.classList.remove("flash");
      }
    });
  });

}

function buildDisplayTimeline() {
  const timeline = [];

  runState.actions.forEach((action) => {
    timeline.push({
      entryType: "action",
      sortAt: action.actionAt || "",
      action
    });
  });

  achievementCatalog.forEach((achievement) => {
    const progress = runState.achievementProgress?.[achievement.id];

    if (progress?.unlocked && progress.unlockedAt) {
      timeline.push({
        entryType: "achievement_unlocked",
        sortAt: progress.unlockedAt,
        achievementId: achievement.id
      });
    }
  });

  timeline.sort((a, b) => {
    const timeA = a.sortAt || "";
    const timeB = b.sortAt || "";

    if (timeA !== timeB) {
      return timeB.localeCompare(timeA);
    }

    if (a.entryType === b.entryType) {
      return 0;
    }

    if (a.entryType === "action" && b.entryType !== "action") {
      return -1;
    }

    if (b.entryType === "action" && a.entryType !== "action") {
      return 1;
    }

    return 0;
  });

  return timeline;
}

function renderAchievementLogCard(achievementId) {
  const achievement = achievementCatalog.find((a) => a.id === achievementId);

  const container = document.createElement("div");
  container.className = "achievement-log-toast";

  if (!achievement) {
    container.textContent = "Unknown Achievement";
    return container;
  }

  const badgeSrc = getAchievementToastBadgeImage(achievement);
  const backgroundSrc = getAchievementTierBackground(achievement);

  container.style.backgroundImage = `
    linear-gradient(180deg, rgba(10, 17, 32, 0.22), rgba(7, 13, 24, 0.32)),
    url("${backgroundSrc}")
  `;

  container.innerHTML = `
    <div class="achievement-toast-badge-wrap">
      <img
        class="achievement-toast-badge"
        alt="${achievement.name} badge"
      />
    </div>

    <div class="achievement-toast-content">
      <div class="achievement-toast-status">Achievement Unlocked</div>
      <div class="achievement-toast-title">${achievement.name}</div>
      <div class="achievement-toast-desc">${achievement.description || ""}</div>
    </div>
  `;

  const badgeImg = container.querySelector(".achievement-toast-badge");
  applyAchievementToastBadgeImage(badgeImg, badgeSrc);

  return container;
}

// =========================
// Helpers
// =========================

function formatActionTimestamp(isoString) {
  if (!isoString) return "";

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${weekday}, ${month} ${day}${getOrdinalSuffix(day)}, ${year} @ ${hours}:${minutes}${ampm}`;
}

function getOrdinalSuffix(day) {
  if (day >= 11 && day <= 13) return "th";

  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

function getFusionsDiscoveredCount() {
  const discovered = new Set();

  runState.actions.forEach((action) => {
    if (action.actionType === "fusion") {
      const head = getPokemonById(action.headPokemonId);
      const body = getPokemonById(action.bodyPokemonId);

      if (!head || !body) return;

      discovered.add(`${head.speciesId}__${body.speciesId}`);
      return;
    }

    if (action.actionType === "catch" && action.isFusion) {
      discovered.add(`${action.headSpeciesId}__${action.bodySpeciesId}`);
    }
  });

  return discovered.size;
}

function populateLocationSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const currentFirstOption = select.querySelector("option");
  const firstOptionText = currentFirstOption?.textContent || "Select a location";

  select.innerHTML = `<option value="">${firstOptionText}</option>`;

  locationCatalog.forEach((location) => {
    const option = document.createElement("option");
    option.value = location.locationId;
    option.textContent = location.name;
    select.appendChild(option);
  });

  debugLog(`Populated select "${selectId}" with ${locationCatalog.length} locations.`);
}

function getBattleEligibleEntities() {
  const standalonePokemon = runState.pokemon
    .filter(isPokemonStandalone)
    .map((p) => ({
      entityType: "pokemon",
      entityId: p.pokemonId,
      label: getPokemonDisplayName(p)
    }));

  const activeFusions = runState.fusions
    .filter(isFusionActive)
    .map((f) => ({
      entityType: "fusion",
      entityId: f.fusionId,
      label: getFusionDisplayName(f)
    }));

  return [...standalonePokemon, ...activeFusions];
}

function populateBattleTrainerSelect(selectId, battleType) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const filteredTrainers = trainerCatalog.filter(
    (trainer) => trainer.battleType === battleType
  );

  select.innerHTML = `<option value="">Select a trainer</option>`;

  filteredTrainers.forEach((trainer) => {
    const option = document.createElement("option");
    option.value = trainer.trainerId;
    option.textContent = trainer.name;
    select.appendChild(option);
  });

  debugLog(`Populated trainer select "${selectId}" with ${filteredTrainers.length} trainers for battleType "${battleType}".`);
}

function renderActionCard(action) {
  const container = document.createElement("span");
  container.className = "action-card-content";

  function appendSpacer() {
    const spacer = document.createElement("span");
    spacer.className = "action-card-spacer";
    spacer.textContent = " ";
    container.appendChild(spacer);
  }

  function appendText(text, className = "") {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    container.appendChild(span);
  }

  if (action.actionType === "catch") {
    container.appendChild(createActionChip("CATCH", "chip-catch"));
    appendSpacer();

    container.appendChild(createActionChip(action.catchType, "chip-subtype"));
    appendSpacer();

    if (!action.isFusion) {
      const species = speciesById[action.speciesId];
      const speciesName = species
        ? `${species.name}${species.variant ? ` (${species.variant})` : ""}`
        : action.speciesId;

      const displayName = action.nickname || speciesName;

      container.appendChild(createActionChip(displayName, "chip-species"));
    } else {
      const headSpecies = speciesById[action.headSpeciesId];
      const bodySpecies = speciesById[action.bodySpeciesId];

      const headSpeciesName = headSpecies
        ? `${headSpecies.name}${headSpecies.variant ? ` (${headSpecies.variant})` : ""}`
        : action.headSpeciesId;

      const bodySpeciesName = bodySpecies
        ? `${bodySpecies.name}${bodySpecies.variant ? ` (${bodySpecies.variant})` : ""}`
        : action.bodySpeciesId;

      const headName = action.headNickname || headSpeciesName;
      const bodyName = action.bodyNickname || bodySpeciesName;

      container.appendChild(createActionChip(headName, "chip-species"));
      appendText(" + ", "action-inline-separator");
      container.appendChild(createActionChip(bodyName, "chip-species"));
    }

    appendSpacer();

    const locationName = locationById[action.locationId]?.name || action.locationId;
    appendText("@ ", "action-inline-label");
    container.appendChild(createActionChip(locationName, "chip-location"));

    return container;
  }

  if (action.actionType === "fusion") {
    container.appendChild(createActionChip("FUSION", "chip-fusion"));
    appendSpacer();

    const head = getPokemonById(action.headPokemonId);
    const body = getPokemonById(action.bodyPokemonId);

    const headName = getPokemonDisplayName(head);
    const bodyName = getPokemonDisplayName(body);

    container.appendChild(createActionChip(headName, "chip-species"));
    appendText(" + ", "action-inline-separator");
    container.appendChild(createActionChip(bodyName, "chip-species"));

    return container;
  }

  if (action.actionType === "death") {
    container.appendChild(createActionChip("DEATH", "chip-death"));
    appendSpacer();

    if (action.targetType === "pokemon") {
      const target = getPokemonById(action.targetId);
      const name = getPokemonDisplayName(target);

      container.appendChild(createActionChip(name, "chip-species"));
      return container;
    }

    if (action.targetType === "fusion") {
      const fusion = getFusionById(action.targetId);

      if (!fusion) {
        container.appendChild(createActionChip("Unknown Fusion", "chip-fusion"));
        return container;
      }

      const fusionName = getFusionDisplayName(fusion);
      container.appendChild(createActionChip(fusionName, "chip-fusion"));

      return container;
    }
  }

  if (action.actionType === "split") {
    container.appendChild(createActionChip("SPLIT", "chip-split"));
    appendSpacer();

    const fusion = getFusionById(action.fusionId);

    if (!fusion) {
      container.appendChild(createActionChip("Unknown Fusion", "chip-fusion"));
      return container;
    }

    const fusionName = getFusionDisplayName(fusion);
    container.appendChild(createActionChip(fusionName, "chip-fusion"));

    return container;
  }

  if (action.actionType === "purchase") {
    container.appendChild(createActionChip("PURCHASE", "chip-purchase"));
    appendSpacer();

    const lines = Array.isArray(action.lines) ? action.lines : [];
    const totalCost = Number(action.totalCost || 0);

    if (lines.length === 0) {
      container.appendChild(createActionChip("Empty Cart", "chip-shop-item"));
      return container;
    }

    lines.forEach((line, index) => {
      const item = SHOP_ITEMS[line.itemId];
      const itemName = item?.name || line.itemId || "Unknown Item";
      const quantity = Number(line.quantity || 0);

      if (index > 0) {
        appendText(", ", "action-inline-separator");
      }

      container.appendChild(
        createActionChip(`${itemName} x${quantity}`, "chip-shop-item")
      );
    });

    appendSpacer();
    container.appendChild(createActionChip(`${totalCost} RP`, "chip-cost"));

    return container;
  }

  if (action.actionType === "battle") {
    container.appendChild(createActionChip("BATTLE", "chip-battle"));
    appendSpacer();

    const battleTypeLabel = action.battleType
      ? action.battleType.replace(/_/g, " ")
      : "battle";

    container.appendChild(createActionChip(battleTypeLabel, "chip-subtype"));
    appendSpacer();

    const trainer = trainerById[action.trainerId];
    const trainerName = trainer ? trainer.name : action.trainerId || "Unknown Trainer";
    container.appendChild(createActionChip(trainerName, "chip-trainer"));
    appendSpacer();

    container.appendChild(createActionChip(action.result, action.result === "win" ? "chip-win" : "chip-loss"));

    if (Array.isArray(action.party) && action.party.length > 0) {
      appendSpacer();
      appendText("Party: ", "action-inline-label");

      action.party.forEach((member, index) => {
        if (index > 0) {
          appendText(", ", "action-inline-separator");
        }

        if (member.entityType === "pokemon") {
          const pokemon = getPokemonById(member.entityId);
          const name = getPokemonDisplayName(pokemon);

          container.appendChild(createActionChip(name, "chip-species"));
        }

        if (member.entityType === "fusion") {
          const fusion = getFusionById(member.entityId);

          if (!fusion) {
            container.appendChild(createActionChip("Unknown Fusion", "chip-fusion"));
            return;
          }

          const fusionName = getFusionDisplayName(fusion);
          container.appendChild(createActionChip(fusionName, "chip-fusion"));
        }
      });
    }

    return container;
  }

  container.appendChild(createActionChip("UNKNOWN ACTION"));
  return container;
}

function createActionChip(text, className = "") {
  const chip = document.createElement("span");
  chip.className = `action-chip${className ? ` ${className}` : ""}`;
  chip.textContent = text;
  return chip;
}

function getPokemonDisplayName(pokemon) {
  if (!pokemon) return "Unknown Pokémon";
  return pokemon.nickname || `${pokemon.speciesName}${pokemon.variant ? ` (${pokemon.variant})` : ""}`;
}

function getSpeciesDisplayName(species) {
  if (!species) return "Unknown Species";
  return `${species.name}${species.variant ? ` (${species.variant})` : ""}`;
}

function getPokemonById(id) {
  return runState.pokemon.find(p => p.pokemonId === id) || null;
}

function getFusionById(id) {
  return runState.fusions.find(f => f.fusionId === id) || null;
}

function getFusionDisplayName(fusion) {
  if (!fusion) return "Unknown Fusion";

  const head = getPokemonById(fusion.headPokemonId);
  const body = getPokemonById(fusion.bodyPokemonId);

  const headName = getPokemonDisplayName(head);
  const bodyName = getPokemonDisplayName(body);

  return `${headName} + ${bodyName}`;
}

function handleSplitAction() {
  if (runState.resources.splitsAvailable <= 0) {
    alert("You need a Split Token to perform this action.");
    return false;
  }

  const splitFusionSelect = document.getElementById("split-fusion");
  const fusionId = splitFusionSelect?.value || "";

  if (!fusionId) {
    alert("Please choose a fusion to split.");
    return;
  }

  const fusion = getFusionById(fusionId);
  if (!fusion) {
    alert("Selected fusion could not be found.");
    return;
  }

  if (!canFusionBeSplitSelected(fusion)) {
    alert("Only active fusions can be split.");
    return;
  }

  addAction({
    ...createBaseAction("split"),
    fusionId
  });

  updateAndSave();
  renderActionFields();
}

function commitAction(actionType, payload) {
  addAction({
    ...createBaseAction(actionType),
    ...payload
  });

  updateAndSave();
  renderActionFields();
}

function isPokemonAlive(pokemon) {
  return !!pokemon && pokemon.status === "alive";
}

function isPokemonStandalone(pokemon) {
  return isPokemonAlive(pokemon) && !pokemon.activeFusionId;
}

function isFusionActive(fusion) {
  return !!fusion && fusion.status === "active";
}

function canPokemonBeFusionSelected(pokemon) {
  return isPokemonStandalone(pokemon);
}

function canFusionBeSplitSelected(fusion) {
  return isFusionActive(fusion);
}

function normalizeTierKey(tier) {
  return String(tier || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function getAchievementBadgeImage(achievement) {
  const symbol = String(achievement?.symbol || "").trim();

  if (!symbol) {
    return "assets/achievements/badges/trophy_default.png";
  }

  return `assets/achievements/badges/${symbol}.png`;
}

function getAchievementTierBackground(achievement) {
  const tierKey = normalizeTierKey(achievement?.tier);

  const allowedTiers = new Set([
    "bronze",
    "silver",
    "gold",
    "platinum",
    "diamond",
    "master"
  ]);

  if (!allowedTiers.has(tierKey)) {
    return "assets/achievements/backgrounds/default.png";
  }

  return `assets/achievements/backgrounds/${tierKey}.png`;
}

function updateAchievementCardScales() {
  const shells = document.querySelectorAll(".achievement-scale-shell");

  shells.forEach((shell) => {
    const designWidth = 1100;
    const designHeight = 220;
    const availableWidth = shell.clientWidth;

    if (!availableWidth || availableWidth <= 0) {
      return;
    }

    const scale = Math.min(1, availableWidth / designWidth);

    shell.style.setProperty("--achievement-scale", scale);
    shell.style.setProperty("--achievement-design-width", designWidth);
    shell.style.setProperty("--achievement-design-height", designHeight);
    shell.style.height = `${designHeight * scale}px`;
  });
}

function queueAchievementNotifications(achievementChanges) {
  const unlockedItems = achievementChanges.newlyUnlocked.map((id) => ({
    achievementId: id,
    updateType: "unlocked"
  }));

  const removedItems = achievementChanges.newlyRemoved.map((id) => ({
    achievementId: id,
    updateType: "removed"
  }));

  const items = [...unlockedItems, ...removedItems];

  if (items.length === 0) return;

  items.forEach((item) => {
    const existingIndex = achievementNotificationQueue.findIndex(
      (queued) => queued.achievementId === item.achievementId
    );

    if (existingIndex >= 0) {
      const existing = achievementNotificationQueue[existingIndex];

      achievementNotificationQueue[existingIndex] = {
        ...existing,
        updateType: item.updateType,
       
      };
    } else {
      achievementNotificationQueue.push({
        id: `achievement-toast-${achievementNotificationIdCounter++}`,
        ...item,
   
      });
    }
  });

  renderAchievementToasts();
}

function removeAchievementToast(toastId) {
  const toastData = achievementNotificationQueue.find((item) => item.id === toastId);
  const toastNode = document.querySelector(`.achievement-toast[data-toast-id="${toastId}"]`);

  if (toastData?.timeoutId) {
    clearTimeout(toastData.timeoutId);
    toastData.timeoutId = null;
  }

  if (!toastNode) {
    achievementNotificationQueue = achievementNotificationQueue.filter(
      (item) => item.id !== toastId
    );
    renderAchievementToasts();
    return;
  }

  if (toastNode.dataset.leaving === "true") {
    return;
  }

  toastNode.dataset.leaving = "true";
  toastNode.classList.add("achievement-toast-leave");

  window.setTimeout(() => {
    achievementNotificationQueue = achievementNotificationQueue.filter(
      (item) => item.id !== toastId
    );

    toastNode.remove();
    renderAchievementToasts();
  }, 240);
}

function getAchievementToastBadgeImage(achievement) {
  const symbol = String(achievement?.symbol || "").trim();

  if (!symbol) {
    return "assets/achievements/badges/trophy_default_toast.png";
  }

  return `assets/achievements/badges/${symbol}_toast.png`;
}

function getAchievementToastBackground(achievement, updateType) {
  return getAchievementTierBackground(achievement);
}

function renderAchievementToasts() {
  const layer = document.getElementById("achievement-toast-layer");
  if (!layer) return;

  const visibleItems = achievementNotificationQueue.slice(0, 3);
  const hiddenCount = Math.max(0, achievementNotificationQueue.length - 3);

  const visibleIds = new Set(visibleItems.map((item) => item.id));

  Array.from(layer.querySelectorAll(".achievement-toast")).forEach((node) => {
    const nodeId = node.dataset.toastId;
    if (!visibleIds.has(nodeId)) {
      node.remove();
    }
  });

  visibleItems.forEach((item) => {
    let existingToast = layer.querySelector(
      `.achievement-toast[data-toast-id="${item.id}"]`
    );

    const achievement = achievementCatalog.find((a) => a.id === item.achievementId);
    if (!achievement) return;

    const badgeSrc = getAchievementToastBadgeImage(achievement);
    const backgroundSrc = getAchievementToastBackground(achievement, item.updateType);

    const toastOverlay =
      item.updateType === "unlocked"
        ? `linear-gradient(180deg, rgba(10, 17, 32, 0.22), rgba(7, 13, 24, 0.32))`
        : `linear-gradient(180deg, rgba(10, 17, 32, 0.48), rgba(7, 13, 24, 0.60))`;

    const statusLabel =
      item.updateType === "unlocked"
        ? "Achievement Unlocked"
        : "Achievement Removed";

    if (existingToast) {
      existingToast.className = `achievement-toast achievement-toast-${item.updateType}`;
      existingToast.style.backgroundImage = `
        ${toastOverlay},
        url("${backgroundSrc}")
      `;

      const statusEl = existingToast.querySelector(".achievement-toast-status");
      const titleEl = existingToast.querySelector(".achievement-toast-title");
      const descEl = existingToast.querySelector(".achievement-toast-desc");
      const badgeEl = existingToast.querySelector(".achievement-toast-badge");

      if (statusEl) statusEl.textContent = statusLabel;
      if (titleEl) titleEl.textContent = achievement.name;
      if (descEl) descEl.textContent = achievement.description || "";
      if (badgeEl && badgeEl.dataset.loadedSrc !== badgeSrc) {
        applyAchievementToastBadgeImage(badgeEl, badgeSrc);
      }

      return;
    }

    const toast = document.createElement("div");
    toast.className = `achievement-toast achievement-toast-${item.updateType} achievement-toast-enter`;
    toast.dataset.toastId = item.id;
    toast.style.backgroundImage = `
      ${toastOverlay},
      url("${backgroundSrc}")
    `;

    toast.innerHTML = `
      <div class="achievement-toast-badge-wrap">
        <img
          class="achievement-toast-badge"
          alt="${achievement.name} badge"
        />
      </div>

      <div class="achievement-toast-content">
        <div class="achievement-toast-status">${statusLabel}</div>
        <div class="achievement-toast-title">${achievement.name}</div>
        <div class="achievement-toast-desc">${achievement.description || ""}</div>
      </div>
    `;

    const badgeImg = toast.querySelector(".achievement-toast-badge");
    applyAchievementToastBadgeImage(badgeImg, badgeSrc);

    toast.addEventListener(
      "animationend",
      () => {
        toast.classList.remove("achievement-toast-enter");
      },
      { once: true }
    );

    layer.appendChild(toast);

    if (!item.timeoutId) {
      const lifetime = item.updateType === "unlocked" ? 5000 : 4200;

      item.timeoutId = window.setTimeout(() => {
        removeAchievementToast(item.id);
      }, lifetime);
    }
  });

  visibleItems.forEach((item) => {
    const toast = layer.querySelector(`.achievement-toast[data-toast-id="${item.id}"]`);
    if (toast) {
      layer.appendChild(toast);
    }
  });

  let summary = layer.querySelector(".achievement-toast-summary");

  if (hiddenCount > 0) {
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "achievement-toast-summary";
      layer.appendChild(summary);
    }

    summary.textContent = `and ${hiddenCount} more achievement${hiddenCount === 1 ? "" : "s"} updated`;
    layer.appendChild(summary);
  } else if (summary) {
    summary.remove();
  }
}

function applyAchievementToastBadgeImage(imgEl, src) {
  if (!imgEl) return;

  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = "assets/achievements/badges/trophy_default.png";
    imgEl.dataset.loadedSrc = "assets/achievements/badges/trophy_default.png";
  };

  imgEl.src = src;
  imgEl.dataset.loadedSrc = src;
}

async function preloadAchievementAssets() {
  if (!Array.isArray(achievementCatalog)) return;

  const sources = new Set();

  achievementCatalog.forEach((achievement) => {
    const badge = getAchievementToastBadgeImage(achievement);
    const background = getAchievementTierBackground(achievement);

    if (badge) sources.add(badge);
    if (background) sources.add(background);
  });

  const preloadPromises = [];

  sources.forEach((src) => {
    if (!src || achievementAssetCache.has(src)) return;

    const img = new Image();
    img.src = src;

    const promise =
      typeof img.decode === "function"
        ? img.decode().catch(() => {})
        : new Promise((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });

    preloadPromises.push(promise);
    achievementAssetCache.add(src);
  });

  await Promise.all(preloadPromises);
}

function commitPurchaseAction(cartLines) {
  if (!Array.isArray(cartLines) || cartLines.length === 0) {
    alert("Your cart is empty.");
    return false;
  }

  const normalizedLines = cartLines
    .map((line) => {
      const item = SHOP_ITEMS[line.itemId];
      const quantity = Number(line.quantity);

      if (!item) return null;
      if (!Number.isInteger(quantity) || quantity <= 0) return null;

      return {
        itemId: item.itemId,
        quantity,
        unitCost: item.cost,
        lineTotal: item.cost * quantity
      };
    })
    .filter(Boolean);

  if (normalizedLines.length === 0) {
    alert("Your cart is empty.");
    return false;
  }

  const totalCost = normalizedLines.reduce((sum, line) => sum + line.lineTotal, 0);

  if (getAvailableRP() < totalCost) {
    alert(`Not enough RP to complete this purchase (${totalCost} RP needed).`);
    return false;
  }

  addAction({
    ...createBaseAction("purchase"),
    lines: normalizedLines,
    totalCost
  });

  updateAndSave();
  return true;
}

// =========================
// Shop Code
// =========================

function renderShop() {
  const container = document.getElementById("shop-items");
  if (!container) return;

  const availableRP = getAvailableRP();
  const items = Object.values(SHOP_ITEMS);
  const cartLines = getShopCartLines();
  const totalCost = getShopCartTotal();
  const canCheckout = cartLines.length > 0 && totalCost <= availableRP;

  container.innerHTML = "";

  items.forEach((item) => {
    const quantity = clampShopQuantity(shopCart[item.itemId] || 0);

    const card = document.createElement("div");
    card.className = "shop-item-card";

    card.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-cost">${item.cost} RP each</div>
      </div>

      <div class="shop-item-controls">
        <button type="button" class="shop-qty-btn shop-qty-minus">−</button>
        <input
          type="number"
          min="0"
          max="99"
          step="1"
          value="${quantity}"
          class="shop-qty-input"
          aria-label="${item.name} quantity"
        />
        <button type="button" class="shop-qty-btn shop-qty-plus">+</button>
      </div>
    `;

    const qtyInput = card.querySelector(".shop-qty-input");
    const minusBtn = card.querySelector(".shop-qty-minus");
    const plusBtn = card.querySelector(".shop-qty-plus");

    minusBtn.addEventListener("click", () => {
      adjustShopCartQuantity(item.itemId, -1);
      renderShop();
    });

    plusBtn.addEventListener("click", () => {
      adjustShopCartQuantity(item.itemId, 1);
      renderShop();
    });

    qtyInput.addEventListener("input", () => {
      setShopCartQuantity(item.itemId, qtyInput.value);
      renderShop();
    });

    qtyInput.addEventListener("blur", () => {
      setShopCartQuantity(item.itemId, qtyInput.value);
      renderShop();
    });

    container.appendChild(card);
  });

  const summary = document.createElement("div");
  summary.className = "shop-cart-summary";

  const summaryLinesHtml =
    cartLines.length > 0
      ? cartLines
          .map((line) => {
            const item = SHOP_ITEMS[line.itemId];
            const itemName = item?.name || line.itemId;
            return `
              <div class="shop-cart-line">
                <span>${itemName} × ${line.quantity}</span>
                <span>${line.lineTotal} RP</span>
              </div>
            `;
          })
          .join("")
      : `<div class="shop-cart-empty">Cart is empty.</div>`;

  summary.innerHTML = `
    <div class="shop-cart-title">Cart</div>
    <div class="shop-cart-lines">
      ${summaryLinesHtml}
    </div>
    <div class="shop-cart-total">
      <span>Total</span>
      <span>${totalCost} RP</span>
    </div>
    <div class="shop-cart-actions">
      <button type="button" class="shop-clear-btn" ${cartLines.length === 0 ? "disabled" : ""}>
        Clear
      </button>
      <button type="button" class="shop-checkout-btn" ${canCheckout ? "" : "disabled"}>
        Checkout
      </button>
    </div>
  `;

  const clearBtn = summary.querySelector(".shop-clear-btn");
  const checkoutBtn = summary.querySelector(".shop-checkout-btn");

  clearBtn.addEventListener("click", () => {
    clearShopCart();
    renderShop();
  });

  checkoutBtn.addEventListener("click", () => {
    const lines = getShopCartLines();
    const purchased = commitPurchaseAction(lines);

    if (purchased) {
      clearShopCart();
      renderShop();
      renderActionFields();
    }
  });

  container.appendChild(summary);
}

function getPurchaseTotalCost(action) {
  if (!action || action.actionType !== "purchase") {
    return 0;
  }

  const lines = Array.isArray(action.lines) ? action.lines : [];

  return lines.reduce((sum, line) => {
    const quantity = Number(line.quantity || 0);
    const unitCost = Number(line.unitCost || 0);
    const lineTotal = Number(line.lineTotal);

    if (Number.isFinite(lineTotal)) {
      return sum + lineTotal;
    }

    return sum + (quantity * unitCost);
  }, 0);
}

function syncSpentRPFromActions() {
  runState.rp.spent = runState.actions.reduce((sum, action) => {
    return sum + getPurchaseTotalCost(action);
  }, 0);
}

function adjustShopQuantity(inputEl, delta) {
  if (!inputEl) return;

  const current = clampShopQuantity(inputEl.value);
  const next = clampShopQuantity(current + delta);
  inputEl.value = next;
}

function clampShopQuantity(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > 99) return 99;

  return Math.floor(parsed);
}

function setShopCartQuantity(itemId, value) {
  if (!SHOP_ITEMS[itemId]) return;
  shopCart[itemId] = clampShopQuantity(value);
}

function adjustShopCartQuantity(itemId, delta) {
  if (!SHOP_ITEMS[itemId]) return;
  const current = clampShopQuantity(shopCart[itemId] || 0);
  shopCart[itemId] = clampShopQuantity(current + delta);
}

function getShopCartLines() {
  return Object.values(SHOP_ITEMS)
    .map((item) => {
      const quantity = clampShopQuantity(shopCart[item.itemId] || 0);

      if (quantity <= 0) return null;

      return {
        itemId: item.itemId,
        quantity,
        unitCost: item.cost,
        lineTotal: item.cost * quantity
      };
    })
    .filter(Boolean);
}

function getShopCartTotal() {
  return getShopCartLines().reduce((sum, line) => sum + line.lineTotal, 0);
}

function clearShopCart() {
  Object.keys(SHOP_ITEMS).forEach((itemId) => {
    shopCart[itemId] = 0;
  });
}

// =========================
// Event Handlers
// =========================

function handleSaveRunName() {
  const input = document.getElementById("run-name");
  runState.meta.runName = input.value.trim() || "My Fusion Run";
  updateAndSave();
}

function handleNewRun() {
  const confirmed = window.confirm("Create a new run? This will overwrite the current local run.");
  if (!confirmed) return;

  runState = createNewRunState();
  clearShopCart();
  updateAndSave();
}

function handleAddEarnedRP() {
  runState.rp.bonusEarned += 1;
  updateAndSave();
}


function handleLogAction(event) {
  event.preventDefault();

  const actionType = document.getElementById("action-type").value;
  const handler = actionHandlers[actionType];

  if (!handler) {
    alert("Unknown action type.");
    return;
  }

  handler();
}

function handleCatchAction() {
  if (runState.resources.catchesAvailable <= 0) {
    alert("You need a Catch Token to perform this action.");
    return false;
  }

  const catchTypeSelect = document.getElementById("catch-type");
  const locationInput = document.getElementById("catch-location");
  const fusionCheckbox = document.getElementById("catch-is-fusion");

  const catchType = catchTypeSelect?.value || "";
  const locationId = locationInput?.value.trim() || "";
  const isFusion = !!fusionCheckbox?.checked;

  if (!catchType || !locationId) {
    alert("Catch actions need both a catch type and a location.");
    return;
  }

  if (!isFusion) {
    const speciesSelect = document.getElementById("catch-species");
    const nicknameInput = document.getElementById("catch-nickname");

    const speciesId = speciesSelect?.value || "";
    const nickname = nicknameInput?.value.trim() || "";

    if (!speciesId) {
      alert("Please choose a species.");
      return;
    }

    const species = speciesById[speciesId];
    if (!species) {
      alert("Selected species could not be found in the catalog.");
      return;
    }

    const caughtPokemonId = crypto.randomUUID();

    addAction({
      ...createBaseAction("catch"),
      catchType,
      locationId,
      isFusion: false,
      caughtPokemonId,
      speciesId,
      nickname
    });
  } else {
    const headSpeciesSelect = document.getElementById("catch-head-species");
    const bodySpeciesSelect = document.getElementById("catch-body-species");
    const headNicknameInput = document.getElementById("catch-head-nickname");
    const bodyNicknameInput = document.getElementById("catch-body-nickname");

    const headSpeciesId = headSpeciesSelect?.value || "";
    const bodySpeciesId = bodySpeciesSelect?.value || "";
    const headNickname = headNicknameInput?.value.trim() || "";
    const bodyNickname = bodyNicknameInput?.value.trim() || "";

    if (!headSpeciesId || !bodySpeciesId) {
      alert("Please choose both fusion species.");
      return;
    }

    const headSpecies = speciesById[headSpeciesId];
    const bodySpecies = speciesById[bodySpeciesId];

    if (!headSpecies || !bodySpecies) {
      alert("One or both selected fusion species could not be found in the catalog.");
      return;
    }

    const caughtFusionId = crypto.randomUUID();
    const headPokemonId = crypto.randomUUID();
    const bodyPokemonId = crypto.randomUUID();

    addAction({
      ...createBaseAction("catch"),
      catchType,
      locationId,
      isFusion: true,
      caughtFusionId,
      headPokemonId,
      bodyPokemonId,
      headSpeciesId,
      bodySpeciesId,
      headNickname,
      bodyNickname
    });
  }

  updateAndSave();
  renderActionFields();
}

function handleDeathAction() {
  const deathTarget = document.getElementById("death-target");
  const deathNote = document.getElementById("death-note");

  const rawTarget = deathTarget?.value || "";
  const note = deathNote?.value.trim() || "";

  if (!rawTarget) {
    alert("Please choose a target to mark as dead.");
    return;
  }

  const [targetType, targetId] = rawTarget.split(":");

  if (!targetType || !targetId) {
    alert("Invalid death target selected.");
    return;
  }

  commitAction("death", {
    targetType,
    targetId,
    note
  });
}

function handleFusionAction() {
  const fusionHead = document.getElementById("fusion-head");
  const fusionBody = document.getElementById("fusion-body");

  const headPokemonId = fusionHead?.value || "";
  const bodyPokemonId = fusionBody?.value || "";

  if (!headPokemonId || !bodyPokemonId) {
    alert("Please choose both fusion components.");
    return;
  }

  if (headPokemonId === bodyPokemonId) {
    alert("A Pokémon cannot fuse with itself.");
    return;
  }

  const headPokemon = runState.pokemon.find((p) => p.pokemonId === headPokemonId);
  const bodyPokemon = runState.pokemon.find((p) => p.pokemonId === bodyPokemonId);

  if (!headPokemon || !bodyPokemon) {
    alert("One or both selected Pokémon could not be found.");
    return;
  }

  if (!canPokemonBeFusionSelected(headPokemon) || !canPokemonBeFusionSelected(bodyPokemon)) {
    alert("One or both selected Pokémon cannot be fused right now.");
    return;
  }

  const fusionId = crypto.randomUUID();

  commitAction("fusion", {
    fusionId,
    headPokemonId,
    bodyPokemonId
  });
}

function handleBattleAction() {
  const battleTypeSelect = document.getElementById("battle-type");
  const battleTrainerSelect = document.getElementById("battle-trainer");
  const battleResultSelect = document.getElementById("battle-result");

  const battleType = battleTypeSelect?.value || "";
  const trainerId = battleTrainerSelect?.value || "";
  const result = battleResultSelect?.value || "win";

  if (!battleType) {
    alert("Please choose a battle type.");
    return;
  }

  if (!trainerId) {
    alert("Please choose a trainer.");
    return;
  }

  const trainer = trainerById[trainerId];
  if (!trainer) {
    alert("Selected trainer could not be found.");
    return;
  }

  if (trainer.battleType !== battleType) {
    alert("Selected trainer does not match the chosen battle type.");
    return;
  }

  const rawPartyValues = [
    document.getElementById("battle-party-1")?.value || "",
    document.getElementById("battle-party-2")?.value || "",
    document.getElementById("battle-party-3")?.value || "",
    document.getElementById("battle-party-4")?.value || "",
    document.getElementById("battle-party-5")?.value || "",
    document.getElementById("battle-party-6")?.value || ""
  ];

  const nonEmptyPartyValues = rawPartyValues.filter(Boolean);

  if (nonEmptyPartyValues.length === 0) {
    alert("Please choose at least one party member.");
    return;
  }

  const uniqueValues = new Set(nonEmptyPartyValues);
  if (uniqueValues.size !== nonEmptyPartyValues.length) {
    alert("The same party member cannot be selected more than once.");
    return;
  }

  const eligibleEntities = getBattleEligibleEntities();
  const eligibleSet = new Set(
    eligibleEntities.map((entry) => `${entry.entityType}:${entry.entityId}`)
  );

  const hasInvalidSelection = nonEmptyPartyValues.some((value) => !eligibleSet.has(value));
  if (hasInvalidSelection) {
    alert("One or more selected party members are no longer eligible.");
    return;
  }

  const party = nonEmptyPartyValues.map((value) => {
    const [entityType, entityId] = value.split(":");
    return { entityType, entityId };
  });

  commitAction("battle", {
    battleType,
    trainerId,
    result,
    party
  });
}

function handleUndoAction() {
  if (runState.actions.length === 0) return;

  const action = runState.actions[runState.actions.length - 1];
  const nextActions = runState.actions.slice(0, -1);
  const validation = validateActionSequence(nextActions);

  if (!validation.valid) {
    alert(validation.reason);
    return;
  }

  runState.actions.pop();
  runState.redoStack.push(action);

  updateAndSave();
  renderActionFields();
}

function handleRedoAction() {
  if (runState.redoStack.length === 0) return;

  const action = runState.redoStack[runState.redoStack.length - 1];
  const nextActions = [...runState.actions, action];
  const validation = validateActionSequence(nextActions);

  if (!validation.valid) {
    alert(validation.reason);
    return;
  }

  runState.redoStack.pop();
  runState.actions.push(action);

  updateAndSave();
  renderActionFields();
}

function handleDeleteAction(actionId) {
  const confirmed = window.confirm("Delete this action?");
  if (!confirmed) return;

  const nextActions = runState.actions.filter((action) => action.actionId !== actionId);
  const validation = validateActionSequence(nextActions);

  if (!validation.valid) {
    alert(validation.reason);
    return;
  }

  runState.actions = nextActions;
  runState.redoStack = [];

  updateAndSave();
  renderActionFields();
}

function exportRun() {
  const blob = new Blob([JSON.stringify(runState, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = (runState.meta.runName || "fusion-run")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  anchor.href = url;
  anchor.download = `${safeName || "fusion-run"}.json`;
  anchor.click();

  URL.revokeObjectURL(url);
}

function importRun(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (loadEvent) => {
    try {
      const parsed = JSON.parse(loadEvent.target.result);

      if (!parsed.meta || !parsed.rp || !Array.isArray(parsed.actions)) {
        throw new Error("Invalid save file format.");
      }
      
      runState = normalizeRunState(parsed);
      clearShopCart();
      updateAndSave();
      alert("Run imported successfully.");
    } catch (error) {
      console.error(error);
      alert("Import failed. That JSON file does not match the expected save structure.");
    } finally {
      event.target.value = "";
    }
  };

  reader.readAsText(file);
}




// =========================
// Event Listener Wiring
// =========================

function attachEventListeners() {
  document.getElementById("save-run-name-btn").addEventListener("click", handleSaveRunName);
  document.getElementById("new-run-btn").addEventListener("click", handleNewRun);
  document.getElementById("add-earned-rp-btn").addEventListener("click", handleAddEarnedRP);
  document.getElementById("action-form").addEventListener("submit", handleLogAction);
  document.getElementById("action-type").addEventListener("change", renderActionFields);
  document.getElementById("export-run-btn").addEventListener("click", exportRun);
  document.getElementById("import-run-input").addEventListener("change", importRun);
  document.getElementById("undo-action-btn").addEventListener("click", handleUndoAction);
  document.getElementById("redo-action-btn").addEventListener("click", handleRedoAction);
  window.addEventListener("resize", updateAchievementCardScales);
}

function attachTabEventListeners() {
  const buttons = document.querySelectorAll(".tab-button");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });
}


// =========================
// Initialization
// =========================

function initializeDebugMode() {
  const debugPanel = document.getElementById("debug-panel");
  if (debugPanel && !DEBUG_MODE) {
    debugPanel.style.display = "none";
  }
}

async function init() {
  await loadAchievementCatalog();
  await loadSpeciesCatalog();
  await loadLocationCatalog();
  await loadTrainerCatalog();
  await preloadAchievementAssets();
  attachEventListeners();
  attachTabEventListeners();
  attachAnimationCleanup();
  initializeDebugMode();
  renderActionFields();
  renderRun();
}

init();